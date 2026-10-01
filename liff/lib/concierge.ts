import type { createMCPClient } from '@ai-sdk/mcp';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

import { tokyoDays } from './format';
import { WEEKDAY_IDS, resolveDate } from './resolve-date';

/** Tells the Maison plugin a call came from the concierge. Informational; never used for identity. */
export const SURFACE_HEADER = 'x-maison-surface';
const MAX_MESSAGES = 20;
const MAX_CHARS = 1000;
const MAX_STEPS = 8; // resolve_date adds a step to most visits: the original 6 left a long search no room to answer
/** How many days the calendar in the instructions covers, today first. */
const CALENDAR_DAYS = 14;
const WEEKDAY_NAMES = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
} as const;

const tokyoDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/**
 * The concierge's instructions, built for each request. Dates are what a small model gets wrong: on the local model
 * "Saturday" came out as Friday, even with a calendar in front of it. So it never works a date out. It asks
 * resolve_date, uses what that returns, and restates the visit from what the booking returns. The calendar is only
 * context: Tokyo's (lib/format.ts), whatever time zone the server runs in, with the weekdays in the reply's language.
 */
export const conciergeInstructions = (locale: 'ja' | 'en', now: Date) => {
  const days = tokyoDays(CALENDAR_DAYS, now);
  const calendar = days.map(({ date, weekday }) => `${date} ${WEEKDAY_NAMES[locale][weekday]}`).join('\n');
  return `You are the concierge of Maison, a fictional luxury house of trunks, bags and small gifts. You help one signed-in customer choose a gift and request a boutique visit.
Today in Tokyo: ${tokyoDay(now)}. Boutique times are Japan time (Asia/Tokyo, +09:00).

Calendar of the next ${CALENDAR_DAYS} days in Tokyo, today first:
${calendar}

Rules:
1. Use the tools for every fact about products, prices, stock and opening hours. Never invent products, prices, availability or hours. Name products exactly as the tools return them. Call the tools you need in this reply and answer from their results: never say you will look something up and then stop.
2. Search broadly first. For a gift, use search_products with the occasion (occasion "travel" for someone who travels), the budget (maxPriceJpy) and the boutique (inStockAt). Add a category or collection only when the customer asks for one. If a search finds nothing, drop a filter and search again before saying nothing fits.
3. Before calling request_appointment, restate the boutique, the day (the weekday and date resolve_date returned), the time and the products in one short sentence, and wait for the customer's yes.
4. Never work out or guess a date or weekday yourself. When the customer names a day ("Saturday", "tomorrow", "today", "10 October"), call resolve_date for it first, on its own, before find_boutiques with a date and before request_appointment: weekday for a weekday on its own, relative only for exactly "today" or "tomorrow", date for any other day: a calendar date, or a day you read off the calendar, such as "the day after tomorrow" or "in 3 days". If the customer names no day, don't call it, don't pass a date to find_boutiques or look up opening hours, and don't suggest a day yourself: ask which day suits them when they want to visit. Use the date it returns, and the weekday it returns when you speak of that day, never a weekday from the customer's words. If isPast is true, that day has gone: ask for another day. For a day the calendar doesn't show ("next month"), ask the customer which day they mean. Write requestedFor as YYYY-MM-DDTHH:MM:00+09:00: the date from resolve_date, then T and the time in 24-hour form (2 pm is T14:00:00+09:00).
5. Never say a visit is confirmed. Say it is requested, and that the boutique will confirm it on LINE. After request_appointment, restate the boutique, date and time from the tool's result (appointment.boutique.name and appointment.requestedFor), with the weekday resolve_date returned for that date, never from what the customer asked for.
6. If a tool returns an error, follow its hint. not_found means a slug was wrong: look it up with the tool the hint names, never guess. An input validation error means fix the arguments and call again. Otherwise ask the customer.
7. ${locale === 'ja' ? 'Reply in polite Japanese (keigo).' : 'Reply in English.'} Pass locale "${locale}" to every tool that takes one, so names match your reply and the app's cards. Keep replies to two or three short sentences of plain text: no markdown, no bold, no numbered or bulleted lists. The app shows product cards, so don't repeat their details.
8. Suggest at most three products at a time.`;
};

/**
 * The local model fills in every input a tool has, sending null or "" for the ones it isn't using, and writes "Saturday"
 * for "saturday". Blanks mean "not given", and case and spaces don't matter. Without this, "exactly one of" rejected
 * nearly every call, and the model sometimes gave up after repeating it. A real value in two of them, or one that isn't
 * allowed ("the day after tomorrow" for relative), is still refused.
 */
const tidyInput = (input: unknown) =>
  input !== null && typeof input === 'object' && !Array.isArray(input)
    ? Object.fromEntries(
        Object.entries(input)
          .map(([key, value]) => [key, typeof value === 'string' ? value.trim().toLowerCase() : value])
          .filter(([, value]) => value !== null && value !== '')
      )
    : input;

const resolveDateInput = z.preprocess(
  tidyInput,
  z
    .object({
      weekday: z.enum(WEEKDAY_IDS).optional().describe('A weekday on its own, as the customer said it, in lower case English: "Saturday" is "saturday". It gives the first such day after today.'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional().describe('A calendar date, YYYY-MM-DD, to get its weekday.'),
      relative: z.enum(['today', 'tomorrow']).optional().describe('Only when the customer says exactly "today" or "tomorrow". "The day after tomorrow" is not "tomorrow": give that as a date.'),
    })
    .refine((input) => [input.weekday, input.date, input.relative].filter((part) => part !== undefined).length === 1, {
      message: 'Give exactly one of weekday, date or relative.',
    })
);

/**
 * The one tool that isn't a Maison tool: it works out which day the customer means, so the model never has to. It
 * answers from the same Tokyo calendar as everything else here, and names the weekday in the reply's language.
 */
const resolveDateTool = (locale: 'ja' | 'en', now: Date) =>
  tool({
    description:
      'Works out which day the customer means, on Tokyo\'s calendar, so you never work out a date or weekday yourself. Call it only when the customer has named a day, never to look up today\'s date or to suggest a day, and call it before find_boutiques with a date and before request_appointment. Give exactly one of: weekday (a weekday on its own, such as "Saturday": the first such day after today), relative ("today" or "tomorrow"), or date (YYYY-MM-DD, to get its weekday). It returns the date as YYYY-MM-DD, the weekday\'s name in the customer\'s language, and isPast, whether that day has already gone.',
    inputSchema: resolveDateInput,
    execute: async (query) => resolveDate(query, locale, now),
  });

export interface ConciergeDeps {
  model: LanguageModel;
  /** Which model answers (conciergeModel().label), named in the error when it can't be reached. */
  modelLabel?: string;
  createMcpClient: typeof createMCPClient;
  strapiUrl: string;
  now?: () => Date;
}

/** What the customer sees when the model fails. An unreachable model is named, with the fix. */
export const describeModelError = (error: unknown, modelLabel?: string): string => {
  const message = error instanceof Error ? error.message : 'The concierge had a problem.';
  if (/Cannot connect to API|fetch failed|ECONNREFUSED/i.test(message)) {
    return `The concierge's model${modelLabel ? ` (${modelLabel})` : ''} isn't reachable. Start Ollama, or set ANTHROPIC_API_KEY in liff/.env, then restart the app.`;
  }
  return message;
};

/**
 * The model (Claude, or the local model) with the Maison tools, acting as the signed-in customer. The customer's
 * own session token goes to Strapi unchanged; the route adds no credential of its own.
 */
export async function handleConcierge(request: Request, deps: ConciergeDeps): Promise<Response> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer mcp_at_\S+$/.test(authorization)) {
    return Response.json({ error: 'Sign in with LINE first.' }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { messages?: UIMessage[]; locale?: string } | null;
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const oversized = messages.some((message) => message.parts?.some((part) => part.type === 'text' && part.text.length > MAX_CHARS));
  if (messages.length === 0 || oversized) {
    return Response.json({ error: `Send 1 to ${MAX_MESSAGES} messages of up to ${MAX_CHARS} characters.` }, { status: 400 });
  }
  const locale = body?.locale === 'en' ? 'en' : 'ja';

  let mcp: Awaited<ReturnType<typeof createMCPClient>>;
  try {
    mcp = await deps.createMcpClient({
      transport: { type: 'http', url: `${deps.strapiUrl}/mcp`, headers: { Authorization: authorization, [SURFACE_HEADER]: 'concierge' } },
    });
  } catch (error) {
    return Response.json({ error: `Could not reach the Maison tools: ${(error as Error).message}` }, { status: 502 });
  }
  const close = async () => {
    await mcp.close();
  };

  try {
    const now = deps.now?.() ?? new Date(); // one "now" for the instructions and for resolve_date
    const result = streamText({
      model: deps.model,
      instructions: conciergeInstructions(locale, now),
      messages: await convertToModelMessages(messages),
      tools: { ...(await mcp.tools()), resolve_date: resolveDateTool(locale, now) },
      stopWhen: isStepCount(MAX_STEPS),
      abortSignal: request.signal,
      // onEnd is skipped on abort, and when no step completes, so close in all three.
      onEnd: close,
      onAbort: close,
      onError: async ({ error }) => {
        console.error('[concierge]', error);
        await close();
      },
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onError: (error) => describeModelError(error, deps.modelLabel),
      }),
    });
  } catch (error) {
    await close();
    throw error;
  }
}

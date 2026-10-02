import type { createMCPClient } from '@ai-sdk/mcp';
import {
  APICallError,
  RetryError,
  asSchema,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

import { tokyoDays } from './format';
import { RELATIVE_IDS, WEEKDAY_IDS, WEEK_IDS, resolveDate } from './resolve-date';
import { MAX_BODY_BYTES, isCustomerSession, readBody } from './strapi-proxy';

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
4. Call resolve_date only when the customer names a day, never to find out today's date, which is given above.${locale === 'ja' ? ' 日付が出ていないご相談では resolve_date を呼ばないでください。' : ''} Never work out or guess a date or weekday yourself. When the customer names a day ("Saturday", "tomorrow", "10 October"), call resolve_date for it first, on its own, before find_boutiques with a date and before request_appointment: weekday for a weekday name ("Saturday": week "this"; "next week's Saturday", 来週の土曜日: week "next"), relative for exactly "today", "tomorrow" or "day_after_tomorrow" ("the day after tomorrow", 明後日), date for any other day: a calendar date, or a day you read off the calendar, such as "in 3 days". If the customer names no day, don't call it, don't pass a date to find_boutiques, and don't suggest a day yourself: ask which day suits them when they want to visit, and look up opening hours only when they ask about them, by calling find_boutiques without a date, which lists each boutique's weekly hours. Use the date resolve_date returns, and the weekday it returns when you speak of that day, never a weekday from the customer's words. If isPast is true, that day has gone: ask for another day. For a day the calendar doesn't show ("next month"), ask the customer which day they mean. Write requestedFor as YYYY-MM-DDTHH:MM:00+09:00: the date from resolve_date, then T and the time in 24-hour form (2 pm is T14:00:00+09:00).
5. Never say a visit is confirmed. Say it is requested, and that the boutique will confirm it on LINE. After request_appointment, restate the boutique, date and time from the tool's result (appointment.boutique.name and appointment.requestedFor), with the weekday resolve_date returned for that date, never from what the customer asked for.
6. If a tool returns an error, follow its hint. not_found means a slug was wrong: look it up with the tool the hint names, never guess. An input validation error means fix the arguments and call again. Otherwise ask the customer.
7. ${locale === 'ja' ? 'Reply in polite Japanese (keigo).' : 'Reply in English.'} Pass locale "${locale}" to every tool that takes one, so names match your reply and the app's cards. Keep replies to two or three short sentences of plain text: no markdown, no bold, no numbered or bulleted lists. The app shows product cards, so don't repeat their details.
8. Suggest at most three products at a time.
9. For a question about Maison's services and policies, such as care, materials, sizing, personalization, delivery, payment, returns, repairs, warranty or gift wrapping, call search_knowledge with the customer's own words, and with productSlugs when the question is about particular pieces. Answer only from the entries it returns, and never invent a policy, a price or a time. If no entry answers the question, call hand_off_to_staff next, before you write anything, with the customer's question in their own words, reason "no_answer", and productSlug when it is about one piece. Then say in one short sentence that you couldn't find a reliable answer and have passed the question to Maison's client advisors: the app shows the customer where and when they reply. Never say a question is with the advisors unless hand_off_to_staff succeeded for it, in this reply or an earlier one, and never promise a time yourself.
10. If the customer asks to talk to a person, call hand_off_to_staff at once with their request, reason "asked_for_person". Hand off each question once: if it is already with the advisors, say so.`;
};

/**
 * The local model fills in every input a tool has, sending null or "" for the ones it isn't using, and writes "Saturday"
 * for "saturday". Blanks mean "not given", and case and spaces don't matter. Without this, "exactly one of" rejected
 * nearly every call, and the model sometimes gave up after repeating it. A real value in two of them, one that isn't
 * allowed ("the day after tomorrow" for relative), or under a name the tool doesn't have is still refused. The one name
 * ignored is `locale`: the Maison tools take one, the instructions say to pass it to every tool that does, and the model
 * does here too, though this tool already answers in the reply's language.
 */
const tidyInput = (input: unknown) =>
  input !== null && typeof input === 'object' && !Array.isArray(input)
    ? Object.fromEntries(
        Object.entries(input)
          .map(([key, value]) => [key, typeof value === 'string' ? value.trim().toLowerCase() : value])
          .filter(([key, value]) => value !== null && value !== '' && key !== 'locale')
      )
    : input;

/**
 * A strict object: a key the tool doesn't have is refused, with its name, and not stripped. Stripping once turned the
 * model's `week: "next"` into this week's Saturday, under a green chip, for 来週の土曜日.
 */
const resolveDateInput = z.preprocess(
  tidyInput,
  z
    .strictObject({
      weekday: z.enum(WEEKDAY_IDS).optional().describe('Any day the customer names by its weekday, such as "Saturday" or 土曜日, in lower case English: "saturday". Use it even when that day is only two days away. It gives the first such day after today, or with week "next" the one in next week.'),
      week: z.enum(WEEK_IDS).optional().describe('Only with weekday. "this" for "Saturday" or "this Saturday": the coming one. "next" for "next week\'s Saturday" (来週の土曜日): that weekday in next week, which runs from Monday to Sunday.'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional().describe('A calendar date, YYYY-MM-DD, to get its weekday.'),
      relative: z.enum(RELATIVE_IDS).optional().describe('Only when the customer says exactly "today", "tomorrow" or "the day after tomorrow". A weekday name such as "Saturday" or 土曜日 is never relative: use weekday.'),
    })
    .refine((input) => [input.weekday, input.date, input.relative].filter((part) => part !== undefined).length === 1, {
      message: 'Give exactly one of weekday, date or relative, and leave the others out. A weekday name such as "Saturday" or 土曜日 is weekday, with week "this" or "next".',
    })
    .refine((input) => input.week === undefined || input.weekday !== undefined, {
      message: 'week goes with weekday: give both, such as weekday "saturday" and week "next".',
    })
);

/**
 * The one tool that isn't a Maison tool: it works out which day the customer means, so the model never has to. It
 * answers from the same Tokyo calendar as everything else here, and names the weekday in the reply's language.
 */
const resolveDateTool = (locale: 'ja' | 'en', now: Date) =>
  tool({
    description:
      'Works out which day the customer means, on Tokyo\'s calendar, so you never work out a date or weekday yourself. Call it only when the customer has named a day, never to look up today\'s date or to suggest a day, and call it before find_boutiques with a date and before request_appointment. Give exactly one of: weekday (a weekday name, with week "this" for "Saturday" or "next" for "next week\'s Saturday", 来週の土曜日), relative ("today", "tomorrow" or "day_after_tomorrow", 明後日), or date (YYYY-MM-DD, to get its weekday). It returns the date as YYYY-MM-DD, the weekday\'s name in the customer\'s language, and isPast, whether that day has already gone.',
    inputSchema: resolveDateInput,
    execute: async (query) => resolveDate(query, locale, now),
  });

export interface ConciergeDeps {
  model: LanguageModel;
  /** Which model answers (conciergeModel().label), named in the error when it can't be reached. */
  modelLabel?: string;
  /** What to do then (conciergeModel().fix): start Ollama for the local model, check the internet for Claude. */
  modelFix?: string;
  createMcpClient: typeof createMCPClient;
  strapiUrl: string;
  now?: () => Date;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** How a model call that can't connect fails: the SDK's own words ("Cannot connect to API: …"), or fetch's. */
const CANNOT_CONNECT = /Cannot connect to API|fetch failed|ECONNREFUSED/i;

/**
 * Whether a model call failed to connect: the SDK's APICallError says so, on its own, among the attempts of the
 * RetryError the SDK throws after retrying, or as the cause of the error a provider wraps it in. The AI Gateway's
 * GatewayError does that, and its own message says only "Gateway request failed".
 */
const cannotConnect = (error: unknown, seen = new Set<unknown>()): boolean => {
  if (!(error instanceof Error) || seen.has(error)) return false;
  seen.add(error);
  if (APICallError.isInstance(error) && CANNOT_CONNECT.test(error.message)) return true;
  return [...(RetryError.isInstance(error) ? error.errors : []), error.cause].some((inner) => cannotConnect(inner, seen));
};

/**
 * What the customer sees when the model fails. A model call that can't connect is named, with its provider's fix. Only
 * a model call is: a tool that can't reach Strapi also fails with "fetch failed" (a TypeError, never an APICallError),
 * and says that, not that the model is down.
 */
export const describeModelError = (error: unknown, modelLabel?: string, modelFix?: string): string => {
  if (cannotConnect(error)) {
    return `The concierge's model${modelLabel ? ` (${modelLabel})` : ''} isn't reachable.${modelFix ? ` ${modelFix}` : ''}`;
  }
  return error instanceof Error ? error.message : 'The concierge had a problem.';
};

/**
 * The Maison tools, with the conversation's locale for each tool whose input schema has one, when the model leaves it
 * out (or sends null or "", the local model's blanks). Rule 7 asks for it, but in an English chat a booking came back
 * without it, so in the catalog's default language: the card showed 銀座本店. A locale the model gives is kept.
 */
export const withConversationLocale = async <TOOLS extends ToolSet>(tools: TOOLS, locale: 'ja' | 'en'): Promise<TOOLS> => {
  const entries = await Promise.all(
    Object.entries(tools).map(async ([name, maisonTool]) => {
      const properties = maisonTool.inputSchema === undefined ? undefined : (await asSchema(maisonTool.inputSchema).jsonSchema).properties;
      const execute = maisonTool.execute;
      if (!execute || !properties || !Object.hasOwn(properties, 'locale')) return [name, maisonTool];
      const withLocale = (input: unknown) => (isObject(input) && (input.locale === undefined || input.locale === null || input.locale === '') ? { ...input, locale } : input);
      return [name, { ...maisonTool, execute: (input: unknown, options: Parameters<NonNullable<typeof execute>>[1]) => execute(withLocale(input), options) }];
    })
  );
  return Object.fromEntries(entries) as TOOLS;
};

/** The request's JSON, or null when it isn't JSON: the conversation then counts as empty. */
const parseBody = (raw: Uint8Array): { messages?: unknown[]; locale?: string } | null => {
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
};

/**
 * A message as the app sends it: the customer's (role user) or the concierge's own earlier reply (assistant), an object
 * with a list of parts, each an object, and a text part's text a string. Anything else is the caller's mistake, a 400.
 * A number as the text otherwise reached the model call, and the SDK refused the whole prompt there, after the reply
 * had begun. A system message was refused there too, inside a 200 stream, and an unknown role threw from
 * convertToModelMessages once MCP had connected: a 500.
 */
const isWellFormed = (message: unknown): message is UIMessage =>
  isObject(message) &&
  (message.role === 'user' || message.role === 'assistant') &&
  Array.isArray(message.parts) &&
  message.parts.every((part) => isObject(part) && (part.type !== 'text' || typeof part.text === 'string'));

/**
 * The model (Claude, or the local model) with the Maison tools, acting as the signed-in customer. The customer's
 * own session token goes to Strapi unchanged; the route adds no credential of its own.
 */
export async function handleConcierge(request: Request, deps: ConciergeDeps): Promise<Response> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!isCustomerSession(authorization)) {
    return Response.json({ error: 'Sign in with LINE first.' }, { status: 401 });
  }
  // At most the proxy's 1 MB, as the proxy reads it: never more than that of one body in memory.
  let raw: Uint8Array | null;
  try {
    raw = await readBody(request, MAX_BODY_BYTES);
  } catch {
    return Response.json({ error: "The request's body couldn't be read." }, { status: 400 });
  }
  if (raw === null) return Response.json({ error: 'The request body is over 1 MB.' }, { status: 413 });
  const body = parseBody(raw);
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  if (!messages.every(isWellFormed)) {
    return Response.json({ error: 'Each message needs a role of user or assistant, a list of parts, and each text part its text as a string.' }, { status: 400 });
  }
  // The customer's own messages are limited. What the concierge wrote earlier (sent back with each turn) isn't: a long reply must not refuse the next one.
  const oversized = messages.some((message) => message.role === 'user' && message.parts.some((part) => part.type === 'text' && part.text.length > MAX_CHARS));
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
    const tools = { ...(await withConversationLocale(await mcp.tools(), locale)), resolve_date: resolveDateTool(locale, now) };
    const result = streamText({
      model: deps.model,
      instructions: conciergeInstructions(locale, now),
      // With the tools, an earlier turn's tool results reach the model as each tool shapes them (toModelOutput), as
      // they did in that turn, and not as the raw MCP result.
      messages: await convertToModelMessages(messages, { tools }),
      tools,
      stopWhen: isStepCount(MAX_STEPS),
      abortSignal: request.signal,
      // onEnd is skipped on abort, and when no step completes, so close in all three.
      onEnd: close,
      onAbort: close,
      onError: async ({ error }) => {
        // The label too: in LINE mode the customer's screen never shows the detail (ErrorDetail is mock-only).
        console.error('[concierge]', describeModelError(error, deps.modelLabel, deps.modelFix), error);
        await close();
      },
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onError: (error) => describeModelError(error, deps.modelLabel, deps.modelFix),
      }),
    });
  } catch (error) {
    await close();
    throw error;
  }
}

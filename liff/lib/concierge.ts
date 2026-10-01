import type { createMCPClient } from '@ai-sdk/mcp';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from 'ai';

/** Tells the Maison plugin a call came from the concierge. Informational; never used for identity. */
export const SURFACE_HEADER = 'x-maison-surface';
const MAX_MESSAGES = 20;
const MAX_CHARS = 1000;
const MAX_STEPS = 6;

const tokyoDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export const conciergeInstructions = (locale: 'ja' | 'en', now: Date) => `You are the concierge of Maison, a fictional luxury house of trunks, bags and small gifts. You help one signed-in customer choose a gift and request a boutique visit.
Today in Tokyo: ${tokyoDay(now)}. Boutique times are Japan time (Asia/Tokyo, +09:00).

Rules:
1. Use the tools for every fact about products, prices, stock and opening hours. Never invent products, prices, availability or hours. Name products exactly as the tools return them.
2. Search broadly first. For a gift, use search_products with the occasion (occasion "travel" for someone who travels), the budget (maxPriceJpy) and the boutique (inStockAt). Add a category or collection only when the customer asks for one. If a search finds nothing, drop a filter and search again before saying nothing fits.
3. Before calling request_appointment, restate the boutique, date, time and products in one short sentence, and wait for the customer's yes.
4. Write requestedFor as ISO 8601 with the +09:00 offset, for example 2026-10-10T14:00:00+09:00. Use real calendar dates, and work out weekdays from today's date above.
5. Never say a visit is confirmed. Say it is requested, and that the boutique will confirm it on LINE.
6. If a tool returns an error, follow its hint. not_found means a slug was wrong: look it up with the tool the hint names, never guess. An input validation error means fix the arguments and call again. Otherwise ask the customer.
7. ${locale === 'ja' ? 'Reply in polite Japanese (keigo).' : 'Reply in English.'} Pass locale "${locale}" to every tool that takes one, so names match your reply and the app's cards. Keep replies to two or three short sentences. The app shows product cards, so don't repeat their details.
8. Suggest at most three products at a time.`;

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
    const result = streamText({
      model: deps.model,
      instructions: conciergeInstructions(locale, deps.now?.() ?? new Date()),
      messages: await convertToModelMessages(messages),
      tools: await mcp.tools(),
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

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
import { pieceSlugOf } from './piece-slug';
import { RELATIVE_IDS, WEEKDAY_IDS, WEEK_IDS, resolveDate } from './resolve-date';
import { MAX_BODY_BYTES, isCustomerSession, readBody } from './strapi-proxy';
import { CHOOSE_VISIT } from './visit-picker';

/** Tells the Maison plugin a call came from the concierge. Informational; never used for identity. */
export const SURFACE_HEADER = 'x-maison-surface';
const MAX_MESSAGES = 20;
const MAX_CHARS = 1000;
/** The longest question hand_off_to_staff takes (its schema's limit), in UTF-16 units: how Strapi counts a string's length. */
const MAX_QUESTION = 1000;
/** The longest reply log_inquiry takes (its schema's limit), in UTF-16 units as above: a longer turn is cut to it, not refused whole. */
const MAX_REPLY = 8000;
const MAX_STEPS = 8; // resolve_date adds a step to most visits: the original 6 left a long search no room to answer
/** How long the end-of-turn log may take: Strapi is close, and the customer's stream waits for it to finish. */
const LOG_TIMEOUT_MS = 5000;
/** How many days the calendar in the instructions covers, today first. */
const CALENDAR_DAYS = 14;
const WEEKDAY_NAMES = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
} as const;

const tokyoDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

// The slug check is a file of its own, which the concierge page imports (lib/piece-slug.ts says why). Exported from here too, with its tests.
export { pieceSlugOf };

/**
 * The concierge's instructions, built for each request. Dates are what a small model gets wrong: on the local model
 * "Saturday" came out as Friday, even with a calendar in front of it. So it never works a date out. It asks
 * resolve_date, and passes what that returns to choose_visit: the customer checks the visit, and sends it, in the app's
 * picker (lib/visit-picker.ts). The calendar is only
 * context: Tokyo's (lib/format.ts), whatever time zone the server runs in, with the weekdays in the reply's language.
 * For a customer who came from a piece's page (Ask about this piece), `piece` is its slug (pieceSlugOf), and a last
 * paragraph, after the rules, says that "it" and "this" mean that piece.
 */
export const conciergeInstructions = (locale: 'ja' | 'en', now: Date, piece?: string | null) => {
  const days = tokyoDays(CALENDAR_DAYS, now);
  const calendar = days.map(({ date, weekday }) => `${date} ${WEEKDAY_NAMES[locale][weekday]}`).join('\n');
  const instructions = `You are the concierge of Maison, a fictional luxury house of trunks, bags and small gifts. You help one signed-in customer choose a gift and request a boutique visit.
Today in Tokyo: ${tokyoDay(now)}. Boutique times are Japan time (Asia/Tokyo, +09:00).

Calendar of the next ${CALENDAR_DAYS} days in Tokyo, today first:
${calendar}

Rules:
1. Use the tools for every fact about products, prices, stock and opening hours. Never invent products, prices, availability or hours. Name products exactly as the tools return them. Call the tools you need in this reply and answer from their results: never say you will look something up and then stop.
2. Search broadly first. For a gift, use search_products with the occasion (occasion "travel" for someone who travels), the budget (maxPriceJpy) and the boutique (inStockAt). Add a category or collection only when the customer asks for one. If a search finds nothing, drop a filter and search again before saying nothing fits.
3. To request a visit, call choose_visit with the pieces the customer wants to see and, when they named them, the boutique slug, the day (the date resolve_date returned) and the time (HH:MM, 24-hour). Never ask for a boutique, day or time in words, and never restate them for a yes: the app shows them filled in, and the customer sends the request there. If the customer asks to visit before choosing a piece, call choose_visit in the same reply with the pieces you suggest in that reply or suggested just before, at most three; ask which piece only when you have none to suggest.
4. Call resolve_date only when the customer names a day, never to find out today's date, which is given above.${locale === 'ja' ? ' 日付が出ていないご相談では resolve_date を呼ばないでください。' : ''} Never work out or guess a date or weekday yourself. When the customer names a day ("Saturday", "tomorrow", "10 October"), call resolve_date for it first, on its own, before find_boutiques with a date and before choose_visit: weekday for a weekday name ("Saturday": week "this"; "next week's Saturday", 来週の土曜日: week "next"), relative for exactly "today", "tomorrow" or "day_after_tomorrow" ("the day after tomorrow", 明後日), date for any other day: a calendar date, or a day you read off the calendar, such as "in 3 days". If the customer names no day, don't call it, don't pass a date to find_boutiques or choose_visit, and don't suggest a day yourself. Look up opening hours only when they ask about them, by calling find_boutiques without a date, which lists each boutique's weekly hours. Use the date resolve_date returns, and the weekday it returns when you speak of that day, never a weekday from the customer's words. If isPast is true, that day has gone: ask for another day. For a day the calendar doesn't show ("next month"), ask the customer which day they mean. Visits can be requested from tomorrow up to two weeks ahead: when the customer wants today, or a later day than that, say so in one short sentence and call choose_visit without a date.
5. Never say a visit is confirmed. When choose_visit answers requested, say in one short sentence that the visit is requested and the boutique will confirm it on LINE; the app shows the details. When it answers closed, offer help without pushing.
6. If a tool returns an error, follow its hint. not_found means a slug was wrong: look it up with the tool the hint names, never guess. An input validation error means fix the arguments and call again. Otherwise ask the customer.
7. ${locale === 'ja' ? 'Reply in polite Japanese (keigo).' : 'Reply in English.'} Pass locale "${locale}" to every tool that takes one, so names match your reply and the app's cards. Keep replies to two or three short sentences of plain text: no markdown, no bold, no numbered or bulleted lists. The app shows product cards, so don't repeat their details.
8. Suggest at most three products at a time.
9. For a question about Maison's services and policies, such as care, materials, sizing, personalization, delivery, payment, returns, repairs, warranty or gift wrapping, call search_knowledge with the customer's own words, and with productSlugs when the question is about particular pieces. Answer only from the entries it returns, and never invent a policy, a price or a time. If no entry answers the question, call hand_off_to_staff next, before you write anything, with the customer's question in their own words, reason "no_answer", and productSlug when it is about one piece. Then thank the customer and say in one short sentence that one of Maison's client advisors will look into it and message them here on LINE with the answer: the app shows the details. Never say a question is with the advisors unless hand_off_to_staff, or search_knowledge's own hand-off, succeeded for it, in this reply or an earlier one, and never promise a time yourself.
10. If the customer asks to talk to a person, call hand_off_to_staff at once with their request, reason "asked_for_person". Hand off each question once: if it is already with the advisors, say so.`;
  return piece
    ? `${instructions}\n\nThe customer is on the page of the piece with slug "${piece}". Unless they name another piece, "it" and "this" mean that piece: use that slug with view_product, as productSlugs for search_knowledge, and as productSlug for hand_off_to_staff.`
    : instructions;
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
      'Works out which day the customer means, on Tokyo\'s calendar, so you never work out a date or weekday yourself. Call it only when the customer has named a day, never to look up today\'s date or to suggest a day, and call it before find_boutiques with a date and before choose_visit. Give exactly one of: weekday (a weekday name, with week "this" for "Saturday" or "next" for "next week\'s Saturday", 来週の土曜日), relative ("today", "tomorrow" or "day_after_tomorrow", 明後日), or date (YYYY-MM-DD, to get its weekday). It returns the date as YYYY-MM-DD, the weekday\'s name in the customer\'s language, and isPast, whether that day has already gone.',
    inputSchema: resolveDateInput,
    execute: async (query) => resolveDate(query, locale, now),
  });

/** A slug, as the Maison tools take one (slugInput): lower-case letters, digits and hyphens. */
const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * Strapi's reason when a choose_visit call names a piece it doesn't know (find_boutiques' not_found), or null when it
 * knows every piece or the check couldn't tell.
 */
type UnknownPieces = (productSlugs: string[]) => Promise<string | null>;

/**
 * choose_visit's input: a strict object, as resolve_date's, so a key it doesn't have is refused with its name, and the
 * same tidying (tidyInput): blanks and nulls mean "not given", case and spaces don't count, and a locale is ignored. The
 * picker checks the rest against the boutiques' hours and stock (lib/visit-picker.ts): a day or a time the call gets wrong
 * falls back, and is never sent as it is. A piece can't fall back: Strapi refuses the picker's whole find_boutiques call
 * for a piece it doesn't know, which would leave a form with no boutiques. So input with nothing else wrong is checked
 * with `unknownPieces`, and Strapi's reason refuses the call: the model reads it and calls again (rule 6).
 */
const chooseVisitInput = (unknownPieces: UnknownPieces) =>
  z.preprocess(
    tidyInput,
    z
      .strictObject({
        productSlugs: z
          .array(z.string().regex(SLUG, 'Use product slugs, such as "weekender-50".'))
          .min(1)
          .max(5)
          .describe('The pieces the customer wants to see: 1 to 5 product slugs, from search_products or view_product.'),
        boutique: z.string().regex(SLUG, 'Use a boutique slug, such as "ginza".').optional().describe('Only when the customer named a boutique: its slug, such as "ginza".'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD: the date resolve_date returned.').optional().describe('Only when the customer named a day: the date resolve_date returned, YYYY-MM-DD.'),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24-hour: 2 pm is "14:00".')
          .optional()
          .describe('Only when the customer named a time: HH:MM, 24-hour, such as "14:00" for 2 pm.'),
      })
      .superRefine(
        async ({ productSlugs }, context) => {
          const reason = await unknownPieces(productSlugs);
          if (reason !== null) context.addIssue({ code: 'custom', path: ['productSlugs'], message: reason });
        },
        // Only for input with nothing else wrong: the check is a call to Strapi.
        { when: (payload) => payload.issues.length === 0 }
      )
  );

/**
 * The app's own tool for a visit: it shows the customer the visit picker, the product page's booking form, filled in
 * from the call. It has no execute: the model's call ends the step loop and reaches the browser as a tool-choose_visit
 * part waiting for its output, which the picker adds (addToolOutput) once the customer has sent the request or closed it.
 */
const chooseVisitTool = (unknownPieces: UnknownPieces) =>
  tool({
    description:
      'Shows the customer the visit picker in the chat: the form to request a boutique visit, filled in with what you pass. Pass productSlugs, the pieces to see, and only what the customer named: the boutique slug, the date resolve_date returned, and the time as HH:MM (24-hour). The customer checks it and sends the request there, so your reply stops here until they answer. It answers status "requested", with the visit, once the customer has sent it, or status "closed" when they closed the picker without a request.',
    inputSchema: chooseVisitInput(unknownPieces),
  });

/** How long choose_visit's check of its pieces may take: Strapi is close, and the reply waits for it. */
const PIECES_CHECK_TIMEOUT_MS = 5000;

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

/**
 * `text` cut to `max` UTF-16 units, how Strapi counts a string's length: never through half of an emoji, and without the
 * blanks the cut leaves at its end. Text that fits is returned as it is.
 */
const cutTo = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  return (/[\uD800-\uDBFF]$/.test(head) ? head.slice(0, -1) : head).trimEnd(); // the cut may have left a lone half of a pair
};

/**
 * The customer's last message as the question for staff: its text parts, trimmed, and cut to what hand_off_to_staff
 * takes, never through half of an emoji. Empty when it has no text.
 */
const lastQuestionOf = (messages: UIMessage[]): string => {
  const text = messages.findLast((message) => message.role === 'user')?.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n') ?? '';
  return cutTo(text.trim(), MAX_QUESTION);
};

/** What the app records for staff when the knowledge search finds nothing (withAutoHandOff). */
export interface AutoHandOffContext {
  /** The customer's last message (lastQuestionOf): the question, as they wrote it. */
  question: string;
  /** The piece whose page the customer asked from (pieceSlugOf), or null. It is what the question is about unless the search names another (pieceOfSearch). */
  piece: string | null;
  /** The chat's language: the question's. */
  locale: 'ja' | 'en';
}

/**
 * The piece a question is about, for the hand-off an empty search makes: the one the search was about, which isn't always
 * the page's (a customer on one piece's page may ask about another, and staff see, and an answer saved to knowledge is
 * tagged to, the piece recorded here). `input` is what the model sent search_knowledge, and `page` the piece whose page
 * the customer asked from. A value in productSlugs that isn't a slug names no piece, and a piece named twice is one.
 * - The search names exactly one piece: that one.
 * - It names none, or its pieces include the page's: the page's piece (none, on no page).
 * - Otherwise (it names several, and the page's isn't among them): none, since there's no telling which one it is about.
 */
const pieceOfSearch = (input: unknown, page: string | null): string | null => {
  const named = [...new Set((isObject(input) && Array.isArray(input.productSlugs) ? input.productSlugs : []).flatMap((slug) => pieceSlugOf(slug) ?? []))];
  if (named.length === 1) return named[0];
  return named.length === 0 || (page !== null && named.includes(page)) ? page : null;
};

/** The question Strapi recorded, as hand_off_to_staff answers it. */
interface RecordedQuestion {
  reference: string;
  status: 'open';
  product: { slug: string; name: string } | null;
}

/** The question a hand_off_to_staff result says Strapi recorded: null for a refusal, and for a result with no reference. */
const recordedQuestionOf = (result: unknown): RecordedQuestion | null => {
  if (!isObject(result) || result.isError === true || !isObject(result.structuredContent)) return null;
  const { question } = result.structuredContent;
  if (!isObject(question) || typeof question.reference !== 'string' || question.reference === '') return null;
  const { product } = question;
  return {
    reference: question.reference,
    status: 'open',
    product: isObject(product) && typeof product.slug === 'string' && typeof product.name === 'string' ? { slug: product.slug, name: product.name } : null,
  };
};

/** hand_off_to_staff's own answer for a question that is already recorded, in the shape Strapi's tool gives it. */
const recordedResult = (question: RecordedQuestion) => {
  const data = { question };
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
};

/** Strapi's refusal as it gave it, for the log: the first text part of an error result, cut to 300. None for any other answer, and for a refusal with no text. */
const refusalTextOf = (answer: unknown): string | undefined => {
  const item = isObject(answer) && answer.isError === true && Array.isArray(answer.content) ? answer.content.find((part) => isObject(part) && part.type === 'text') : undefined;
  return isObject(item) && typeof item.text === 'string' ? item.text.slice(0, 300) : undefined;
};

/**
 * Strapi's words for a not_found refusal, as a Maison tool answers one (an isError result with its error as JSON): its
 * message and its hint. Null for any other answer.
 */
const notFoundOf = (answer: unknown): string | null => {
  const item = isObject(answer) && answer.isError === true && Array.isArray(answer.content) ? answer.content.find((part) => isObject(part) && part.type === 'text') : undefined;
  if (!isObject(item) || typeof item.text !== 'string') return null;
  let error: unknown;
  try {
    error = (JSON.parse(item.text) as { error?: unknown } | null)?.error;
  } catch {
    return null; // not JSON: no refusal of Strapi's
  }
  if (!isObject(error) || error.code !== 'not_found' || typeof error.message !== 'string') return null;
  return [error.message, error.hint].filter((words) => typeof words === 'string' && words !== '').join(' ');
};

/** What a hand-off that recorded nothing says, for the log: Strapi's refusal as it gave it, or that its answer has no reference. */
const whyNothingWasRecorded = (answer: unknown): string => refusalTextOf(answer) ?? 'its answer has no reference';

/** Whether a search_knowledge result came back whole and found nothing: not a refusal, and its `entries` an empty list. */
const foundNothing = (result: unknown): result is Record<string, unknown> & { structuredContent: Record<string, unknown> } =>
  isObject(result) && result.isError !== true && isObject(result.structuredContent) && Array.isArray(result.structuredContent.entries) && result.structuredContent.entries.length === 0;

/**
 * Has the app's server record a question no entry answers for Maison's staff, whatever the model does. Rule 9 tells the
 * model to call hand_off_to_staff when search_knowledge finds nothing, but the local model searched, found nothing,
 * skipped the call and wrote that the question was with the advisors: nothing was recorded, so its words were false. So:
 * - A search that comes back whole with no entries makes the call itself, for the customer's last message (their own
 *   words, not the model's), reason "no_answer", about the piece the search was about (pieceOfSearch: the one it names,
 *   else the page's). When Strapi records it, the search's result carries what it recorded (structuredContent.handOff,
 *   which the chat shows as the hand-off note, lib/tool-view.ts) and a sentence that tells the model. When the call
 *   fails, the result is as Strapi gave it and the chat shows its plain note. Nothing in the chat says why, so the log
 *   does, unless the customer closed the chat meanwhile: the call was cut short then, and nothing failed.
 * - hand_off_to_staff records once a request: after a question is recorded, by the model's call or the app's, a later
 *   call is answered with it and doesn't reach Strapi. A call that failed doesn't count, so a retry does. The calls run
 *   one at a time, so the model's call and the app's, made in the same step, can't both record.
 * Each call to this function has a hand-off of its own, so none is shared between requests. The tools are returned as
 * they are when either one is missing (a token without the permission).
 */
export const withAutoHandOff = <TOOLS extends ToolSet>(tools: TOOLS, context: AutoHandOffContext): TOOLS => {
  const { search_knowledge: searchTool, hand_off_to_staff: handOffTool } = tools;
  const runSearch = searchTool?.execute;
  const runHandOff = handOffTool?.execute;
  if (!searchTool || !handOffTool || !runSearch || !runHandOff) return tools;
  type Options = Parameters<typeof runSearch>[1];

  /** What Strapi recorded in this request, once something has. */
  let recorded: RecordedQuestion | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  /** Runs `task` once every one before it has finished, however it ended. */
  const oneAtATime = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  };

  const searchAndHandOff = async (input: unknown, options: Options) => {
    const result = await runSearch(input, options);
    if (!foundNothing(result) || context.question === '') return result;
    /** Logs a failed hand-off, unless the customer closed the chat meanwhile: the call was cut short then, and nothing failed. */
    const logFailure = (what: string) => {
      if (!options?.abortSignal?.aborted) console.warn(`[concierge] The hand-off for a search that found nothing ${what}`);
    };
    return oneAtATime(async () => {
      if (recorded) return result;
      const productSlug = pieceOfSearch(input, context.piece);
      let answer: unknown;
      try {
        answer = await runHandOff({ question: context.question, reason: 'no_answer', ...(productSlug ? { productSlug } : {}), locale: context.locale }, options);
      } catch (error) {
        logFailure(`broke on the way: ${error instanceof Error ? error.message : String(error)}`);
        return result;
      }
      const question = recordedQuestionOf(answer);
      if (!question) {
        logFailure(`recorded nothing: ${whyNothingWasRecorded(answer)}`);
        return result;
      }
      recorded = question;
      return {
        ...result,
        content: [
          ...(Array.isArray(result.content) ? result.content : []),
          { type: 'text', text: `No entry answers this, so the question was passed to Maison's client advisors as ${question.reference}. Don't call hand_off_to_staff for it.` },
        ],
        structuredContent: { ...result.structuredContent, handOff: { reference: question.reference, question: context.question, product: question.product } },
      };
    });
  };

  const handOffOnce = (input: unknown, options: Options) =>
    oneAtATime(async () => {
      if (recorded) return recordedResult(recorded);
      const result = await runHandOff(input, options);
      recorded = recordedQuestionOf(result);
      return result;
    });

  return { ...tools, search_knowledge: { ...searchTool, execute: searchAndHandOff }, hand_off_to_staff: { ...handOffTool, execute: handOffOnce } } as TOOLS;
};

/** What a finished turn did, for the inquiry it logs: whether knowledge answered, and the question a hand-off recorded. */
export const turnFactsOf = (
  toolResults: ReadonlyArray<{ toolName: string; output: unknown }>
): { knowledgeFound: boolean; handedOff: boolean; questionReference: string | null } => {
  let knowledgeFound = false;
  let questionReference: string | null = null;
  for (const { toolName, output } of toolResults) {
    if (toolName === 'search_knowledge' && isObject(output) && output.isError !== true && isObject(output.structuredContent)) {
      const { entries, handOff } = output.structuredContent;
      if (Array.isArray(entries) && entries.length > 0) knowledgeFound = true;
      if (isObject(handOff) && typeof handOff.reference === 'string' && handOff.reference !== '') questionReference ??= handOff.reference;
    }
    if (toolName === 'hand_off_to_staff') questionReference ??= recordedQuestionOf(output)?.reference ?? null;
  }
  return { knowledgeFound, handedOff: questionReference !== null, questionReference };
};

/** The concierge's words for the turn: every text part of every step, as the customer read them. */
export const turnReplyOf = (content: ReadonlyArray<{ type: string; text?: string }>): string =>
  content
    .flatMap((part) => (part.type === 'text' && typeof part.text === 'string' ? [part.text] : []))
    .join('\n\n')
    .trim();

/** What the log says of a turn that ended at a visit picker, for the staff who read it: the concierge's words aren't the whole of what it did. */
const PICKER_NOTE = '(The concierge showed a visit picker so the customer can request a visit.)';

/**
 * The reply a finished turn is logged with: its words (turnReplyOf), and, when the turn holds a choose_visit call, the
 * note above on a paragraph of its own, or alone when no words came before the call. A turn that ends at the call has
 * nothing after it: the customer's answer comes in a later request, which isn't logged, so without the note staff's
 * labeller would see a customer with no answer. A call the schema refused (`invalid`) showed no picker, and doesn't count.
 */
const loggedReplyOf = (content: ReadonlyArray<{ type: string; text?: string; toolName?: string; invalid?: boolean }>): string => {
  const words = turnReplyOf(content);
  const showedPicker = content.some((part) => part.type === 'tool-call' && part.toolName === CHOOSE_VISIT && part.invalid !== true);
  return showedPicker ? [words, PICKER_NOTE].filter((paragraph) => paragraph !== '').join('\n\n') : words;
};

/** The request's JSON, or null when it isn't JSON: the conversation then counts as empty. */
const parseBody = (raw: Uint8Array): { messages?: unknown[]; locale?: string; product?: unknown } | null => {
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
  // The piece whose page the customer asked from, when they did: a value that isn't a slug is ignored, never passed on.
  const piece = pieceSlugOf(body?.product);

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
    // log_inquiry is the app's own call, made once a turn is over. The model is never offered it: the log says what happened, not what the model says happened.
    // Nor request_appointment: the customer books in the visit picker (choose_visit), which calls it with their own session.
    const { log_inquiry: logTool, request_appointment: _bookedInThePicker, ...mcpTools } = await mcp.tools();
    const question = lastQuestionOf(messages);
    /**
     * A request whose last message is the concierge's own carries the customer's answer to a visit picker, and the reply
     * goes on in that message (resumesOncePerAnswer in lib/visit-picker.ts). Its turn was logged when the customer's
     * message arrived: one inquiry per customer message.
     */
    const resumed = messages.at(-1)?.role === 'assistant';
    // The Maison tools, with the chat's locale, and with the hand-off an empty knowledge search makes on its own.
    const maisonTools = withAutoHandOff(await withConversationLocale(mcpTools, locale), { question, piece, locale });
    const findBoutiques = mcpTools.find_boutiques?.execute;
    /**
     * choose_visit's check of its pieces: one find_boutiques call with them, as the picker will make. Only Strapi's
     * not_found refuses the call. Anything else lets it through: no find_boutiques for this token, a refusal the model
     * can't put right, a call that breaks, or one that takes longer than PIECES_CHECK_TIMEOUT_MS. The form then shows its
     * own error, with Try again.
     */
    const unknownPieces: UnknownPieces = async (productSlugs) => {
      if (!findBoutiques) return null;
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(PIECES_CHECK_TIMEOUT_MS)]);
        const answer = await findBoutiques({ productSlugs, locale }, { toolCallId: 'check-pieces', messages: [], context: undefined, abortSignal: signal });
        return notFoundOf(answer);
      } catch {
        return null;
      }
    };
    const tools = { ...maisonTools, resolve_date: resolveDateTool(locale, now), [CHOOSE_VISIT]: chooseVisitTool(unknownPieces) };
    /**
     * Logs the finished turn in Strapi as an inquiry, for the staff's Inquiries tab. Nothing is logged without the tool (a
     * token without the permission) or without a question to log. A log that fails, is refused or runs past LOG_TIMEOUT_MS
     * never changes the customer's turn: the reply is already written, so the log only warns, and this never throws.
     */
    const logTurn = async (event: { content: Parameters<typeof loggedReplyOf>[0]; toolResults: Parameters<typeof turnFactsOf>[0] }) => {
      if (!logTool?.execute || question === '' || resumed) return;
      // The call's own limit, not the request's signal: a customer who closes the chat after the last word doesn't cut the log.
      const timeout = AbortSignal.timeout(LOG_TIMEOUT_MS);
      let why: string | undefined;
      try {
        const { knowledgeFound, handedOff, questionReference } = turnFactsOf(event.toolResults);
        const answer = await logTool.execute(
          {
            message: question,
            // A long turn is logged cut to what the tool takes (the note included): refused whole, it wouldn't be logged at all.
            reply: cutTo(loggedReplyOf(event.content), MAX_REPLY),
            knowledgeFound,
            handedOff,
            ...(questionReference ? { questionReference } : {}),
            ...(piece ? { productSlug: piece } : {}),
            locale,
          },
          { toolCallId: 'log-inquiry', messages: [], context: undefined, abortSignal: timeout }
        );
        if (isObject(answer) && answer.isError === true) why = refusalTextOf(answer) ?? 'its answer gives no reason';
      } catch (error) {
        // The MCP client words a call the signal cut off as "Request was aborted", which doesn't say who did it.
        why = timeout.aborted ? `it took longer than ${LOG_TIMEOUT_MS / 1000} seconds` : error instanceof Error ? error.message : String(error);
      }
      if (why !== undefined) console.warn("[concierge] The turn couldn't be logged:", why);
    };
    /**
     * Whether the turn failed or was cut off. onEnd isn't told: it also runs for a turn that fails once a step has finished
     * (see onEnd below). No stream retries are set, so every onError ends the turn.
     */
    let failed = false;
    const result = streamText({
      model: deps.model,
      instructions: conciergeInstructions(locale, now, piece),
      // With the tools, an earlier turn's tool results reach the model as each tool shapes them (toModelOutput), as
      // they did in that turn, and not as the raw MCP result. A visit picker the customer moved past by writing has no
      // answer: a call without a result is one the model call refuses (MissingToolResultsError), so it is left out, and
      // the model answers the new message (ignoreIncompleteToolCalls).
      messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
      tools,
      stopWhen: isStepCount(MAX_STEPS),
      abortSignal: request.signal,
      // onEnd is skipped on abort, and when no step completes, so close in all three. It also runs, after onError, for a turn
      // that fails once a step has finished (a tool step, then a model call that throws or a stream that errors), so `failed`
      // keeps that turn out of the log: only a turn that ended whole is logged, and before the client closes, since closing
      // it first would cut the log short.
      onEnd: async (event) => {
        if (!failed) await logTurn(event);
        await close();
      },
      onAbort: async () => {
        failed = true;
        await close();
      },
      onError: async ({ error }) => {
        failed = true;
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

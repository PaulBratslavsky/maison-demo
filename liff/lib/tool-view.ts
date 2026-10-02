import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { COPY } from './copy';
import { toolErrorOf } from './mcp';
import type { Appointment, Locale, ProductCard } from './types';

/** What the chat needs from AI SDK 7's dynamic-tool UI part (MCP tools arrive as dynamic tools). */
export interface ToolPart {
  toolName: string;
  state: string;
  /** What the model sent the tool. */
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

/**
 * A message part as a tool call, or null when it isn't one. MCP tools arrive as `dynamic-tool` parts, which carry their
 * name. The concierge's own tool (resolve_date) arrives as a `tool-<name>` part, with the name in the type.
 */
export const toolPartOf = (part: { type: string }): ToolPart | null => {
  if (part.type === 'dynamic-tool') return part as unknown as ToolPart;
  if (part.type.startsWith('tool-')) return { ...part, toolName: part.type.slice('tool-'.length) } as unknown as ToolPart;
  return null;
};

/** The concierge's own tool. It isn't a Maison tool, so its line says "Local", not "MCP". */
const LOCAL_TOOLS = ['resolve_date'];

/** What `resolve_date` returned, for its line: the weekday and date the model was given. */
const resolvedDay = (output: unknown): string | null => {
  const day = output as { date?: unknown; weekday?: unknown } | null;
  return typeof day?.date === 'string' && typeof day.weekday === 'string' ? `${day.weekday} ${day.date}` : null;
};

/**
 * What a call gave back: whether it failed (it broke on the way, or Maison refused it with an isError result), and,
 * when it came back whole, the result's structuredContent.
 */
const outcomeOf = (part: ToolPart) => {
  const output = part.state === 'output-available' ? (part.output as CallToolResult) : null;
  const error = output ? toolErrorOf(output) : null;
  const failed = part.state === 'output-error' || error !== null;
  const data = output && !error ? (output.structuredContent as Record<string, unknown> | undefined) : undefined;
  return { error, failed, data };
};

/** A question Strapi recorded for Maison's client advisors: the reference it gave, and the question as the model sent it. */
export interface RecordedHandOff {
  reference: string;
  question: string;
}

/**
 * What Strapi recorded, for a hand_off_to_staff that went through; null for any other call, one that is running, broke
 * on the way or was refused, and a result with no reference. The reference is read from the result's structuredContent
 * (question.reference) and nowhere else, and it is what says the question is with the advisors. The question is read from
 * what the model sent, which Strapi checked before it recorded it.
 */
const recordedBy = (part: ToolPart): RecordedHandOff | null => {
  if (part.toolName !== 'hand_off_to_staff' || part.state !== 'output-available') return null;
  const reference = (outcomeOf(part).data?.question as { reference?: unknown } | null | undefined)?.reference;
  if (typeof reference !== 'string' || reference === '') return null;
  const question = (part.input as { question?: unknown } | null | undefined)?.question;
  return { reference, question: typeof question === 'string' ? question : '' };
};

/**
 * What a tool call shows in the chat, built from its structuredContent, never from the model's text: its line ("MCP ·
 * search_products ✓ 5 results", "Local · resolve_date ✓ Saturday 2026-10-10", "… ✕ boutique_closed"), the products a
 * search found, the appointment a request made, and the question a hand-off recorded (handOffAt decides where a
 * message's note goes).
 */
export const toolView = (part: ToolPart, locale: Locale) => {
  const t = COPY[locale];
  const local = LOCAL_TOOLS.includes(part.toolName);
  const { error, failed, data } = outcomeOf(part);
  const list = Object.values(data ?? {}).find(Array.isArray) as unknown[] | undefined;
  const answer = local && !failed ? resolvedDay(part.output) : null;
  const status = part.state.startsWith('input')
    ? '…'
    : failed
      ? `✕ ${error?.code ?? 'error'}`
      : `✓${answer ? ` ${answer}` : list ? ` ${t.results(list.length)}` : ''}`;
  return {
    line: `${local ? 'Local' : 'MCP'} · ${part.toolName} ${status}`,
    failed,
    products: part.toolName === 'search_products' && Array.isArray(data?.products) ? (data.products as ProductCard[]) : null,
    appointment: part.toolName === 'request_appointment' ? ((data?.appointment as Appointment | undefined) ?? null) : null,
    handOff: recordedBy(part),
  };
};

/**
 * Where a message's hand-off note goes, and which note it is: `index`, in its parts, of the part it goes under, and
 * `recorded`; or null for no note. There is one note a message:
 * - under the first hand_off_to_staff that went through, whatever the searches found: `recorded` is what Strapi recorded,
 *   so the note names the question's reference, and its button sends the question in the LINE chat;
 * - otherwise, when no hand-off went through, under the last search_knowledge, if it came back whole with no entries:
 *   `recorded` is null, and the note is the plain one. The local model often skips the call, and one that failed or was
 *   refused recorded nothing, so the chat doesn't wait for it: that note says only where the team answers, never that
 *   the question is with the advisors.
 *
 * The conditions below are the fallback's alone; a hand-off that went through needs none. The fallback shows only when no
 * search in the message found entries (the question may be answered) and none is still running (a note that showed while
 * a second search was under way would vanish when that one found the answer). The last search decides: an earlier one
 * that failed or was refused doesn't count, because rule 6 has the model fix its arguments and search again, and the
 * local model makes bad first calls. A last search that failed or was refused means no note.
 */
export const handOffAt = (parts: ReadonlyArray<{ type: string }>): { index: number; recorded: RecordedHandOff | null } | null => {
  const calls = parts.flatMap((part, index) => {
    const tool = toolPartOf(part);
    return tool ? [{ index, tool }] : [];
  });
  for (const { index, tool } of calls) {
    const recorded = recordedBy(tool);
    if (recorded) return { index, recorded };
  }
  const searches = calls.filter(({ tool }) => tool.toolName === 'search_knowledge');
  const last = searches.at(-1);
  /** The entries a search found: undefined unless it came back whole with a list of them. */
  const entriesOf = ({ tool }: (typeof calls)[number]) => {
    const entries = outcomeOf(tool).data?.entries;
    return Array.isArray(entries) ? entries : undefined;
  };
  const foundEntries = searches.some((search) => (entriesOf(search)?.length ?? 0) > 0);
  const running = searches.some(({ tool }) => tool.state !== 'output-available' && tool.state !== 'output-error');
  return last && !foundEntries && !running && entriesOf(last)?.length === 0 ? { index: last.index, recorded: null } : null;
};

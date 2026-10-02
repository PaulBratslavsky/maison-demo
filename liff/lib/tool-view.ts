import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { COPY } from './copy';
import { toolErrorOf } from './mcp';
import type { Appointment, Locale, ProductCard } from './types';

/** What the chat needs from AI SDK 7's dynamic-tool UI part (MCP tools arrive as dynamic tools). */
export interface ToolPart {
  toolName: string;
  state: string;
  output?: unknown;
  errorText?: string;
}

/**
 * A message part as a tool call, or null when it isn't one. MCP tools arrive as `dynamic-tool` parts, which carry their
 * name. The concierge's own tools (resolve_date, hand_off_to_staff) arrive as `tool-<name>` parts, with the name in the type.
 */
export const toolPartOf = (part: { type: string }): ToolPart | null => {
  if (part.type === 'dynamic-tool') return part as unknown as ToolPart;
  if (part.type.startsWith('tool-')) return { ...part, toolName: part.type.slice('tool-'.length) } as unknown as ToolPart;
  return null;
};

/** The concierge's own tools. They aren't Maison tools, so their lines say "Local", not "MCP". */
const LOCAL_TOOLS = ['resolve_date', 'hand_off_to_staff'];

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

/** Whether a call is a hand_off_to_staff that went through. */
const handedOff = (part: ToolPart) => part.toolName === 'hand_off_to_staff' && part.state === 'output-available' && !outcomeOf(part).failed;

/**
 * What a tool call shows in the chat, built from its structuredContent, never from the model's text: its line ("MCP ·
 * search_products ✓ 5 results", "Local · resolve_date ✓ Saturday 2026-10-10", "… ✕ boutique_closed"), the products a
 * search found, the appointment a request made, and whether it is a hand-off that went through (handOffAt decides where
 * a message's note goes).
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
    handOff: handedOff(part),
  };
};

/**
 * Where a message's hand-off note goes, with the LINE chat button: the index, in its parts, of the part it goes under,
 * or null for no note. There is one note a message. The note is all hand_off_to_staff does (it sends nothing), and the
 * local model often skips the call, so the chat doesn't wait for it:
 * - under the first hand_off_to_staff that went through, whatever the searches found;
 * - otherwise, when there was no such call, under the last search_knowledge, if it came back whole with no entries.
 *
 * The conditions below are the fallback's alone; a hand-off that went through needs none. The fallback shows only when no
 * search in the message found entries (the question may be answered) and none is still running (a note that showed while
 * a second search was under way would vanish when that one found the answer). The last search decides: an earlier one
 * that failed or was refused doesn't count, because rule 6 has the model fix its arguments and search again, and the
 * local model makes bad first calls. A last search that failed or was refused means no note.
 */
export const handOffAt = (parts: ReadonlyArray<{ type: string }>): number | null => {
  const calls = parts.flatMap((part, index) => {
    const tool = toolPartOf(part);
    return tool ? [{ index, tool }] : [];
  });
  const handOff = calls.find(({ tool }) => handedOff(tool));
  if (handOff) return handOff.index;
  const searches = calls.filter(({ tool }) => tool.toolName === 'search_knowledge');
  const last = searches.at(-1);
  /** The entries a search found: undefined unless it came back whole with a list of them. */
  const entriesOf = ({ tool }: (typeof calls)[number]) => {
    const entries = outcomeOf(tool).data?.entries;
    return Array.isArray(entries) ? entries : undefined;
  };
  const foundEntries = searches.some((search) => (entriesOf(search)?.length ?? 0) > 0);
  const running = searches.some(({ tool }) => tool.state !== 'output-available' && tool.state !== 'output-error');
  return last && !foundEntries && !running && entriesOf(last)?.length === 0 ? last.index : null;
};

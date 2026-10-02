import { handOffAt } from './tool-view';

/** What the chat needs from a message part: its text, or the tool call it records. */
interface ChatPart {
  type: string;
  text?: string;
  /** The tool's name, on a dynamic-tool part (MCP tools arrive as dynamic tools). */
  toolName?: string;
  state?: string;
  output?: unknown;
}

/** What the chat needs from a message to tell whether the concierge answered. */
interface ChatMessage {
  role: string;
  parts: ReadonlyArray<ChatPart>;
}

/** The parts the screen shows: text with something in it, and tool calls. */
const shown = (part: ChatPart) =>
  part.type === 'text' ? Boolean(part.text?.trim()) : part.type === 'dynamic-tool' || part.type.startsWith('tool-');

/** A tool call's name: a dynamic-tool part carries it (MCP tools arrive as dynamic tools), a static one has it in its type. */
const toolNameOf = (part: ChatPart): string | undefined =>
  part.type === 'dynamic-tool' ? part.toolName : part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : undefined;

/** Whether a call's result is a refusal: an MCP error result (isError) that came back. */
const refused = (part: ChatPart): boolean => part.state === 'output-available' && (part.output as { isError?: unknown } | null | undefined)?.isError === true;

/**
 * Whether a part is a request_appointment call that may have booked a visit. Only Maison's refusal says it didn't: an
 * MCP error result (isError) that came back. A result without one is a booking. A call with no result, or one that failed
 * on the way (output-error), can't be told from a booking that went through, so it counts as one.
 */
const mayHaveBooked = (part: ChatPart): boolean => toolNameOf(part) === 'request_appointment' && !refused(part);

/**
 * Whether the last reply ended with nothing to read: no text, or tool calls and no words after them. The local model
 * sometimes makes its tool calls and then returns nothing, which would leave the customer looking at chips. It isn't
 * so while a reply is still coming in, nor when the customer spoke last. A reply that ends in words, even "Let me look
 * that up", can't be told from an answer this way: the customer's next message carries on from it.
 *
 * Nor is it so when the reply holds a booking that went through, or may have. Asking again drops the reply, booking
 * included, and sends the customer's yes again, so the model would book the visit a second time: Maison has no duplicate
 * check, only a cap of 3 open requests. The call's chip (and the visit's card) shows what happened, and the customer can
 * still write.
 *
 * Nor when the chat shows the reply's hand-off note (handOffAt in lib/tool-view.ts), under a hand-off that went through
 * or, when the model skipped the call, under a search that found nothing: the note and the LINE chat button are the
 * answer, so a reply that ends there, with no words after it, isn't empty. With no note (a hand-off that failed, a search
 * that found entries, failed or didn't finish) nothing has answered.
 */
export const needsRetry = (messages: readonly ChatMessage[], busy: boolean): boolean => {
  if (busy) return false;
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return false;
  if (last.parts.some(mayHaveBooked)) return false;
  if (handOffAt(last.parts) !== null) return false;
  const end = last.parts.filter(shown).at(-1);
  return end?.type !== 'text';
};

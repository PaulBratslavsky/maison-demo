/** What the chat needs from a message to tell whether the concierge answered. */
interface ChatMessage {
  role: string;
  parts: ReadonlyArray<{ type: string; text?: string }>;
}

/** The parts the screen shows: text with something in it, and tool calls. */
const shown = (part: { type: string; text?: string }) =>
  part.type === 'text' ? Boolean(part.text?.trim()) : part.type === 'dynamic-tool' || part.type.startsWith('tool-');

/**
 * Whether the last reply ended with nothing to read: no text, or tool calls and no words after them. The local model
 * sometimes makes its tool calls and then returns nothing, which would leave the customer looking at chips. It isn't
 * so while a reply is still coming in, nor when the customer spoke last. A reply that ends in words, even "Let me look
 * that up", can't be told from an answer this way: the customer's next message carries on from it.
 */
export const needsRetry = (messages: readonly ChatMessage[], busy: boolean): boolean => {
  if (busy) return false;
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return false;
  const end = last.parts.filter(shown).at(-1);
  return end?.type !== 'text';
};

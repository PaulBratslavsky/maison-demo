/**
 * What the Ask tab decides, apart from React: its starters, the state it shows, the notices under the messages, when
 * Send works, the line for each tool call, and where the admin's token is. The components read these, and the unit tests
 * hold them.
 */

/** The assistant's two routes, served under /maison. */
export const ASSISTANT_PATHS = { status: '/maison/assistant/status', chat: '/maison/assistant/chat' } as const;

/** The three questions the tab suggests while the chat is empty. */
export const STARTERS: readonly string[] = ['What are customers asking about today?', 'Any complaints this week?', 'Which visits are waiting for staff?'];

/** What GET /maison/assistant/status answers: ready with the model, or not ready with the reason. Never the key. */
export type AssistantStatus = { ready: true; model: string } | { ready: false; reason: string };

export const isStatus = (value: unknown): value is AssistantStatus => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { ready, model, reason } = value as Record<string, unknown>;
  return (ready === true && typeof model === 'string') || (ready === false && typeof reason === 'string');
};

/** What the tab shows: the check is running, the check failed, the assistant is not set up (a notice and no text box), or the chat. */
export type AskTabState =
  | { kind: 'loading' }
  | { kind: 'failed'; text: string }
  | { kind: 'not-ready'; text: string }
  | { kind: 'chat'; model: string };

/** A status the tab already has is kept when a later check fails: the chat stays as it was. */
export const askTabState = (status: AssistantStatus | null, statusError: string | null): AskTabState => {
  if (status) return status.ready ? { kind: 'chat', model: status.model } : { kind: 'not-ready', text: status.reason };
  if (statusError) return { kind: 'failed', text: `Couldn't check the assistant: ${statusError}` };
  return { kind: 'loading' };
};

/** The two CUSTOM events the server's stream wrapper sends (`CUSTOM_EVENTS` in server/src/services/assistant.ts). */
export const CUSTOM_EVENT = { maxTurns: 'max_turns', declined: 'declined' } as const;

// The admin bundle can't import server code when it runs, so the number of steps is written out here. A unit test holds
// it to ASSISTANT_LIMITS.modelTurns on the server.
const CUSTOM_NOTES: Record<string, string> = {
  [CUSTOM_EVENT.maxTurns]: 'The assistant stopped after 6 steps. Ask a narrower question.',
  [CUSTOM_EVENT.declined]: 'The model declined to answer this. Rephrase the question.',
};

/** The note under the messages for a custom event, or null for any other. */
export const customEventNote = (name: string): string | null => (Object.prototype.hasOwnProperty.call(CUSTOM_NOTES, name) ? CUSTOM_NOTES[name] : null);

/** What the tab says about a failed turn, and whether it offers New chat as the way on. */
export interface ErrorNotice {
  text: string;
  newChat: boolean;
}

// These two texts are the server's own (CHAT_TOO_LONG_TEXT and SOMETHING_WRONG_TEXT in server/src/assistant/errors.ts).
// A unit test holds them to it.
const SOMETHING_WRONG = 'Something went wrong. Try again.';
const CHAT_TOO_LONG = 'This chat is long. Start a new chat.';

/** What a browser says when a request never reached the server: Chrome, Firefox and Safari, and Node's "terminated". */
const NETWORK = /failed to fetch|load failed|network ?error|networkerror/i;

/**
 * The notice for an error `useChat` reports.
 * - An error from a RUN_ERROR has a string `code`, and its message is already the staff text the server wrote. A chat that is
 *   too long, or that Anthropic refused to continue, offers New chat.
 * - ai-client throws `HTTP error! status: <n>` for a failed request and never reads its body, so the status decides. The
 *   server sends a real HTTP error only for a bad body (400), a role that lost the permission (403), and a body over
 *   Strapi's limit (413).
 * - A request that never arrived is a lost connection.
 */
export const errorNotice = (error: unknown): ErrorNotice => {
  const { code, message } = (typeof error === 'object' && error !== null ? error : {}) as { code?: unknown; message?: unknown };
  const text = typeof message === 'string' ? message : '';

  if (typeof code === 'string' && code !== '') {
    return { text: text || SOMETHING_WRONG, newChat: code === 'chat_too_long' || code === 'history_rejected' };
  }

  const status = /HTTP error! status: (\d{3})/.exec(text)?.[1];
  if (status === '403') return { text: "Your role can't use the assistant any more. Reload the page.", newChat: false };
  if (status === '413') return { text: CHAT_TOO_LONG, newChat: true };
  if (status) return { text: SOMETHING_WRONG, newChat: false };

  if (error instanceof TypeError || NETWORK.test(text)) return { text: 'The connection to Strapi was lost. Try again.', newChat: false };
  return { text: SOMETHING_WRONG, newChat: false };
};

/** Send works for a message with something in it, when the assistant is ready and not answering: a second message waits. */
export const canSend = ({ text, busy, ready }: { text: string; busy: boolean; ready: boolean }): boolean => ready && !busy && text.trim().length > 0;

/**
 * Whether a key press in the text box sends the message: Enter, without Shift (which adds a line break), and not while an
 * input method composes. Staff typing Japanese press Enter to confirm a conversion, and Safari reports that Enter after the
 * composition has ended, with keyCode 229 and `isComposing` false.
 */
export const shouldSendOnKey = (event: { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number }): boolean =>
  event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;

/** A part of a UIMessage, as TanStack AI keeps it: `type` says which, and the rest depends on it. */
export interface PartLike {
  type: string;
  [field: string]: any;
}

/** The line a tool call gets in the chat: its text, and how to draw it (the error tone is red). */
export interface ToolLineModel {
  text: string;
  tone: 'running' | 'ok' | 'error';
}

/** The tool-result part of a call, by the call's id. */
export const toolResultOf = (parts: readonly PartLike[], callId: string): PartLike | undefined =>
  parts.find((part) => part.type === 'tool-result' && part.toolCallId === callId);

/** What each read tool is called in its line, and which answer field holds its rows (none for the two with no count). */
const TOOL_LINES: Record<string, { what: string; rows?: string }> = {
  list_requests: { what: 'requests', rows: 'requests' },
  list_questions: { what: 'questions', rows: 'questions' },
  list_inquiries: { what: 'inquiries', rows: 'inquiries' },
  inquiry_counts: { what: 'inquiry counts' },
  search_knowledge: { what: 'knowledge', rows: 'entries' },
  search_products: { what: 'products', rows: 'products' },
  view_product: { what: 'product' },
};

const RUNNING = new Set(['awaiting-input', 'input-streaming', 'input-complete']);

/** The message of a failed call: the output's own, else the result part's, else a general one. */
const failureMessage = (output: any, result: PartLike | undefined): string => {
  if (typeof output?.error?.message === 'string' && output.error.message) return output.error.message;
  if (typeof output?.error === 'string' && output.error) return output.error;
  if (typeof result?.error === 'string' && result.error) return result.error;
  return 'The tool failed.';
};

/**
 * The line for a tool call: `Maison · inquiries ✓ 12 results`, `Maison · requests …` while it runs, or in red
 * `Maison · requests ✕ No request APT-4812.` when it failed. Only the seven read tools have one: the drafts have a card
 * instead, and any other name has none.
 */
export const toolLineOf = (call: PartLike, result: PartLike | undefined): ToolLineModel | null => {
  if (call.type !== 'tool-call' || !Object.prototype.hasOwnProperty.call(TOOL_LINES, call.name)) return null;
  const { what, rows } = TOOL_LINES[call.name];
  const output = call.output;

  const failed = call.state === 'error' || result?.state === 'error' || (typeof output === 'object' && output !== null && 'error' in output && Boolean(output.error));
  if (failed) return { text: `Maison · ${what} ✕ ${failureMessage(output, result)}`, tone: 'error' };

  if (RUNNING.has(call.state) || (call.state !== 'complete' && !result)) return { text: `Maison · ${what} …`, tone: 'running' };

  const list = rows ? output?.[rows] : undefined;
  if (!Array.isArray(list)) return { text: `Maison · ${what} ✓`, tone: 'ok' };
  return { text: `Maison · ${what} ✓ ${list.length} ${list.length === 1 ? 'result' : 'results'}`, tone: 'ok' };
};

/**
 * The admin's token, as the page's own requests send it. Strapi keeps it in localStorage, written as a JSON string (a bare
 * token works too), and otherwise in a cookie, whose name the admin build is given (`jwtToken` unless the app renames it).
 * A stream can't go through Strapi's fetch client, which adds the token itself, so the page reads it the same way.
 */
export const adminTokenFrom = ({ stored, cookie, cookieName }: { stored: string | null; cookie: string; cookieName: string }): string | null => {
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed === 'string' && parsed !== '') return parsed;
    } catch {
      return stored;
    }
  }
  const prefix = `${cookieName}=`;
  const found = cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix));
  const value = found?.slice(prefix.length) ?? '';
  if (value === '') return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

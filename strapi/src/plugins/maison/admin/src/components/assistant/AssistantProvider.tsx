import * as React from 'react';

import { useFetchClient } from '@strapi/strapi/admin';
import { fetchServerSentEvents, type UIMessage } from '@tanstack/ai-client';
import { useChat } from '@tanstack/ai-react';

import {
  ASSISTANT_PATHS,
  adminTokenFrom,
  customEventNote,
  draftAfterFailure,
  draftAfterSend,
  errorNotice,
  isStatus,
  noticeAfterStatus,
  withoutFailedTurn,
  withoutOpenToolCalls,
  type AssistantStatus,
  type ErrorNotice,
  type MessageSource,
  type SentQuestion,
} from '../../assistant';
import { useMounted } from '../../useMounted';

/**
 * The cookie Strapi keeps the admin token in when it isn't in localStorage. Strapi's admin build replaces `process.env` with
 * its own settings, among them `admin.auth.cookie.name`, which is empty unless the app renames the cookie. Anywhere else
 * there is no `process`, and the name is the default.
 */
declare const process: { env: Record<string, string | undefined> };
const cookieName = (): string => {
  try {
    return process.env.STRAPI_ADMIN_AUTH_COOKIE_NAME || 'jwtToken';
  } catch {
    return 'jwtToken';
  }
};

export interface AssistantApi {
  /** null until GET /maison/assistant/status answers. */
  status: AssistantStatus | null;
  statusError: string | null;
  /** Whether the assistant is set up: the status says ready. */
  ready: boolean;
  messages: UIMessage[];
  /** Whether an answer is on its way. */
  busy: boolean;
  /** What went wrong with the last turn. The next send and New chat clear it. */
  notice: ErrorNotice | null;
  /** A line about how the last turn ended (stopped after 6 steps, or declined). Cleared the same way. */
  note: string | null;
  /** What staff have typed and not sent. It is kept here, so it is still there when staff come back from another tab. New chat leaves it alone. */
  draft: string;
  setDraft: (text: string) => void;
  /** Sends a message: from the text box (the default), which empties the box, or from a starter, which leaves it as it was. */
  send: (text: string, source?: MessageSource) => Promise<void>;
  /** Stops the answer where it is, and takes out a tool call that was being written. Stop is no error. */
  stop: () => void;
  /** Clears the chat: the messages, the notice and the note. The draft stays. */
  newChat: () => void;
  /** Asks /status again, for after the key was set. */
  recheck: () => Promise<void>;
}

const AssistantContext = React.createContext<AssistantApi | null>(null);

/** The chat of the Maison page, or null outside the provider: an admin without the permission to use the assistant has none. */
export const useAssistant = (): AssistantApi | null => React.useContext(AssistantContext);

const storedToken = (): string | null => {
  try {
    return localStorage.getItem('jwtToken');
  } catch {
    return null;
  }
};

const cookies = (): string => {
  try {
    return document.cookie;
  } catch {
    return '';
  }
};

/**
 * The chat, kept above the tabs. Radix unmounts a tab's content when the tab isn't selected, so a chat held by the Ask tab
 * would be gone when staff look at a list and come back. Here it lives as long as the Maison page does, and the tab only reads it.
 */
export const AssistantProvider = ({ children }: { children: React.ReactNode }) => {
  const { get } = useFetchClient();
  const mounted = useMounted();
  // useChat keeps its connection from the first render, so the connection reads `get` through a ref.
  const getRef = React.useRef(get);
  getRef.current = get;

  const [status, setStatus] = React.useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<ErrorNotice | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  // The last question staff sent, so a failed turn can put it back in the box.
  const asked = React.useRef<SentQuestion | null>(null);
  // Set by onError, and settled when the chat is idle: by then the failed run's messages are in the chat.
  const [failedTurn, setFailedTurn] = React.useState<{ question: SentQuestion | null } | null>(null);

  const recheck = React.useCallback(async (): Promise<void> => {
    try {
      const { data } = await getRef.current<unknown>(ASSISTANT_PATHS.status);
      if (!mounted.current) return;
      if (isStatus(data)) {
        setStatus(data);
        setStatusError(null);
        // A "not set up" notice from an earlier send is stale once the assistant is ready.
        setNotice((current) => noticeAfterStatus(current, data));
      } else {
        setStatusError('The answer was not a status.');
      }
    } catch (error) {
      if (mounted.current) setStatusError((error as Error).message);
    }
  }, [mounted]);

  React.useEffect(() => {
    void recheck();
  }, [recheck]);

  const connection = React.useMemo(
    () =>
      fetchServerSentEvents(`${(globalThis as { strapi?: { backendURL?: string } }).strapi?.backendURL ?? ''}${ASSISTANT_PATHS.chat}`, async () => {
        // A stream needs a plain fetch, which Strapi doesn't refresh an expired admin token for. A call through its own client does,
        // so one goes first: the token read after it is the fresh one. If it fails, the chat request says what is wrong.
        try {
          await getRef.current(ASSISTANT_PATHS.status);
        } catch {
          // Nothing to do here.
        }
        const token = adminTokenFrom({ stored: storedToken(), cookie: cookies(), cookieName: cookieName() });
        return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      }),
    []
  );

  const chat = useChat({
    connection,
    // A message sent while an answer is on its way is dropped, never queued out of sight. Send and the Ask about this buttons wait instead.
    queue: 'drop',
    onError: (error: Error) => {
      // Stop ends the stream, and says nothing.
      if (error?.name === 'AbortError') return;
      setNotice(errorNotice(error));
      setFailedTurn({ question: asked.current });
      if ((error as { code?: unknown } | undefined)?.code === 'not_ready') void recheck();
    },
    onCustomEvent: (name: string) => setNote(customEventNote(name)),
  });

  const { sendMessage, stop: stopChat, clear, setMessages } = chat;
  const ready = status?.ready === true;
  const busy = chat.isLoading;

  // The handlers below read the chat as it is now, not as it was when they were made.
  const messagesRef = React.useRef(chat.messages);
  messagesRef.current = chat.messages;
  const busyRef = React.useRef(busy);
  busyRef.current = busy;

  /** Takes out a tool call that was cut off (see withoutOpenToolCalls), so the chat never shows it as running and never replays it. */
  const dropOpenToolCalls = React.useCallback(() => {
    const current = messagesRef.current;
    const cleaned = withoutOpenToolCalls(current);
    if (cleaned !== current) setMessages(cleaned);
  }, [setMessages]);

  // Whenever nothing is answering, a tool call that was cut off is taken out, and a turn that failed with nothing to read is taken
  // back. This is the one place that holds after Stop, a dropped connection and a timeout alike: TanStack AI goes on processing the
  // chunks it already has after Stop, so a call taken out right after Stop can come back a moment later, and onError runs before
  // the messages of the failed run have reached this component.
  const idle = !busy;
  React.useEffect(() => {
    if (!idle) return;
    let next = withoutOpenToolCalls(chat.messages);
    if (failedTurn) {
      setFailedTurn(null);
      const { question } = failedTurn;
      // A turn that failed before anything came back leaves the chat, and its question goes back to an empty box, so staff don't
      // retype it and a second try doesn't put the question in the chat twice. A starter's text is not put back.
      next = withoutFailedTurn(next);
      setDraft((current) => draftAfterFailure({ draft: current, question }));
    }
    if (next !== chat.messages) setMessages(next);
  }, [idle, chat.messages, failedTurn, setMessages]);

  const send = React.useCallback(
    async (text: string, source: MessageSource = 'box'): Promise<void> => {
      // useChat would drop a send made while an answer is on its way. Nothing is changed for it: the box keeps its text.
      if (busyRef.current) return;
      dropOpenToolCalls();
      asked.current = { text, source };
      setFailedTurn(null);
      setNotice(null);
      setNote(null);
      setDraft((current) => draftAfterSend(current, source));
      await sendMessage(text);
    },
    [sendMessage, dropOpenToolCalls]
  );

  const stop = React.useCallback(() => {
    stopChat();
    dropOpenToolCalls();
  }, [stopChat, dropOpenToolCalls]);

  const newChat = React.useCallback(() => {
    stopChat();
    clear();
    setNotice(null);
    setNote(null);
    setFailedTurn(null);
  }, [stopChat, clear]);

  const api = React.useMemo<AssistantApi>(
    () => ({
      status,
      statusError,
      ready,
      messages: chat.messages,
      busy,
      notice,
      note,
      draft,
      setDraft,
      send,
      stop,
      newChat,
      recheck,
    }),
    [status, statusError, ready, chat.messages, busy, notice, note, draft, send, stop, newChat, recheck]
  );

  return <AssistantContext.Provider value={api}>{children}</AssistantContext.Provider>;
};

'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { AssistantParts } from '@/components/chat-parts';
import { ErrorNote } from '@/components/error-note';
import { useMaison } from '@/components/maison-provider';
import { Screen } from '@/components/screen';
import { Spinner } from '@/components/spinner';
import { needsRetry } from '@/lib/chat-retry';
import { config } from '@/lib/config';
import { COPY } from '@/lib/copy';
import { getMaison } from '@/lib/maison';
import { errorOf, errorText } from '@/lib/status';
import { tunnelHeaders } from '@/lib/tunnel';

const CONCIERGE_TOOLS = ['browse_collections', 'search_products', 'view_product', 'find_boutiques', 'search_knowledge', 'request_appointment', 'my_appointments', 'hand_off_to_staff'];

/**
 * The concierge, as in the mockup: a title bar with the "N MCP tools" button (Screen's `title`); the customer's messages
 * as black blocks on the right, the concierge's as plain text, each tool call as one mono line; and an input bar pinned
 * at the bottom, with the suggestions above an underline field and a black Send.
 */
export default function ConciergePage() {
  const { locale } = useMaison();
  const t = COPY[locale];
  // The header's language switch can change the language at any time, so the transport reads it when a message is sent.
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/api/concierge',
        // The customer's own session token, fetched per request. The route passes it on to Strapi.
        headers: async () => ({
          Authorization: `Bearer ${await (await getMaison()).session.getToken()}`,
          ...tunnelHeaders(config.strapiUrl),
        }),
        body: () => ({ locale: localeRef.current }),
      }),
    []
  );
  const { messages, sendMessage, regenerate, status, error } = useChat({ transport });
  const [draft, setDraft] = useState('');
  const busy = status === 'submitted' || status === 'streaming';
  const failure = error ? errorOf(error) : null;
  // A reply that ended with nothing to read (tool calls, then no words): offer to ask again.
  const retry = needsRetry(messages, busy);

  // The conversation scrolls inside the screen. It follows the newest words as they stream in, until the customer
  // scrolls up to read; sending a message, or scrolling back to the end, makes it follow again.
  const conversation = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    const list = conversation.current;
    if (list && following.current) list.scrollTop = list.scrollHeight;
  }, [messages, busy, error]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    following.current = true;
    void sendMessage({ text: trimmed });
    setDraft('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(draft);
  };

  return (
    <Screen name="concierge" tools={CONCIERGE_TOOLS} title={t.concierge} fill>
      <div
        ref={conversation}
        onScroll={(event) => {
          const list = event.currentTarget;
          following.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="flex flex-col gap-3.5 p-5">
          <p className="text-body text-graphite">{t.conciergeIntro}</p>
          {messages.map((message) =>
            message.role === 'user' ? (
              // The customer's words, as typed.
              <div
                key={message.id}
                data-testid="message-user"
                className="max-w-[78%] self-end bg-ink px-3.5 py-3 text-[14px] leading-[1.45] text-paper"
              >
                {message.parts.map((part, index) =>
                  part.type === 'text' ? (
                    <p key={index} className="whitespace-pre-wrap break-words">
                      {part.text}
                    </p>
                  ) : null
                )}
              </div>
            ) : (
              <div key={message.id} data-testid={`message-${message.role}`} className="flex flex-col gap-3.5 text-[14px] leading-[1.55]">
                <AssistantParts parts={message.parts} locale={locale} />
              </div>
            )
          )}
          {retry && (
            <div className="flex flex-wrap items-center gap-x-3 text-[12px] text-mist">
              <p>{t.noReply}</p>
              <button
                type="button"
                data-testid="retry-reply"
                onClick={() => {
                  following.current = true;
                  void regenerate();
                }}
                className="btn-text shrink-0"
              >
                {t.retry}
              </button>
            </div>
          )}
          {busy && <Spinner label={t.loading} className="py-2" />}
          {failure && <ErrorNote error={failure}>{errorText(failure, locale)}</ErrorNote>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-3 border-t border-hairline bg-paper px-5 pb-[calc(0.75rem+var(--line-safe-bottom))] pt-3">
        {/* On a phone in landscape the row goes once the conversation has begun, to leave it room (tailwind.config.ts). A flex gap, not space-y: the hidden row leaves no margin behind. */}
        <div className={`-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${messages.length > 0 ? 'short:hidden' : ''}`}>
          {t.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              onClick={() => send(suggestion)}
              className="min-h-[44px] max-w-[85%] shrink-0 border border-hairline px-3 py-2 text-left text-[13px] leading-snug disabled:text-mist"
            >
              <span className="line-clamp-2">{suggestion}</span>
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex items-end gap-2.5">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            className="field min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="flex h-11 shrink-0 items-center bg-ink px-[18px] text-[11px] font-medium uppercase tracking-[0.2em] text-paper disabled:bg-hairline disabled:text-mist"
          >
            {t.send}
          </button>
        </form>
      </div>
    </Screen>
  );
}

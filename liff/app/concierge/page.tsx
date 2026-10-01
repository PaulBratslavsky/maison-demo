'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { ChatText, ToolResult, toolPartOf } from '@/components/chat-parts';
import { ErrorDetail } from '@/components/error-detail';
import { useMaison } from '@/components/maison-provider';
import { Screen } from '@/components/screen';
import { Spinner } from '@/components/spinner';
import { COPY } from '@/lib/copy';
import { getMaison } from '@/lib/maison';
import { errorOf, errorText } from '@/lib/status';

const CONCIERGE_TOOLS = ['browse_collections', 'search_products', 'view_product', 'find_boutiques', 'request_appointment', 'my_appointments'];

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
        headers: async () => ({ Authorization: `Bearer ${await (await getMaison()).session.getToken()}` }),
        body: () => ({ locale: localeRef.current }),
      }),
    []
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [draft, setDraft] = useState('');
  const busy = status === 'submitted' || status === 'streaming';
  const failure = error ? errorOf(error) : null;

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
    <Screen name="concierge" tools={CONCIERGE_TOOLS} fill>
      <div
        ref={conversation}
        onScroll={(event) => {
          const list = event.currentTarget;
          following.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="space-y-3 px-5 pb-4 pt-5">
          <h1 className="font-serif text-4xl">{t.concierge}</h1>
          <p className="text-sm text-ink/70">{t.conciergeIntro}</p>
          {messages.map((message) => (
            <div
              key={message.id}
              data-testid={`message-${message.role}`}
              className={message.role === 'user' ? 'ml-10 rounded-2xl bg-ink px-4 py-2 text-sm text-ivory' : 'mr-4 text-sm'}
            >
              {message.parts.map((part, index) => {
                if (part.type === 'text') {
                  // The customer's words are shown as typed. The assistant's get simple formatting (bold, lists).
                  return message.role === 'user' ? (
                    <p key={index} className="whitespace-pre-wrap leading-relaxed">
                      {part.text}
                    </p>
                  ) : (
                    <ChatText key={index} text={part.text} />
                  );
                }
                const tool = toolPartOf(part);
                return tool ? <ToolResult key={index} part={tool} locale={locale} /> : null;
              })}
            </div>
          ))}
          {busy && <Spinner label={t.loading} className="py-2" />}
          {failure && (
            <div role="alert" className="text-sm text-red-800">
              <p>{errorText(failure, locale)}</p>
              <ErrorDetail error={failure} />
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 space-y-2 border-t border-ink/10 bg-ivory px-5 pb-[calc(0.75rem+var(--line-safe-bottom))] pt-3">
        <div className="flex gap-2 overflow-x-auto">
          {t.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              onClick={() => send(suggestion)}
              className="min-h-[44px] shrink-0 rounded-full border border-ink/20 px-3 text-left text-xs disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            className="min-h-[44px] flex-1 rounded-full border border-ink/20 bg-white px-4 text-sm"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="min-h-[44px] rounded-full bg-ink px-4 text-sm text-ivory disabled:opacity-40">
            {t.send}
          </button>
        </form>
      </div>
    </Screen>
  );
}

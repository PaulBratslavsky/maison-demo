'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { parseChatText, type Line } from '@/lib/chat-text';
import { config } from '@/lib/config';
import { COPY } from '@/lib/copy';
import { visitTime, yen } from '@/lib/format';
import { lineMessageUrl } from '@/lib/line-chat';
import { handOffAt, toolPartOf, toolView, type RecordedHandOff } from '@/lib/tool-view';
import type { Appointment, Locale, ProductCard } from '@/lib/types';
import { LineChat } from './line-chat';
import { ProductImage } from './product-grid';

function Lines({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line.map((span, spanIndex) => (span.bold ? <strong key={spanIndex}>{span.text}</strong> : <Fragment key={spanIndex}>{span.text}</Fragment>))}
        </Fragment>
      ))}
    </>
  );
}

/**
 * The assistant's words: paragraphs, line breaks, **bold** and simple lists (lib/chat-text.ts). The text becomes React
 * elements and text nodes, never HTML, so nothing in it can add markup to the page. The customer's own messages don't
 * pass through here: what they type is shown as typed.
 */
export function ChatText({ text }: { text: string }) {
  const blocks = parseChatText(text);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={index}>
              <Lines lines={block.lines} />
            </p>
          );
        }
        const items = block.items.map((item, itemIndex) => (
          <li key={itemIndex}>
            <Lines lines={item} />
          </li>
        ));
        return block.kind === 'ordered' ? (
          <ol key={index} start={block.start} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        );
      })}
    </div>
  );
}

/** A tool call: one mono line, mist, or the error red when the call failed. */
export function ToolLine({ text, failed }: { text: string; failed: boolean }) {
  return (
    <p data-testid="tool-chip" className={`break-words font-mono text-[11px] leading-snug ${failed ? 'text-error' : 'text-mist'}`}>
      {text}
    </p>
  );
}

/** The pieces a search found, the first three: a three-column grid of square photos, each with its name and price. */
export function ProductSuggestions({ products, locale }: { products: ProductCard[]; locale: Locale }) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {products.slice(0, 3).map((product) => (
        <li key={product.slug}>
          <Link href={`/products/${product.slug}`} className="flex flex-col gap-1.5">
            {/* Decorative: the link's name is the product name below it. */}
            <ProductImage url={product.imageUrl} alt="" className="aspect-square w-full" />
            <span className="text-[12px] leading-[1.3]">{product.name}</span>
            <span className="text-[12px] leading-none tabular-nums text-graphite">{yen(product.priceJpy, locale)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The visit a request made, which leads to its page: its reference in mono, its status, the boutique and the time. */
export function BookingCard({ appointment, locale }: { appointment: Appointment; locale: Locale }) {
  return (
    <Link href={`/visits/${appointment.reference}`} className="flex flex-col gap-1.5 border border-ink p-3.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] text-graphite">{appointment.reference}</span>
        <span className="text-right text-[10px] uppercase tracking-[0.16em]">{COPY[locale].requested}</span>
      </span>
      <span className="text-[16px]">{appointment.boutique.name}</span>
      <span className="text-[14px] tabular-nums text-graphite">{visitTime(appointment.requestedFor, locale)}</span>
    </Link>
  );
}

/**
 * The hand-off note, which handOffAt places once a message. After a hand-off Strapi recorded (`recorded`): who has the
 * question, by its reference, and where and when they reply, with "Send it in the LINE chat", a secondary button that
 * opens the chat with Maison with the question already typed in, for the customer to send (lineMessageUrl). Without
 * NEXT_PUBLIC_LINE_OA_ID there's no button. With nothing recorded (the model skipped the call after a search that found
 * nothing, or the call failed): where the team answers, and "Chat with Maison on LINE", so a customer can always reach a
 * person. Only a recorded hand-off says the question is with the advisors.
 */
export function HandOffNote({ recorded, locale }: { recorded: RecordedHandOff | null; locale: Locale }) {
  const copy = COPY[locale].handOff;
  if (!recorded) {
    return (
      <div data-testid="hand-off" className="flex flex-col gap-2.5">
        <p className="text-body text-graphite">{copy.fallback}</p>
        <LineChat />
      </div>
    );
  }
  const url = lineMessageUrl(config.lineOaId, copy.typed(recorded.reference, recorded.question));
  return (
    <div data-testid="hand-off" className="flex flex-col gap-2.5">
      <p className="text-body text-graphite">{copy.note(recorded.reference)}</p>
      {url && (
        <a href={url} data-testid="hand-off-line" className="btn-secondary w-full">
          {copy.send}
        </a>
      )}
    </div>
  );
}

/**
 * An assistant message, in the mockup's order: its words and tool lines as they came, a run of tool lines kept together,
 * with a booking card right under the lines that made it, "Chat with Maison on LINE" under the card, the hand-off note,
 * once, under the line handOffAt names (a hand_off_to_staff call that went through; otherwise, with the plain note, the
 * last search that found nothing, or a hand-off that failed), and the pieces a search found under the message's words.
 */
export function AssistantParts({ parts, locale }: { parts: Array<{ type: string; text?: string }>; locale: Locale }) {
  const blocks: ReactNode[] = [];
  const found: ReactNode[] = [];
  let lines: ReactNode[] = [];
  let cards: ReactNode[] = [];
  const note = handOffAt(parts);
  const endRun = () => {
    if (lines.length > 0) {
      blocks.push(
        <div key={`lines-${blocks.length}`} className="flex flex-col gap-1">
          {lines}
        </div>
      );
    }
    blocks.push(...cards);
    lines = [];
    cards = [];
  };
  parts.forEach((part, index) => {
    if (part.type === 'text') {
      if (!part.text?.trim()) return;
      endRun();
      blocks.push(<ChatText key={index} text={part.text} />);
      return;
    }
    const tool = toolPartOf(part);
    if (!tool) return;
    const view = toolView(tool, locale);
    lines.push(<ToolLine key={index} text={view.line} failed={view.failed} />);
    if (view.appointment) {
      cards.push(
        <div key={`card-${index}`} className="flex flex-col gap-2.5">
          <BookingCard appointment={view.appointment} locale={locale} />
          <LineChat />
        </div>
      );
    }
    if (note && index === note.index) {
      cards.push(<HandOffNote key={`hand-off-${index}`} recorded={note.recorded} locale={locale} />);
    }
    if (view.products) found.push(<ProductSuggestions key={`found-${index}`} products={view.products} locale={locale} />);
  });
  endRun();
  return (
    <>
      {blocks}
      {found}
    </>
  );
}

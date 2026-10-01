'use client';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { parseChatText, type Line } from '@/lib/chat-text';
import { COPY } from '@/lib/copy';
import { visitTime, yen } from '@/lib/format';
import { toolErrorOf } from '@/lib/mcp';
import type { Appointment, Locale, ProductCard } from '@/lib/types';
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

/** What the chat needs from AI SDK 7's dynamic-tool UI part (MCP tools arrive as dynamic tools). */
export interface ToolPart {
  toolName: string;
  state: string;
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

/** The concierge's own tools. They aren't Maison tools, so their lines say "Local", not "MCP". */
const LOCAL_TOOLS = ['resolve_date'];

/** What `resolve_date` returned, for its line: the weekday and date the model was given. */
const resolvedDay = (output: unknown): string | null => {
  const day = output as { date?: unknown; weekday?: unknown } | null;
  return typeof day?.date === 'string' && typeof day.weekday === 'string' ? `${day.weekday} ${day.date}` : null;
};

/**
 * What a tool call shows in the chat, built from its structuredContent, never from the model's text: its line ("MCP ·
 * search_products ✓ 5 results", "Local · resolve_date ✓ Saturday 2026-10-10", "… ✕ boutique_closed"), the products a
 * search found, and the appointment a request made.
 */
export const toolView = (part: ToolPart, locale: Locale) => {
  const t = COPY[locale];
  const local = LOCAL_TOOLS.includes(part.toolName);
  const output = part.state === 'output-available' ? (part.output as CallToolResult) : null;
  const error = output ? toolErrorOf(output) : null;
  const failed = part.state === 'output-error' || error !== null;
  const data = output && !error ? (output.structuredContent as Record<string, unknown> | undefined) : undefined;
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
  };
};

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
 * An assistant message, in the mockup's order: its words and tool lines as they came, a run of tool lines kept together,
 * with a booking card right under the lines that made it, and the pieces a search found under the message's words.
 */
export function AssistantParts({ parts, locale }: { parts: Array<{ type: string; text?: string }>; locale: Locale }) {
  const blocks: ReactNode[] = [];
  const found: ReactNode[] = [];
  let lines: ReactNode[] = [];
  let cards: ReactNode[] = [];
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
    if (view.appointment) cards.push(<BookingCard key={`card-${index}`} appointment={view.appointment} locale={locale} />);
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

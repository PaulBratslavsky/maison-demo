'use client';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import Link from 'next/link';
import { Fragment } from 'react';

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
    <div className="space-y-2 leading-relaxed">
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

/** A chip per tool call, plus cards built from structuredContent, never from the model's text. */
export function ToolResult({ part, locale }: { part: ToolPart; locale: Locale }) {
  const t = COPY[locale];
  const output = part.state === 'output-available' ? (part.output as CallToolResult) : null;
  const error = output ? toolErrorOf(output) : null;
  const failed = part.state === 'output-error' || error !== null;
  const data = output && !error ? (output.structuredContent as Record<string, unknown> | undefined) : undefined;
  const list = Object.values(data ?? {}).find(Array.isArray) as unknown[] | undefined;
  const products = Array.isArray(data?.products) ? (data?.products as ProductCard[]) : null;
  const appointment = (data?.appointment as Appointment | undefined) ?? null;
  const label = part.state.startsWith('input') ? '…' : failed ? `✕ ${error?.code ?? 'error'}` : `✓${list ? ` ${t.results(list.length)}` : ''}`;

  return (
    <div className="my-2 space-y-2">
      <span
        data-testid="tool-chip"
        className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] ${failed ? 'bg-red-100 text-red-900' : 'bg-ink/5 text-ink/70'}`}
      >
        MCP · {part.toolName} {label}
      </span>
      {part.toolName === 'search_products' && products && (
        <ul className="flex gap-2 overflow-x-auto">
          {products.slice(0, 3).map((product) => (
            <li key={product.slug} className="w-32 shrink-0">
              <Link href={`/products/${product.slug}`} className="block">
                {/* Decorative: the link's name is the product name below it. */}
                <ProductImage url={product.imageUrl} alt="" className="aspect-square w-full" />
                <p className="mt-1 text-xs leading-tight">{product.name}</p>
                <p className="text-[11px] text-mist">{yen(product.priceJpy, locale)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {part.toolName === 'request_appointment' && appointment && (
        <Link href={`/visits/${appointment.reference}`} className="block rounded border border-gold bg-white p-3 text-sm">
          <p className="flex justify-between text-xs text-mist">
            <span>{appointment.reference}</span>
            <span>{t.requested}</span>
          </p>
          <p className="font-serif text-lg">{appointment.boutique.name}</p>
          <p>{visitTime(appointment.requestedFor, locale)}</p>
        </Link>
      )}
    </div>
  );
}

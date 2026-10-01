'use client';

import { useEffect, useRef } from 'react';

import { COPY } from '@/lib/copy';
import { toolErrorOf, type ToolCallRecord } from '@/lib/mcp';
import { useMaison } from './maison-provider';

const summarize = (call: ToolCallRecord): string => {
  if (call.error) return `error: ${call.error}`;
  const error = toolErrorOf(call.result);
  if (error) return `isError: ${error.code}`;
  const data = call.result?.structuredContent as Record<string, unknown> | undefined;
  if (!data) return 'ok';
  return Object.entries(data)
    .map(([key, value]) => (Array.isArray(value) ? `${key}: ${value.length}` : value && typeof value === 'object' ? `${key}: {…}` : `${key}: ${String(value)}`))
    .join(', ');
};

/**
 * The MCP calls behind the current screen: the same tools an agent would use. It covers the bottom of the screen, so
 * it reports its height (`onHeight`, 0 when closed) for the screen to pad its end by: the last rows scroll clear of it.
 */
export function AgentDrawer({ screen, onHeight }: { screen: string; onHeight: (height: number) => void }) {
  const { agentView, calls, locale } = useMaison();
  const drawer = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = drawer.current;
    if (!element) return;
    const observer = new ResizeObserver(() => onHeight(element.offsetHeight));
    observer.observe(element);
    return () => {
      observer.disconnect();
      onHeight(0);
    };
  }, [agentView, onHeight]);

  if (!agentView) return null;
  const mine = calls.filter((call) => call.screen === screen).slice(-6).reverse();
  return (
    <aside
      ref={drawer}
      aria-label={COPY[locale].agentView}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[45%] overflow-y-auto rounded-t-2xl bg-ink px-[calc(1rem+var(--line-safe-x))] pb-[calc(1rem+var(--line-safe-bottom))] pt-4 font-mono text-[11px] text-ivory shadow-2xl stage:absolute"
    >
      <p className="mb-2 text-gold">MCP · Strapi /mcp</p>
      {mine.length === 0 && <p className="text-ivory/60">{COPY[locale].agentViewEmpty}</p>}
      <ol className="space-y-3">
        {mine.map((call) => (
          <li key={call.id} data-testid="agent-call" className="border-t border-ivory/10 pt-2">
            <p>
              <span className="text-gold">{call.name}</span> <span className="text-ivory/50">{call.ms} ms</span>
            </p>
            <p className="break-all text-ivory/70">{JSON.stringify(call.args)}</p>
            <p className="text-ivory/90">→ {summarize(call)}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}

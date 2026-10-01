'use client';

import { useState, type ReactNode } from 'react';

import { COPY } from '@/lib/copy';
import { errorText } from '@/lib/status';
import { AgentDrawer } from './agent-drawer';
import { ErrorDetail } from './error-detail';
import { Header } from './header';
import { useMaison } from './maison-provider';
import { OpenInLine } from './open-in-line';
import { Spinner } from './spinner';

/**
 * Every screen: header, the MCP tools it uses, sign-in state, and the agent view. In LINE mode outside the LINE app,
 * the "Open in LINE" page takes the screen's place, without the tools: nothing is called from it.
 *
 * By default the page scrolls. `fill` is for a screen that scrolls inside itself with a bar pinned under it (the
 * concierge): it makes a column as tall as the whole screen, whose children are the column's flex items. The column runs
 * under the frame's own safe-area padding (`-mb`), so the bar keeps its own, as the agent view's drawer does. On the stage
 * laptop it is as tall as the phone frame.
 */
export function Screen({ name, tools, fill = false, children }: { name: string; tools: string[]; fill?: boolean; children: ReactNode }) {
  const { status, signInError, openInLine, locale, agentView, retrySignIn } = useMaison();
  const t = COPY[locale];
  // With the agent view on, the screen ends the drawer's height lower (a page adds a margin too), so the last rows of a
  // page scroll clear of it, and the pinned bar of a `fill` screen sits above it.
  const [drawerHeight, setDrawerHeight] = useState(0);
  const drawerOpen = agentView && drawerHeight > 0;
  return (
    <div
      className={fill ? 'flex h-dvh flex-col -mb-[var(--line-safe-bottom)] stage:mb-0 stage:h-full' : 'pb-32'}
      style={drawerOpen ? { paddingBottom: fill ? `${drawerHeight}px` : `calc(${drawerHeight}px + 2rem)` } : undefined}
    >
      <Header />
      {status !== 'open-in-line' && (
        <ul className="flex flex-wrap gap-1 px-5 pt-3" aria-label="MCP tools">
          {tools.map((tool) => (
            <li key={tool} data-testid="tool-badge" className="rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[10px] text-mist">
              MCP · {tool}
            </li>
          ))}
        </ul>
      )}
      {status === 'starting' && <Spinner label={t.signingIn} className="min-h-[50vh]" />}
      {status === 'error' && signInError && (
        <div role="alert" className="px-5 py-10 text-sm text-red-800">
          <p>
            {t.signInFailed}: {errorText(signInError, locale)}
          </p>
          <ErrorDetail error={signInError} />
          <button type="button" onClick={retrySignIn} className="mt-3 min-h-[44px] text-xs underline">
            {t.retry}
          </button>
        </div>
      )}
      {status === 'open-in-line' && openInLine && <OpenInLine url={openInLine.url} os={openInLine.os} />}
      {status === 'ready' && children}
      <AgentDrawer screen={name} onHeight={setDrawerHeight} />
    </div>
  );
}

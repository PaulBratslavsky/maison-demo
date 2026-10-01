'use client';

import { useState, type ReactNode } from 'react';

import { COPY } from '@/lib/copy';
import { errorText } from '@/lib/status';
import { AgentDrawer } from './agent-drawer';
import { AgentViewSwitch } from './agent-view-switch';
import { ErrorNote } from './error-note';
import { Header, type BackLink } from './header';
import { useMaison } from './maison-provider';
import { OpenInLine } from './open-in-line';
import { Spinner } from './spinner';

/**
 * Every screen: header, the MCP tools it uses, sign-in state, and the agent view. In LINE mode outside the LINE app,
 * the "Open in LINE" page takes the screen's place, without the tools: nothing is called from it. `back` names the
 * screen's parent for the header's link, when it's closer than the header's own guess (a product's collection).
 *
 * Under the header, one quiet line: the screen's MCP tools on the left, and on the right the agent view's switch, which
 * the header has no room for on a phone. On a page it scrolls away with the content; on a `fill` screen it stays.
 *
 * By default the page scrolls. `fill` is for a screen that scrolls inside itself with a bar pinned under it (the
 * concierge): it makes a column as tall as the whole screen, whose children are the column's flex items. The column runs
 * under the frame's own safe-area padding (`-mb`), so the bar keeps its own, as the agent view's drawer does. On the stage
 * laptop it is as tall as the phone frame.
 */
export function Screen({
  name,
  tools,
  fill = false,
  back,
  children,
}: {
  name: string;
  tools: string[];
  fill?: boolean;
  back?: BackLink;
  children: ReactNode;
}) {
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
      <Header back={back} />
      {status !== 'open-in-line' && (
        <div className="flex h-11 shrink-0 items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-center font-mono text-[11px] text-mist">
            <span aria-hidden="true" className="shrink-0 whitespace-pre">
              MCP ·{' '}
            </span>
            <ul aria-label="MCP tools" className="min-w-0 truncate">
              {tools.map((tool) => (
                <li key={tool} data-testid="tool-badge" className="inline before:content-['_·_'] first:before:content-none">
                  {tool}
                </li>
              ))}
            </ul>
          </div>
          <AgentViewSwitch />
        </div>
      )}
      {status === 'starting' && <Spinner label={t.signingIn} className="min-h-[50vh]" />}
      {status === 'error' && signInError && (
        <ErrorNote
          error={signInError}
          className="mx-5 my-10"
          action={
            <button type="button" onClick={retrySignIn} className="btn-text">
              {t.retry}
            </button>
          }
        >
          {t.signInFailed}: {errorText(signInError, locale)}
        </ErrorNote>
      )}
      {status === 'open-in-line' && openInLine && <OpenInLine url={openInLine.url} os={openInLine.os} />}
      {status === 'ready' && children}
      <AgentDrawer screen={name} onHeight={setDrawerHeight} />
    </div>
  );
}

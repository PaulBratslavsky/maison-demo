'use client';

import { useState, type ReactNode } from 'react';

import { COPY } from '@/lib/copy';
import { errorText } from '@/lib/status';
import { AgentDrawer } from './agent-drawer';
import { ErrorDetail } from './error-detail';
import { Header } from './header';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

/** Every screen: header, the MCP tools it uses, sign-in state, and the agent view. */
export function Screen({ name, tools, children }: { name: string; tools: string[]; children: ReactNode }) {
  const { status, signInError, locale, agentView, retrySignIn } = useMaison();
  const t = COPY[locale];
  // With the agent view on, the screen ends the drawer's height (plus a margin) lower, so its last rows scroll clear.
  const [drawerHeight, setDrawerHeight] = useState(0);
  return (
    <div className="pb-32" style={agentView && drawerHeight > 0 ? { paddingBottom: `calc(${drawerHeight}px + 2rem)` } : undefined}>
      <Header />
      <ul className="flex flex-wrap gap-1 px-5 pt-3" aria-label="MCP tools">
        {tools.map((tool) => (
          <li key={tool} data-testid="tool-badge" className="rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[10px] text-mist">
            MCP · {tool}
          </li>
        ))}
      </ul>
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
      {status === 'ready' && children}
      <AgentDrawer screen={name} onHeight={setDrawerHeight} />
    </div>
  );
}

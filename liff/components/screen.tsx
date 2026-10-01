'use client';

import type { ReactNode } from 'react';

import { COPY } from '@/lib/copy';
import { errorText } from '@/lib/status';
import { AgentDrawer } from './agent-drawer';
import { Header } from './header';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

/** Every screen: header, the MCP tools it uses, sign-in state, and the agent view. */
export function Screen({ name, tools, children }: { name: string; tools: string[]; children: ReactNode }) {
  const { status, error, errorCode, locale, retrySignIn } = useMaison();
  const t = COPY[locale];
  return (
    <div className="pb-32">
      <Header />
      <ul className="flex flex-wrap gap-1 px-5 pt-3" aria-label="MCP tools">
        {tools.map((tool) => (
          <li key={tool} data-testid="tool-badge" className="rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[10px] text-mist">
            MCP · {tool}
          </li>
        ))}
      </ul>
      {status === 'starting' && <Spinner label={t.signingIn} className="min-h-[50vh]" />}
      {status === 'error' && (
        <div role="alert" className="px-5 py-10 text-sm text-red-800">
          <p>
            {t.signInFailed}: {errorCode ? errorText({ code: errorCode, message: error ?? '' }, locale) : error}
          </p>
          <button type="button" onClick={retrySignIn} className="mt-3 min-h-[44px] text-xs underline">
            {t.retry}
          </button>
        </div>
      )}
      {status === 'ready' && children}
      <AgentDrawer screen={name} />
    </div>
  );
}

'use client';

import Link from 'next/link';

import { COPY } from '@/lib/copy';
import { useMaison } from './maison-provider';

export function Header() {
  const { locale, agentView, setAgentView } = useMaison();
  const t = COPY[locale];
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-ivory/95 px-5 py-2 backdrop-blur">
      <Link href="/" className="font-serif text-2xl tracking-[0.3em]">
        MAISON
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/visits" className="flex min-h-[44px] items-center px-1 text-xs">
          {t.myVisits}
        </Link>
        <button
          type="button"
          role="switch"
          aria-checked={agentView}
          aria-label={t.agentView}
          onClick={() => setAgentView(!agentView)}
          className={`min-h-[44px] rounded-full px-3 text-[11px] ${agentView ? 'bg-ink text-ivory' : 'border border-ink/30'}`}
        >
          {t.agentView}
        </button>
      </div>
    </header>
  );
}

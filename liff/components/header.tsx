'use client';

import Link from 'next/link';

import { COPY } from '@/lib/copy';
import type { Locale } from '@/lib/types';
import { useMaison } from './maison-provider';

const LANGUAGES: Locale[] = ['en', 'ja'];

/**
 * Two rows at every width: the logo and the language switch, then the visits link and the agent-view switch. In
 * Japanese the second row's two controls take about 185 px; with the logo (136 px) and the switch (94 px), one row
 * would need about 450 px of content width, more than any phone has. Two rows hold from 320 px up (50 px to spare),
 * and switching the language never moves a control to another row. Every control is 44 px tall; the pills inside are
 * drawn smaller.
 */
export function Header() {
  const { locale, setLocale, agentView, setAgentView } = useMaison();
  const t = COPY[locale];
  return (
    <header className="sticky top-0 z-10 border-b border-ink/10 bg-ivory/95 px-5 backdrop-blur">
      <div className="flex h-11 items-center justify-between gap-3">
        <Link href="/" className="flex h-11 items-center whitespace-nowrap font-serif text-2xl tracking-[0.3em]">
          MAISON
        </Link>
        <div role="group" aria-label={t.language} className="flex shrink-0 rounded-full border border-ink/25 p-0.5">
          {LANGUAGES.map((option) => (
            // The 44 px box overhangs the 30 px pill (negative margins), so the tap target stays full height.
            <button
              key={option}
              type="button"
              aria-pressed={locale === option}
              onClick={() => setLocale(option)}
              className="-my-[10px] flex h-11 min-w-[44px] items-center justify-center whitespace-nowrap"
            >
              <span className={`rounded-full px-2.5 py-1 text-[11px] tracking-[0.15em] ${locale === option ? 'bg-ink text-ivory' : 'text-ink/60'}`}>
                {option.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-11 items-center justify-between gap-3">
        <Link href="/visits" className="flex h-11 items-center whitespace-nowrap text-xs">
          {t.myVisits}
        </Link>
        <button
          type="button"
          role="switch"
          aria-checked={agentView}
          aria-label={t.agentView}
          onClick={() => setAgentView(!agentView)}
          className="flex h-11 shrink-0 items-center whitespace-nowrap"
        >
          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${agentView ? 'border-ink bg-ink text-ivory' : 'border-ink/30'}`}>{t.agentView}</span>
        </button>
      </div>
    </header>
  );
}

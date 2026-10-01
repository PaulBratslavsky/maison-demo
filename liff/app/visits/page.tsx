'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Header } from '@/components/header';
import { useMaison } from '@/components/maison-provider';
import { Screen } from '@/components/screen';
import { Spinner } from '@/components/spinner';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import { listOf, visitTime } from '@/lib/format';
import { requestSentFor, statusLabel } from '@/lib/status';
import type { Appointment } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

function Visits() {
  const { locale } = useMaison();
  const t = COPY[locale];
  const highlight = useSearchParams().get('ref');
  const visits = useTool<{ appointments: Appointment[] }>('visits', 'my_appointments', { locale });
  return (
    <Screen name="visits" tools={['my_appointments']}>
      <h1 className="px-5 pb-4 pt-6 font-serif text-4xl">{t.myVisits}</h1>
      {requestSentFor(visits.data?.appointments, highlight) && <p className="mx-5 mb-4 rounded bg-gold/15 p-3 text-sm">{t.visitRequested}</p>}
      <StatusNote loading={visits.loading} error={visits.error} retry={visits.retry} />
      {visits.data?.appointments.length === 0 && <p className="px-5 text-sm text-mist">{t.noVisits}</p>}
      <ul className="space-y-3 px-5">
        {visits.data?.appointments.map((visit) => (
          <li key={visit.reference}>
            <Link
              href={`/visits/${visit.reference}`}
              data-testid="visit"
              className={`block rounded border p-4 ${visit.reference === highlight ? 'border-gold' : 'border-ink/10'}`}
            >
              <p className="flex justify-between text-xs text-mist">
                <span>{visit.reference}</span>
                <span className={visit.status === 'confirmed' ? 'text-emerald-700' : ''}>{statusLabel(visit, locale)}</span>
              </p>
              <p className="mt-1 font-serif text-xl">{visit.boutique.name}</p>
              <p className="text-sm">{visitTime(visit.requestedFor, locale)}</p>
              <p className="text-xs text-ink/70">{listOf(visit.products.map((product) => product.name), locale)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

/** The prerendered shell, which LINE's confirmation link opens first: the header and LINE's loading icon. */
function VisitsLoading() {
  const { locale } = useMaison();
  return (
    <div className="pb-32">
      <Header />
      <Spinner label={COPY[locale].loading} className="min-h-[50vh]" />
    </div>
  );
}

export default function VisitsPage() {
  return (
    <Suspense fallback={<VisitsLoading />}>
      <Visits />
    </Suspense>
  );
}

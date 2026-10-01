'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { useMaison } from '@/components/maison-provider';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import { visitTime } from '@/lib/format';
import { statusLabel } from '@/lib/status';
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
      {highlight && <p className="mx-5 mb-4 rounded bg-gold/15 p-3 text-sm">{t.visitRequested}</p>}
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
              <p className="text-xs text-ink/70">{visit.products.map((product) => product.name).join('、')}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

export default function VisitsPage() {
  return (
    <Suspense>
      <Visits />
    </Suspense>
  );
}

'use client';

import { useParams } from 'next/navigation';

import { useMaison } from '@/components/maison-provider';
import { Screen } from '@/components/screen';
import { StatusNote } from '@/components/status-note';
import { COPY } from '@/lib/copy';
import { visitTime } from '@/lib/format';
import { statusLabel } from '@/lib/status';
import type { Appointment } from '@/lib/types';
import { useTool } from '@/lib/use-tool';

/** Where the LINE confirmation's button leads. */
export default function VisitPage() {
  const { reference } = useParams<{ reference: string }>();
  const { locale } = useMaison();
  const t = COPY[locale];
  const visits = useTool<{ appointments: Appointment[] }>('visits', 'my_appointments', { locale });
  const visit = visits.data?.appointments.find((candidate) => candidate.reference === reference);
  return (
    <Screen name="visits" tools={['my_appointments']}>
      <StatusNote loading={visits.loading} error={visits.error} retry={visits.retry} />
      {visits.data && !visit && <p className="px-5 py-8 text-sm text-mist">{t.visitNotFound}</p>}
      {visit && (
        <article className="px-5 pt-6">
          <p className="text-xs text-mist">{visit.reference}</p>
          <h1 className="font-serif text-4xl">{visit.boutique.name}</h1>
          <p className="mt-2 text-lg">{visitTime(visit.requestedFor, locale)}</p>
          <p className="mt-1 text-sm">{statusLabel(visit, locale)}</p>
          <ul className="mt-4 list-disc pl-5 text-sm">
            {visit.products.map((product) => (
              <li key={product.slug}>{product.name}</li>
            ))}
          </ul>
          {visit.note && <p className="mt-4 text-sm text-ink/70">{visit.note}</p>}
        </article>
      )}
    </Screen>
  );
}

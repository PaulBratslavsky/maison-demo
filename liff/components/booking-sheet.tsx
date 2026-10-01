'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { COPY } from '@/lib/copy';
import { isRealDate, nextSaturday, timeSlots, tomorrow } from '@/lib/format';
import { toolErrorOf, type ToolError } from '@/lib/mcp';
import { errorText } from '@/lib/status';
import type { Appointment, BoutiqueInfo, Product } from '@/lib/types';
import { useTool } from '@/lib/use-tool';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

const field = 'mt-1 block min-h-[44px] w-full rounded border border-ink/20 bg-white px-3 text-sm';

/** "Book a visit": the same request_appointment tool the concierge uses. */
export function BookingSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { maison, locale } = useMaison();
  const t = COPY[locale];
  const router = useRouter();
  const [date, setDate] = useState(() => nextSaturday());
  const [boutique, setBoutique] = useState('ginza');
  const [time, setTime] = useState('14:00');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<ToolError | null>(null);

  // A cleared or impossible date is never sent: the tools only take real calendar dates.
  const validDate = isRealDate(date) && date >= tomorrow();
  const availability = useTool<{ boutiques: BoutiqueInfo[] }>(
    'product',
    'find_boutiques',
    validDate ? { productSlugs: [product.slug], date, locale } : null
  );
  const boutiques = availability.data?.boutiques ?? [];
  const chosen = boutiques.find((candidate) => candidate.slug === boutique);
  const open = validDate && chosen?.openOnDate === true;
  const slots = open && chosen?.hoursOnDate ? timeSlots(chosen.hoursOnDate.opens, chosen.hoursOnDate.closes) : [];
  const startTime = slots.includes(time) ? time : slots[0];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!maison || !open || !startTime) return;
    setSending(true);
    setProblem(null);
    try {
      const result = await maison.callTool('product', 'request_appointment', {
        boutique,
        productSlugs: [product.slug],
        requestedFor: `${date}T${startTime}:00+09:00`,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const error = toolErrorOf(result);
      if (error) {
        setProblem(error);
        return;
      }
      const { appointment } = result.structuredContent as { appointment: Appointment };
      router.push(`/visits?ref=${appointment.reference}`);
    } catch (error) {
      setProblem({ code: 'network', message: (error as Error).message, hint: '' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t.bookVisit} className="fixed inset-0 z-30 flex items-end bg-black/40 stage:absolute">
      <form onSubmit={submit} className="max-h-[90%] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-ivory px-[calc(1.25rem+var(--line-safe-x))] pb-[calc(1.25rem+var(--line-safe-bottom))] pt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">{t.bookVisit}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-[44px] min-w-[44px] text-lg">
            ✕
          </button>
        </div>
        <p className="text-sm">{product.name}</p>

        <label htmlFor="boutique" className="block text-xs">
          {t.boutique}
          <select id="boutique" value={boutique} onChange={(event) => setBoutique(event.target.value)} className={field}>
            {boutiques.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="date" className="block text-xs">
          {t.date}
          <input id="date" type="date" min={tomorrow()} value={date} onChange={(event) => setDate(event.target.value)} className={field} />
        </label>

        {!validDate && (
          <p role="status" className="text-xs text-red-900">
            {t.chooseDate}
          </p>
        )}
        {validDate && availability.loading && <Spinner label={t.loading} className="py-2" />}
        {validDate && !availability.loading && chosen && !open && (
          <p role="status" className="rounded bg-red-50 p-3 text-sm text-red-900">
            {t.closedOnDate}
          </p>
        )}
        {open && (
          <label htmlFor="time" className="block text-xs">
            {t.time}
            <select id="time" value={startTime} onChange={(event) => setTime(event.target.value)} className={field}>
              {slots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
        )}

        <label htmlFor="note" className="block text-xs">
          {t.note}
          <textarea id="note" maxLength={500} rows={2} value={note} onChange={(event) => setNote(event.target.value)} className={`${field} py-2`} />
        </label>

        {problem && (
          <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">
            {errorText(problem, locale)}
          </p>
        )}
        <button type="submit" disabled={sending || !open} className="min-h-[48px] w-full rounded-full bg-ink text-sm text-ivory disabled:opacity-40">
          {t.request}
        </button>
      </form>
    </div>
  );
}

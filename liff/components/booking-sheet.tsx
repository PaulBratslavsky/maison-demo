'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { bookingState, isBookableDate } from '@/lib/booking';
import { COPY } from '@/lib/copy';
import { nextSaturday, tomorrow } from '@/lib/format';
import { toolErrorOf } from '@/lib/mcp';
import { errorOf, errorText, type ScreenError } from '@/lib/status';
import type { Appointment, BoutiqueInfo, Product } from '@/lib/types';
import { useTool } from '@/lib/use-tool';
import { ErrorDetail } from './error-detail';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

// 16 px text: iOS zooms the page into a field whose text is smaller.
const field = 'mt-1 block min-h-[44px] w-full rounded border border-ink/20 bg-white px-3 text-base';

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
  const [problem, setProblem] = useState<ScreenError | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pressedOnBackdrop = useRef(false);

  // Only a bookable date is checked, and sent: the tools take only real calendar dates.
  const availability = useTool<{ boutiques: BoutiqueInfo[] }>(
    'product',
    'find_boutiques',
    isBookableDate(date) ? { productSlugs: [product.slug], date, locale } : null
  );
  const boutiques = availability.data?.boutiques ?? [];
  const { validDate, dateProblem, chosen, open, slots, startTime } = bookingState({ date, boutique, time, boutiques, loading: availability.loading });

  // Focus moves into the dialog when it opens, and Escape closes it.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  /** A new boutique, date or time makes the last send's problem stale. */
  const changed = (set: (value: string) => void) => (value: string) => {
    set(value);
    setProblem(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (!maison || !chosen || !startTime) return;
    setSending(true);
    setProblem(null);
    try {
      const result = await maison.callTool('product', 'request_appointment', {
        boutique: chosen.slug,
        productSlugs: [product.slug],
        requestedFor: `${date}T${startTime}:00+09:00`,
        ...(note.trim() ? { note: note.trim() } : {}),
        // The answer names the boutique and products in the customer's language.
        locale,
      });
      const error = toolErrorOf(result);
      if (error) {
        setProblem(error);
        setSending(false);
        return;
      }
      const { appointment } = result.structuredContent as { appointment: Appointment };
      // `sending` stays on: the button stays disabled while the app moves to the visits screen.
      router.push(`/visits?ref=${appointment.reference}`);
    } catch (error) {
      // A sign-in problem keeps its OAuth code, so the copy can say what to do.
      setSending(false);
      setProblem(errorOf(error));
    }
  };

  return (
    // A click on the backdrop closes the sheet: pressed and released there, not a drag that ends outside the sheet.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.bookVisit}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose();
      }}
      className="fixed inset-0 z-30 flex items-end bg-black/40 stage:absolute"
    >
      <form onSubmit={submit} className="max-h-[90%] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-ivory px-[calc(1.25rem+var(--line-safe-x))] pb-[calc(1.25rem+var(--line-safe-bottom))] pt-5">
        <div className="flex items-center justify-between">
          <h2 ref={heading} tabIndex={-1} className="font-serif text-2xl outline-none">
            {t.bookVisit}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="min-h-[44px] min-w-[44px] text-lg">
            ✕
          </button>
        </div>
        <p className="text-sm">{product.name}</p>

        <label htmlFor="boutique" className="block text-xs">
          {t.boutique}
          <select id="boutique" value={chosen?.slug ?? boutique} onChange={(event) => changed(setBoutique)(event.target.value)} className={field}>
            {boutiques.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="date" className="block text-xs">
          {t.date}
          <input id="date" type="date" min={tomorrow()} value={date} onChange={(event) => changed(setDate)(event.target.value)} className={field} />
        </label>

        {dateProblem && (
          <p role="status" className="text-xs text-red-900">
            {t[dateProblem]}
          </p>
        )}
        {validDate && availability.loading && <Spinner label={t.loading} className="py-2" />}
        {validDate && availability.error && !availability.loading && (
          <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">
            <p>{errorText(availability.error, locale)}</p>
            <ErrorDetail error={availability.error} />
            <button type="button" onClick={availability.retry} className="mt-2 min-h-[44px] text-xs underline">
              {t.retry}
            </button>
          </div>
        )}
        {validDate && !availability.loading && chosen && !open && (
          <p role="status" className="rounded bg-red-50 p-3 text-sm text-red-900">
            {t.closedOnDate}
          </p>
        )}
        {open && (
          <label htmlFor="time" className="block text-xs">
            {t.time}
            <select id="time" value={startTime} onChange={(event) => changed(setTime)(event.target.value)} className={field}>
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
          <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">
            {/* `chosen` is the boutique the request was for: picking another clears the problem. */}
            <p>{errorText(problem, locale, chosen?.name)}</p>
            <ErrorDetail error={problem} />
          </div>
        )}
        <button
          type="submit"
          disabled={sending || !startTime}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-ink text-sm text-ivory disabled:opacity-40"
        >
          {sending && <img src="/line/LINE_spinner_light.svg" width={16} height={16} alt="" />}
          {sending ? t.loading : t.request}
        </button>
      </form>
    </div>
  );
}

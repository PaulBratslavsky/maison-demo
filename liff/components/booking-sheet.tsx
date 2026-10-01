'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { bookingDays, bookingState, hasStock, isBookableDate, shouldCloseOnKey } from '@/lib/booking';
import { COPY } from '@/lib/copy';
import { dayLabel, nextSaturday, yen } from '@/lib/format';
import { toolErrorOf } from '@/lib/mcp';
import { errorOf, errorText, type ScreenError } from '@/lib/status';
import type { Appointment, BoutiqueInfo, Product } from '@/lib/types';
import { useToday } from '@/lib/use-today';
import { useTool } from '@/lib/use-tool';
import { ErrorNote } from './error-note';
import { useMaison } from './maison-provider';
import { Spinner } from './spinner';

/** Arrow keys move along a row of radios, Home and End go to its ends: each picks the chip it lands on. */
const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * A row of chips to pick one from, as the mockup draws the day and the time: a radio group named by its label, whose
 * chips are radios (one tab stop, arrow keys between them). It scrolls sideways when the chips don't fit, and brings the
 * chosen one into view when the row appears or its chips change.
 */
function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const labelId = useId();
  const row = useRef<HTMLDivElement>(null);
  const checked = options.findIndex((option) => option.value === value);
  const focusable = Math.max(checked, 0);
  const chips = options.map((option) => option.value).join();

  useEffect(() => {
    const list = row.current;
    const chip = list?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (list && chip) list.scrollLeft = chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2;
  }, [chips]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[event.key];
    const target =
      event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : step ? (focusable + step + options.length) % options.length : -1;
    if (target < 0 || options.length === 0) return;
    event.preventDefault();
    onChange(options[target].value);
    (row.current?.children[target] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="label">
        {label}
      </p>
      <div
        ref={row}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={move}
        // Bleeds to the sheet's edges, with 4 px above and below for a chip's focus ring, which a scroller would clip.
        className="relative -mx-5 -my-1 flex gap-2 overflow-x-auto px-5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={index === checked}
            tabIndex={index === focusable ? 0 : -1}
            onClick={() => onChange(option.value)}
            className="chip w-[72px] flex-none"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Book a visit", as a bottom sheet over the product: the same request_appointment tool the concierge uses. The
 * boutique is a radio per boutique, disabled where the piece isn't in stock; the day and the time are rows of chips: the
 * next two weeks, and the half-hour slots the chosen boutique is open on that day.
 */
export function BookingSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { maison, locale } = useMaison();
  const t = COPY[locale];
  const router = useRouter();
  const now = useToday();
  const [date, setDate] = useState(() => nextSaturday());
  const [boutique, setBoutique] = useState('ginza');
  const [time, setTime] = useState('14:00');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<ScreenError | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pressedOnBackdrop = useRef(false);
  const boutiqueLabel = useId();

  // Only a bookable date is checked, and sent: the tools take only real calendar dates.
  const availability = useTool<{ boutiques: BoutiqueInfo[] }>(
    'product',
    'find_boutiques',
    isBookableDate(date, now) ? { productSlugs: [product.slug], date, locale } : null
  );
  const boutiques = availability.data?.boutiques ?? [];
  const { validDate, dateProblem, chosen, open, slots, startTime } = bookingState({
    date,
    boutique,
    time,
    product: product.slug,
    boutiques,
    loading: availability.loading,
    now,
  });

  // Focus moves into the dialog when it opens, and Escape closes it: not while Japanese input composes, which it cancels.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (shouldCloseOnKey(event)) onClose();
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
      className="fixed inset-0 z-30 flex items-end bg-ink/45 stage:absolute"
    >
      <form
        onSubmit={submit}
        className="flex max-h-[90%] w-full flex-col gap-[18px] overflow-y-auto bg-paper px-[calc(1.25rem+var(--line-safe-x))] pb-[calc(1.25rem+var(--line-safe-bottom))] pt-2.5"
      >
        {/* The grab handle: the one rounded thing in the design. */}
        <div aria-hidden="true" className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-hairline" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 ref={heading} tabIndex={-1} className="text-[20px] font-normal leading-tight outline-none">
              {t.bookVisit}
            </h2>
            <p className="text-[13px] text-graphite">
              {product.name} · <span className="tabular-nums">{yen(product.priceJpy, locale)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        {/* A real radio per boutique, named by its label. One without the piece is disabled and says so. */}
        <fieldset role="radiogroup" aria-labelledby={boutiqueLabel} className="m-0 min-w-0 border-0 p-0">
          <legend id={boutiqueLabel} className="label pb-2">
            {t.boutique}
          </legend>
          {boutiques.length === 0 && availability.loading ? (
            // Three rows' room while the first answer comes, so the sheet doesn't grow under the finger.
            <div className="h-[132px]" />
          ) : (
            boutiques.map((option) => {
              const stocked = hasStock(option, product.slug);
              return (
                <label
                  key={option.slug}
                  className={`flex min-h-[44px] items-center justify-between gap-4 border-t border-hairline text-[14px] last:border-b ${stocked ? 'cursor-pointer' : 'cursor-not-allowed text-mist'}`}
                >
                  <span>
                    {option.name}
                    {stocked ? '' : ` · ${t.notInStock}`}
                  </span>
                  <input
                    type="radio"
                    name="boutique"
                    value={option.slug}
                    checked={chosen?.slug === option.slug}
                    disabled={!stocked}
                    onChange={() => changed(setBoutique)(option.slug)}
                    className="m-0 h-[18px] w-[18px] shrink-0"
                  />
                </label>
              );
            })
          )}
        </fieldset>

        <ChipRow
          label={t.date}
          options={bookingDays(now).map((day) => ({ value: day.date, label: dayLabel(day.date, locale) }))}
          value={date}
          onChange={changed(setDate)}
        />

        {/* The time, or why there's none yet. The room for a row of chips is kept, so nothing jumps while a day is checked. */}
        <div className="flex min-h-[68px] flex-col justify-center gap-3">
          {validDate && availability.loading ? (
            <Spinner label={t.loading} className="py-0" />
          ) : validDate && availability.error ? (
            <ErrorNote
              error={availability.error}
              action={
                <button type="button" onClick={availability.retry} className="btn-text">
                  {t.retry}
                </button>
              }
            >
              {errorText(availability.error, locale)}
            </ErrorNote>
          ) : validDate && chosen && !open ? (
            <ErrorNote role="status">{t.closedOnDate}</ErrorNote>
          ) : open ? (
            <ChipRow label={t.time} options={slots.map((slot) => ({ value: slot, label: slot }))} value={startTime} onChange={changed(setTime)} />
          ) : null}
          {dateProblem && <ErrorNote role="status">{t[dateProblem]}</ErrorNote>}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="label">{t.note}</span>
          <textarea
            maxLength={500}
            rows={1}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.notePlaceholder}
            className="field max-h-32 resize-none [field-sizing:content]"
          />
        </label>

        {problem && (
          // `chosen` is the boutique the request was for: picking another clears the problem.
          <ErrorNote error={problem}>{errorText(problem, locale, chosen?.name)}</ErrorNote>
        )}
        <div className="flex flex-col gap-2.5">
          {/* While it sends, the button stays black with LINE's light spinner: it's busy, not unavailable. */}
          <button
            type="submit"
            disabled={sending || !startTime}
            className={`btn-primary w-full ${sending ? 'disabled:cursor-wait disabled:bg-ink disabled:text-paper' : ''}`}
          >
            {sending && <img src="/line/LINE_spinner_light.svg" width={16} height={16} alt="" />}
            {sending ? t.loading : t.request}
          </button>
          <p className="text-center text-[12px] text-graphite">{t.confirmsOnLine}</p>
        </div>
      </form>
    </div>
  );
}

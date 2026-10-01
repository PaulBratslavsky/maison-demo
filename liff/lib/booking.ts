import { isRealDate, timeSlots, tokyoDays, tomorrow } from './format';
import type { BoutiqueInfo } from './types';

/** Why a date can't be booked: the COPY key the sheet shows under the days. */
export type DateProblem = 'chooseDate' | 'dateTooSoon';

/** How many days the sheet offers, from tomorrow: two weeks, as far ahead as the concierge's calendar reaches. */
export const BOOKING_DAYS = 14;

/**
 * The days the sheet offers, as chips: the next two weeks on Tokyo's calendar, from tomorrow. Each weekday comes up
 * twice, and the default day, the next Saturday at least two days away, is always among them.
 */
export const bookingDays = (now: Date = new Date()): Array<{ date: string; weekday: number }> => tokyoDays(BOOKING_DAYS + 1, now).slice(1);

/** A date the tools take and a visit can be on: a real calendar date, from tomorrow on Tokyo's calendar. */
export const isBookableDate = (date: string, now: Date = new Date()): boolean => isRealDate(date) && date >= tomorrow(now);

/**
 * No date, or an impossible one, asks for one; a real date today or in the past asks for a later one. The chips offer only
 * days from tomorrow, so a chosen day becomes too soon when Tokyo's midnight passes with the sheet open.
 */
export const dateProblem = (date: string, now: Date = new Date()): DateProblem | null =>
  isBookableDate(date, now) ? null : isRealDate(date) ? 'dateTooSoon' : 'chooseDate';

/** Whether a boutique has the piece to see: at least one in its stock, in find_boutiques' answer for the product. */
export const hasStock = (boutique: BoutiqueInfo, product: string): boolean =>
  boutique.stock.some((line) => line.product === product && line.quantity > 0);

/**
 * The boutique the sheet uses: the one picked, or else the first listed, as the radios show. Only a boutique that has the
 * piece: one without it is a disabled radio, and is never chosen, even when picked before.
 */
export const chooseBoutique = (boutiques: BoutiqueInfo[], slug: string, product: string): BoutiqueInfo | undefined => {
  const withPiece = boutiques.filter((candidate) => hasStock(candidate, product));
  return withPiece.find((candidate) => candidate.slug === slug) ?? withPiece[0];
};

/** Open on a bookable date. Never while that date's answer is loading: the boutiques held are the last date's. */
export const isOpen = (validDate: boolean, loading: boolean, boutique: BoutiqueInfo | undefined): boolean =>
  validDate && !loading && boutique?.openOnDate === true;

/** Half-hour start times on an open day, none otherwise. */
export const slotsFor = (open: boolean, boutique: BoutiqueInfo | undefined): string[] =>
  open && boutique?.hoursOnDate ? timeSlots(boutique.hoursOnDate.opens, boutique.hoursOnDate.closes) : [];

/** The time to send: the one picked when it's offered, else the first offered. Undefined when none is: nothing to send. */
export const startTimeFrom = (slots: string[], picked: string): string | undefined => (slots.includes(picked) ? picked : slots[0]);

/**
 * Whether a key closes the sheet: Escape, but not while an input method is composing text, as when the note is typed in
 * Japanese, where Escape cancels the composition. Safari reports that keydown as keyCode 229, without isComposing.
 */
export const shouldCloseOnKey = (event: Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>): boolean =>
  event.key === 'Escape' && !event.isComposing && event.keyCode !== 229;

/**
 * The booking sheet's rules in one place: what it may send, and what it says when it may not. `boutiques` and
 * `loading` are find_boutiques' answer for the date and the `product`. The sheet may send only when `startTime` is set.
 */
export const bookingState = ({
  date,
  boutique,
  time,
  product,
  boutiques,
  loading,
  now = new Date(),
}: {
  date: string;
  boutique: string;
  time: string;
  product: string;
  boutiques: BoutiqueInfo[];
  loading: boolean;
  now?: Date;
}) => {
  const validDate = isBookableDate(date, now);
  const chosen = chooseBoutique(boutiques, boutique, product);
  const open = isOpen(validDate, loading, chosen);
  const slots = slotsFor(open, chosen);
  return { validDate, dateProblem: dateProblem(date, now), chosen, open, slots, startTime: startTimeFrom(slots, time) };
};

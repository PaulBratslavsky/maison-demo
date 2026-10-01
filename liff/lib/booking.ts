import { isRealDate, timeSlots, tomorrow } from './format';
import type { BoutiqueInfo } from './types';

/** Why a date can't be booked: the COPY key the sheet shows under the date field. */
export type DateProblem = 'chooseDate' | 'dateTooSoon';

/** A date the tools take and a visit can be on: a real calendar date, from tomorrow on Tokyo's calendar. */
export const isBookableDate = (date: string, now: Date = new Date()): boolean => isRealDate(date) && date >= tomorrow(now);

/** A cleared or impossible date asks for one; a real date today or in the past asks for a later one. */
export const dateProblem = (date: string, now: Date = new Date()): DateProblem | null =>
  isBookableDate(date, now) ? null : isRealDate(date) ? 'dateTooSoon' : 'chooseDate';

/** The boutique the sheet uses: the one picked, or the first listed when that one isn't (the select shows it too). */
export const chooseBoutique = (boutiques: BoutiqueInfo[], slug: string): BoutiqueInfo | undefined =>
  boutiques.find((candidate) => candidate.slug === slug) ?? boutiques[0];

/** Open on a bookable date. Never while that date's answer is loading: the boutiques held are the last date's. */
export const isOpen = (validDate: boolean, loading: boolean, boutique: BoutiqueInfo | undefined): boolean =>
  validDate && !loading && boutique?.openOnDate === true;

/** Half-hour start times on an open day, none otherwise. */
export const slotsFor = (open: boolean, boutique: BoutiqueInfo | undefined): string[] =>
  open && boutique?.hoursOnDate ? timeSlots(boutique.hoursOnDate.opens, boutique.hoursOnDate.closes) : [];

/** The time to send: the one picked when it's offered, else the first offered. Undefined when none is: nothing to send. */
export const startTimeFrom = (slots: string[], picked: string): string | undefined => (slots.includes(picked) ? picked : slots[0]);

/**
 * The booking sheet's rules in one place: what it may send, and what it says when it may not. `boutiques` and
 * `loading` are find_boutiques' answer for the date. The sheet may send only when `startTime` is set.
 */
export const bookingState = ({
  date,
  boutique,
  time,
  boutiques,
  loading,
  now = new Date(),
}: {
  date: string;
  boutique: string;
  time: string;
  boutiques: BoutiqueInfo[];
  loading: boolean;
  now?: Date;
}) => {
  const validDate = isBookableDate(date, now);
  const chosen = chooseBoutique(boutiques, boutique);
  const open = isOpen(validDate, loading, chosen);
  const slots = slotsFor(open, chosen);
  return { validDate, dateProblem: dateProblem(date, now), chosen, open, slots, startTime: startTimeFrom(slots, time) };
};

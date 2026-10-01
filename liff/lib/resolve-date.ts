import { isRealDate, tokyoDays } from './format';
import type { Locale } from './types';

/** The weekdays as the concierge's `resolve_date` tool takes them, Monday first. */
export const WEEKDAY_IDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekdayId = (typeof WEEKDAY_IDS)[number];

/** The days a customer can name relative to today, each as many days from today as its place in the list. */
export const RELATIVE_IDS = ['today', 'tomorrow', 'day_after_tomorrow'] as const;
export type RelativeId = (typeof RELATIVE_IDS)[number];

/**
 * Which week a weekday is in. "this" is the first such day after today, which is all "Saturday" means, and what a
 * weekday means without `week`. "next" is that weekday in the week after this one. "this" is there for the model:
 * given only "next" to add, the local model added it to a plain "Saturday" and booked the Saturday after.
 */
export const WEEK_IDS = ['this', 'next'] as const;
export type WeekId = (typeof WEEK_IDS)[number];

/** `Date.getUTCDay()` numbers the week from Sunday (0): Monday is 1, Sunday is 0. */
const dayNumber = (weekday: WeekdayId) => (WEEKDAY_IDS.indexOf(weekday) + 1) % 7;
/** The place of a `getUTCDay()` number in a week that starts on Monday (0): Monday is 0, Sunday is 6. */
const placeInWeek = (utcDay: number) => (utcDay + 6) % 7;

const WEEKDAY_NAMES: Record<Locale, readonly string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ja: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
};

/** Which day the customer means: exactly one of weekday, date and relative, and `week` only together with weekday. */
export interface DateQuery {
  /** A weekday on its own, such as "Saturday": the first such day after today (today only if the customer says "today"). */
  weekday?: WeekdayId;
  /**
   * With a weekday: "next" is that weekday in the week after this one, as in "next week's Saturday" (来週の土曜日). Weeks
   * run from Monday to Sunday. On a Thursday, next week's Saturday is nine days away. On a Sunday, next week starts
   * tomorrow. "this", or no week, is the first such day after today.
   */
  week?: WeekId;
  /** A calendar date, YYYY-MM-DD: its weekday, and whether it has gone by. */
  date?: string;
  relative?: RelativeId;
}

export interface ResolvedDate {
  /** YYYY-MM-DD, on Tokyo's calendar. */
  date: string;
  /** The weekday's name in the reply language. */
  weekday: string;
  /** Whether the date is before today in Tokyo. */
  isPast: boolean;
}

/**
 * Which date the customer means, worked out here and not by the model: on the local model "Saturday" came out as
 * Friday twice, even with a calendar in front of it, and a model that is asked for a date can always get one wrong.
 * Days are Tokyo's (`tokyoDays` in lib/format.ts), whatever time zone the server runs in. Throws unless it is given
 * exactly one of weekday, date and relative (with `week` only beside a weekday), and a date that is on the calendar.
 */
export const resolveDate = (query: DateQuery, locale: Locale, now: Date = new Date()): ResolvedDate => {
  const { weekday, week, date, relative } = query;
  if ([weekday, date, relative].filter((part) => part !== undefined).length !== 1) {
    throw new Error('Give exactly one of weekday, date or relative.');
  }
  if (week !== undefined && weekday === undefined) {
    throw new Error('week goes with weekday: give both, such as weekday "saturday" and week "next".');
  }
  // Today and the thirteen days after it. Next week's Sunday, the furthest day asked for here, is thirteen days away
  // (from a Monday); every weekday comes up within seven days of today.
  const days = tokyoDays(14, now);
  const today = days[0];
  const untilNextMonday = 7 - placeInWeek(today.weekday);
  const resolved =
    weekday !== undefined
      ? week === 'next'
        ? days[untilNextMonday + WEEKDAY_IDS.indexOf(weekday)]?.date
        : days.slice(1, 8).find((day) => day.weekday === dayNumber(weekday))?.date
      : relative !== undefined
        ? days[RELATIVE_IDS.indexOf(relative)]?.date
        : date;
  if (resolved === undefined || !isRealDate(resolved)) throw new Error(`${resolved} is not a date on the calendar. Use YYYY-MM-DD.`);
  return {
    date: resolved,
    weekday: WEEKDAY_NAMES[locale][new Date(`${resolved}T00:00:00Z`).getUTCDay()],
    isPast: resolved < today.date,
  };
};

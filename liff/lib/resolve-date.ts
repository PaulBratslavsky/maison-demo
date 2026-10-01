import { isRealDate, tokyoDays } from './format';
import type { Locale } from './types';

/** The weekdays as the concierge's `resolve_date` tool takes them, Monday first. */
export const WEEKDAY_IDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekdayId = (typeof WEEKDAY_IDS)[number];

/** `Date.getUTCDay()` numbers the week from Sunday (0): Monday is 1, Sunday is 0. */
const dayNumber = (weekday: WeekdayId) => (WEEKDAY_IDS.indexOf(weekday) + 1) % 7;

const WEEKDAY_NAMES: Record<Locale, readonly string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ja: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
};

/** Which day the customer means: exactly one of these. */
export interface DateQuery {
  /** A weekday on its own, such as "Saturday": the first such day after today (today only if the customer says "today"). */
  weekday?: WeekdayId;
  /** A calendar date, YYYY-MM-DD: its weekday, and whether it has gone by. */
  date?: string;
  relative?: 'today' | 'tomorrow';
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
 * exactly one of weekday, date and relative, and a date that is on the calendar.
 */
export const resolveDate = (query: DateQuery, locale: Locale, now: Date = new Date()): ResolvedDate => {
  const { weekday, date, relative } = query;
  if ([weekday, date, relative].filter((part) => part !== undefined).length !== 1) {
    throw new Error('Give exactly one of weekday, date or relative.');
  }
  // Today, then the seven days after it: every weekday comes up among those seven.
  const [today, ...ahead] = tokyoDays(8, now);
  const resolved =
    weekday !== undefined
      ? ahead.find((day) => day.weekday === dayNumber(weekday))?.date
      : relative !== undefined
        ? (relative === 'today' ? today : ahead[0]).date
        : date;
  if (resolved === undefined || !isRealDate(resolved)) throw new Error(`${resolved} is not a date on the calendar. Use YYYY-MM-DD.`);
  return {
    date: resolved,
    weekday: WEEKDAY_NAMES[locale][new Date(`${resolved}T00:00:00Z`).getUTCDay()],
    isPast: resolved < today.date,
  };
};

import { describe, expect, it } from 'vitest';
import { RELATIVE_IDS, WEEKDAY_IDS, resolveDate, type WeekdayId } from './resolve-date';

// 11:30 on Thursday 1 October 2026 in Tokyo, while it's still Wednesday evening in California.
const thursday = new Date('2026-10-01T02:30:00Z');

// The hour at that instant in each zone shows that the zone really changed.
const HOUR_AT_THURSDAY: Record<string, number> = { 'Asia/Tokyo': 11, 'America/Los_Angeles': 19, 'Pacific/Kiritimati': 16, 'Pacific/Pago_Pago': 15, UTC: 2 };
/** Runs `check` once in each of several server time zones, and puts the zone back. */
const inEachZone = (check: (zone: string) => void) => {
  const original = process.env.TZ;
  try {
    for (const [zone, hour] of Object.entries(HOUR_AT_THURSDAY)) {
      process.env.TZ = zone;
      expect(new Date(thursday).getHours(), zone).toBe(hour);
      check(zone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
};
/** Every date `resolveDate` gives for every form, from `now`, in English. */
const everyForm = (now: Date) => ({
  weekday: Object.fromEntries(WEEKDAY_IDS.map((weekday) => [weekday, resolveDate({ weekday }, 'en', now).date])),
  thisWeek: Object.fromEntries(WEEKDAY_IDS.map((weekday) => [weekday, resolveDate({ weekday, week: 'this' }, 'en', now).date])),
  nextWeek: Object.fromEntries(WEEKDAY_IDS.map((weekday) => [weekday, resolveDate({ weekday, week: 'next' }, 'en', now).date])),
  relative: Object.fromEntries(RELATIVE_IDS.map((relative) => [relative, resolveDate({ relative }, 'en', now).date])),
});

describe('resolveDate', () => {
  it('finds the first day after today for each weekday', () => {
    const next: Record<WeekdayId, string> = {
      monday: '2026-10-05',
      tuesday: '2026-10-06',
      wednesday: '2026-10-07',
      thursday: '2026-10-08',
      friday: '2026-10-02',
      saturday: '2026-10-03',
      sunday: '2026-10-04',
    };
    for (const [weekday, date] of Object.entries(next) as Array<[WeekdayId, string]>) {
      expect(resolveDate({ weekday }, 'en', thursday).date, weekday).toBe(date);
    }
    expect(resolveDate({ weekday: 'saturday' }, 'en', thursday)).toEqual({ date: '2026-10-03', weekday: 'Saturday', isPast: false });
  });

  it('counts today only when the customer says "today"', () => {
    // Today is Thursday: "Thursday" means next week's, "today" means today.
    expect(resolveDate({ weekday: 'thursday' }, 'en', thursday)).toEqual({ date: '2026-10-08', weekday: 'Thursday', isPast: false });
    expect(resolveDate({ relative: 'today' }, 'en', thursday)).toEqual({ date: '2026-10-01', weekday: 'Thursday', isPast: false });
    // On a Saturday, "Saturday" is the one after this.
    const saturday = new Date('2026-10-03T03:00:00Z');
    expect(resolveDate({ weekday: 'saturday' }, 'en', saturday).date).toBe('2026-10-10');
    expect(resolveDate({ relative: 'today' }, 'en', saturday).date).toBe('2026-10-03');
  });

  it('resolves tomorrow', () => {
    expect(resolveDate({ relative: 'tomorrow' }, 'en', thursday)).toEqual({ date: '2026-10-02', weekday: 'Friday', isPast: false });
    // Over the end of a month and a year.
    expect(resolveDate({ relative: 'tomorrow' }, 'en', new Date('2026-12-31T03:00:00Z'))).toEqual({ date: '2027-01-01', weekday: 'Friday', isPast: false });
  });

  it('names the weekday in the reply language', () => {
    expect(resolveDate({ weekday: 'saturday' }, 'ja', thursday)).toEqual({ date: '2026-10-03', weekday: '土曜日', isPast: false });
    expect(resolveDate({ relative: 'today' }, 'ja', thursday).weekday).toBe('木曜日');
    expect(resolveDate({ date: '2026-10-04' }, 'ja', thursday).weekday).toBe('日曜日');
    expect(resolveDate({ date: '2026-10-04' }, 'en', thursday).weekday).toBe('Sunday');
  });

  it("finds an explicit date's weekday", () => {
    expect(resolveDate({ date: '2026-10-10' }, 'en', thursday)).toEqual({ date: '2026-10-10', weekday: 'Saturday', isPast: false });
    expect(resolveDate({ date: '2028-02-29' }, 'en', thursday).weekday).toBe('Tuesday'); // a leap day
    expect(resolveDate({ date: '2026-12-31' }, 'en', thursday).weekday).toBe('Thursday');
    expect(resolveDate({ date: '2027-01-01' }, 'en', thursday).weekday).toBe('Friday');
  });

  it('says whether a date has gone by', () => {
    expect(resolveDate({ date: '2026-09-30' }, 'en', thursday)).toEqual({ date: '2026-09-30', weekday: 'Wednesday', isPast: true });
    expect(resolveDate({ date: '2026-10-01' }, 'en', thursday).isPast).toBe(false); // today
    expect(resolveDate({ date: '2026-10-02' }, 'en', thursday).isPast).toBe(false);
  });

  it("counts Tokyo's day, not UTC's", () => {
    // 00:30 on Friday 2 October in Tokyo is still Thursday 1 October in UTC, and in California.
    const justAfterMidnight = new Date('2026-10-01T15:30:00Z');
    expect(resolveDate({ relative: 'today' }, 'en', justAfterMidnight)).toEqual({ date: '2026-10-02', weekday: 'Friday', isPast: false });
    expect(resolveDate({ weekday: 'friday' }, 'en', justAfterMidnight).date).toBe('2026-10-09');
    expect(resolveDate({ weekday: 'saturday' }, 'en', justAfterMidnight).date).toBe('2026-10-03');
    expect(resolveDate({ date: '2026-10-01' }, 'en', justAfterMidnight).isPast).toBe(true);
    // A minute earlier it is still Thursday in Tokyo.
    expect(resolveDate({ relative: 'today' }, 'en', new Date('2026-10-01T14:59:00Z')).date).toBe('2026-10-01');
  });

  it('takes week "this" for what a weekday means on its own: the first such day after today', () => {
    // The local model wants something to fill in after a weekday. Given only "next", it filled in "next" for "Saturday".
    inEachZone((zone) => {
      for (const weekday of WEEKDAY_IDS) {
        expect(resolveDate({ weekday, week: 'this' }, 'en', thursday), `${zone} ${weekday}`).toEqual(resolveDate({ weekday }, 'en', thursday));
      }
    });
    expect(resolveDate({ weekday: 'saturday', week: 'this' }, 'ja', thursday)).toEqual({ date: '2026-10-03', weekday: '土曜日', isPast: false });
    // Today's own weekday is next week's, as without a week.
    expect(resolveDate({ weekday: 'thursday', week: 'this' }, 'en', thursday).date).toBe('2026-10-08');
  });

  it('finds each weekday in next week, which runs Monday to Sunday', () => {
    // Today is Thursday 1 October. This week ends on Sunday the 4th: next week is Monday the 5th to Sunday the 11th.
    const nextWeek: Record<WeekdayId, string> = {
      monday: '2026-10-05',
      tuesday: '2026-10-06',
      wednesday: '2026-10-07',
      thursday: '2026-10-08',
      friday: '2026-10-09',
      saturday: '2026-10-10',
      sunday: '2026-10-11',
    };
    inEachZone((zone) => {
      for (const [weekday, date] of Object.entries(nextWeek) as Array<[WeekdayId, string]>) {
        expect(resolveDate({ weekday, week: 'next' }, 'en', thursday).date, `${zone} ${weekday}`).toBe(date);
      }
    });
    expect(resolveDate({ weekday: 'saturday', week: 'next' }, 'en', thursday)).toEqual({ date: '2026-10-10', weekday: 'Saturday', isPast: false });
    expect(resolveDate({ weekday: 'saturday', week: 'next' }, 'ja', thursday)).toEqual({ date: '2026-10-10', weekday: '土曜日', isPast: false });
    // Without "next", the same weekday is the first one after today: that is how 来週の土曜日 used to come out wrong.
    expect(resolveDate({ weekday: 'saturday' }, 'en', thursday).date).toBe('2026-10-03');
  });

  it("starts next week on Monday: from a Monday it is seven days on, from a Sunday it starts tomorrow", () => {
    const monday = new Date('2026-10-05T03:00:00Z'); // noon on Monday 5 October in Tokyo
    const saturday = new Date('2026-10-03T03:00:00Z');
    const sunday = new Date('2026-10-04T03:00:00Z');
    inEachZone((zone) => {
      expect(resolveDate({ weekday: 'monday', week: 'next' }, 'en', monday).date, `${zone} Monday`).toBe('2026-10-12');
      expect(resolveDate({ weekday: 'sunday', week: 'next' }, 'en', monday).date, `${zone} Monday's Sunday`).toBe('2026-10-18');
      expect(resolveDate({ weekday: 'monday', week: 'next' }, 'en', sunday).date, `${zone} Sunday`).toBe('2026-10-05');
      expect(resolveDate({ weekday: 'sunday', week: 'next' }, 'en', sunday).date, `${zone} Sunday's Sunday`).toBe('2026-10-11');
      expect(resolveDate({ weekday: 'monday', week: 'next' }, 'en', saturday).date, `${zone} Saturday`).toBe('2026-10-05');
      expect(resolveDate({ weekday: 'saturday', week: 'next' }, 'en', saturday).date, `${zone} Saturday's Saturday`).toBe('2026-10-10');
    });
  });

  it("starts next week where Tokyo's week turns, not UTC's", () => {
    // 00:30 on Monday 5 October in Tokyo is still Sunday evening in UTC and in California.
    const justAfterMidnight = new Date('2026-10-04T15:30:00Z');
    inEachZone((zone) => {
      expect(resolveDate({ relative: 'today' }, 'en', justAfterMidnight).date, `${zone} today`).toBe('2026-10-05');
      expect(resolveDate({ weekday: 'monday', week: 'next' }, 'en', justAfterMidnight).date, `${zone} next Monday`).toBe('2026-10-12');
      expect(resolveDate({ weekday: 'saturday', week: 'next' }, 'en', justAfterMidnight).date, `${zone} next Saturday`).toBe('2026-10-17');
      // A minute earlier it is still Sunday in Tokyo, and next week starts tomorrow.
      expect(resolveDate({ weekday: 'monday', week: 'next' }, 'en', new Date('2026-10-04T14:59:00Z')).date, `${zone} a minute earlier`).toBe('2026-10-05');
    });
  });

  it("finds next week's weekday across the end of a month, a year, and over a leap day", () => {
    const newYearsEve = new Date('2026-12-31T03:00:00Z'); // a Thursday; next week is Monday 4 to Sunday 10 January
    const leapWeek = new Date('2028-02-24T03:00:00Z'); // a Thursday; next week is Monday 28 February to Sunday 5 March
    inEachZone((zone) => {
      expect(resolveDate({ weekday: 'monday', week: 'next' }, 'en', newYearsEve).date, zone).toBe('2027-01-04');
      expect(resolveDate({ weekday: 'saturday', week: 'next' }, 'en', newYearsEve).date, zone).toBe('2027-01-09');
      expect(resolveDate({ weekday: 'sunday', week: 'next' }, 'en', newYearsEve).date, zone).toBe('2027-01-10');
      expect(resolveDate({ weekday: 'tuesday', week: 'next' }, 'en', leapWeek).date, zone).toBe('2028-02-29');
      expect(resolveDate({ weekday: 'wednesday', week: 'next' }, 'en', leapWeek).date, zone).toBe('2028-03-01');
    });
  });

  it('resolves the day after tomorrow', () => {
    inEachZone((zone) => {
      expect(resolveDate({ relative: 'day_after_tomorrow' }, 'en', thursday), zone).toEqual({ date: '2026-10-03', weekday: 'Saturday', isPast: false });
      expect(resolveDate({ relative: 'day_after_tomorrow' }, 'ja', thursday).weekday, zone).toBe('土曜日');
      // Over the end of a month and a year, and from just after midnight in Tokyo.
      expect(resolveDate({ relative: 'day_after_tomorrow' }, 'en', new Date('2026-12-31T03:00:00Z')).date, zone).toBe('2027-01-02');
      expect(resolveDate({ relative: 'day_after_tomorrow' }, 'en', new Date('2026-10-01T15:30:00Z')).date, zone).toBe('2026-10-04');
    });
  });

  it('is the same wherever the server runs, for every form', () => {
    const comingWeekday = { monday: '2026-10-05', tuesday: '2026-10-06', wednesday: '2026-10-07', thursday: '2026-10-08', friday: '2026-10-02', saturday: '2026-10-03', sunday: '2026-10-04' };
    const expected = {
      weekday: comingWeekday,
      thisWeek: comingWeekday, // "this" is the same as no week at all
      nextWeek: { monday: '2026-10-05', tuesday: '2026-10-06', wednesday: '2026-10-07', thursday: '2026-10-08', friday: '2026-10-09', saturday: '2026-10-10', sunday: '2026-10-11' },
      relative: { today: '2026-10-01', tomorrow: '2026-10-02', day_after_tomorrow: '2026-10-03' },
    };
    inEachZone((zone) => {
      expect(everyForm(thursday), zone).toEqual(expected);
      expect(resolveDate({ date: '2026-09-30' }, 'ja', thursday), zone).toEqual({ date: '2026-09-30', weekday: '水曜日', isPast: true });
      expect(resolveDate({ date: '2026-10-10' }, 'en', thursday), zone).toEqual({ date: '2026-10-10', weekday: 'Saturday', isPast: false });
    });
  });

  it('wants exactly one of weekday, date and relative', () => {
    expect(() => resolveDate({}, 'en', thursday)).toThrow(/exactly one/);
    expect(() => resolveDate({ weekday: 'saturday', relative: 'today' }, 'en', thursday)).toThrow(/exactly one/);
    expect(() => resolveDate({ weekday: 'saturday', date: '2026-10-03' }, 'en', thursday)).toThrow(/exactly one/);
    expect(() => resolveDate({ date: '2026-10-03', relative: 'tomorrow' }, 'en', thursday)).toThrow(/exactly one/);
  });

  it('wants week to go with a weekday', () => {
    expect(() => resolveDate({ week: 'next' }, 'en', thursday)).toThrow(/exactly one/);
    expect(() => resolveDate({ date: '2026-10-10', week: 'next' }, 'en', thursday)).toThrow(/week goes with weekday/);
    expect(() => resolveDate({ relative: 'tomorrow', week: 'next' }, 'en', thursday)).toThrow(/week goes with weekday/);
  });

  it("refuses a date that isn't on the calendar", () => {
    for (const date of ['2026-02-30', '2026-13-01', '2026-10-3', '10/03/2026', 'Saturday', '']) {
      expect(() => resolveDate({ date }, 'en', thursday), date).toThrow(/calendar/);
    }
  });
});

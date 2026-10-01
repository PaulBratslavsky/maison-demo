import { describe, expect, it } from 'vitest';
import { resolveDate, type WeekdayId } from './resolve-date';

// 11:30 on Thursday 1 October 2026 in Tokyo, while it's still Wednesday evening in California.
const thursday = new Date('2026-10-01T02:30:00Z');

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

  it('is the same wherever the server runs', () => {
    // The hour at 02:30Z in each zone shows that the zone really changed.
    const hourAtNow: Record<string, number> = { 'Asia/Tokyo': 11, 'America/Los_Angeles': 19, 'Pacific/Kiritimati': 16, 'Pacific/Pago_Pago': 15, UTC: 2 };
    const zone = process.env.TZ;
    try {
      const answers = Object.entries(hourAtNow).map(([timeZone, hour]) => {
        process.env.TZ = timeZone;
        expect(new Date(thursday).getHours(), timeZone).toBe(hour);
        return [
          resolveDate({ weekday: 'saturday' }, 'en', thursday),
          resolveDate({ relative: 'today' }, 'ja', thursday),
          resolveDate({ relative: 'tomorrow' }, 'en', thursday),
          resolveDate({ date: '2026-09-30' }, 'en', thursday),
        ];
      });
      for (const answer of answers) expect(answer).toEqual(answers[0]);
      expect(answers[0][0].date).toBe('2026-10-03');
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });

  it('wants exactly one of weekday, date and relative', () => {
    expect(() => resolveDate({}, 'en', thursday)).toThrow(/exactly one/);
    expect(() => resolveDate({ weekday: 'saturday', relative: 'today' }, 'en', thursday)).toThrow(/exactly one/);
    expect(() => resolveDate({ weekday: 'saturday', date: '2026-10-03' }, 'en', thursday)).toThrow(/exactly one/);
    expect(() => resolveDate({ date: '2026-10-03', relative: 'tomorrow' }, 'en', thursday)).toThrow(/exactly one/);
  });

  it("refuses a date that isn't on the calendar", () => {
    for (const date of ['2026-02-30', '2026-13-01', '2026-10-3', '10/03/2026', 'Saturday', '']) {
      expect(() => resolveDate({ date }, 'en', thursday), date).toThrow(/calendar/);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { bookingState, isBookableDate, shouldCloseOnKey } from './booking';
import type { BoutiqueInfo } from './types';

// 11:30 on Thursday 1 October 2026 in Tokyo. Tomorrow there is Friday 2 October.
const NOW = new Date('2026-10-01T02:30:00Z');
const TUESDAY = '2026-10-06';

const week = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** A boutique as find_boutiques returns it for one date (the seed's hours: 11:00 to 20:00; Osaka has no Tuesday). */
const boutique = (slug: string, name: string, openOnDate: boolean, hoursOnDate = openOnDate ? { opens: '11:00', closes: '20:00' } : null): BoutiqueInfo => ({
  slug,
  name,
  city: slug === 'osaka' ? 'Osaka' : 'Tokyo',
  address: `${name} (demo)`,
  hours: week.filter((day) => slug !== 'osaka' || day !== 'tue').map((weekday) => ({ weekday, opens: '11:00', closes: '20:00' })),
  openOnDate,
  hoursOnDate,
  stock: [{ product: 'weekender-50', quantity: slug === 'osaka' ? 0 : 1 }],
});
const onTuesday = [boutique('ginza', 'Ginza Flagship', true), boutique('omotesando', 'Omotesando', true), boutique('osaka', 'Osaka Shinsaibashi', false)];

const sheet = (overrides: Partial<Parameters<typeof bookingState>[0]> = {}) =>
  bookingState({ date: TUESDAY, boutique: 'ginza', time: '14:00', boutiques: onTuesday, loading: false, now: NOW, ...overrides });

describe('isBookableDate', () => {
  it('takes real calendar dates from tomorrow in Tokyo', () => {
    expect(isBookableDate('2026-10-02', NOW)).toBe(true);
    expect(isBookableDate(TUESDAY, NOW)).toBe(true);
  });

  it('refuses today, the past, impossible dates and a cleared field', () => {
    for (const date of ['2026-10-01', '2026-09-30', '2026-02-30', '2026-11-31', '']) expect(isBookableDate(date, NOW)).toBe(false);
  });
});

describe('bookingState', () => {
  it('offers the picked time at an open boutique on a bookable date', () => {
    const state = sheet();
    expect(state).toMatchObject({ validDate: true, dateProblem: null, open: true, startTime: '14:00' });
    expect(state.chosen?.slug).toBe('ginza');
    expect(state.slots).toHaveLength(18);
    expect([state.slots[0], state.slots.at(-1)]).toEqual(['11:00', '19:30']);
  });

  it('asks for a date when the field is cleared, and offers nothing', () => {
    expect(sheet({ date: '' })).toMatchObject({ validDate: false, dateProblem: 'chooseDate', open: false, slots: [], startTime: undefined });
  });

  it('asks for a date when the date is not on the calendar', () => {
    expect(sheet({ date: '2026-02-30' })).toMatchObject({ validDate: false, dateProblem: 'chooseDate', open: false, startTime: undefined });
  });

  it('asks for a later date for today or a day in the past', () => {
    expect(sheet({ date: '2026-10-01' })).toMatchObject({ validDate: false, dateProblem: 'dateTooSoon', open: false, startTime: undefined });
    expect(sheet({ date: '2026-09-15' })).toMatchObject({ validDate: false, dateProblem: 'dateTooSoon', startTime: undefined });
  });

  it('is closed for Osaka on a Tuesday, with no time to send', () => {
    const state = sheet({ boutique: 'osaka' });
    expect(state.chosen?.slug).toBe('osaka');
    expect(state).toMatchObject({ validDate: true, dateProblem: null, open: false, slots: [], startTime: undefined });
  });

  it('is not open while the date is being checked, even with the last answer saying open', () => {
    expect(sheet({ loading: true })).toMatchObject({ open: false, slots: [], startTime: undefined });
  });

  it('has nothing to send when an open day leaves no half-hour slot', () => {
    const short = [boutique('ginza', 'Ginza Flagship', true, { opens: '11:00', closes: '11:20' })];
    expect(sheet({ boutiques: short })).toMatchObject({ open: true, slots: [], startTime: undefined });
    const noHours = [boutique('ginza', 'Ginza Flagship', true, null)];
    expect(sheet({ boutiques: noHours })).toMatchObject({ open: true, slots: [], startTime: undefined });
  });

  it("uses the first boutique listed when the picked one isn't there, as the select shows", () => {
    const withoutGinza = onTuesday.filter((candidate) => candidate.slug !== 'ginza');
    expect(sheet({ boutiques: withoutGinza }).chosen?.slug).toBe('omotesando');
    expect(sheet({ boutiques: [] })).toMatchObject({ chosen: undefined, open: false, startTime: undefined });
  });

  it('falls back to the first slot when the picked time is not offered', () => {
    expect(sheet({ time: '09:00' }).startTime).toBe('11:00');
  });
});

describe('shouldCloseOnKey', () => {
  const key = (event: Partial<Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>>) => ({ key: '', isComposing: false, keyCode: 0, ...event });

  it('closes the sheet on Escape', () => {
    expect(shouldCloseOnKey(key({ key: 'Escape', keyCode: 27 }))).toBe(true);
  });

  it('leaves it open while an input method composes, as when typing the note in Japanese: Escape there cancels the composition', () => {
    expect(shouldCloseOnKey(key({ key: 'Escape', keyCode: 27, isComposing: true }))).toBe(false);
    // Safari ends a composition before its keydown, and reports that keydown as keyCode 229 instead.
    expect(shouldCloseOnKey(key({ key: 'Escape', keyCode: 229 }))).toBe(false);
  });

  it('ignores every other key', () => {
    for (const other of ['Enter', 'Tab', 'a', ' ']) expect(shouldCloseOnKey(key({ key: other })), other).toBe(false);
  });
});

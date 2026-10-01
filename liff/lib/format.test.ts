import { describe, expect, it } from 'vitest';
import { isRealDate, mediaUrl, nextSaturday, timeSlots, visitTime, yen } from './format';

describe('format', () => {
  it('formats yen and Tokyo visit times', () => {
    expect(yen(385000)).toBe('￥385,000');
    expect(visitTime('2026-10-10T14:00:00+09:00', 'ja')).toContain('14:00');
    expect(visitTime('2026-10-10T05:00:00.000Z', 'en')).toContain('14:00');
  });

  it('picks the next Saturday at least two days away', () => {
    expect(nextSaturday(new Date(2026, 9, 7))).toBe('2026-10-10'); // Wednesday → Saturday
    expect(nextSaturday(new Date(2026, 9, 9))).toBe('2026-10-17'); // Friday → the Saturday after
    expect(nextSaturday(new Date(2026, 9, 10))).toBe('2026-10-17'); // Saturday → next week
  });

  it('offers half-hour slots that end 30 minutes before closing', () => {
    const slots = timeSlots('11:00', '20:00');
    expect(slots[0]).toBe('11:00');
    expect(slots.at(-1)).toBe('19:30');
    expect(slots).toHaveLength(18);
  });

  it('makes relative media URLs absolute', () => {
    expect(mediaUrl('/uploads/a.png')).toMatch(/^https?:\/\/.+\/uploads\/a\.png$/);
    expect(mediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(mediaUrl(null)).toBeNull();
  });

  it('accepts only real calendar dates, like the Maison tools', () => {
    expect(isRealDate('2026-10-10')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2026-09-31')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isoDateInput, isoDateTimeInput } from '../../server/src/mcp/schemas';

/** The messages a schema gives for a value; none when it's valid. */
const messagesOf = (schema: typeof isoDateInput, value: string) => {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('isoDateInput', () => {
  it.each(['2026-10-10', '2028-02-29'])('accepts the real date %s', (value) => {
    expect(messagesOf(isoDateInput, value)).toEqual([]);
  });

  it.each(['2026-02-29', '2026-09-31', '2026-02-31'])('rejects %s, which is not on the calendar', (value) => {
    expect(messagesOf(isoDateInput, value)).toEqual(['Not a real calendar date.']);
  });

  it('asks for YYYY-MM-DD when the format is wrong, and only that', () => {
    expect(messagesOf(isoDateInput, '10/10/2026')).toEqual(['Use YYYY-MM-DD.']);
  });
});

describe('isoDateTimeInput', () => {
  it.each(['2026-10-10T14:00:00+09:00', '2028-02-29T14:00+09:00', '2026-10-10T05:00:00Z', '2026-10-10T23:59:59.999+09:00'])(
    'accepts %s',
    (value) => {
      expect(messagesOf(isoDateTimeInput, value)).toEqual([]);
    }
  );

  it.each(['2026-09-31T14:00:00+09:00', '2026-02-29T14:00:00+09:00'])('rejects %s, whose day is not on the calendar', (value) => {
    expect(messagesOf(isoDateTimeInput, value)).toEqual(['Not a real calendar date.']);
  });

  it.each(['2026-10-10T24:00:00+09:00', '2026-10-10T24:00+09:00'])('rejects the hour 24 in %s', (value) => {
    expect(messagesOf(isoDateTimeInput, value)).toEqual(['Not a real time of day: the hour must be 00 to 23.']);
  });

  it('asks for ISO 8601 with a time zone when the format is wrong, and only that', () => {
    expect(messagesOf(isoDateTimeInput, 'next Saturday')).toEqual([
      'Use ISO 8601 with a time zone, e.g. 2026-10-10T14:00:00+09:00.',
    ]);
  });
});

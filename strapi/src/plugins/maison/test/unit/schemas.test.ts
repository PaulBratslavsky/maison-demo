import { describe, expect, it } from 'vitest';
import { handOffToStaffInput, isoDateInput, isoDateTimeInput, questionOutput } from '../../server/src/mcp/schemas';

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

describe('handOffToStaffInput', () => {
  const parse = (value: Record<string, unknown>) => handOffToStaffInput.safeParse(value);

  it.each([1, 1000])('accepts a question of %i characters', (length) => {
    expect(parse({ question: 'x'.repeat(length) }).success).toBe(true);
  });

  it('trims the question', () => {
    expect(parse({ question: '  Can the coffret hold a watch?\n' }).data?.question).toBe('Can the coffret hold a watch?');
  });

  it('counts the question after trimming it: 1,000 characters between spaces are accepted', () => {
    expect(parse({ question: ` ${'x'.repeat(1000)} ` }).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['whitespace only', ' \n\t '],
    ['1,001 characters', 'x'.repeat(1001)],
  ])('refuses a question that is %s', (_label, question) => {
    const result = parse({ question });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['question']);
  });

  it('refuses a call with no question', () => {
    expect(parse({}).success).toBe(false);
  });

  it.each(['no_answer', 'asked_for_person'])('accepts the reason %s', (reason) => {
    expect(parse({ question: 'x', reason }).data?.reason).toBe(reason);
  });

  it('leaves the reason out when it is not given: the tool makes it no_answer', () => {
    expect(parse({ question: 'x' }).data).toEqual({ question: 'x' });
  });

  it.each(['other', 'NO_ANSWER', ''])('refuses the reason "%s"', (reason) => {
    const result = parse({ question: 'x', reason });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['reason']);
  });

  it('accepts a productSlug that is a slug', () => {
    expect(parse({ question: 'x', productSlug: 'jewelry-coffret' }).data?.productSlug).toBe('jewelry-coffret');
  });

  it.each([
    ['capitals and a space', 'Jewelry Coffret'],
    ['an underscore', 'jewelry_coffret'],
    ['Japanese', 'ジュエリー'],
    ['nothing', ''],
    ['121 characters', 'a'.repeat(121)],
  ])('refuses a productSlug that is not a slug: %s', (_label, productSlug) => {
    const result = parse({ question: 'x', productSlug });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['productSlug']);
  });

  it.each(['ja', 'en'])('accepts the locale %s, and refuses another', (locale) => {
    expect(parse({ question: 'x', locale }).data?.locale).toBe(locale);
    expect(parse({ question: 'x', locale: 'fr' }).success).toBe(false);
  });

  it('has no customer field: whatever an argument says about the customer is dropped', () => {
    const subject = `line:U${'b'.repeat(32)}`;
    expect(parse({ question: 'x', subject, customer: subject }).data).toEqual({ question: 'x' });
  });
});

describe('questionOutput', () => {
  it('is an open question with its reference, and its piece or none', () => {
    const piece = { slug: 'jewelry-coffret', name: 'Jewelry Coffret' };
    expect(questionOutput.safeParse({ reference: 'Q-4821', status: 'open', product: piece }).success).toBe(true);
    expect(questionOutput.safeParse({ reference: 'Q-4821', status: 'open', product: null }).success).toBe(true);
  });

  it.each(['taken', 'answered'])('is never a question that is already %s', (status) => {
    expect(questionOutput.safeParse({ reference: 'Q-4821', status, product: null }).success).toBe(false);
  });
});

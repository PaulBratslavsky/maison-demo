import { describe, expect, it } from 'vitest';
import knowledgeSchema from '../../server/src/content-types/knowledge/schema.json';
import { answerInput, handOffToStaffInput, isoDateInput, isoDateTimeInput, questionOutput } from '../../server/src/mcp/schemas';

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

describe('answerInput, the title of the knowledge entry', () => {
  const ANSWER = { text: 'Yes, a watch up to 42 mm fits.', addToKnowledge: true, category: 'sizing' };
  const parse = (value: Record<string, unknown>) => answerInput.safeParse({ ...ANSWER, ...value });

  it('needs no title: without one the question is the title, and the parsed answer has no title at all', () => {
    const result = parse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(ANSWER);
    expect(Object.keys(result.data ?? {})).not.toContain('title');
  });

  it('takes a title, and trims it', () => {
    expect(parse({ title: '  Does a watch fit in the coffret?\n' }).data?.title).toBe('Does a watch fit in the coffret?');
  });

  it.each([1, 200])('accepts a title of %i characters', (length) => {
    expect(parse({ title: 'x'.repeat(length) }).success).toBe(true);
  });

  it('counts the title after trimming it: 200 characters between spaces are accepted', () => {
    expect(parse({ title: ` ${'x'.repeat(200)} ` }).data?.title).toBe('x'.repeat(200));
  });

  it('counts UTF-16 units, as Strapi does for a title: 100 emoji fit, and 101 do not', () => {
    expect(parse({ title: '😀'.repeat(100) }).success).toBe(true);
    expect(parse({ title: '😀'.repeat(101) }).success).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['whitespace only', ' \n\t '],
    ['201 characters', 'x'.repeat(201)],
    ['not text', 42],
  ])('refuses a title that is %s', (_label, title) => {
    const result = parse({ title });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['title']);
  });

  it("allows as many characters as a knowledge entry's title holds", () => {
    const { maxLength } = knowledgeSchema.attributes.title;
    expect(maxLength).toBe(200);
    expect(parse({ title: 'x'.repeat(maxLength) }).success).toBe(true);
    expect(parse({ title: 'x'.repeat(maxLength + 1) }).success).toBe(false);
  });

  it('accepts a title when the answer is not added to product knowledge, for the service to leave unused', () => {
    const result = answerInput.safeParse({ text: ANSWER.text, addToKnowledge: false, title: 'Anything' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ text: ANSWER.text, addToKnowledge: false, title: 'Anything' });
  });

  it('still needs a category to add the answer to product knowledge, whatever the title', () => {
    const result = answerInput.safeParse({ text: ANSWER.text, addToKnowledge: true, title: 'Does a watch fit?' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['category']);
  });
});

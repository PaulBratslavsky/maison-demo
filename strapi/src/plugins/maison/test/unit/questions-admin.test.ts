import { afterEach, describe, expect, it } from 'vitest';
import {
  CATEGORY_OPTIONS,
  REASON_LABELS,
  answerBody,
  askedAt,
  canAnswer,
  canLetThemKnow,
  canSendAnswer,
  statusLabel,
} from '../../admin/src/questions';
import { KNOWLEDGE_CATEGORIES, QUESTION_REASONS } from '../../server/src/constants';
import { answerInput } from '../../server/src/mcp/schemas';

describe('statusLabel', () => {
  it('says Open for a question nobody has taken', () => {
    expect(statusLabel({ status: 'open', staffName: null })).toBe('Open');
  });

  it('names the staff member who took a question, and who answered it', () => {
    expect(statusLabel({ status: 'taken', staffName: 'Jane' })).toBe('Taken by Jane');
    expect(statusLabel({ status: 'answered', staffName: 'Jane' })).toBe('Answered by Jane');
  });

  it.each([null, ''])('says "staff" when the name is missing (%j)', (staffName) => {
    expect(statusLabel({ status: 'taken', staffName })).toBe('Taken by staff');
    expect(statusLabel({ status: 'answered', staffName })).toBe('Answered by staff');
  });
});

describe('REASON_LABELS', () => {
  it('words the two reasons the concierge hands a question over for', () => {
    expect(REASON_LABELS).toEqual({ no_answer: 'No answer in product knowledge', asked_for_person: 'Asked for a person' });
  });

  it('labels every reason the server records, and no other', () => {
    expect(Object.keys(REASON_LABELS)).toEqual([...QUESTION_REASONS]);
  });
});

describe('the buttons a question gets', () => {
  it.each([
    ['open', true, true],
    ['taken', false, true],
    ['answered', false, false],
  ] as const)('%s: Let them know is %s, Answer is %s', (status, letThemKnow, answer) => {
    expect(canLetThemKnow({ status })).toBe(letThemKnow);
    expect(canAnswer({ status })).toBe(answer);
  });
});

describe('CATEGORY_OPTIONS', () => {
  it("has the server's knowledge categories as its values, in the server's order", () => {
    expect(CATEGORY_OPTIONS.map(({ value }) => value)).toEqual([...KNOWLEDGE_CATEGORIES]);
  });

  it('labels each category in words staff know', () => {
    expect(CATEGORY_OPTIONS).toEqual([
      { value: 'care', label: 'Care' },
      { value: 'materials', label: 'Materials' },
      { value: 'sizing', label: 'Sizing' },
      { value: 'personalization', label: 'Personalization' },
      { value: 'delivery', label: 'Delivery' },
      { value: 'returns', label: 'Returns' },
      { value: 'repairs', label: 'Repairs' },
      { value: 'warranty', label: 'Warranty' },
      { value: 'gifting', label: 'Gifting' },
      { value: 'store', label: 'Boutiques and service' },
    ]);
  });
});

describe('askedAt', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('writes the moment in Tokyo time, whatever time zone the browser is in', () => {
    // Tokyo is 9 hours ahead of UTC. Los Angeles is a day behind it, and Kiritimati is 14 hours ahead of it.
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      expect(askedAt('2026-10-03T01:12:00.000Z'), zone).toBe('2026-10-03 10:12');
    }
  });

  it("gives Tokyo's date, not UTC's, across a date boundary, and writes midnight as 00:00", () => {
    process.env.TZ = 'UTC';
    expect(askedAt('2026-10-02T15:00:00.000Z')).toBe('2026-10-03 00:00');
    expect(askedAt('2026-12-31T14:59:00.000Z')).toBe('2026-12-31 23:59');
  });

  it('pads every part, and reads an offset as well as Z', () => {
    expect(askedAt('2026-01-05T00:07:00.000Z')).toBe('2026-01-05 09:07');
    expect(askedAt('2026-10-03T10:12:00+09:00')).toBe('2026-10-03 10:12');
  });

  it("shows a value that isn't a date as it came, instead of failing the whole table", () => {
    expect(askedAt('soon')).toBe('soon');
  });
});

describe('the answer the dialog sends', () => {
  it('leaves category out when Add to product knowledge is unticked, even if one was picked before', () => {
    const body = answerBody({ text: 'Yes, a watch up to 42 mm fits.', addToKnowledge: false, category: 'care' });
    expect(body).toEqual({ text: 'Yes, a watch up to 42 mm fits.', addToKnowledge: false });
    expect(Object.keys(body)).not.toContain('category');
    expect(answerInput.safeParse(body).success).toBe(true);
  });

  it("never says no category with null or an empty string: the server's schema refuses both", () => {
    const body = answerBody({ text: 'Yes.', addToKnowledge: false, category: '' });
    for (const category of [null, '']) {
      expect(answerInput.safeParse({ ...body, category }).success, JSON.stringify(category)).toBe(false);
    }
  });

  it('sends the category with the box ticked, and the server accepts every category the select offers', () => {
    for (const { value } of CATEGORY_OPTIONS) {
      const body = answerBody({ text: 'Yes.', addToKnowledge: true, category: value });
      expect(body).toEqual({ text: 'Yes.', addToKnowledge: true, category: value });
      expect(answerInput.safeParse(body).success, value).toBe(true);
    }
  });

  it('sends the answer as it was typed', () => {
    expect(answerBody({ text: '  Yes.\n\nNo charge. ', addToKnowledge: false, category: '' }).text).toBe('  Yes.\n\nNo charge. ');
  });
});

describe('Send on LINE', () => {
  it.each([
    ['no answer yet', { text: '', addToKnowledge: false, category: '' }, false],
    ['an answer of only spaces and line breaks', { text: ' \n ', addToKnowledge: false, category: '' }, false],
    ['an answer, with the box unticked', { text: 'Yes.', addToKnowledge: false, category: '' }, true],
    ['an answer, the box ticked and no category yet', { text: 'Yes.', addToKnowledge: true, category: '' }, false],
    ['an answer, the box ticked and a category', { text: 'Yes.', addToKnowledge: true, category: 'care' }, true],
    ['a category but no answer', { text: '', addToKnowledge: true, category: 'care' }, false],
    ['a category the select does not offer', { text: 'Yes.', addToKnowledge: true, category: 'nonsense' }, false],
  ])('is enabled for %s: %s', (_label, form, enabled) => {
    expect(canSendAnswer(form)).toBe(enabled);
  });
});

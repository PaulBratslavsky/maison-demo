import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UID } from '../../server/src/constants';
import questions from '../../server/src/services/questions';
import { LINE_API, TOKEN, lineAnswers } from './fake-line';
import { fakeStrapi } from './fake-strapi';

type Doc = Record<string, any>;
type Language = 'ja' | 'en';
/** A product in one language: published unless `status` says draft. */
type Piece = { slug: string; name: string; locale: Language; status?: 'published' | 'draft' };

/** The customer as the session gives them: `line:U` and 32 hex characters. LINE's own user ID is what follows `line:`. */
const USER_ID = 'U4af49806290a28bb0a53ff1d09a9d588';
const SUBJECT = `line:${USER_ID}`;
const ASKED = 'Can the coffret hold a watch?';
const input = { subject: SUBJECT, question: ASKED, reason: 'no_answer' as const };
const WITH_TOKEN = { lineChannelAccessToken: TOKEN, lineApiBaseUrl: LINE_API };

const COFFRET: Piece[] = [
  { slug: 'jewelry-coffret', name: 'ジュエリー・コフレ', locale: 'ja' },
  { slug: 'jewelry-coffret', name: 'Jewelry Coffret', locale: 'en' },
];

interface WorldOptions {
  /** How many open or taken questions the customer has. */
  waiting?: number;
  /** The references some question already has. */
  taken?: string[];
  pieces?: Piece[];
  /** What findMany answers: the questions, as the Document Service holds them. */
  rows?: Doc[];
  config?: Record<string, unknown>;
}

/**
 * The Document Service as the questions service reads and writes it. `count` answers by what it is asked: the
 * open-question count filters on `customer`, the reference check on `reference`, and anything else is a mistake in
 * the service. A piece is found only in its own language, and only in the status asked for. `create` and `findMany`
 * are kept, for a test to read what was stored and asked.
 */
const world = ({ waiting = 0, taken = [], pieces = [], rows = [], config = {} }: WorldOptions = {}) => {
  const count = vi.fn(async ({ filters }: Doc) => {
    if (filters?.reference) return taken.filter((reference) => reference === filters.reference.$eq).length;
    if (filters?.customer) return waiting;
    throw new Error(`count was asked something these tests don't know: ${JSON.stringify(filters)}`);
  });
  const create = vi.fn(async ({ data }: { data: Doc }) => ({ documentId: 'doc-new', ...data }));
  const findMany = vi.fn(async (_params: Doc) => rows);
  const findFirst = vi.fn(
    async ({ locale, status, filters }: Doc) =>
      pieces.find((piece) => piece.locale === locale && (piece.status ?? 'published') === status && piece.slug === filters?.slug?.$eq) ?? null
  );
  const documents = (uid: string) => {
    if (uid === UID.question) return { count, create, findMany };
    if (uid === UID.product) return { findFirst };
    throw new Error(`These tests have no ${uid}.`);
  };
  return { service: questions({ strapi: fakeStrapi({ documents, config }) }), count, create, findMany, findFirst };
};

/** What the question's `create` was given. */
const storedBy = (create: ReturnType<typeof world>['create']): Doc => {
  expect(create).toHaveBeenCalledOnce();
  return create.mock.calls[0][0].data;
};

/** `fetch` when no answer comes: it rejects with `error`. */
const rejects = (error: unknown) => vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => Promise.reject(error));

let fetchMock: ReturnType<typeof lineAnswers>;
const useFetch = (mock: ReturnType<typeof lineAnswers>) => {
  fetchMock = mock;
  vi.stubGlobal('fetch', mock);
};

// Nothing here reaches LINE: every test starts with fetch stubbed, and the API address is this machine's.
beforeEach(() => useFetch(lineAnswers(404, { message: 'Not found' })));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('questions.ask', () => {
  it("records the question for staff: the customer from the session, the question trimmed, why, and the chat's language", async () => {
    const { service, create } = world();

    const result = await service.ask({ subject: SUBJECT, question: `  ${ASKED}\n`, reason: 'asked_for_person', locale: 'en' });

    const stored = storedBy(create);
    expect(stored).toEqual({
      reference: expect.stringMatching(/^Q-\d{4}$/),
      customer: SUBJECT,
      customerName: null,
      question: ASKED,
      reason: 'asked_for_person',
      language: 'en',
      productSlug: null,
      status: 'open',
    });
    expect(result).toEqual({ ok: true, value: { reference: stored.reference, status: 'open', product: null } });
  });

  it.each([
    ['a chat in English', { locale: 'en' as const }, {}, 'en'],
    ['a chat in Japanese', { locale: 'ja' as const }, {}, 'ja'],
    ['no locale: the default locale, Japanese', {}, {}, 'ja'],
    ['no locale, with English as the default locale', {}, { defaultLocale: 'en' }, 'en'],
  ])('stores the language of %s', async (_label, locale, config, language) => {
    const { service, create } = world({ config });
    expect((await service.ask({ ...input, ...locale })).ok).toBe(true);
    expect(storedBy(create).language).toBe(language);
  });

  it('keeps the reason it was given', async () => {
    const { service, create } = world();
    await service.ask({ ...input, reason: 'no_answer' });
    expect(storedBy(create).reason).toBe('no_answer');
  });
});

describe('questions.ask, about a piece', () => {
  it("stores the slug of a published piece, and answers its name in the question's language", async () => {
    const { service, create } = world({ pieces: COFFRET });

    const result = await service.ask({ ...input, productSlug: 'jewelry-coffret', locale: 'en' });

    const stored = storedBy(create);
    expect(stored.productSlug).toBe('jewelry-coffret');
    expect(result).toEqual({
      ok: true,
      value: { reference: stored.reference, status: 'open', product: { slug: 'jewelry-coffret', name: 'Jewelry Coffret' } },
    });
  });

  it('names the piece in Japanese for a chat in Japanese, and for a chat with no locale', async () => {
    for (const locale of [{ locale: 'ja' as const }, {}]) {
      const { service } = world({ pieces: COFFRET });
      const result = await service.ask({ ...input, productSlug: 'jewelry-coffret', ...locale });
      expect(result).toMatchObject({ ok: true, value: { product: { slug: 'jewelry-coffret', name: 'ジュエリー・コフレ' } } });
    }
  });

  it("names the piece in the default language when the question's language has no version of it", async () => {
    const { service, create, findFirst } = world({ pieces: [COFFRET[0]] });

    const result = await service.ask({ ...input, productSlug: 'jewelry-coffret', locale: 'en' });

    expect(findFirst.mock.calls.map(([params]) => params.locale)).toEqual(['en', 'ja']);
    expect(storedBy(create).productSlug).toBe('jewelry-coffret');
    expect(result).toMatchObject({ ok: true, value: { product: { slug: 'jewelry-coffret', name: 'ジュエリー・コフレ' } } });
  });

  it('reads published versions only, so a piece that is only a draft is dropped', async () => {
    const { service, create } = world({ pieces: COFFRET.map((piece) => ({ ...piece, status: 'draft' as const })) });

    const result = await service.ask({ ...input, productSlug: 'jewelry-coffret', locale: 'en' });

    expect(storedBy(create).productSlug).toBeNull();
    expect(result).toMatchObject({ ok: true, value: { product: null } });
  });

  it('drops an unknown slug: it stores no piece, answers product null, and still creates the question', async () => {
    const { service, create } = world({ pieces: COFFRET });

    const result = await service.ask({ ...input, productSlug: 'no-such-piece', locale: 'en' });

    const stored = storedBy(create);
    expect(stored.productSlug).toBeNull();
    expect(stored.question).toBe(ASKED);
    expect(result).toEqual({ ok: true, value: { reference: stored.reference, status: 'open', product: null } });
  });

  it.each([
    ['en', ['en', 'ja']],
    ['ja', ['ja']],
  ] as const)("looks for an unknown piece in a chat in %s, and then in the default language only if that's another one", async (locale, looked) => {
    const { service, findFirst } = world();
    await service.ask({ ...input, productSlug: 'no-such-piece', locale });
    expect(findFirst.mock.calls.map(([params]) => params.locale)).toEqual(looked);
  });

  it('looks for no piece when the question is not about one', async () => {
    const { service, findFirst } = world({ pieces: COFFRET });
    await service.ask(input);
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("questions.ask, the customer's LINE name", () => {
  it("asks LINE's Get profile API for the user ID without line:, with the token, and stores the name", async () => {
    useFetch(lineAnswers(200, { displayName: 'Paul (test)' }));
    const { service, create } = world({ config: WITH_TOKEN });

    const result = await service.ask(input);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${LINE_API}/v2/bot/profile/${USER_ID}`);
    expect(url).not.toContain('line:');
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(storedBy(create).customerName).toBe('Paul (test)');
    expect(result.ok).toBe(true);
  });

  it.each([
    ['no token is set', {}],
    ['the token is empty', { lineChannelAccessToken: '', lineApiBaseUrl: LINE_API }],
  ])('never calls LINE when %s, and stores no name', async (_label, config) => {
    useFetch(lineAnswers(200, { displayName: 'Paul (test)' }));
    const { service, create } = world({ config });

    expect((await service.ask(input)).ok).toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storedBy(create).customerName).toBeNull();
  });

  it.each([
    ['answers 404, as it does for someone who is not a friend of the account', () => lineAnswers(404, { message: 'Not found' })],
    ["doesn't answer in time", () => rejects(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))],
  ])('still creates the question, without a name, when LINE %s', async (_label, mock) => {
    useFetch(mock());
    const { service, create } = world({ config: WITH_TOKEN });

    const result = await service.ask(input);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(storedBy(create).customerName).toBeNull();
    expect(result.ok).toBe(true);
  });
});

describe('questions.ask, the limit', () => {
  const REFUSAL = {
    ok: false,
    code: 'too_many_open_questions',
    message: "This customer already has 5 questions with Maison's client advisors.",
    hint: "Don't hand this one off. Tell the customer their earlier questions are with the advisors, who will reply in the LINE chat with Maison.",
  };

  it.each([5, 6])('answers too_many_open_questions, and creates nothing, for a customer with %i open or taken questions', async (waiting) => {
    const { service, create, findFirst } = world({ waiting, pieces: COFFRET, config: WITH_TOKEN });

    const result = await service.ask({ ...input, productSlug: 'jewelry-coffret' });

    expect(result).toEqual(REFUSAL);
    expect(create).not.toHaveBeenCalled();
    // It stops before it looks for the piece or asks LINE for a name.
    expect(findFirst).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts only this customer, and only their open or taken questions', async () => {
    const { service, count } = world({ waiting: 4 });

    const result = await service.ask(input);

    expect(count).toHaveBeenNthCalledWith(1, { filters: { customer: { $eq: SUBJECT }, status: { $in: ['open', 'taken'] } } });
    // The fifth question is still allowed.
    expect(result.ok).toBe(true);
  });
});

describe('questions.ask, the reference', () => {
  it('draws again when a question already has the reference', async () => {
    // Math.random 0 makes Q-1000, and 0.5 makes Q-5500.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5);
    const { service, create, count } = world({ taken: ['Q-1000'] });

    const result = await service.ask(input);

    expect(count).toHaveBeenCalledWith({ filters: { reference: { $eq: 'Q-1000' } } });
    expect(count).toHaveBeenCalledWith({ filters: { reference: { $eq: 'Q-5500' } } });
    expect(storedBy(create).reference).toBe('Q-5500');
    expect(result).toMatchObject({ ok: true, value: { reference: 'Q-5500' } });
  });

  it('gives up with an error, and creates nothing, after 20 references that are all taken', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { service, create, count } = world({ taken: ['Q-1000'] });

    await expect(service.ask(input)).rejects.toThrow('[maison] Could not find a free question reference after 20 attempts.');

    expect(create).not.toHaveBeenCalled();
    // The count of open questions, then 20 references.
    expect(count).toHaveBeenCalledTimes(21);
  });
});

const OPEN: Doc = {
  documentId: 'doc-1',
  reference: 'Q-4821',
  customer: SUBJECT,
  customerName: null,
  question: ASKED,
  reason: 'no_answer',
  language: 'en',
  productSlug: null,
  status: 'open',
  staffName: null,
  takenAt: null,
  answeredAt: null,
  answer: null,
  knowledgeDocumentId: null,
  lineOutcome: null,
  lineDetail: null,
  createdAt: '2026-10-01T05:30:00.000Z',
};

/** OPEN as staff see it: the customer masked, and nothing yet from staff, LINE or product knowledge. */
const OPEN_VIEW = {
  reference: 'Q-4821',
  customer: 'line:U4af…88',
  customerName: null,
  question: ASKED,
  reason: 'no_answer',
  language: 'en',
  product: null,
  status: 'open',
  staffName: null,
  takenAt: null,
  answeredAt: null,
  answer: null,
  addedToKnowledge: false,
  line: null,
  createdAt: '2026-10-01T05:30:00.000Z',
};

const ANSWERED: Doc = {
  ...OPEN,
  documentId: 'doc-2',
  reference: 'Q-5500',
  customerName: 'Paul (test)',
  productSlug: 'jewelry-coffret',
  status: 'answered',
  staffName: 'Jane',
  takenAt: '2026-10-01T05:35:00.000Z',
  answeredAt: '2026-10-01T05:40:00.000Z',
  answer: 'Yes, a watch up to 42 mm fits.',
  knowledgeDocumentId: 'k-1',
  lineOutcome: 'sent',
  lineDetail: '',
};

describe('questions.list', () => {
  it.each([
    ['by default, the questions staff can still answer: open or taken', undefined, { status: { $in: ['open', 'taken'] } }],
    ['the open ones, which includes the taken ones', { status: 'open' as const }, { status: { $in: ['open', 'taken'] } }],
    ['the answered ones', { status: 'answered' as const }, { status: { $eq: 'answered' } }],
    ['all of them, with no status filter', { status: 'all' as const }, {}],
  ])('lists %s', async (_label, filters, expected) => {
    const { service, findMany } = world();

    expect(await service.list(filters)).toEqual({ ok: true, value: [] });

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0].filters).toEqual(expected);
  });

  it('puts the newest first, and shows 50 by default', async () => {
    const { service, findMany } = world();
    await service.list();
    expect(findMany.mock.calls[0][0]).toMatchObject({ sort: { createdAt: 'desc' }, limit: 50 });
  });

  it('shows as many as it is asked for', async () => {
    const { service, findMany } = world();
    await service.list({ status: 'answered', limit: 5 });
    expect(findMany.mock.calls[0][0]).toMatchObject({ sort: { createdAt: 'desc' }, limit: 5 });
  });

  it('shows an open question: the customer masked, and nothing from staff or LINE yet', async () => {
    const { service } = world({ rows: [OPEN] });
    expect(await service.list()).toEqual({ ok: true, value: [OPEN_VIEW] });
  });

  it('shows the same for a question that only has the fields every question has', async () => {
    const { reference, customer, question, reason, language, status, createdAt } = OPEN;
    const { service } = world({ rows: [{ reference, customer, question, reason, language, status, createdAt }] });
    expect(await service.list()).toEqual({ ok: true, value: [OPEN_VIEW] });
  });

  it("shows an answered question: the customer's LINE name, who answered, what LINE did, and its piece", async () => {
    const { service } = world({ rows: [ANSWERED], pieces: COFFRET });

    expect(await service.list({ status: 'answered' })).toEqual({
      ok: true,
      value: [
        {
          reference: 'Q-5500',
          customer: 'line:U4af…88',
          customerName: 'Paul (test)',
          question: ASKED,
          reason: 'no_answer',
          language: 'en',
          product: { slug: 'jewelry-coffret', name: 'Jewelry Coffret' },
          status: 'answered',
          staffName: 'Jane',
          takenAt: '2026-10-01T05:35:00.000Z',
          answeredAt: '2026-10-01T05:40:00.000Z',
          answer: 'Yes, a watch up to 42 mm fits.',
          addedToKnowledge: true,
          line: { outcome: 'sent', detail: '' },
          createdAt: '2026-10-01T05:30:00.000Z',
        },
      ],
    });
  });

  it("never shows the customer's full LINE ID, in any field", async () => {
    const { service } = world({ rows: [OPEN, ANSWERED], pieces: COFFRET });
    const result = await service.list({ status: 'all' });
    expect(JSON.stringify(result)).not.toContain(USER_ID);
  });

  it('shows a customer that is not a LINE subject as unknown, never as it was stored', async () => {
    const { service } = world({ rows: [{ ...OPEN, customer: 'someone@example.com' }] });
    const result = await service.list();
    expect(result.ok && result.value[0].customer).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('someone@example.com');
  });

  const REFUSED = 'LINE answered 400: The request body has 1 error(s)';
  it.each([
    ['a failed push, with the reason LINE gave', { lineOutcome: 'failed', lineDetail: REFUSED }, { outcome: 'failed', detail: REFUSED }],
    ['a sent message, with no detail', { lineOutcome: 'sent', lineDetail: null }, { outcome: 'sent', detail: '' }],
    ['no message yet', { lineOutcome: null, lineDetail: 'left over' }, null],
    ['no message yet, with the fields not even in the row', { lineOutcome: undefined, lineDetail: undefined }, null],
  ])('shows what LINE did: %s', async (_label, fields, line) => {
    const { service } = world({ rows: [{ ...OPEN, ...fields }] });
    const result = await service.list();
    expect(result.ok && result.value[0].line).toEqual(line);
  });

  it.each([
    ['a knowledge entry', 'k-1', true],
    ['no knowledge entry', null, false],
    ['an empty knowledge entry ID', '', false],
  ])('says it was added to product knowledge only with a knowledge entry: %s', async (_label, knowledgeDocumentId, added) => {
    const { service } = world({ rows: [{ ...ANSWERED, knowledgeDocumentId }], pieces: COFFRET });
    const result = await service.list({ status: 'answered' });
    expect(result.ok && result.value[0].addedToKnowledge).toBe(added);
  });

  it.each([
    ['an ISO string already', '2026-10-01T05:30:00.000Z'],
    ['an ISO string with an offset', '2026-10-01T14:30:00+09:00'],
    ['a Date', new Date('2026-10-01T05:30:00.000Z')],
  ])('gives the times as ISO strings, from %s', async (_label, createdAt) => {
    const { service } = world({ rows: [{ ...ANSWERED, createdAt, takenAt: createdAt, answeredAt: createdAt }], pieces: COFFRET });
    const result = await service.list({ status: 'answered' });
    expect(result.ok && result.value[0]).toMatchObject({
      createdAt: '2026-10-01T05:30:00.000Z',
      takenAt: '2026-10-01T05:30:00.000Z',
      answeredAt: '2026-10-01T05:30:00.000Z',
    });
  });

  it("names each question's piece in the question's own language", async () => {
    const english = { ...ANSWERED, reference: 'Q-1111', language: 'en' };
    const japanese = { ...ANSWERED, reference: 'Q-2222', language: 'ja' };
    const { service } = world({ rows: [english, japanese], pieces: COFFRET });

    const result = await service.list({ status: 'answered' });

    expect(result.ok && result.value.map((row) => [row.reference, row.language, row.product])).toEqual([
      ['Q-1111', 'en', { slug: 'jewelry-coffret', name: 'Jewelry Coffret' }],
      ['Q-2222', 'ja', { slug: 'jewelry-coffret', name: 'ジュエリー・コフレ' }],
    ]);
  });

  it('looks each piece up once per language, however many questions are about it', async () => {
    const rows = [
      { ...ANSWERED, reference: 'Q-1111', language: 'en' },
      { ...ANSWERED, reference: 'Q-2222', language: 'en' },
      { ...ANSWERED, reference: 'Q-3333', language: 'ja' },
      { ...ANSWERED, reference: 'Q-4444', language: 'en' },
    ];
    const { service, findFirst } = world({ rows, pieces: COFFRET });

    const result = await service.list({ status: 'answered' });

    expect(findFirst.mock.calls.map(([params]) => params.locale).sort()).toEqual(['en', 'ja']);
    expect(result.ok && result.value.map((row) => row.product?.name)).toEqual([
      'Jewelry Coffret', 'Jewelry Coffret', 'ジュエリー・コフレ', 'Jewelry Coffret',
    ]);
  });

  it('names a piece in the default language when its question has no version of it, as a hand-off does', async () => {
    const { service } = world({ rows: [ANSWERED], pieces: [COFFRET[0]] });
    const result = await service.list({ status: 'answered' });
    expect(result.ok && result.value[0].product).toEqual({ slug: 'jewelry-coffret', name: 'ジュエリー・コフレ' });
  });

  it('shows no piece for a question that has none, and looks nothing up for it', async () => {
    const { service, findFirst } = world({ rows: [OPEN], pieces: COFFRET });
    const result = await service.list();
    expect(result.ok && result.value[0].product).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('shows no piece for a question whose piece is no longer published, and still lists the question', async () => {
    const { service } = world({ rows: [ANSWERED], pieces: COFFRET.map((piece) => ({ ...piece, status: 'draft' as const })) });
    const result = await service.list({ status: 'answered' });
    expect(result.ok && result.value).toHaveLength(1);
    expect(result.ok && result.value[0].product).toBeNull();
  });

  it('keeps the order the Document Service gave', async () => {
    const rows = [{ ...OPEN, reference: 'Q-3000' }, { ...OPEN, reference: 'Q-2000' }, { ...OPEN, reference: 'Q-1000' }];
    const { service } = world({ rows });
    const result = await service.list();
    expect(result.ok && result.value.map((row) => row.reference)).toEqual(['Q-3000', 'Q-2000', 'Q-1000']);
  });
});

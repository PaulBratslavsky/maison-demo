import { describe, expect, it, vi } from 'vitest';
import { UID } from '../../server/src/constants';
import inquiriesController from '../../server/src/controllers/inquiries';
import questionsController from '../../server/src/controllers/questions';
import questionsService from '../../server/src/services/questions';
import { fakeStrapi } from './fake-strapi';

type Doc = Record<string, any>;

/** Strapi's error helpers on a Koa context, and the status each one sets. */
const ERROR_HELPERS = { badRequest: 400, notFound: 404 };

/** Enough of a Koa context: the route's params, and error helpers that set their status and an error body as Strapi's do. */
const fakeCtx = (params: Record<string, string>) => {
  const ctx: any = { params, status: 200, body: undefined };
  for (const [helper, status] of Object.entries(ERROR_HELPERS)) {
    ctx[helper] = vi.fn((message: string, details: unknown) => {
      ctx.status = status;
      ctx.body = { error: { message, details } };
    });
  }
  return ctx;
};

describe('inquiries.findOne: GET /inquiries/:documentId', () => {
  const VIEW = { documentId: 'inq4abc', customer: 'line:Uaaa…aa', status: 'open', queue: 'complaint' };
  const controllerOver = (view: unknown) => inquiriesController({ strapi: fakeStrapi({ services: { inquiries: { view } } }) });

  it('answers the inquiry as staff see it now, for the documentId in the address', async () => {
    const view = vi.fn(async () => ({ ok: true, value: VIEW }));
    const ctx = fakeCtx({ documentId: 'inq4abc' });

    await controllerOver(view).findOne(ctx);

    expect(view).toHaveBeenCalledExactlyOnceWith('inq4abc');
    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ inquiry: VIEW });
    expect(ctx.notFound).not.toHaveBeenCalled();
  });

  it('answers 404 not_found, with the hint, for an inquiry that is not there any more', async () => {
    const hint = 'Reload the Inquiries tab: it may have been deleted.';
    const view = vi.fn(async () => ({ ok: false, code: 'not_found', message: 'No inquiry "inq9".', hint }));
    const ctx = fakeCtx({ documentId: 'inq9' });

    await controllerOver(view).findOne(ctx);

    expect(ctx.notFound).toHaveBeenCalledExactlyOnceWith('No inquiry "inq9".', { code: 'not_found', hint });
    expect(ctx.status).toBe(404);
  });
});

describe('questions.view', () => {
  const USER_ID = 'U4af49806290a28bb0a53ff1d09a9d588';
  /** A question a staff member took, about a piece, as the database holds it. */
  const TAKEN: Doc = {
    documentId: 'doc-q-1',
    reference: 'Q-4821',
    customer: `line:${USER_ID}`,
    customerName: 'Aiko T.',
    question: 'Can the coffret hold a watch?',
    reason: 'no_answer',
    language: 'en',
    productSlug: 'jewelry-coffret',
    status: 'taken',
    staffName: 'Jane',
    takenAt: '2026-10-06T01:00:00.000Z',
    answeredAt: null,
    answer: null,
    knowledgeDocumentId: null,
    lineOutcome: 'sent',
    lineDetail: '',
    createdAt: '2026-10-06T00:30:00.000Z',
  };
  const PIECES = [{ slug: 'jewelry-coffret', name: 'Jewelry Coffret', locale: 'en' }];

  /** The questions service over a Document Service that holds `rows`, and the one piece above. `config` is the plugin's settings. */
  const worldOf = (rows: Doc[], config: Doc = {}) => {
    const findQuestion = vi.fn(async ({ filters }: Doc) => rows.find((row) => row.reference === filters.reference.$eq) ?? null);
    const findPiece = vi.fn(async ({ locale, filters }: Doc) => PIECES.find((piece) => piece.locale === locale && piece.slug === filters.slug.$eq) ?? null);
    const documents = (uid: string) => {
      if (uid === UID.question) return { findFirst: findQuestion };
      if (uid === UID.product) return { findFirst: findPiece };
      throw new Error(`These tests have no ${uid}.`);
    };
    return { service: questionsService({ strapi: fakeStrapi({ documents, config }) }), findQuestion, findPiece };
  };

  it('answers one question as staff see it: the customer masked, the piece named', async () => {
    const { service } = worldOf([TAKEN]);

    await expect(service.view('Q-4821')).resolves.toEqual({
      ok: true,
      value: {
        reference: 'Q-4821',
        customer: 'line:U4af…88',
        customerName: 'Aiko T.',
        question: 'Can the coffret hold a watch?',
        reason: 'no_answer',
        language: 'en',
        product: { slug: 'jewelry-coffret', name: 'Jewelry Coffret' },
        status: 'taken',
        staffName: 'Jane',
        takenAt: '2026-10-06T01:00:00.000Z',
        answeredAt: null,
        answer: null,
        addedToKnowledge: false,
        line: { outcome: 'sent', detail: '' },
        yourLine: false,
        createdAt: '2026-10-06T00:30:00.000Z',
      },
    });
  });

  // The page reads yourLine from the fresh view too, so the route must not lose it.
  it("marks the presenter's own LINE account as yourLine, and no other customer", async () => {
    const mine = await worldOf([TAKEN], { demoLineUserId: USER_ID }).service.view('Q-4821');
    expect(mine).toMatchObject({ ok: true, value: { yourLine: true, customer: 'line:U4af…88' } });

    const someoneElse = await worldOf([{ ...TAKEN, customer: `line:U${'a'.repeat(32)}` }], { demoLineUserId: USER_ID }).service.view('Q-4821');
    expect(someoneElse).toMatchObject({ ok: true, value: { yourLine: false } });
  });

  it('asks for the question by its reference, and nothing else', async () => {
    const { service, findQuestion } = worldOf([TAKEN]);
    await service.view('Q-4821');
    expect(findQuestion).toHaveBeenCalledExactlyOnceWith({ filters: { reference: { $eq: 'Q-4821' } } });
  });

  it('answers an answered question with its answer, so the page can say it was answered already', async () => {
    const answered = { ...TAKEN, status: 'answered', answeredAt: '2026-10-06T02:00:00.000Z', answer: 'Yes, up to 42 mm.', knowledgeDocumentId: 'kn-1' };
    const result = await worldOf([answered]).service.view('Q-4821');
    expect(result).toMatchObject({ ok: true, value: { status: 'answered', answer: 'Yes, up to 42 mm.', addedToKnowledge: true } });
  });

  it('answers a question about no piece with no product, and looks no piece up', async () => {
    const { service, findPiece } = worldOf([{ ...TAKEN, productSlug: null }]);
    await expect(service.view('Q-4821')).resolves.toMatchObject({ ok: true, value: { product: null } });
    expect(findPiece).not.toHaveBeenCalled();
  });

  it('answers not_found for a reference no question has, with the hint the Inquiries view gives', async () => {
    const { service } = worldOf([TAKEN]);
    await expect(service.view('Q-9999')).resolves.toEqual({
      ok: false,
      code: 'not_found',
      message: 'No question Q-9999.',
      hint: 'Reload the Questions tab: it may have been deleted.',
    });
  });
});

describe('questions.findOne: GET /questions/:reference', () => {
  const VIEW = { reference: 'Q-4821', customer: 'line:U4af…88', status: 'open' };
  const controllerOver = (view: unknown) => questionsController({ strapi: fakeStrapi({ services: { questions: { view } } }) });

  it('answers the question as staff see it now, for the reference in the address', async () => {
    const view = vi.fn(async () => ({ ok: true, value: VIEW }));
    const ctx = fakeCtx({ reference: 'Q-4821' });

    await controllerOver(view).findOne(ctx);

    expect(view).toHaveBeenCalledExactlyOnceWith('Q-4821');
    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ question: VIEW });
  });

  it.each(['Q-48', 'q-4821', 'APT-4821', 'Q-48210', ' Q-4821', 'Q-4821 '])(
    'answers 400 invalid_input, with the reference hint, for %j, and never calls the service',
    async (reference) => {
      const view = vi.fn();
      const ctx = fakeCtx({ reference });

      await controllerOver(view).findOne(ctx);

      expect(ctx.status).toBe(400);
      expect(ctx.body.error.message.startsWith('input: ')).toBe(true);
      expect(ctx.body.error.details).toEqual({ code: 'invalid_input', hint: 'Use a reference like Q-4821.' });
      expect(view).not.toHaveBeenCalled();
    }
  );

  it('answers 404 not_found, with the hint, for a question that is not there', async () => {
    const hint = 'Reload the Questions tab: it may have been deleted.';
    const view = vi.fn(async () => ({ ok: false, code: 'not_found', message: 'No question Q-9999.', hint }));
    const ctx = fakeCtx({ reference: 'Q-9999' });

    await controllerOver(view).findOne(ctx);

    expect(ctx.notFound).toHaveBeenCalledExactlyOnceWith('No question Q-9999.', { code: 'not_found', hint });
    expect(ctx.status).toBe(404);
  });
});

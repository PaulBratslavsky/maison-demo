import { describe, expect, it, vi } from 'vitest';
import controllers from '../../server/src/controllers';
import appointmentsController from '../../server/src/controllers/appointments';
import questionsController from '../../server/src/controllers/questions';
import routes from '../../server/src/routes';
import { fakeStrapi } from './fake-strapi';

/** Strapi's error helpers on a Koa context, such as ctx.badRequest, and the status each one sets. */
const ERROR_HELPERS = {
  badRequest: 400,
  notFound: 404,
  conflict: 409,
  unprocessableEntity: 422,
  badGateway: 502,
  serviceUnavailable: 503,
};

/** Enough of a Koa context: each of Strapi's error helpers sets its status and an error body. */
const fakeCtx = (overrides: Record<string, unknown> = {}) => {
  const ctx: any = { query: {}, params: {}, status: 200, body: undefined, ...overrides };
  for (const [helper, status] of Object.entries(ERROR_HELPERS)) {
    ctx[helper] = vi.fn((message: string, details: unknown) => {
      ctx.status = status;
      ctx.body = { error: { message, details } };
    });
  }
  return ctx;
};
const controllerWith = (appointments: Record<string, unknown>) =>
  appointmentsController({ strapi: fakeStrapi({ services: { appointments } }) });
/** The appointments controller, with `sendConfirmation` standing in for the line-confirmations service. */
const controllerSending = (sendConfirmation: (reference: string) => Promise<unknown>) =>
  appointmentsController({ strapi: fakeStrapi({ services: { 'line-confirmations': { sendConfirmation } } }) });

describe('admin routes', () => {
  const gate = (action: string) => ['admin::isAuthenticatedAdmin', { name: 'admin::hasPermissions', config: { actions: [action] } }];
  const routeOf = (method: string, path: string) => routes.admin.routes.find((route) => route.method === method && route.path === path);
  const policiesOf = (method: string, path: string) => routeOf(method, path)?.config.policies;

  it('each require a signed-in admin with the matching Maison permission', () => {
    expect(routes.admin.type).toBe('admin');
    expect(routes.admin.routes).toHaveLength(9);
    expect(policiesOf('GET', '/appointments')).toEqual(gate('plugin::maison.appointments.review'));
    expect(policiesOf('GET', '/appointments/summary')).toEqual(gate('plugin::maison.appointments.review'));
    expect(policiesOf('POST', '/appointments/:reference/confirm')).toEqual(gate('plugin::maison.appointments.confirm'));
    // Send again: whoever may confirm a visit may send its confirmation again.
    expect(policiesOf('POST', '/appointments/:reference/notify')).toEqual(gate('plugin::maison.appointments.confirm'));
    expect(policiesOf('GET', '/questions')).toEqual(gate('plugin::maison.questions.read'));
    // Let them know and Answer are one permission: whoever may answer a customer may let them know first.
    expect(policiesOf('POST', '/questions/:reference/notify')).toEqual(gate('plugin::maison.questions.answer'));
    expect(policiesOf('POST', '/questions/:reference/answer')).toEqual(gate('plugin::maison.questions.answer'));
    expect(policiesOf('POST', '/demo/seed')).toEqual(gate('plugin::maison.demo.manage'));
    expect(policiesOf('POST', '/demo/reset')).toEqual(gate('plugin::maison.demo.manage'));
  });

  it('send the customer questions to the questions controller', () => {
    expect(routeOf('GET', '/questions')?.handler).toBe('questions.list');
    expect(routeOf('POST', '/questions/:reference/notify')?.handler).toBe('questions.notify');
    expect(routeOf('POST', '/questions/:reference/answer')?.handler).toBe('questions.answer');
  });

  it('name controller actions that exist', () => {
    const instances = Object.fromEntries(
      Object.entries(controllers).map(([name, factory]) => [name, (factory as any)({ strapi: fakeStrapi() })])
    );
    for (const { handler } of routes.admin.routes) {
      const [controller, action] = handler.split('.');
      expect(typeof instances[controller]?.[action], handler).toBe('function');
    }
  });

  it('list the summary before any route whose :parameter could take "summary" for a value', () => {
    // The first route that matches a request answers it, so nothing ahead of the summary may match its path.
    const paths = routes.admin.routes.filter((route) => route.method === 'GET').map((route) => route.path);
    const summaryAt = paths.indexOf('/appointments/summary');
    expect(summaryAt, 'GET /appointments/summary is registered').toBeGreaterThanOrEqual(0);
    const matchesSummary = (path: string) => new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+')}$`).test('/appointments/summary');
    expect(paths.slice(0, summaryAt).filter(matchesSummary)).toEqual([]);
  });
});

describe('appointments controller', () => {
  it('lists with the filters from the query string', async () => {
    const listRequests = vi.fn(async () => ({ ok: true, value: [] }));
    const ctx = fakeCtx({ query: { status: 'all', limit: '5' } });
    await controllerWith({ listRequests }).list(ctx);
    expect(listRequests).toHaveBeenCalledWith({ status: 'all', limit: 5 });
    expect(ctx.body).toEqual({ appointments: [] });
  });

  it('answers bad filters with 400 invalid_input and never calls the service', async () => {
    const listRequests = vi.fn();
    for (const query of [{ status: 'pending' }, { limit: '0' }, { limit: 'ten' }, { date: '10/10/2026' }, { date: '2026-09-31' }]) {
      const ctx = fakeCtx({ query });
      await controllerWith({ listRequests }).list(ctx);
      expect(ctx.status, JSON.stringify(query)).toBe(400);
      expect(ctx.body.error.details.code).toBe('invalid_input');
    }
    expect(listRequests).not.toHaveBeenCalled();
  });

  describe('summary', () => {
    const summary = {
      counts: { waitingForStaff: 2, confirmedUpcoming: 1, confirmationsSent: 1 },
      recent: [
        {
          reference: 'APT-4821', status: 'requested', customer: 'line:U4af…88', boutique: null, requestedFor: '2026-10-10T14:00:00+09:00',
          note: 'A gift for a friend who travels', confirmationSent: false, createdAt: '2026-10-01T09:00:00+09:00',
        },
      ],
    };

    it("returns the service's summary", async () => {
      const summarizeRequests = vi.fn(async () => summary);
      const ctx = fakeCtx();
      await controllerWith({ summarizeRequests }).summary(ctx);
      expect(ctx.body).toEqual(summary);
    });

    it('counts at the real time: nothing in the request can move the service clock', async () => {
      const summarizeRequests = vi.fn(async () => summary);
      await controllerWith({ summarizeRequests }).summary(fakeCtx({ query: { now: '2020-01-01T00:00:00Z', limit: '1' } }));
      expect(summarizeRequests).toHaveBeenCalledWith();
    });

    it("lets a service failure reach Strapi's error handling, so the widget shows its error and not made-up numbers", async () => {
      const summarizeRequests = vi.fn(async () => {
        throw new Error('database is down');
      });
      const ctx = fakeCtx();
      await expect(controllerWith({ summarizeRequests }).summary(ctx)).rejects.toThrow('database is down');
      expect(ctx.body).toBeUndefined();
    });
  });

  it('returns the confirmed appointment', async () => {
    const value = { appointment: { reference: 'APT-4821', status: 'confirmed' }, alreadyConfirmed: false };
    const confirm = vi.fn(async () => ({ ok: true, value }));
    const ctx = fakeCtx({ params: { reference: 'APT-4821' } });
    await controllerWith({ confirm }).confirm(ctx);
    expect(confirm).toHaveBeenCalledWith('APT-4821');
    expect(ctx.body).toEqual(value);
  });

  it.each([
    ['not_found', 404],
    ['in_the_past', 400],
  ])('answers %s with %i, the message and the hint', async (code, status) => {
    const confirm = vi.fn(async () => ({ ok: false, code, message: 'Not possible.', hint: 'Try another.' }));
    const ctx = fakeCtx({ params: { reference: 'APT-4821' } });
    await controllerWith({ confirm }).confirm(ctx);
    expect(ctx.status).toBe(status);
    expect(ctx.body.error).toEqual({ message: 'Not possible.', details: { code, hint: 'Try another.' } });
  });

  it('rejects a malformed reference without calling the service', async () => {
    const confirm = vi.fn();
    const ctx = fakeCtx({ params: { reference: 'APT-48' } });
    await controllerWith({ confirm }).confirm(ctx);
    expect(ctx.status).toBe(400);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('Send again (notify)', () => {
  it.each(['sent', 'already_sent', 'sent_unrecorded'])('answers %s with a 200 and the outcome', async (status) => {
    const outcome = { reference: 'APT-4821', status, message: 'Sent the LINE confirmation for APT-4821.' };
    const sendConfirmation = vi.fn(async () => outcome);
    const ctx = fakeCtx({ params: { reference: 'APT-4821' } });
    await controllerSending(sendConfirmation).notify(ctx);
    expect(sendConfirmation).toHaveBeenCalledExactlyOnceWith('APT-4821');
    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual(outcome);
  });

  it.each([
    ['not_found', 404],
    ['not_confirmed', 409],
    ['past', 422],
    ['failed', 502],
    ['not_configured', 503],
  ])('answers %s with %i and its message, for the board to show', async (status, httpStatus) => {
    const sendConfirmation = vi.fn(async () => ({ reference: 'APT-4821', status, message: 'Why nothing went out.' }));
    const ctx = fakeCtx({ params: { reference: 'APT-4821' } });
    await controllerSending(sendConfirmation).notify(ctx);
    expect(ctx.status).toBe(httpStatus);
    expect(ctx.body.error).toEqual({ message: 'Why nothing went out.', details: { code: status } });
  });

  it('rejects a malformed reference without sending', async () => {
    const sendConfirmation = vi.fn();
    const ctx = fakeCtx({ params: { reference: 'APT-48' } });
    await controllerSending(sendConfirmation).notify(ctx);
    expect(ctx.status).toBe(400);
    expect(ctx.body.error.details.code).toBe('invalid_input');
    expect(sendConfirmation).not.toHaveBeenCalled();
  });
});

describe('questions controller', () => {
  /** The controller over a service that has only `methods`. */
  const controllerOver = (methods: Record<string, unknown>) => questionsController({ strapi: fakeStrapi({ services: { questions: methods } }) });
  /** Nothing in the request went to an error helper. */
  const expectNoError = (ctx: any) => {
    for (const helper of Object.keys(ERROR_HELPERS)) expect(ctx[helper], helper).not.toHaveBeenCalled();
  };

  describe('list', () => {
    const questions = [{ reference: 'Q-4821', status: 'open', customer: 'line:Uaaa…aa' }];

    it('lists with the filters from the query string, and answers the questions', async () => {
      const list = vi.fn(async () => ({ ok: true, value: questions }));
      const ctx = fakeCtx({ query: { status: 'answered', limit: '5' } });

      await controllerOver({ list }).list(ctx);

      expect(list).toHaveBeenCalledExactlyOnceWith({ status: 'answered', limit: 5 });
      expect(ctx.status).toBe(200);
      expect(ctx.body).toEqual({ questions });
    });

    it('lists with no filters when the query string has none, and ignores what it does not know', async () => {
      const list = vi.fn(async () => ({ ok: true, value: [] }));
      await controllerOver({ list }).list(fakeCtx());
      await controllerOver({ list }).list(fakeCtx({ query: { search: 'coffret' } }));
      expect(list.mock.calls).toEqual([[{}], [{}]]);
    });

    it.each([
      ['open', '1'],
      ['answered', '100'],
      ['all', '50'],
    ])('accepts the status %s with the limit %s', async (status, limit) => {
      const list = vi.fn(async () => ({ ok: true, value: [] }));
      const ctx = fakeCtx({ query: { status, limit } });
      await controllerOver({ list }).list(ctx);
      expect(list).toHaveBeenCalledExactlyOnceWith({ status, limit: Number(limit) });
      expectNoError(ctx);
    });

    it('answers bad filters with 400 invalid_input and never calls the service', async () => {
      const list = vi.fn();
      for (const query of [{ status: 'pending' }, { status: ['open', 'all'] }, { limit: '0' }, { limit: '101' }, { limit: '2.5' }, { limit: 'ten' }, { limit: '' }]) {
        const ctx = fakeCtx({ query });
        await controllerOver({ list }).list(ctx);
        expect(ctx.status, JSON.stringify(query)).toBe(400);
        expect(ctx.body.error.details).toEqual({ code: 'invalid_input', hint: 'Fix the filters and try again.' });
      }
      expect(list).not.toHaveBeenCalled();
    });

    it("answers a failure of the service with its code, message and hint", async () => {
      const list = vi.fn(async () => ({ ok: false, code: 'invalid_input', message: 'Not possible.', hint: 'Try another.' }));
      const ctx = fakeCtx();
      await controllerOver({ list }).list(ctx);
      expect(ctx.status).toBe(400);
      expect(ctx.body.error).toEqual({ message: 'Not possible.', details: { code: 'invalid_input', hint: 'Try another.' } });
    });
  });

  const OUTCOME = { reference: 'Q-4821', status: 'sent', message: 'Sent the LINE message for Q-4821.' };
  const ANSWER = { text: 'Yes, a watch up to 42 mm fits.', addToKnowledge: true, category: 'sizing' };

  // What Let them know and Answer do alike: read the reference, sign with the admin's name, and answer by the outcome.
  describe.each([
    { action: 'notify', body: undefined, args: (staffName: string | null) => ['Q-4821', staffName] },
    { action: 'answer', body: ANSWER, args: (staffName: string | null) => ['Q-4821', ANSWER, staffName] },
  ])('$action', ({ action, body, args }) => {
    const ctxFor = (overrides: Record<string, unknown> = {}) =>
      fakeCtx({ params: { reference: 'Q-4821' }, state: { user: { firstname: 'Jane' } }, request: { body }, ...overrides });
    const run = (service: unknown, ctx: unknown) => (controllerOver({ [action]: service }) as any)[action](ctx);

    it("passes the signed-in admin's first name as the staff name, and answers the outcome with 200 when LINE took it", async () => {
      const service = vi.fn(async () => OUTCOME);
      const ctx = ctxFor();

      await run(service, ctx);

      // No time argument: nothing in the request can move the service clock.
      expect(service).toHaveBeenCalledExactlyOnceWith(...args('Jane'));
      expect(ctx.status).toBe(200);
      expect(ctx.body).toEqual(OUTCOME);
      expectNoError(ctx);
    });

    it('answers a sent outcome as it is, with the knowledge entry it made', async () => {
      const sent = { ...OUTCOME, knowledgeDocumentId: 'k-new' };
      const ctx = ctxFor();
      await run(vi.fn(async () => sent), ctx);
      expect(ctx.body).toEqual(sent);
    });

    it.each([
      ['Jane', 'Jane'],
      ['  Jane \n', 'Jane'],
      ['', null],
      ['   ', null],
      [undefined, null],
      [null, null],
      [42, null],
      [{ first: 'Jane' }, null],
      ['J'.repeat(150), 'J'.repeat(100)],
    ])('takes %j for the first name as the staff name %j', async (firstname, staffName) => {
      const service = vi.fn(async () => OUTCOME);
      await run(service, ctxFor({ state: { user: { firstname } } }));
      expect(service).toHaveBeenCalledExactlyOnceWith(...args(staffName as string | null));
    });

    it.each([
      ['no state', { state: undefined }],
      ['no user', { state: {} }],
      ['a user with no first name', { state: { user: { email: 'jane@example.test' } } }],
    ])('speaks for the team, with null for the staff name, for %s', async (_label, overrides) => {
      const service = vi.fn(async () => OUTCOME);
      await run(service, ctxFor(overrides));
      expect(service).toHaveBeenCalledExactlyOnceWith(...args(null));
    });

    it('never takes the staff name from the request', async () => {
      const service = vi.fn(async () => OUTCOME);
      const ctx = ctxFor({ query: { staffName: 'Mallory' }, request: { body: { ...(body as object), staffName: 'Mallory', firstname: 'Mallory' } } });
      await run(service, ctx);
      expect(service).toHaveBeenCalledExactlyOnceWith(...args('Jane'));
    });

    it.each([
      ['not_found', 404],
      ['already_taken', 409],
      ['already_answered', 409],
      ['failed', 502],
      ['not_configured', 503],
    ])('answers %s with %i, and its message for the admin to show', async (status, httpStatus) => {
      const service = vi.fn(async () => ({ reference: 'Q-4821', status, message: 'Why nothing went out.' }));
      const ctx = ctxFor();

      await run(service, ctx);

      expect(ctx.status).toBe(httpStatus);
      expect(ctx.body.error).toEqual({ message: 'Why nothing went out.', details: { code: status } });
    });

    it.each([
      ['not_found', 'notFound'],
      ['already_taken', 'conflict'],
      ['already_answered', 'conflict'],
      ['failed', 'badGateway'],
      ['not_configured', 'serviceUnavailable'],
    ])("calls Strapi's %s error helper, %s", async (status, helper) => {
      const ctx = ctxFor();
      await run(vi.fn(async () => ({ reference: 'Q-4821', status, message: 'Why nothing went out.' })), ctx);
      expect(ctx[helper]).toHaveBeenCalledExactlyOnceWith('Why nothing went out.', { code: status });
    });

    it.each(['Q-48', 'Q-482', 'Q-48210', 'APT-4821', 'q-4821', 'Q-48a1', 'Q-4821 ', ' Q-4821', ''])(
      'refuses the reference %j with 400, and never calls the service',
      async (reference) => {
        const service = vi.fn();
        const ctx = ctxFor({ params: { reference } });

        await run(service, ctx);

        expect(ctx.status).toBe(400);
        expect(ctx.body.error.details).toEqual({ code: 'invalid_input', hint: 'Use a reference like Q-4821.' });
        expect(ctx.body.error.message).toContain('Use a reference like Q-4821.');
        expect(service).not.toHaveBeenCalled();
      }
    );

    it('refuses a request with no reference with 400', async () => {
      const service = vi.fn();
      const ctx = ctxFor({ params: {} });
      await run(service, ctx);
      expect(ctx.status).toBe(400);
      expect(service).not.toHaveBeenCalled();
    });
  });

  describe('answer, with the staff member’s reply', () => {
    const answer = (body: unknown, overrides: Record<string, unknown> = {}) => {
      const service = vi.fn(async () => OUTCOME);
      const ctx = fakeCtx({ params: { reference: 'Q-4821' }, state: { user: { firstname: 'Jane' } }, request: { body }, ...overrides });
      return { service, ctx, done: controllerOver({ answer: service }).answer(ctx) };
    };

    it('adds the answer to product knowledge by default: without addToKnowledge, a category is needed', async () => {
      const { service, done } = answer({ text: ANSWER.text, category: 'sizing' });
      await done;
      expect(service).toHaveBeenCalledExactlyOnceWith('Q-4821', { text: ANSWER.text, addToKnowledge: true, category: 'sizing' }, 'Jane');
    });

    it('needs no category when it is not added to product knowledge', async () => {
      const { service, done } = answer({ text: ANSWER.text, addToKnowledge: false });
      await done;
      expect(service).toHaveBeenCalledExactlyOnceWith('Q-4821', { text: ANSWER.text, addToKnowledge: false }, 'Jane');
    });

    it('passes a category along with addToKnowledge false, for the service to ignore', async () => {
      const { service, done } = answer({ text: ANSWER.text, addToKnowledge: false, category: 'care' });
      await done;
      expect(service).toHaveBeenCalledExactlyOnceWith('Q-4821', { text: ANSWER.text, addToKnowledge: false, category: 'care' }, 'Jane');
    });

    it.each(['care', 'materials', 'sizing', 'personalization', 'delivery', 'returns', 'repairs', 'warranty', 'gifting', 'store'])(
      'accepts the knowledge category %s',
      async (category) => {
        const { service, ctx, done } = answer({ ...ANSWER, category });
        await done;
        expect(service.mock.calls[0][1]).toEqual({ ...ANSWER, category });
        expectNoError(ctx);
      }
    );

    it('trims the text before it is counted and sent', async () => {
      const { service, done } = answer({ ...ANSWER, text: `  ${ANSWER.text}\n` });
      await done;
      expect(service.mock.calls[0][1].text).toBe(ANSWER.text);
    });

    it.each([1, 2000])('accepts an answer of %i characters', async (length) => {
      const { service, ctx, done } = answer({ ...ANSWER, text: 'x'.repeat(length) });
      await done;
      expect(service).toHaveBeenCalledOnce();
      expectNoError(ctx);
    });

    it('counts the answer after trimming it: 2,000 characters between spaces are accepted', async () => {
      const { service, done } = answer({ ...ANSWER, text: ` ${'x'.repeat(2000)} ` });
      await done;
      expect(service.mock.calls[0][1].text).toBe('x'.repeat(2000));
    });

    it.each([
      ['an empty text', { ...ANSWER, text: '' }],
      ['a text of spaces', { ...ANSWER, text: '  \n ' }],
      ['2,001 characters', { ...ANSWER, text: 'x'.repeat(2001) }],
      ['no text', { addToKnowledge: false }],
      ['a text that is not a string', { ...ANSWER, text: 42 }],
      ['addToKnowledge true without a category', { text: ANSWER.text, addToKnowledge: true }],
      ['addToKnowledge left out, which means true, without a category', { text: ANSWER.text }],
      ['a category that is not one', { ...ANSWER, category: 'sizes' }],
      ['addToKnowledge that is not true or false', { ...ANSWER, addToKnowledge: 'yes' }],
      ['a body that is not an object', 'Yes, it fits.'],
      ['no body', undefined],
      ['an empty body', {}],
    ])('refuses %s with 400 invalid_input and the hint, before calling the service', async (_label, body) => {
      const { service, ctx, done } = answer(body);

      await done;

      expect(ctx.status).toBe(400);
      expect(ctx.badRequest).toHaveBeenCalledOnce();
      expect(ctx.body.error.details).toEqual({
        code: 'invalid_input',
        hint: 'Write an answer of up to 2,000 characters, and pick a category to add it to product knowledge.',
      });
      expect(service).not.toHaveBeenCalled();
    });

    it('says which field is wrong, with the schema’s own words', async () => {
      const { ctx, done } = answer({ text: ANSWER.text, addToKnowledge: true });
      await done;
      expect(ctx.body.error.message).toContain('category: Pick a category to add the answer to product knowledge.');
    });

    it('says the text is missing, not that the body is, when there is no body at all', async () => {
      const { ctx, done } = answer(undefined);
      await done;
      expect(ctx.body.error.message).toMatch(/^text: /);
    });

    it('reads the reference before the body: a bad one gets the reference hint, whatever the body', async () => {
      const { service, ctx, done } = answer({}, { params: { reference: 'Q-48' } });
      await done;
      expect(ctx.status).toBe(400);
      expect(ctx.body.error.details.hint).toBe('Use a reference like Q-4821.');
      expect(service).not.toHaveBeenCalled();
    });
  });
});

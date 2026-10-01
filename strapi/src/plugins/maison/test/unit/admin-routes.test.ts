import { describe, expect, it, vi } from 'vitest';
import controllers from '../../server/src/controllers';
import appointmentsController from '../../server/src/controllers/appointments';
import routes from '../../server/src/routes';
import { fakeStrapi } from './fake-strapi';

/** Enough of a Koa context: Strapi's ctx.badRequest and ctx.notFound set the status and an error body. */
const fakeCtx = (overrides: Record<string, unknown> = {}) => {
  const ctx: any = { query: {}, params: {}, status: 200, body: undefined, ...overrides };
  ctx.badRequest = vi.fn((message: string, details: unknown) => {
    ctx.status = 400;
    ctx.body = { error: { message, details } };
  });
  ctx.notFound = vi.fn((message: string, details: unknown) => {
    ctx.status = 404;
    ctx.body = { error: { message, details } };
  });
  return ctx;
};
const controllerWith = (appointments: Record<string, unknown>) =>
  appointmentsController({ strapi: fakeStrapi({ services: { appointments } }) });

describe('admin routes', () => {
  const gate = (action: string) => ['admin::isAuthenticatedAdmin', { name: 'admin::hasPermissions', config: { actions: [action] } }];
  const policiesOf = (method: string, path: string) =>
    routes.admin.routes.find((route) => route.method === method && route.path === path)?.config.policies;

  it('each require a signed-in admin with the matching Maison permission', () => {
    expect(routes.admin.type).toBe('admin');
    expect(routes.admin.routes).toHaveLength(5);
    expect(policiesOf('GET', '/appointments')).toEqual(gate('plugin::maison.appointments.review'));
    expect(policiesOf('GET', '/appointments/summary')).toEqual(gate('plugin::maison.appointments.review'));
    expect(policiesOf('POST', '/appointments/:reference/confirm')).toEqual(gate('plugin::maison.appointments.confirm'));
    expect(policiesOf('POST', '/demo/seed')).toEqual(gate('plugin::maison.demo.manage'));
    expect(policiesOf('POST', '/demo/reset')).toEqual(gate('plugin::maison.demo.manage'));
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
      recent: [{ reference: 'APT-4821', status: 'requested', customer: 'line:U4af…88', boutique: null, requestedFor: '2026-10-10T14:00:00+09:00', confirmationSent: false }],
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

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, test } from '@playwright/test';

import { createSession } from '../lib/session';
import type { Appointment } from '../lib/types';
import { nextWeekday } from './support';

const strapiUrl = (process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338').replace(/\/+$/, '');
const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const asAdmin = () => ({ Authorization: `Bearer ${process.env.MAISON_E2E_ADMIN_JWT}` });

/** The next given weekday (0 = Sunday … 6 = Saturday) at least two days away, at `time` in Tokyo. */
const visitOn = (weekday: number, time: string) => `${nextWeekday(weekday)}T${time}:00+09:00`;

/**
 * An HTTP request with Node's fetch, never Playwright's `request` fixture: when a call of the fixture fails, Playwright
 * prints its request headers, the Authorization header among them, in the error's call log (and a trace stores them too).
 */
const send = (method: 'GET' | 'POST', url: string, { headers, data }: { headers?: Record<string, string>; data?: unknown } = {}) =>
  fetch(url, {
    method,
    headers: data === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });

/** A demo customer's session, signed in the way the app signs in: a LIFF mock ID token, exchanged. */
const sessionOf = (lineUserId: string) => createSession({ strapiUrl, clientId, getIdToken: () => `valid.${lineUserId}` }).getToken();

/** A demo customer's own MCP connection. */
const signIn = async (lineUserId: string) => {
  const token = await sessionOf(lineUserId);
  const client = new Client({ name: 'maison-e2e', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${strapiUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
};

/** The text of a tool result's content: for a refused call, the `{ error: { code, message, hint } }` the tool answered with. */
const textOf = (content: unknown): string =>
  (Array.isArray(content) ? content : [])
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join(' ')
    .trim();

/** A tool's structured answer. A tool error (isError) throws with the tool's own words, so a refused booking shows its code and hint. */
const call = async (client: Client, name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} answered with an error: ${textOf(result.content)}`);
  return result.structuredContent as Record<string, any>;
};
const references = async (client: Client) =>
  ((await call(client, 'my_appointments', {})).appointments as Array<{ reference: string }>).map((visit) => visit.reference);

test('my_appointments shows each customer only their own visits', async () => {
  // Customers of their own, apart from the browser tests' customers.
  const alice = await signIn(`U${'d'.repeat(32)}`);
  const bob = await signIn(`U${'e'.repeat(32)}`);
  const hers = await call(alice, 'request_appointment', { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: visitOn(6, '14:00') });
  const his = await call(bob, 'request_appointment', { boutique: 'omotesando', productSlugs: ['tote-soleil'], requestedFor: visitOn(0, '15:00') });
  expect(await references(alice)).toEqual([hers.appointment.reference]);
  expect(await references(bob)).toEqual([his.appointment.reference]);
  await alice.close();
  await bob.close();
});

test("the Content Manager's appointment list never returns a customer, and its search never matches one", async () => {
  const carol = await signIn(`U${'f'.repeat(32)}`);
  const booked = await call(carol, 'request_appointment', { boutique: 'ginza', productSlugs: ['passport-cover'], requestedFor: visitOn(6, '16:00') });
  await carol.close();
  const contentManager = `${strapiUrl}/content-manager`;
  // Only the Content Manager's list route runs here. The admin API's other routes use the same sanitizer, but aren't called.
  const list = async (query = '') => {
    const response = await send('GET', `${contentManager}/collection-types/plugin::maison.appointment?page=1&pageSize=20${query}`, { headers: asAdmin() });
    expect(response.status, 'the appointment list').toBe(200);
    return ((await response.json()) as { results: Array<{ reference: string }> }).results;
  };
  const rows = await list();
  expect(rows.length).toBeGreaterThan(0);
  // Keys only: a failure here must not print the customer's LINE user ID.
  for (const row of rows) expect(Object.keys(row), `the keys of ${row.reference}`).not.toContain('customer');
  // The list search (_q) finds an appointment by its reference, and never by part of its customer's LINE user ID.
  expect((await list(`&_q=${booked.appointment.reference}`)).map((row) => row.reference)).toContain(booked.appointment.reference);
  expect((await list('&_q=ffffffff')).map((row) => row.reference)).toEqual([]);
  // A relation picker searches, and shows, the main field of the records it lists. For appointments that must be the
  // reference, never the customer: on the appointment itself (picked from a list of appointments), and on the
  // `appointments` relation of a boutique and of a product (picked from their edit views).
  type Configuration = { data: { contentType: { settings: { mainField: string }; metadatas: Record<string, { edit?: { mainField?: string } }> } } };
  const configuration = async (type: string) => {
    const response = await send('GET', `${contentManager}/content-types/plugin::maison.${type}/configuration`, { headers: asAdmin() });
    expect(response.status, `the ${type} configuration`).toBe(200);
    return ((await response.json()) as Configuration).data.contentType;
  };
  expect((await configuration('appointment')).settings.mainField).toBe('reference');
  for (const type of ['boutique', 'product']) {
    expect((await configuration(type)).metadatas.appointments?.edit?.mainField, `the main field of a ${type}'s appointments`).toBe('reference');
  }
});

test.describe('the REST door at /api/maison', () => {
  const rest = `${strapiUrl}/api/maison`;
  // Customers of their own, apart from every other test's: A books one visit (a customer may hold three open), B none.
  const CUSTOMER_A = `U${'a'.repeat(32)}`;
  const CUSTOMER_B = `U${'9'.repeat(32)}`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  test('serves the catalog with no credentials: the Public role reads it', async () => {
    const response = await send('GET', `${rest}/collections?locale=en`);
    expect(response.status).toBe(200);
    const { collections } = (await response.json()) as { collections: Array<{ name: string }> };
    expect(collections.map((collection) => collection.name).sort()).toEqual(['Atelier', 'Gifts', 'Voyage']);
  });

  test("answers a product by its slug, and an unknown slug with view_product's hint", async () => {
    const found = await send('GET', `${rest}/products/weekender-50?locale=en`);
    expect(found.status).toBe(200);
    expect(((await found.json()) as { product: { slug: string; name: string } }).product).toMatchObject({ slug: 'weekender-50', name: 'Weekender 50' });
    const unknown = await send('GET', `${rest}/products/no-such-piece?locale=en`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({
      error: { code: 'not_found', message: 'No published product "no-such-piece".', hint: 'Call search_products to find valid product slugs.' },
    });
  });

  test("books only with a LINE customer's session, as a web request, and lists the visit for that customer alone", async () => {
    const booking = { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: visitOn(6, '14:00'), locale: 'en' };
    // Every request as the staff board lists it. How a request came in (createdVia) is for staff, so only the board shows it.
    const board = async () => {
      const response = await send('GET', `${strapiUrl}/maison/appointments?status=all&limit=50`, { headers: asAdmin() });
      expect(response.status, 'the staff board').toBe(200);
      return ((await response.json()) as { appointments: Array<{ reference: string; createdVia: string }> }).appointments;
    };
    const requestsBefore = (await board()).length;

    for (const [caller, headers] of [['no session', {}], ['the admin session', asAdmin()]] as const) {
      const refused = await send('POST', `${rest}/appointments`, { data: booking, headers });
      expect(refused.status, caller).toBe(401);
      expect(refused.headers.get('www-authenticate'), caller).toBe('Bearer');
      expect(((await refused.json()) as { error: { code: string } }).error.code, caller).toBe('not_signed_in');
    }
    expect(await board(), 'a refused request books nothing').toHaveLength(requestsBefore);

    const asA = bearer(await sessionOf(CUSTOMER_A));
    const created = await send('POST', `${rest}/appointments`, { data: booking, headers: asA });
    expect(created.status).toBe(201);
    const { appointment } = (await created.json()) as { appointment: Appointment };
    expect(appointment).toMatchObject({
      status: 'requested',
      boutique: { slug: 'ginza', name: 'Ginza Flagship' },
      requestedFor: booking.requestedFor,
      products: [{ slug: 'weekender-50', name: 'Weekender 50' }],
    });
    expect((await board()).find((row) => row.reference === appointment.reference)?.createdVia).toBe('web');

    const visitsOf = async (headers: Record<string, string>) => {
      const response = await send('GET', `${rest}/my-appointments?locale=en`, { headers });
      expect(response.status).toBe(200);
      return ((await response.json()) as { appointments: Appointment[] }).appointments.map((visit) => visit.reference);
    };
    expect(await visitsOf(asA)).toEqual([appointment.reference]);
    expect(await visitsOf(bearer(await sessionOf(CUSTOMER_B))), "B never sees A's visit").toEqual([]);
  });
});

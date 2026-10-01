import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, test } from '@playwright/test';

import { createSession } from '../lib/session';
import type { Appointment } from '../lib/types';

const strapiUrl = (process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338').replace(/\/+$/, '');
const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const asAdmin = () => ({ Authorization: `Bearer ${process.env.MAISON_E2E_ADMIN_JWT}` });

const pad = (n: number) => String(n).padStart(2, '0');
/** The next given weekday (0 = Sunday … 6 = Saturday) at least two days away, at `time` in Tokyo. */
const visitOn = (weekday: number, time: string) => {
  const date = new Date();
  const ahead = (weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (ahead < 2 ? ahead + 7 : ahead));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}:00+09:00`;
};

/** A demo customer's session, signed in the way the app signs in: a LIFF mock ID token, exchanged. */
const sessionOf = (lineUserId: string) => createSession({ strapiUrl, clientId, getIdToken: () => `valid.${lineUserId}` }).getToken();

/** A demo customer's own MCP connection. */
const signIn = async (lineUserId: string) => {
  const token = await sessionOf(lineUserId);
  const client = new Client({ name: 'maison-e2e', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${strapiUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
};
const call = async (client: Client, name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })).structuredContent as Record<string, any>;
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

test("the admin API never returns an appointment's customer, and its list search never matches one", async ({ request }) => {
  const carol = await signIn(`U${'f'.repeat(32)}`);
  const booked = await call(carol, 'request_appointment', { boutique: 'ginza', productSlugs: ['passport-cover'], requestedFor: visitOn(6, '16:00') });
  await carol.close();
  // The Content Manager's API. Every admin API reader goes through the same sanitizer.
  const list = async (query = '') => {
    const response = await request.get(`${strapiUrl}/content-manager/collection-types/plugin::maison.appointment?page=1&pageSize=20${query}`, { headers: asAdmin() });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { results: Array<Record<string, unknown>> }).results;
  };
  const results = await list();
  expect(results.length).toBeGreaterThan(0);
  for (const row of results) expect(row).not.toHaveProperty('customer');
  // The list search (_q) finds an appointment by its reference, and never by part of its customer's LINE user ID.
  expect((await list(`&_q=${booked.appointment.reference}`)).map((row) => row.reference)).toContain(booked.appointment.reference);
  expect(await list('&_q=ffffffff')).toHaveLength(0);
  // The relation picker searches an appointment's main field, so it must be the reference, never the customer.
  const configuration = await request.get(`${strapiUrl}/content-manager/content-types/plugin::maison.appointment/configuration`, { headers: asAdmin() });
  expect(configuration.ok()).toBe(true);
  expect(((await configuration.json()) as { data: { contentType: { settings: { mainField: string } } } }).data.contentType.settings.mainField).toBe('reference');
});

test.describe('the REST door at /api/maison', () => {
  const rest = `${strapiUrl}/api/maison`;
  // Customers of their own, apart from every other test's: A books one visit (a customer may hold three open), B none.
  const CUSTOMER_A = `U${'a'.repeat(32)}`;
  const CUSTOMER_B = `U${'9'.repeat(32)}`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  test('serves the catalog with no credentials: the Public role reads it', async ({ request }) => {
    const response = await request.get(`${rest}/collections?locale=en`);
    expect(response.status()).toBe(200);
    const { collections } = (await response.json()) as { collections: Array<{ name: string }> };
    expect(collections.map((collection) => collection.name).sort()).toEqual(['Atelier', 'Gifts', 'Voyage']);
  });

  test("answers a product by its slug, and an unknown slug with view_product's hint", async ({ request }) => {
    const found = await request.get(`${rest}/products/weekender-50?locale=en`);
    expect(found.status()).toBe(200);
    expect(((await found.json()) as { product: { slug: string; name: string } }).product).toMatchObject({ slug: 'weekender-50', name: 'Weekender 50' });
    const unknown = await request.get(`${rest}/products/no-such-piece?locale=en`);
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({
      error: { code: 'not_found', message: 'No published product "no-such-piece".', hint: 'Call search_products to find valid product slugs.' },
    });
  });

  test("books only with a LINE customer's session, as a web request, and lists the visit for that customer alone", async ({ request }) => {
    const booking = { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: visitOn(6, '14:00'), locale: 'en' };
    // Every request as the staff board lists it. How a request came in (createdVia) is for staff, so only the board shows it.
    const board = async () => {
      const response = await request.get(`${strapiUrl}/maison/appointments?status=all&limit=50`, { headers: asAdmin() });
      expect(response.ok()).toBe(true);
      return ((await response.json()) as { appointments: Array<{ reference: string; createdVia: string }> }).appointments;
    };
    const requestsBefore = (await board()).length;

    for (const [caller, headers] of [['no session', {}], ['the admin session', asAdmin()]] as const) {
      const refused = await request.post(`${rest}/appointments`, { data: booking, headers });
      expect(refused.status(), caller).toBe(401);
      expect(refused.headers()['www-authenticate'], caller).toBe('Bearer');
      expect(((await refused.json()) as { error: { code: string } }).error.code, caller).toBe('not_signed_in');
    }
    expect(await board(), 'a refused request books nothing').toHaveLength(requestsBefore);

    const asA = bearer(await sessionOf(CUSTOMER_A));
    const created = await request.post(`${rest}/appointments`, { data: booking, headers: asA });
    expect(created.status()).toBe(201);
    const { appointment } = (await created.json()) as { appointment: Appointment };
    expect(appointment).toMatchObject({
      status: 'requested',
      boutique: { slug: 'ginza', name: 'Ginza Flagship' },
      requestedFor: booking.requestedFor,
      products: [{ slug: 'weekender-50', name: 'Weekender 50' }],
    });
    expect((await board()).find((row) => row.reference === appointment.reference)?.createdVia).toBe('web');

    const visitsOf = async (headers: Record<string, string>) => {
      const response = await request.get(`${rest}/my-appointments?locale=en`, { headers });
      expect(response.status()).toBe(200);
      return ((await response.json()) as { appointments: Appointment[] }).appointments.map((visit) => visit.reference);
    };
    expect(await visitsOf(asA)).toEqual([appointment.reference]);
    expect(await visitsOf(bearer(await sessionOf(CUSTOMER_B))), "B never sees A's visit").toEqual([]);
  });
});

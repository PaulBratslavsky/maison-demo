import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, test } from '@playwright/test';

import { createSession } from '../lib/session';

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

/** A demo customer's own MCP connection, signed in the way the app signs in: a LIFF mock ID token, exchanged. */
const signIn = async (lineUserId: string) => {
  const token = await createSession({ strapiUrl, clientId, getIdToken: () => `valid.${lineUserId}` }).getToken();
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

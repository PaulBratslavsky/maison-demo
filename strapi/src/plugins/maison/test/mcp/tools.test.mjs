import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1338';
const tokens = JSON.parse(readFileSync(new URL('./.tokens.json', import.meta.url), 'utf8'));

const connect = async (token) => {
  const client = new Client({ name: 'maison-smoke-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', STRAPI_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
};
const toolNames = async (client) =>
  (await client.listTools()).tools.map((tool) => tool.name).filter((name) => name !== 'log').sort(); // log exists in development only
const promptNames = async (client) => ((await client.listPrompts().catch(() => ({ prompts: [] }))).prompts).map((prompt) => prompt.name);
const errorOf = (result) => JSON.parse(result.content[0].text).error;
const STAFF_TOOLS = ['appointment_requests', 'confirm_appointment'];

describe('Maison over /mcp', () => {
  let customer;
  let staff;
  let ops;

  before(async () => {
    customer = await connect(tokens.customer);
    staff = await connect(tokens.staff);
    ops = await connect(tokens.ops);
  });

  after(async () => {
    await customer?.close();
    await staff?.close();
    await ops?.close();
  });

  it('shows each token only the tools its permissions allow', async () => {
    assert.deepEqual(await toolNames(customer), [
      'browse_collections', 'find_boutiques', 'my_appointments', 'request_appointment', 'search_knowledge', 'search_products', 'view_product',
    ]);
    assert.deepEqual(await toolNames(staff), [
      'appointment_requests', 'browse_collections', 'confirm_appointment', 'find_boutiques', 'search_knowledge', 'search_products', 'view_product',
    ]);
    assert.deepEqual(await toolNames(ops), ['pending_confirmations', 'record_confirmation']);
  });

  it('keeps the staff tools away from the customer token', async () => {
    const names = await toolNames(customer);
    for (const name of STAFF_TOOLS) assert.ok(!names.includes(name), `${name} is hidden`);
    // Depending on the SDK version, a hidden tool is a protocol error or an isError result. Either way it doesn't run.
    const refused = await customer.callTool({ name: 'appointment_requests', arguments: {} }).then((result) => result.isError === true, () => true);
    assert.ok(refused, 'the customer token cannot call appointment_requests');
  });

  it('shows the ops prompt only to the ops token', async () => {
    assert.ok((await promptNames(ops)).includes('send_pending_confirmations'));
    assert.ok(!(await promptNames(customer)).includes('send_pending_confirmations'));
    assert.ok(!(await promptNames(staff)).includes('send_pending_confirmations'));
  });

  it('answers the demo question through the catalog tools', async () => {
    const result = await customer.callTool({
      name: 'search_products',
      arguments: { occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza', locale: 'en' },
    });
    assert.ok(!result.isError);
    assert.deepEqual(result.structuredContent.products.map((p) => p.slug), [
      'weekender-50', 'garment-carrier', 'watch-roll-trois', 'passport-cover', 'luggage-tag-duo',
    ]);
  });

  it("answers a question about a piece from the product knowledge, with that piece's own entry first", async () => {
    const result = await customer.callTool({
      name: 'search_knowledge',
      arguments: { query: 'Will it fit in the overhead bin?', productSlugs: ['cabin-case-55'], locale: 'en' },
    });
    assert.ok(!result.isError, JSON.stringify(result.content));
    assert.equal(result.structuredContent.entries[0].title, 'Will the Cabin Case 55 fit in an airline overhead bin?');
  });

  it('returns not_found with a hint for an unknown product', async () => {
    const result = await customer.callTool({ name: 'view_product', arguments: { slug: 'no-such-piece' } });
    assert.equal(result.isError, true);
    assert.equal(errorOf(result).code, 'not_found');
    assert.match(errorOf(result).hint, /search_products/);
  });

  it('never lets a plain admin token act as a customer', async () => {
    const booking = await customer.callTool({
      name: 'request_appointment',
      arguments: { boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: '2030-01-12T14:00:00+09:00' },
    });
    assert.equal(errorOf(booking).code, 'not_signed_in');
    const mine = await customer.callTool({ name: 'my_appointments', arguments: {} });
    assert.equal(errorOf(mine).code, 'not_signed_in');
  });

  it('lets the staff token review requests with customers masked, and refuses unknown references', async () => {
    const requests = await staff.callTool({ name: 'appointment_requests', arguments: { status: 'all' } });
    assert.ok(!requests.isError, JSON.stringify(requests.content));
    assert.ok(Array.isArray(requests.structuredContent.appointments));
    for (const appointment of requests.structuredContent.appointments) {
      assert.match(appointment.customer, /^(line:U[0-9a-f]{3}…[0-9a-f]{2}|unknown)$/);
    }
    const unknown = await staff.callTool({ name: 'confirm_appointment', arguments: { reference: 'APT-0000' } });
    assert.equal(errorOf(unknown).code, 'not_found');
  });

  it('lets the ops token list and record, and refuses unknown references', async () => {
    const pending = await ops.callTool({ name: 'pending_confirmations', arguments: {} });
    assert.ok(!pending.isError, JSON.stringify(pending.content));
    assert.ok(Array.isArray(pending.structuredContent.appointments));
    const unknown = await ops.callTool({ name: 'record_confirmation', arguments: { reference: 'APT-0000', status: 'sent', detail: 'smoke test' } });
    assert.equal(errorOf(unknown).code, 'not_found');
  });
});

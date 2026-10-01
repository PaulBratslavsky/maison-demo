/**
 * The concierge end to end on the local model: the real route, a signed-in demo customer, real MCP tool calls to the
 * running Strapi. Opt-in (`npm run test:live`), and skipped when Ollama or Strapi isn't up. It always uses the local
 * model, even when an API key is set, so it costs nothing and runs offline.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/concierge/route';
import { createSession } from '@/lib/session';
import { STRAPI_URL, ensureVerifyMock, ollamaUp, sseEvents, strapiUp } from './support';

delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;

const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const ready = Boolean(clientId) && (await strapiUp()) && (await ollamaUp());
/** A demo customer of its own, so the browser tests' customers never see these visits. */
const CUSTOMER = `U${'c'.repeat(32)}`;
const QUESTION = "I'm looking for a travel gift under ¥400,000 that I can see at the Ginza boutique. What would you suggest?";

type Product = { slug: string; name: string };

describe.skipIf(!ready)('the concierge on the local model', () => {
  let stopMock = () => {};
  let token = '';

  beforeAll(async () => {
    stopMock = await ensureVerifyMock();
    token = await createSession({ strapiUrl: STRAPI_URL, clientId, getIdToken: () => `valid.${CUSTOMER}` }).getToken();
  });
  afterAll(() => stopMock());

  it('answers the demo question from the catalog tools, and names only products they returned', async () => {
    const response = await POST(
      new Request('http://localhost:3003/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locale: 'en', messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: QUESTION }] }] }),
      })
    );
    expect(response.status).toBe(200);
    const events = sseEvents(await response.text());
    expect(events.filter((event) => event.type === 'error')).toEqual([]);

    const inputs = events.filter((event) => event.type === 'tool-input-available');
    const calls = inputs.map((event) => `${event.toolName}(${JSON.stringify(event.input)})`).join(', ');
    expect(inputs.some((event) => ['search_products', 'find_boutiques'].includes(event.toolName)), `tools called: ${calls}`).toBe(true);

    // Every product a tool returned in this conversation, by slug.
    const returned = new Set(
      events
        .filter((event) => event.type === 'tool-output-available')
        .flatMap((event) => {
          const data = event.output?.structuredContent ?? {};
          return [...((data.products as Product[]) ?? []), ...(data.product ? [data.product as Product] : [])];
        })
        .map((product) => product.slug)
    );
    const answer = events.filter((event) => event.type === 'text-delta').map((event) => event.delta as string).join('');

    // The whole catalog in both languages, and the demo question's own answer, straight from search_products.
    const mcp = new Client({ name: 'maison-live-test', version: '1.0.0' });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${STRAPI_URL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const search = async (args: Record<string, unknown>) =>
      ((await mcp.callTool({ name: 'search_products', arguments: { limit: 20, ...args } })).structuredContent as { products: Product[] }).products;
    const catalog = [...(await search({ locale: 'en' })), ...(await search({ locale: 'ja' }))];
    const fits = new Set((await search({ locale: 'en', occasion: 'travel', maxPriceJpy: 400000, inStockAt: 'ginza' })).map((product) => product.slug));
    await mcp.close();

    const named = [...new Set(catalog.filter((product) => answer.includes(product.name)).map((product) => product.slug))];
    const context = `Answer: ${answer} Tools: ${calls}`;
    expect(named.length, `the answer names a product. ${context}`).toBeGreaterThan(0);
    for (const slug of named) expect(returned.has(slug), `${slug} came from a tool call, not from the model. ${context}`).toBe(true);
    expect(named.some((slug) => fits.has(slug)), `a named product fits the question. ${context}`).toBe(true);
  });
});

/**
 * The concierge end to end on the local model: the real route, a signed-in demo customer, real MCP tool calls to the
 * running Strapi. Opt-in (`npm run test:live`), and skipped when the app's client ID is missing (`npm run setup` writes
 * NEXT_PUBLIC_MAISON_CLIENT_ID to liff/.env), or Ollama or Strapi isn't up. In LINE mode it refuses to run
 * (live/support.ts). It always uses the local model, even when an API key is set, so it costs nothing and runs offline.
 */
import { randomBytes } from 'node:crypto';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/concierge/route';
import { COPY } from '@/lib/copy';
import { resolveDate } from '@/lib/resolve-date';
import { createSession } from '@/lib/session';
import { handOffAt } from '@/lib/tool-view';
import { STRAPI_URL, datesIn, ensureVerifyMock, ollamaUp, saysConfirmed, sseEvents, strapiUp, weekdaysIn } from './support';

delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;

const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const ready = Boolean(clientId) && (await strapiUp()) && (await ollamaUp());
/** A demo customer of its own, so the browser tests' customers never see these visits. */
const CUSTOMER = `U${'c'.repeat(32)}`;
const QUESTION = "I'm looking for a travel gift under ¥400,000 that I can see at the Ginza boutique. What would you suggest?";

type Product = { slug: string; name: string };

/** The tool calls in an event stream, in order, and what each returned. */
const callsIn = (events: Array<Record<string, any>>) =>
  events
    .filter((event) => event.type === 'tool-input-available')
    .map((event) => ({
      id: event.toolCallId as string,
      name: event.toolName as string,
      input: event.input as Record<string, any>,
      output: events.find((other) => other.type === 'tool-output-available' && other.toolCallId === event.toolCallId)?.output as Record<string, any> | undefined,
    }));
const textIn = (events: Array<Record<string, any>>) => events.filter((event) => event.type === 'text-delta').map((event) => event.delta as string).join('');
/** The assistant's message as the page holds it after a reply, tool parts included: what it sends back with the next one. */
const assistantMessageOf = async (events: Array<Record<string, any>>): Promise<UIMessage> => {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const event of events) controller.enqueue(event as UIMessageChunk);
      controller.close();
    },
  });
  let message: UIMessage | undefined;
  for await (const snapshot of readUIMessageStream({ stream })) message = snapshot;
  return message as UIMessage;
};

// These run without Ollama or Strapi: they check the checks.
describe("the booking test's reply checks", () => {
  it('finds the dates an English reply mentions, and only dates', () => {
    expect(datesIn('Your visit on Saturday, October 3 at 2 pm is requested.', 2026)).toEqual(['2026-10-03']);
    expect(datesIn('Saturday, 3 October at 14:00', 2026)).toEqual(['2026-10-03']);
    expect(datesIn('on the 3rd of October, or Oct. 10th', 2026).sort()).toEqual(['2026-10-03', '2026-10-10']);
    expect(datesIn('That is 2026-10-03, a Saturday', 2026)).toEqual(['2026-10-03']);
    expect(datesIn('requestedFor 2026-10-03T14:00:00+09:00', 2026)).toEqual(['2026-10-03']);
    expect(datesIn('Saturday at 2 pm in Ginza: the Weekender 50 for ¥385,000 and 3 other pieces', 2026)).toEqual([]);
  });

  it('tells a visit that is confirmed from one that is only requested', () => {
    const confirmed = [
      'Your visit is confirmed.',
      'Your visit has been confirmed for Saturday.',
      'It is now confirmed.',
      'Both visits are already confirmed.',
      'The visit WAS confirmed.',
      'Your visit has already been confirmed.',
      // Contractions, and someone doing the confirming.
      "Great news, it's confirmed.",
      'It’s been confirmed.',
      "You're all confirmed for Saturday at 2 pm.",
      "I've confirmed your visit to the Ginza boutique.",
      'We have confirmed your appointment.',
      'The boutique has confirmed your visit.',
      // A clause before it, ended by a comma and a new subject, doesn't make it a confirmation still to come.
      'Once again, your visit is confirmed.',
      'After checking with Ginza, I’ve confirmed your visit.',
    ];
    const notConfirmed = [
      'Your visit has been requested. The boutique will confirm it on LINE.',
      'It is requested, and not yet confirmed.',
      "It isn't confirmed yet, and hasn't been confirmed by the boutique.",
      'Awaiting confirmation from the boutique.',
      'Please confirm the time.',
      // A confirmation still to come, whichever side of "confirmed" the condition is on.
      "You'll get a LINE message once it is confirmed.",
      'The boutique will message you on LINE when it is confirmed.',
      'You will hear from them as soon as the visit is confirmed by the boutique.',
      "After it's confirmed, you'll see it under Visits.",
      'It stays a request until it’s confirmed.',
      "I'll let you know when they've confirmed it.",
      'Once your visit on Saturday, October 3, is confirmed, the boutique will message you on LINE.',
      'Your visit is confirmed once the boutique accepts it on LINE.',
      'Nothing is confirmed until the boutique replies.',
      // The customer's yes.
      "Thank you, you've confirmed Saturday at 2 pm, so I've requested it.",
    ];
    // Soft, so a run names every reply it misjudges, not just the first.
    for (const reply of confirmed) expect.soft(saysConfirmed(reply), reply).toBe(true);
    for (const reply of notConfirmed) expect.soft(saysConfirmed(reply), reply).toBe(false);
  });

  it('reads a Japanese reply the same way', () => {
    for (const reply of ['確定しました。', 'ご予約が確定しました。', '土曜日14時のご予約が確定いたしました。', 'ご予約は確定です。']) {
      expect.soft(saysConfirmed(reply), reply).toBe(true);
    }
    // 確定しましたら is "once it is confirmed", 確定次第 "as soon as it is confirmed", and 未確定 "not confirmed".
    for (const reply of ['確定しましたらLINEでお知らせいたします。', 'ご予約が確定しましたら、LINEでお知らせいたします。', '予約が確定次第、LINEでご連絡いたします。', 'まだ確定しておりません。', 'ご予約はまだ未確定です。']) {
      expect.soft(saysConfirmed(reply), reply).toBe(false);
    }
  });

  it('finds the weekday names an English reply mentions', () => {
    expect(weekdaysIn('Saturday, October 3, at 2 pm')).toEqual(['Saturday']);
    expect(weekdaysIn('Closed on Mondays; see you on friday')).toEqual(['Monday', 'Friday']);
    expect(weekdaysIn('Weekender 50 at the boutique')).toEqual([]);
  });
});

describe.skipIf(!ready)('the concierge on the local model', () => {
  let stopMock = () => {};
  let token = '';

  beforeAll(async () => {
    stopMock = await ensureVerifyMock();
    token = await createSession({ strapiUrl: STRAPI_URL, clientId, getIdToken: () => `valid.${CUSTOMER}` }).getToken();
  });
  afterAll(() => stopMock());

  /** One English turn through the real route, as the app sends it: the stream's events. */
  const turn = async (text: string) => {
    const response = await POST(
      new Request('http://localhost:3003/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locale: 'en', messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }] }),
      })
    );
    expect(response.status).toBe(200);
    return sseEvents(await response.text());
  };

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

  /**
   * The demo's two messages, with "Saturday" in the first: it must ask resolve_date for the day, book the next Saturday
   * in Tokyo with the date that returned, and never name another date or weekday. It books a visit in the demo database,
   * for a customer of its own each run: the plugin lets one customer have 3 requests waiting for a boutique.
   */
  it('books the next Saturday in Tokyo, with the date resolve_date returned', async () => {
    const customer = `U${randomBytes(16).toString('hex')}`;
    const customerToken = await createSession({ strapiUrl: STRAPI_URL, clientId, getIdToken: () => `valid.${customer}` }).getToken();
    const saturday = resolveDate({ weekday: 'saturday' }, 'en').date; // by the code the tool runs
    const [ask, yes] = COPY.en.suggestions; // the two messages the stage demo sends
    const say = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] });
    const converse = async (messages: UIMessage[]) => {
      const response = await POST(
        new Request('http://localhost:3003/api/concierge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
          body: JSON.stringify({ locale: 'en', messages }),
        })
      );
      expect(response.status).toBe(200);
      const events = sseEvents(await response.text());
      expect(events.filter((event) => event.type === 'error')).toEqual([]);
      return events;
    };

    const firstTurn = await converse([say('u1', ask)]);
    const secondTurn = await converse([say('u1', ask), await assistantMessageOf(firstTurn), say('u2', yes)]);
    const calls = callsIn([...firstTurn, ...secondTurn]);
    const replies = [textIn(firstTurn), textIn(secondTurn)];
    const trace = `Tools: ${calls.map((call) => `${call.name}(${JSON.stringify(call.input)})`).join(', ')}. Replies: ${JSON.stringify(replies)}`;

    // It asked resolve_date for the day, before it booked.
    const asked = calls.findIndex((call) => call.name === 'resolve_date');
    const booking = calls.findIndex((call) => call.name === 'request_appointment');
    expect(asked, `it asks resolve_date. ${trace}`).toBeGreaterThanOrEqual(0);
    expect(booking, `it requests the visit. ${trace}`).toBeGreaterThanOrEqual(0);
    expect(asked < booking, `it asks resolve_date before it requests the visit. ${trace}`).toBe(true);
    expect(
      calls.some((call) => call.name === 'resolve_date' && call.output?.date === saturday && call.output?.weekday === 'Saturday'),
      `resolve_date gave it ${saturday}, a Saturday. ${trace}`
    ).toBe(true);

    // The visit it got is on that Saturday at 2 pm, in the request and as the system stored it.
    const booked = calls.find((call) => call.name === 'request_appointment' && call.output?.structuredContent?.appointment);
    const on = new RegExp(`^${saturday}T14:00`);
    expect(booked, `a visit was requested. ${trace}`).toBeDefined();
    expect(booked?.input.requestedFor, `it asks for ${saturday} at 14:00. ${trace}`).toMatch(on);
    expect(booked?.output?.structuredContent.appointment.requestedFor, `the visit is on ${saturday} at 14:00. ${trace}`).toMatch(on);

    // The visit is requested, not confirmed: the boutique confirms it, on LINE.
    expect(saysConfirmed(replies[1]), `the second reply says the visit is confirmed. ${trace}`).toBe(false);

    // And what it tells the customer, before the yes and after the booking, names no other date or weekday.
    const year = Number(saturday.slice(0, 4));
    for (const [which, reply] of [['first', replies[0]], ['second', replies[1]]] as const) {
      expect(datesIn(reply, year).filter((date) => date !== saturday), `the ${which} reply names another date. ${trace}`).toEqual([]);
      expect(weekdaysIn(reply).filter((name) => name !== 'Saturday'), `the ${which} reply names another weekday. ${trace}`).toEqual([]);
    }
  });

  it("answers a care question from Maison's product knowledge", async () => {
    const events = await turn('How do I care for the leather?');
    const answer = textIn(events);
    const called = callsIn(events).map((call) => call.name);
    const found = events
      .filter((event) => event.type === 'tool-output-available')
      .flatMap((event) => (event.output?.structuredContent?.entries as Array<{ title: string }> | undefined) ?? []);
    expect(called, answer).toContain('search_knowledge');
    expect(found.map((entry) => entry.title), answer).toContain('How do I care for the leather?');
    expect(called, answer).not.toContain('hand_off_to_staff');
    expect(answer, 'the answer uses the entry').toMatch(/cloth|sunlight|balm/i);
  });

  it("sends a question Maison hasn't written about to the LINE chat", async () => {
    const events = await turn('Can I pay in bitcoin?');
    const answer = textIn(events);
    const called = callsIn(events).map((call) => call.name);
    expect(called, answer).toContain('search_knowledge');
    // The chat shows the note and the LINE chat button when the model calls hand_off_to_staff, and when it skips the call after a search that found nothing.
    const noteAt = handOffAt((await assistantMessageOf(events)).parts);
    expect(noteAt, `the chat shows no hand-off note. Tools: ${called.join(', ')}. Answer: ${answer}`).not.toBeNull();
    expect(answer, 'it promises no contact').not.toMatch(/will (contact|reach out|get back|reply)/i);
  });
});

/**
 * The concierge end to end: the real route, a signed-in demo customer, real MCP tool calls to the running Strapi. Opt-in
 * (`npm run test:live`), and skipped when the app's client ID is missing (`npm run setup` writes
 * NEXT_PUBLIC_MAISON_CLIENT_ID to liff/.env), or Strapi or the model isn't there. In LINE mode it refuses to run
 * (live/support.ts). Two modes:
 * - The local model, the default. It always uses Ollama, even when an API key is set, so it costs nothing and runs offline.
 * - Claude, opt-in: `LIVE_MODEL=claude npm run test:live` runs the visit picker's two cases on Claude, with the key the
 *   app uses from liff/.env (ANTHROPIC_API_KEY, or AI_GATEWAY_API_KEY). Skipped without one. The key is never printed:
 *   the test only checks that one is set.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/concierge/route';
import { COPY } from '@/lib/copy';
import { resolveDate } from '@/lib/resolve-date';
import { createSession } from '@/lib/session';
import { handOffAt } from '@/lib/tool-view';
import { CHOOSE_VISIT, livePickerOf } from '@/lib/visit-picker';
import { STRAPI_URL, datesIn, ensureVerifyMock, ollamaUp, saysConfirmed, saysRequested, sseEvents, strapiUp, weekdaysIn } from './support';

/** Which model answers: Claude only when asked for by name, so a run costs nothing unless someone means it to. */
const claude = process.env.LIVE_MODEL === 'claude';
if (!claude) {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
}
/** Whether a key for Claude is set: checked, never read out. */
const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY);

const clientId = process.env.NEXT_PUBLIC_MAISON_CLIENT_ID ?? '';
const ready = Boolean(clientId) && (await strapiUp()) && (claude ? hasClaudeKey : await ollamaUp());
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

const say = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] });
/** For a failure's message: the calls the turn made, and what the concierge said. */
const traceOf = (events: Array<Record<string, any>>) =>
  `Tools: ${callsIn(events)
    .map((call) => `${call.name}(${JSON.stringify(call.input)})`)
    .join(', ')}. Reply: ${JSON.stringify(textIn(events))}`;

/** One request through the real route, as the app sends it, signed in with `token`: the stream's events, with no error among them. */
const converse = async (token: string, body: Record<string, unknown>) => {
  const response = await POST(
    new Request('http://localhost:3003/api/concierge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  );
  expect(response.status).toBe(200);
  const events = sseEvents(await response.text());
  expect(events.filter((event) => event.type === 'error')).toEqual([]);
  return events;
};

/**
 * The demo's first suggestion, as the stage sends it, ends in a visit picker: for the next Saturday in Tokyo (the date
 * resolve_date returned, which it asked first) at 14:00 in Ginza, for pieces a search in that turn returned. Nothing is
 * booked: the turn stops at the picker, which waits for the customer, and the reply says no visit is confirmed and names
 * no other day.
 */
const expectTheDemoPicker = async (token: string) => {
  const saturday = resolveDate({ weekday: 'saturday' }, 'en').date; // by the code the tool runs
  const [ask] = COPY.en.suggestions;
  const events = await converse(token, { locale: 'en', messages: [say('u1', ask)] });
  const calls = callsIn(events);
  const trace = traceOf(events);

  const asked = calls.findIndex((call) => call.name === 'resolve_date');
  const shown = calls.findIndex((call) => call.name === CHOOSE_VISIT);
  expect(asked, `it asks resolve_date. ${trace}`).toBeGreaterThanOrEqual(0);
  expect(shown, `it shows the picker. ${trace}`).toBeGreaterThanOrEqual(0);
  expect(asked < shown, `it asks resolve_date before it shows the picker. ${trace}`).toBe(true);
  expect(
    calls.some((call) => call.name === 'resolve_date' && call.output?.date === saturday && call.output?.weekday === 'Saturday'),
    `resolve_date gave it ${saturday}, a Saturday. ${trace}`
  ).toBe(true);

  const picker = calls[shown];
  expect(picker.input, `the picker is for Ginza on ${saturday} at 14:00. ${trace}`).toMatchObject({ boutique: 'ginza', date: saturday, time: '14:00' });
  const found = new Set(
    calls
      .filter((call) => call.name === 'search_products')
      .flatMap((call) => (call.output?.structuredContent?.products as Product[] | undefined) ?? [])
      .map((product) => product.slug)
  );
  const pieces: string[] = picker.input.productSlugs ?? [];
  expect(pieces.length, `the picker has pieces. ${trace}`).toBeGreaterThan(0);
  for (const slug of pieces) expect(found.has(slug), `${slug} came from search_products in this turn. ${trace}`).toBe(true);

  // The customer books, in the picker: the model asks for no visit itself, and says none is confirmed.
  expect(events.some((event) => event.toolName === 'request_appointment'), `the model called request_appointment. ${trace}`).toBe(false);
  const reply = textIn(events);
  expect(saysConfirmed(reply), `the reply says the visit is confirmed. ${trace}`).toBe(false);
  expect(saysRequested(reply), `the reply says the visit is requested before the customer sent it. ${trace}`).toBe(false);
  const year = Number(saturday.slice(0, 4));
  expect(datesIn(reply, year).filter((date) => date !== saturday), `the reply names another date. ${trace}`).toEqual([]);
  expect(weekdaysIn(reply).filter((name) => name !== 'Saturday'), `the reply names another weekday. ${trace}`).toEqual([]);

  // The page shows that picker, live: the reply's message ends with it, waiting. No hand-off note: this is a gift and a visit.
  const message = await assistantMessageOf(events);
  expect(livePickerOf([say('u1', ask), message]), `the picker waits for the customer. ${trace}`).toBe(picker.id);
  expect(handOffAt(message.parts), `a hand-off note shows. ${trace}`).toBeNull();
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

  it('tells a visit the model says it requested from one the customer still has to send', () => {
    const requested = [
      "I've requested a visit for Saturday, October 10 at 2pm in Ginza with these three pieces for you to see.",
      'I have booked Saturday at 2 pm at Ginza for you.',
      'I requested a visit to Ginza on Saturday.',
      'Your visit is requested, and the boutique will confirm it on LINE.',
      'The request has been sent to Ginza.',
      'ご来店のリクエストを送信しました。',
      '土曜日14時でご予約いたしました。',
      'ご予約を承りました。',
      "I've sent the request to Ginza.",
      "I've set up your visit for Saturday at 2 pm.",
      "You're booked for Saturday at 2 pm at Ginza.",
      'Your visit to Ginza on Saturday at 2 pm is requested.',
      'Your visit is all booked.',
      'リクエストをお送りしました。',
      'ご予約が完了しました。',
    ];
    const notRequested = [
      'Tap Send request to ask Ginza for Saturday at 2 pm.',
      "I've filled in Ginza, Saturday 10 October and 2 pm: send the request when you're ready.",
      'Once you send the request, the boutique will confirm it on LINE.',
      "I haven't requested anything yet.",
      'Here are three travel pieces in stock at Ginza.',
      "I've made a short list of three travel pieces, and I've sent the details to the form below.",
      'リクエストを送信してください。',
      'リクエストを送信しましたら、ブティックがLINEでお知らせします。',
      'The request is sent when you tap Send request.',
      'Your request is sent to Ginza once you tap Send.',
      'ご要望を承りました。フォームをご用意しました。',
      'ご来店のご希望を承ります。',
    ];
    for (const reply of requested) expect.soft(saysRequested(reply), reply).toBe(true);
    for (const reply of notRequested) expect.soft(saysRequested(reply), reply).toBe(false);
  });

  it('finds the weekday names an English reply mentions', () => {
    expect(weekdaysIn('Saturday, October 3, at 2 pm')).toEqual(['Saturday']);
    expect(weekdaysIn('Closed on Mondays; see you on friday')).toEqual(['Monday', 'Friday']);
    expect(weekdaysIn('Weekender 50 at the boutique')).toEqual([]);
  });
});

describe.skipIf(!ready || claude)('the concierge on the local model', () => {
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
    // A gift is no policy question: the chat shows no hand-off note under the answer.
    expect(handOffAt((await assistantMessageOf(events)).parts), `a hand-off note shows on a gift question. ${context}`).toBeNull();
  });

  it("ends the demo's first suggestion in a visit picker for Ginza, the next Saturday in Tokyo and 14:00, with the date resolve_date returned", async () => {
    await expectTheDemoPicker(token);
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

  it("shows the hand-off note for a question Maison hasn't written about, with Strapi's reference only when it recorded the question", async () => {
    const events = await turn('Can I pay in bitcoin?');
    const answer = textIn(events);
    const calls = callsIn(events);
    const called = calls.map((call) => call.name);
    expect(called, answer).toContain('search_knowledge');
    // The chat shows a note after a search that found nothing: the app records the question itself (the search's result carries it), or the plain note when that fails.
    const note = handOffAt((await assistantMessageOf(events)).parts);
    expect(note, `the chat shows no hand-off note. Tools: ${called.join(', ')}. Answer: ${answer}`).not.toBeNull();
    // The note says the question is with the advisors, under its reference, only when Strapi recorded it: its own reference, from the app's hand-off on the search or from the model's call, or none.
    const recorded = calls.find(
      (call) =>
        (call.name === 'search_knowledge' && call.output?.structuredContent?.handOff?.reference) || (call.name === 'hand_off_to_staff' && call.output?.structuredContent?.question?.reference)
    );
    const reference = recorded?.output?.structuredContent.handOff?.reference ?? recorded?.output?.structuredContent.question?.reference;
    expect(note?.recorded?.reference, `the note's reference is the one Strapi gave. Tools: ${called.join(', ')}. Answer: ${answer}`).toBe(reference);
    // With nothing recorded (the hand-off failed), the reply must not promise contact: nobody has the question.
    if (!note?.recorded) expect(answer, `it promises contact though nothing was recorded. Tools: ${called.join(', ')}`).not.toMatch(/will (contact|reach out|get back)/i);
  });
});

describe.skipIf(!ready || !claude)('the visit picker on Claude', () => {
  let stopMock = () => {};
  let token = '';

  beforeAll(async () => {
    stopMock = await ensureVerifyMock();
    token = await createSession({ strapiUrl: STRAPI_URL, clientId, getIdToken: () => `valid.${CUSTOMER}` }).getToken();
  });
  afterAll(() => stopMock());

  it("shows the picker for the piece on whose page the customer asks \"Can we schedule one?\", with nothing they didn't name", async () => {
    const asked = 'Can we schedule one?';
    const events = await converse(token, { locale: 'en', product: 'weekender-50', messages: [say('u1', asked)] });
    const trace = traceOf(events);
    const pickers = callsIn(events).filter((call) => call.name === CHOOSE_VISIT);
    expect(pickers, `it shows one picker. ${trace}`).toHaveLength(1);
    expect(pickers[0].input.productSlugs, `the picker is for the piece. ${trace}`).toEqual(['weekender-50']);
    // Nothing was named, so nothing is filled in: the picker starts as the sheet does.
    for (const key of ['boutique', 'date', 'time']) expect(pickers[0].input, `the model filled in ${key}. ${trace}`).not.toHaveProperty(key);
    expect(callsIn(events).some((call) => call.name === 'resolve_date'), `it asked resolve_date, for no day. ${trace}`).toBe(false);
    expect(saysConfirmed(textIn(events)), `the reply says a visit is confirmed. ${trace}`).toBe(false);
    expect(saysRequested(textIn(events)), `the reply says the visit is requested before the customer sent it. ${trace}`).toBe(false);
    const message = await assistantMessageOf(events);
    expect(livePickerOf([say('u1', asked), message]), `the picker waits for the customer. ${trace}`).toBe(pickers[0].id);
  });

  it("ends the demo's first suggestion in a visit picker for Ginza, the next Saturday in Tokyo and 14:00", async () => {
    await expectTheDemoPicker(token);
  });
});

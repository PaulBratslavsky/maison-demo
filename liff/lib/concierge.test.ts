import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { APICallError, RetryError, simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SURFACE_HEADER, conciergeInstructions, describeModelError, handleConcierge } from './concierge';
import { conciergeModel } from './model';
import { resolveDate } from './resolve-date';

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 2, text: 2, reasoning: undefined },
};
const replyModel = () =>
  new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'かしこまりました。' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
          ],
        }),
      },
    ],
  });
/** A model that calls one tool, then answers once it has the result. */
const callsThenReplies = (toolName: string, input: unknown) =>
  new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: 'tool-call', toolCallId: 'call-1', toolName, input: JSON.stringify(input) },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Noted.' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
          ],
        }),
      },
    ],
  });
/** The events of a server-sent event stream. */
const eventsOf = (text: string): Array<Record<string, any>> =>
  text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((data) => data && data !== '[DONE]')
    .map((data) => JSON.parse(data));
const fakeMcp = () => {
  const close = vi.fn(async () => {});
  return { close, createMcpClient: vi.fn(async () => ({ tools: async () => ({}), close })) };
};
const ask = (authorization: string | null, body: unknown) =>
  new Request('http://localhost:3003/api/concierge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });
const hello = { messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'こんにちは' }] }], locale: 'ja' };
const deps = (overrides: Record<string, unknown>) =>
  ({ model: replyModel(), strapiUrl: 'http://strapi.test', now: () => new Date('2026-10-07T01:00:00Z'), ...overrides }) as any;

describe('handleConcierge', () => {
  it("forwards only the customer's session token and the surface header to Strapi", async () => {
    const { createMcpClient, close } = fakeMcp();
    const response = await handleConcierge(ask('Bearer mcp_at_customer', hello), deps({ createMcpClient }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('かしこまりました');
    expect(createMcpClient).toHaveBeenCalledWith({
      transport: {
        type: 'http',
        url: 'http://strapi.test/mcp',
        headers: { Authorization: 'Bearer mcp_at_customer', [SURFACE_HEADER]: 'concierge' },
      },
    });
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
  });

  it('refuses callers without a customer session before connecting to anything', async () => {
    const { createMcpClient } = fakeMcp();
    const model = replyModel();
    for (const authorization of [null, 'Bearer an-admin-token', 'Basic dXNlcjpwYXNz']) {
      expect((await handleConcierge(ask(authorization, hello), deps({ createMcpClient, model }))).status).toBe(401);
    }
    expect(createMcpClient).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("limits the customer's own messages to 1000 characters, not the concierge's: a long reply doesn't refuse the next turn", async () => {
    const { createMcpClient } = fakeMcp();
    const longReply = 'お買い物のご案内です。'.repeat(300); // 3,300 characters, as a model can write
    const conversation = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'こんにちは' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: longReply }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'ありがとう' }] },
    ];
    const response = await handleConcierge(ask('Bearer mcp_at_x', { messages: conversation, locale: 'ja' }), deps({ createMcpClient }));
    expect(response.status).toBe(200);
    await response.text();
    // The customer's own message is still limited, wherever it is in the conversation.
    conversation[0].parts[0].text = 'あ'.repeat(1001);
    expect((await handleConcierge(ask('Bearer mcp_at_x', { messages: conversation, locale: 'ja' }), deps({ createMcpClient }))).status).toBe(400);
  });

  it('refuses empty and oversized conversations', async () => {
    const { createMcpClient } = fakeMcp();
    const tooLong = { messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'あ'.repeat(1001) }] }] };
    expect((await handleConcierge(ask('Bearer mcp_at_x', { messages: [] }), deps({ createMcpClient }))).status).toBe(400);
    expect((await handleConcierge(ask('Bearer mcp_at_x', tooLong), deps({ createMcpClient }))).status).toBe(400);
    expect(createMcpClient).not.toHaveBeenCalled();
  });

  it("tells the model today's date in Tokyo and the reply language", async () => {
    const { createMcpClient } = fakeMcp();
    const model = replyModel();
    await (await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'en' }), deps({ createMcpClient, model }))).text();
    const instructions = JSON.stringify(model.doStreamCalls[0].prompt[0]);
    expect(instructions).toContain('2026-10-07');
    expect(instructions).toContain('Reply in English');
  });

  it('gives the model resolve_date next to the Maison tools', async () => {
    const model = replyModel();
    const search = tool({ description: 'Search the catalog.', inputSchema: z.object({}), execute: async () => ({ products: [] }) });
    const createMcpClient = vi.fn(async () => ({ tools: async () => ({ search_products: search }), close: vi.fn(async () => {}) }));
    await (await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient, model }))).text();
    expect(model.doStreamCalls[0].tools?.map((entry) => entry.name).sort()).toEqual(['resolve_date', 'search_products']);
  });

  it("answers resolve_date with the pure function's output, in the reply language", async () => {
    // 11:30 on Thursday 1 October in Tokyo.
    const now = () => new Date('2026-10-01T02:30:00Z');
    for (const locale of ['en', 'ja'] as const) {
      const { createMcpClient } = fakeMcp();
      const model = callsThenReplies('resolve_date', { weekday: 'saturday' });
      const response = await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale }), deps({ createMcpClient, model, now }));
      const result = eventsOf(await response.text()).find((event) => event.type === 'tool-output-available');
      expect(result?.output, locale).toEqual(resolveDate({ weekday: 'saturday' }, locale, now()));
      expect(result?.output, locale).toEqual({ date: '2026-10-03', weekday: locale === 'en' ? 'Saturday' : '土曜日', isPast: false });
    }
  });

  it('never runs resolve_date on input that names more than one day, and tells the model why', async () => {
    const { createMcpClient } = fakeMcp();
    const model = callsThenReplies('resolve_date', { weekday: 'saturday', relative: 'today' });
    const response = await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient, model }));
    const events = eventsOf(await response.text());
    expect(events.some((event) => event.type === 'tool-output-available')).toBe(false);
    expect(events.some((event) => event.type === 'tool-input-error' || event.type === 'tool-output-error')).toBe(true);
    // The step after it, the model is shown the reason, so it can ask again with one.
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain('exactly one of weekday, date or relative');
  });

  it("resolves next week's weekday and the day after tomorrow through the tool, in the reply language", async () => {
    // 11:30 on Thursday 1 October in Tokyo.
    const now = () => new Date('2026-10-01T02:30:00Z');
    const asked = [
      { input: { weekday: 'saturday', week: 'next' }, date: '2026-10-10' },
      { input: { relative: 'day_after_tomorrow' }, date: '2026-10-03' },
    ] as const;
    for (const { input, date } of asked) {
      for (const locale of ['en', 'ja'] as const) {
        const { createMcpClient } = fakeMcp();
        const model = callsThenReplies('resolve_date', input);
        const response = await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale }), deps({ createMcpClient, model, now }));
        const result = eventsOf(await response.text()).find((event) => event.type === 'tool-output-available');
        expect(result?.output, `${JSON.stringify(input)} ${locale}`).toEqual(resolveDate(input, locale, now()));
        expect(result?.output, `${JSON.stringify(input)} ${locale}`).toEqual({ date, weekday: locale === 'en' ? 'Saturday' : '土曜日', isPast: false });
      }
    }
  });

  it('reads week whatever its case, and ignores a blank one, so "Saturday" stays the coming one', async () => {
    const now = () => new Date('2026-10-01T02:30:00Z');
    const sent = [
      { input: { weekday: 'saturday', week: ' NEXT ' }, date: '2026-10-10' },
      { input: { weekday: 'Saturday', week: 'next', relative: '', date: null }, date: '2026-10-10' },
      { input: { weekday: 'saturday', week: '' }, date: '2026-10-03' },
      { input: { weekday: 'saturday', week: 'this' }, date: '2026-10-03' },
      { input: { weekday: 'Saturday', week: ' THIS ' }, date: '2026-10-03' },
      { input: { weekday: 'saturday', week: null, date: '', relative: null }, date: '2026-10-03' },
    ];
    for (const { input, date } of sent) {
      const { createMcpClient } = fakeMcp();
      const model = callsThenReplies('resolve_date', input);
      const response = await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'en' }), deps({ createMcpClient, model, now }));
      const result = eventsOf(await response.text()).find((event) => event.type === 'tool-output-available');
      expect(result?.output?.date, JSON.stringify(input)).toBe(date);
    }
  });

  it("ignores the locale a model passes, since the tool answers in the reply's language whatever it says", async () => {
    // Rule 7 tells the model to pass locale to every tool that takes one, and it does here too.
    const now = () => new Date('2026-10-01T02:30:00Z');
    for (const input of [{ weekday: 'saturday', week: 'this', locale: 'en' }, { weekday: 'saturday', locale: 'ja' }, { weekday: 'saturday', locale: '' }]) {
      const { createMcpClient } = fakeMcp();
      const model = callsThenReplies('resolve_date', input);
      const response = await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'ja' }), deps({ createMcpClient, model, now }));
      const result = eventsOf(await response.text()).find((event) => event.type === 'tool-output-available');
      expect(result?.output, JSON.stringify(input)).toEqual({ date: '2026-10-03', weekday: '土曜日', isPast: false }); // the route's language, not the model's
    }
  });

  it("refuses a key resolve_date doesn't have, with the reason, so a day can't be quietly dropped", async () => {
    // A typo such as "weeks" used to be stripped, and "next week's Saturday" came out as this week's.
    const { createMcpClient } = fakeMcp();
    const model = callsThenReplies('resolve_date', { weekday: 'saturday', weeks: 'next' });
    const events = eventsOf(await (await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient, model }))).text());
    expect(events.some((event) => event.type === 'tool-output-available')).toBe(false);
    expect(events.some((event) => event.type === 'tool-input-error' || event.type === 'tool-output-error')).toBe(true);
    // The step after, the model is shown the schema's own words. Not just "weeks": its call is in that prompt, and the
    // error echoes the input, so "weeks" is there whatever the error says.
    const results = model.doStreamCalls[1].prompt.flatMap((message) => (message.role === 'tool' ? message.content : []));
    const shown = results.map((part) => (part.type === 'tool-result' && part.output.type === 'error-text' ? part.output.value : '')).join('\n');
    // The schema's issues arrive as JSON inside that text, so their quotes come escaped.
    expect(shown.replaceAll('\\"', '"')).toContain('Unrecognized key: "weeks"');
  });

  it('treats the null and "" a model sends for the inputs it is not using as not given, and ignores case and spaces', async () => {
    const now = () => new Date('2026-10-01T02:30:00Z');
    const sent = [
      { weekday: 'saturday' },
      { weekday: 'saturday', relative: null, date: null },
      { date: '', weekday: 'saturday', relative: '' },
      { weekday: 'Saturday' },
      { weekday: ' SATURDAY ', relative: ' ' },
    ];
    for (const input of sent) {
      const { createMcpClient } = fakeMcp();
      const model = callsThenReplies('resolve_date', input);
      const response = await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'en' }), deps({ createMcpClient, model, now }));
      const result = eventsOf(await response.text()).find((event) => event.type === 'tool-output-available');
      expect(result?.output, JSON.stringify(input)).toEqual({ date: '2026-10-03', weekday: 'Saturday', isPast: false });
    }
  });

  it("refuses resolve_date input that names no day, or a day or a key it can't take, without running it", async () => {
    const refused = [
      {},
      { weekday: '', relative: '', date: '' },
      { relative: 'the day after tomorrow' },
      { weekday: 'today' },
      { date: '2026-10-3' },
      { week: 'next' }, // week goes with a weekday
      { date: '2026-10-10', week: 'next' },
      { weekday: 'saturday', week: 'last' }, // only "this" and "next"
      { weekday: 'saturday', limit: 3 }, // a key it doesn't have, with a real value
    ];
    for (const input of refused) {
      const { createMcpClient } = fakeMcp();
      const model = callsThenReplies('resolve_date', input);
      const events = eventsOf(await (await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient, model }))).text());
      expect(events.some((event) => event.type === 'tool-output-available'), JSON.stringify(input)).toBe(false);
      expect(events.some((event) => event.type === 'tool-input-error' || event.type === 'tool-output-error'), JSON.stringify(input)).toBe(true);
    }
  });

  it("doesn't blame the model when a tool can't reach Strapi", async () => {
    const search = tool({
      description: 'Search the catalog.',
      inputSchema: z.object({}),
      execute: async (): Promise<{ products: string[] }> => {
        throw new TypeError('fetch failed');
      },
    });
    const createMcpClient = vi.fn(async () => ({ tools: async () => ({ search_products: search }), close: vi.fn(async () => {}) }));
    const model = callsThenReplies('search_products', {});
    const text = await (await handleConcierge(ask('Bearer mcp_at_x', { ...hello, locale: 'en' }), deps({ createMcpClient, model, modelLabel: 'qwen3-14b-32k (Ollama at http://localhost:11434/v1)' }))).text();
    expect(eventsOf(text).find((event) => event.type === 'tool-output-error')?.errorText).toBe('fetch failed');
    expect(text).not.toContain("isn't reachable");
  });

  it('closes the MCP client when the customer goes away mid-reply', async () => {
    const { createMcpClient, close } = fakeMcp();
    // A reply that has started and never ends: the customer closes the page while the model is still going.
    const model = new MockLanguageModelV4({
      doStream: [
        {
          stream: new ReadableStream<any>({
            start(controller) {
              controller.enqueue({ type: 'text-start', id: 't1' });
              controller.enqueue({ type: 'text-delta', id: 't1', delta: 'Un moment' });
            },
          }),
        },
      ],
    });
    const gone = new AbortController();
    const request = new Request('http://localhost:3003/api/concierge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mcp_at_x' },
      body: JSON.stringify(hello),
      signal: gone.signal,
    });
    const response = await handleConcierge(request, deps({ createMcpClient, model }));
    const reader = response.body!.getReader();
    await reader.read(); // the reply has started
    expect(close).not.toHaveBeenCalled();
    gone.abort();
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    await reader.cancel().catch(() => {});
  });

  it("names the model, and the fix, when the model can't be reached", async () => {
    // The handler logs the failure for whoever runs the app (a long retry error). Keep it out of this run's output.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // A port that just closed: connecting is refused, as when Ollama isn't running.
      const closed = createServer();
      await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
      const { port } = closed.address() as AddressInfo;
      await new Promise((resolve) => closed.close(resolve));
      const { createMcpClient, close } = fakeMcp();
      const { model, label } = conciergeModel({ OLLAMA_BASE_URL: `http://127.0.0.1:${port}/v1` });
      const response = await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient, model, modelLabel: label }));
      const text = await response.text();
      expect(text).toContain(`The concierge's model (qwen3-14b-32k (Ollama at http://127.0.0.1:${port}/v1)) isn't reachable`);
      expect(text).toContain('ANTHROPIC_API_KEY');
      // The log says which model, too: in LINE mode the customer's screen never shows the detail.
      expect(log).toHaveBeenCalledWith('[concierge]', expect.stringContaining(`(qwen3-14b-32k (Ollama at http://127.0.0.1:${port}/v1)) isn't reachable`), expect.any(Error));
      // And the MCP client is closed, whatever went wrong.
      await vi.waitFor(() => expect(close).toHaveBeenCalled());
    } finally {
      log.mockRestore();
    }
  }, 20_000); // the AI SDK retries twice, with backoff, before it gives up

  it('answers 502 when Strapi refuses the connection', async () => {
    const createMcpClient = vi.fn(async () => {
      throw new Error('Streamable HTTP error: 401');
    });
    const response = await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient }));
    expect(response.status).toBe(502);
  });
});

describe('describeModelError', () => {
  const label = 'qwen3-14b-32k (Ollama at http://localhost:11434/v1)';
  const refused = () =>
    new APICallError({
      message: 'Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434',
      url: 'http://localhost:11434/v1/chat/completions',
      requestBodyValues: {},
      isRetryable: true,
    });

  it("names the model, with the fix, when a model call can't connect", () => {
    const retried = new RetryError({ message: 'Failed after 3 attempts. Last error: Cannot connect to API', reason: 'maxRetriesExceeded', errors: [refused()] });
    for (const error of [refused(), retried]) {
      expect(describeModelError(error, label)).toBe(`The concierge's model (${label}) isn't reachable. Start Ollama, or set ANTHROPIC_API_KEY in liff/.env, then restart the app.`);
    }
    expect(describeModelError(refused())).toMatch(/^The concierge's model isn't reachable\./); // with no label to name
  });

  it("leaves a tool's own failure to reach Strapi as it is", () => {
    for (const message of ['fetch failed', 'connect ECONNREFUSED 127.0.0.1:1338', 'Cannot connect to API: nope']) {
      expect(describeModelError(new TypeError(message), label)).toBe(message);
      expect(describeModelError(new Error(message), label)).toBe(message);
    }
  });

  it('passes any other model error through, and has words for what is not an Error', () => {
    const unauthorised = new APICallError({ message: 'invalid x-api-key', url: 'https://api.anthropic.com/v1/messages', requestBodyValues: {}, statusCode: 401 });
    expect(describeModelError(unauthorised, label)).toBe('invalid x-api-key');
    expect(describeModelError('boom', label)).toBe('The concierge had a problem.');
  });
});

describe('conciergeInstructions', () => {
  // 11:30 on Thursday 1 October in Tokyo, while it's still Wednesday evening in California.
  const now = new Date('2026-10-01T02:30:00Z');
  /** The calendar's lines: a date, a space, and the weekday. */
  const calendarOf = (instructions: string) => instructions.split('\n').filter((line) => /^\d{4}-\d{2}-\d{2} \S+$/.test(line));
  const datesOf = (instructions: string) => calendarOf(instructions).map((line) => line.slice(0, 10));

  it('gives the model a calendar of the next 14 days in Tokyo, today first, so it never works out a weekday', () => {
    const calendar = calendarOf(conciergeInstructions('en', now));
    expect(calendar).toHaveLength(14);
    expect(calendar[0]).toBe('2026-10-01 Thu');
    expect(calendar).toContain('2026-10-03 Sat');
    expect(calendar[13]).toBe('2026-10-14 Wed');
    // One line per day: none missing, none repeated.
    expect(datesOf(conciergeInstructions('en', now))).toEqual(Array.from({ length: 14 }, (_, day) => `2026-10-${String(day + 1).padStart(2, '0')}`));
  });

  it('writes the weekdays in the reply language', () => {
    const calendar = calendarOf(conciergeInstructions('ja', now));
    expect(calendar[0]).toBe('2026-10-01 木');
    expect(calendar).toContain('2026-10-03 土');
    expect(calendar).toHaveLength(14);
  });

  it("counts Tokyo's days, not UTC's", () => {
    // 00:30 on 1 October in Tokyo is still 30 September in UTC. 23:59 on 1 October in Tokyo is 1 October in UTC.
    expect(calendarOf(conciergeInstructions('en', new Date('2026-09-30T15:30:00Z')))[0]).toBe('2026-10-01 Thu');
    expect(calendarOf(conciergeInstructions('en', new Date('2026-10-01T14:59:00Z')))[0]).toBe('2026-10-01 Thu');
    expect(calendarOf(conciergeInstructions('en', new Date('2026-10-01T15:00:00Z')))[0]).toBe('2026-10-02 Fri');
  });

  it('runs on across the end of a month and a year, and a leap day', () => {
    const newYear = calendarOf(conciergeInstructions('en', new Date('2026-12-25T03:00:00Z')));
    expect(newYear[0]).toBe('2026-12-25 Fri');
    expect(newYear).toContain('2026-12-31 Thu');
    expect(newYear).toContain('2027-01-01 Fri');
    expect(newYear[13]).toBe('2027-01-07 Thu');
    expect(calendarOf(conciergeInstructions('en', new Date('2028-02-27T03:00:00Z')))).toContain('2028-02-29 Tue');
  });

  it('is the same wherever the server runs', () => {
    // The hour at 02:30Z in each zone shows that the zone really changed. Tokyo is the only one that agrees with Tokyo.
    const hourAtNow: Record<string, number> = { 'Asia/Tokyo': 11, 'America/Los_Angeles': 19, 'Pacific/Kiritimati': 16, 'Pacific/Pago_Pago': 15, UTC: 2 };
    const zone = process.env.TZ;
    try {
      const results = Object.entries(hourAtNow).map(([timeZone, hour]) => {
        process.env.TZ = timeZone;
        expect(new Date(now).getHours(), timeZone).toBe(hour);
        return conciergeInstructions('en', now);
      });
      for (const result of results) expect(result).toBe(results[0]);
      expect(calendarOf(results[0])[0]).toBe('2026-10-01 Thu');
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });

  it('names no date of its own, so no example can be stale or copied for a wrong day', () => {
    for (const when of ['2026-10-01T02:30:00Z', '2027-03-15T10:00:00Z', '2028-02-27T20:00:00Z']) {
      const text = conciergeInstructions('en', new Date(when));
      const calendar = new Set(datesOf(text));
      for (const date of text.match(/\d{4}-\d{2}-\d{2}/g) ?? []) expect(calendar.has(date), `${date} is in the calendar for ${when}`).toBe(true);
    }
  });

  it('points the model at week "next" and day_after_tomorrow for 来週の… and 明後日, in both reply languages', () => {
    for (const locale of ['en', 'ja'] as const) {
      const text = conciergeInstructions(locale, now);
      expect(text, locale).toContain('"next week\'s Saturday", 来週の土曜日: week "next"');
      expect(text, locale).toContain('("the day after tomorrow", 明後日)');
    }
  });

  it('lets the model answer an opening-hours question without asking which day', () => {
    // Rule 1 says to use the tools for opening hours; rule 4 must not forbid the one call that answers it. Only when no
    // day is named: a booking turn names one, and checks it with find_boutiques and that date.
    for (const locale of ['en', 'ja'] as const) {
      const text = conciergeInstructions(locale, now);
      expect(text, locale).toMatch(/If the customer names no day, look up opening hours only when they ask about them: call find_boutiques without a date, which lists each boutique's weekly hours\./);
      expect(text, locale).not.toMatch(/Don't look up opening hours unless/); // the old wording, which had no scope
      expect(text, locale).toMatch(/Use the tools for every fact about products, prices, stock and opening hours/);
      // The sentence after it names its tool: "it" would point at find_boutiques.
      expect(text, locale).toContain('Use the date resolve_date returns, and the weekday it returns when you speak of that day, never a weekday from the customer');
    }
  });

  it('says it once more, in Japanese, in the Japanese instructions only: no resolve_date when no day came up', () => {
    // On the local model a gift question in Japanese made a pointless call to resolve_date nearly every time.
    const line = '日付が出ていないご相談では resolve_date を呼ばないでください。';
    expect(conciergeInstructions('ja', now)).toContain(line);
    expect(conciergeInstructions('en', now)).not.toContain(line);
  });

  it('forbids saying a visit is confirmed, in both reply languages', () => {
    for (const locale of ['en', 'ja'] as const) {
      expect(conciergeInstructions(locale, now), locale).toMatch(/Never say a visit is confirmed\. Say it is requested, and that the boutique will confirm it on LINE/);
    }
  });

  it('sends the model to resolve_date for every day a customer names, and never to a weekday from their words', () => {
    const text = conciergeInstructions('en', now);
    expect(text).toMatch(/Call resolve_date only when the customer names a day, never to find out today's date, which is given above/);
    expect(text).toMatch(/never work out or guess a date or weekday yourself/i);
    expect(text).toMatch(/call resolve_date for it first, on its own, before find_boutiques with a date and before request_appointment/);
    expect(text).toMatch(/weekday for a weekday name \("Saturday": week "this"; "next week's Saturday", 来週の土曜日: week "next"\)/);
    expect(text).toMatch(/relative for exactly "today", "tomorrow" or "day_after_tomorrow"/);
    expect(text).toMatch(/If the customer names no day, don't call it, don't pass a date to find_boutiques, and don't suggest a day yourself/);
    expect(text).toMatch(/never a weekday from the customer's words/i);
    expect(text).toMatch(/isPast is true/);
    expect(text).toMatch(/never say you will look something up and then stop/i);
    // What to send, and where the restatement after booking comes from.
    expect(text).toContain('YYYY-MM-DDTHH:MM:00+09:00');
    expect(text).toMatch(/the date from resolve_date/);
    expect(text).toMatch(/appointment\.requestedFor/);
    expect(text).toMatch(/never from what the customer asked/i);
    expect(text).toMatch(/no markdown/i);
  });
});

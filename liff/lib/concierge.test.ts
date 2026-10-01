import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SURFACE_HEADER, conciergeInstructions, handleConcierge } from './concierge';
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

  it("refuses resolve_date input that names no day, or a day it can't take, without running it", async () => {
    const refused = [{}, { weekday: '', relative: '', date: '' }, { relative: 'the day after tomorrow' }, { weekday: 'today' }, { date: '2026-10-3' }];
    for (const input of refused) {
      const { createMcpClient } = fakeMcp();
      const model = callsThenReplies('resolve_date', input);
      const events = eventsOf(await (await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient, model }))).text());
      expect(events.some((event) => event.type === 'tool-output-available'), JSON.stringify(input)).toBe(false);
      expect(events.some((event) => event.type === 'tool-input-error' || event.type === 'tool-output-error'), JSON.stringify(input)).toBe(true);
    }
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
      const { createMcpClient } = fakeMcp();
      const { model, label } = conciergeModel({ OLLAMA_BASE_URL: `http://127.0.0.1:${port}/v1` });
      const response = await handleConcierge(ask('Bearer mcp_at_x', hello), deps({ createMcpClient, model, modelLabel: label }));
      const text = await response.text();
      expect(text).toContain(`The concierge's model (qwen3-14b-32k (Ollama at http://127.0.0.1:${port}/v1)) isn't reachable`);
      expect(text).toContain('ANTHROPIC_API_KEY');
      expect(log).toHaveBeenCalledWith('[concierge]', expect.any(Error));
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

  it('sends the model to resolve_date for every day a customer names, and never to a weekday from their words', () => {
    const text = conciergeInstructions('en', now);
    expect(text).toMatch(/never work out or guess a date or weekday yourself/i);
    expect(text).toMatch(/call resolve_date for it first, on its own, before find_boutiques with a date and before request_appointment/);
    expect(text).toMatch(/weekday for a weekday on its own, relative only for exactly "today" or "tomorrow", date for any other day/);
    expect(text).toMatch(/If the customer names no day, don't call it, don't pass a date to find_boutiques or look up opening hours, and don't suggest a day yourself/);
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

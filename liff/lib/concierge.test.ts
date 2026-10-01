import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { SURFACE_HEADER, conciergeInstructions, handleConcierge } from './concierge';
import { conciergeModel } from './model';

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

  it('tells the model where its dates come from, what to send, and where the visit is restated from', () => {
    const text = conciergeInstructions('en', now);
    expect(text).toContain('YYYY-MM-DDTHH:MM:00+09:00');
    expect(text).toMatch(/never work out a date or weekday/i);
    expect(text).toMatch(/appointment\.requestedFor/);
    expect(text).toMatch(/never from what the customer asked/i);
    expect(text).toMatch(/no markdown/i);
  });
});

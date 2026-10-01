import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { SURFACE_HEADER, handleConcierge } from './concierge';
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

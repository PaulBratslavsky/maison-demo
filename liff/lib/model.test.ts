import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { conciergeModel } from './model';

const idOf = (model: unknown) => (model as { modelId: string }).modelId;

describe('conciergeModel', () => {
  it('uses Anthropic directly when ANTHROPIC_API_KEY is set', () => {
    const { model, label } = conciergeModel({ ANTHROPIC_API_KEY: 'sk-ant-test', AI_GATEWAY_API_KEY: 'gw' });
    expect(idOf(model)).toBe('claude-sonnet-5');
    expect(label).toBe('Claude Sonnet 5 (Anthropic)');
  });

  it('goes through Vercel AI Gateway with AI_GATEWAY_API_KEY', () => {
    expect(conciergeModel({ AI_GATEWAY_API_KEY: 'gw' }).model).toBe('anthropic/claude-sonnet-5');
  });

  it('otherwise uses the local model on Ollama, qwen3-14b-32k by default', () => {
    const { model, label } = conciergeModel({});
    expect(idOf(model)).toBe('qwen3-14b-32k');
    expect((model as { provider: string }).provider).toMatch(/^ollama/);
    expect(label).toBe('qwen3-14b-32k (Ollama at http://localhost:11434/v1)');
  });

  it('takes the local model and server from OLLAMA_MODEL and OLLAMA_BASE_URL', () => {
    const { model, label } = conciergeModel({ OLLAMA_MODEL: 'gemma4-26b-32k', OLLAMA_BASE_URL: 'http://127.0.0.1:11500/v1' });
    expect(idOf(model)).toBe('gemma4-26b-32k');
    expect(label).toContain('http://127.0.0.1:11500/v1');
  });

  it('asks Ollama to skip thinking (reasoning_effort "none")', async () => {
    let request: Record<string, unknown> = {};
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        request = JSON.parse(raw);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: 'qwen3-14b-32k',
            choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      await generateText({ model: conciergeModel({ OLLAMA_BASE_URL: `http://127.0.0.1:${port}/v1` }).model, prompt: 'Hello' });
    } finally {
      server.close();
    }
    expect(request).toMatchObject({ model: 'qwen3-14b-32k', reasoning_effort: 'none' });
  });
});

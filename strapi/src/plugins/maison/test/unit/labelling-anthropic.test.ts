import { describe, expect, it, vi } from 'vitest';
import { labelSystemPrompt, labelsSchema } from '../../server/src/domain/inquiry-criteria';
import labelling from '../../server/src/services/labelling';
import { fakeStrapi } from './fake-strapi';

// The real Anthropic provider, with the only fetch it can use: a stand-in that keeps each request and answers like the
// Messages API. Nothing here reaches a network, and the provider isn't given a chance to choose another fetch.
const sent = vi.hoisted(() => [] as Array<{ url: string; headers: Record<string, string>; body: Record<string, any> }>);
const LABELS = { kind: 'complaint', sentimentScore: -0.6, sentimentLabel: 'negative', answered: true, reason: 'The strap broke.', topic: 'repairs' };

vi.mock('@ai-sdk/anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-sdk/anthropic')>();
  const messagesApi = async (url: unknown, init: { headers: Record<string, string>; body: string }) => {
    sent.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify({
        id: 'msg_stand_in',
        type: 'message',
        role: 'assistant',
        model: 'claude-stand-in',
        content: [{ type: 'text', text: JSON.stringify(LABELS) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
  return { ...actual, createAnthropic: (options: object) => actual.createAnthropic({ ...options, fetch: messagesApi as typeof fetch }) };
});

const KEY = 'sk-ant-test-0123456789';
const EXCHANGE = { message: 'The strap on my bag broke after a week.', reply: 'I am sorry to hear that.', knowledgeFound: false, handedOff: false };

describe('what labelling sends to Anthropic', () => {
  const labelled = async () => {
    sent.length = 0;
    const service = labelling({ strapi: fakeStrapi({ config: { aiProvider: 'anthropic', aiApiKey: KEY } }) });
    const labels = await service.label(EXCHANGE);
    expect(sent).toHaveLength(1);
    return { labels, request: sent[0] };
  };

  it('is one request to the Messages API, with the configured key, for the default model, and its answer is the labels', async () => {
    const { labels, request } = await labelled();

    expect(labels).toEqual(LABELS);
    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.headers['x-api-key']).toBe(KEY);
    expect(request.body.model).toBe('claude-haiku-4-5-20251001');
    expect(request.body.system).toEqual([{ type: 'text', text: labelSystemPrompt() }]);
  });

  // Native structured output, never a forced tool: some Claude models refuse a forced tool.
  it('asks for native structured output in the shape of the labels, and forces no tool', async () => {
    const { request } = await labelled();

    expect(request.body.output_config.format).toMatchObject({ type: 'json_schema', schema: { type: 'object', additionalProperties: false } });
    expect(request.body.output_config.format.schema.required).toEqual(Object.keys(labelsSchema.shape));
    expect(request.body).not.toHaveProperty('tools');
    expect(request.body).not.toHaveProperty('tool_choice');
  });

  // Anthropic refuses these keywords in a schema. The provider moves them into the descriptions, and the SDK still checks the
  // answer against the whole schema.
  it("sends a schema without the keywords Anthropic's structured output refuses", async () => {
    const { request } = await labelled();

    expect(JSON.stringify(request.body.output_config.format.schema)).not.toMatch(/"(minimum|maximum|minLength|maxLength)"/);
  });

  // Some Claude models refuse a sampling parameter and a disabled thinking mode (a 400), and the labels need neither.
  it('sends no sampling or thinking parameters', async () => {
    const { request } = await labelled();

    for (const name of ['temperature', 'top_p', 'top_k', 'thinking']) expect(request.body, name).not.toHaveProperty(name);
  });
});

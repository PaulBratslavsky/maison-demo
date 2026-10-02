import { APICallError, NoObjectGeneratedError, RetryError } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { labelSystemPrompt, labelsSchema } from '../../server/src/domain/inquiry-criteria';
import labelling from '../../server/src/services/labelling';
import { fakeStrapi } from './fake-strapi';

// The real Anthropic provider, with the only fetch it can use: a stand-in that keeps each request and answers like the
// Messages API. Nothing here reaches a network, and the provider isn't given a chance to choose another fetch.
const sent = vi.hoisted(() => [] as Array<{ url: string; headers: Record<string, string>; body: Record<string, any> }>);
/** What the stand-in answers instead of the labels, when a test sets it: the API's failures, as the provider meets them. */
const failing = vi.hoisted(() => ({ with: undefined as undefined | (() => Response | Promise<Response>) }));
const LABELS = { kind: 'complaint', sentimentScore: -0.6, sentimentLabel: 'negative', answered: true, reason: 'The strap broke.', topic: 'repairs' };

vi.mock('@ai-sdk/anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-sdk/anthropic')>();
  const messagesApi = async (url: unknown, init: { headers: Record<string, string>; body: string }) => {
    sent.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    if (failing.with) return failing.with();
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

/*
 * What labelling.sweep makes of a failure rests on the classes the SDK throws for them, and these are those, from the real
 * provider: a status the API answers with (a refused key or model, or a request it rejects) is an APICallError with that
 * status, one request and no retry; a call that never gets an answer is retried twice, and ends as a RetryError; an answer
 * in the wrong shape is a NoObjectGeneratedError.
 */
describe('what the SDK throws when the Messages API fails', () => {
  const service = () => labelling({ strapi: fakeStrapi({ config: { aiProvider: 'anthropic', aiApiKey: KEY } }) });
  const thrownBy = (call: Promise<unknown>) => call.then(() => null, (error: unknown) => error);
  const failure = (status: number, type: string, message: string) => () =>
    new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    sent.length = 0;
  });
  afterEach(() => {
    failing.with = undefined;
    vi.useRealTimers();
  });

  it.each([
    [401, 'authentication_error', 'invalid x-api-key'],
    [403, 'permission_error', 'Your API key does not have permission to use the specified resource.'],
    // A model name Anthropic doesn't know, which is what a wrong AI_MODEL gives.
    [404, 'not_found_error', 'model: claude-nope'],
    // A request it rejects: the sweep counts that against the inquiry it was about, and goes on.
    [400, 'invalid_request_error', 'messages: text content blocks must be non-empty'],
  ])('is an APICallError with status %i, after one request, when the API answers it', async (status, type, message) => {
    failing.with = failure(status, type, message);

    const error = await thrownBy(service().label(EXCHANGE));

    expect(APICallError.isInstance(error)).toBe(true);
    expect((error as APICallError).statusCode).toBe(status);
    expect(sent).toHaveLength(1);
  });

  it('is a RetryError, after three requests, when the API keeps answering 529 overloaded', async () => {
    vi.useFakeTimers();
    failing.with = failure(529, 'overloaded_error', 'Overloaded');

    const outcome = thrownBy(service().label(EXCHANGE));
    await vi.advanceTimersByTimeAsync(2_000 + 4_000);
    const error = await outcome;

    expect(RetryError.isInstance(error)).toBe(true);
    expect(sent).toHaveLength(3);
  });

  it('is a RetryError over APICallErrors with no status, after three requests, when the connection never comes up', async () => {
    vi.useFakeTimers();
    failing.with = () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' }) });
    };

    const outcome = thrownBy(service().label(EXCHANGE));
    await vi.advanceTimersByTimeAsync(2_000 + 4_000);
    const error = await outcome;

    expect(RetryError.isInstance(error)).toBe(true);
    expect((error as RetryError).errors.every((attempt) => APICallError.isInstance(attempt) && attempt.statusCode === undefined)).toBe(true);
    expect(sent).toHaveLength(3);
  });

  it('is a NoObjectGeneratedError when the model answers in the wrong shape', async () => {
    failing.with = () =>
      new Response(
        JSON.stringify({
          id: 'msg_stand_in',
          type: 'message',
          role: 'assistant',
          model: 'claude-stand-in',
          content: [{ type: 'text', text: JSON.stringify({ ...LABELS, sentimentScore: 3 }) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    const error = await thrownBy(service().label(EXCHANGE));

    expect(NoObjectGeneratedError.isInstance(error)).toBe(true);
    expect(sent).toHaveLength(1);
  });
});

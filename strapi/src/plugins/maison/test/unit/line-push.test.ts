import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_TIMEOUT_MS,
  PUSH_TIMEOUT_MS,
  getDisplayName,
  pushMessages,
  type LineApi,
  type LineMessage,
} from '../../server/src/domain/line-push';

const API: LineApi = { apiBaseUrl: 'http://127.0.0.1:4010', token: 'tok' };
const CUSTOMER = `U${'a'.repeat(32)}`;
const HI: LineMessage[] = [{ type: 'text', text: 'Hi' }];

/** `fetch` as LINE answers it: `status`, with `body` as the text it sends. */
const answers = (status = 200, body = '') => vi.fn(async (_url: string, _init: RequestInit) => new Response(body, { status }));
/** `fetch` when no answer comes: it rejects with `error`. */
const rejects = (error: unknown) => vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => Promise.reject(error));

let fetchMock: ReturnType<typeof answers>;
const useFetch = (mock: ReturnType<typeof answers>) => {
  fetchMock = mock;
  vi.stubGlobal('fetch', mock);
};
/** What `fetch` was asked: where, and how. */
const requested = (call = 0) => {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, init };
};

// Nothing here reaches LINE: every test starts with fetch stubbed, and the API address is this machine's.
beforeEach(() => useFetch(answers()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pushMessages', () => {
  it("posts the messages to LINE's push endpoint with the token, and answers sent with LINE's body", async () => {
    useFetch(answers(200, '{"sentMessages":[{"id":"1","quoteToken":"q"}]}'));

    expect(await pushMessages(API, CUSTOMER, [{ type: 'text', text: 'Hi' }])).toEqual({
      status: 'sent',
      detail: '{"sentMessages":[{"id":"1","quoteToken":"q"}]}',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const { url, init } = requested();
    expect(url).toBe('http://127.0.0.1:4010/v2/bot/message/push');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ to: CUSTOMER, messages: [{ type: 'text', text: 'Hi' }] });
  });

  it('sends a flex message as it is given, ahead of the text that follows it', async () => {
    const flex: LineMessage = { type: 'flex', altText: 'Your visit is confirmed', contents: { type: 'bubble', body: { type: 'box' } } };
    await pushMessages(API, CUSTOMER, [flex, ...HI]);
    expect(JSON.parse(String(requested().init.body)).messages).toEqual([flex, ...HI]);
  });

  it("answers sent with LINE's status when it took the push and said nothing", async () => {
    useFetch(answers(200));
    expect(await pushMessages(API, CUSTOMER, HI)).toEqual({ status: 'sent', detail: 'LINE answered 200.' });
  });

  it("answers failed, with LINE's status and message, when LINE refuses the push", async () => {
    useFetch(answers(400, '{"message":"The request body has 1 error(s)"}'));
    expect(await pushMessages(API, CUSTOMER, HI)).toEqual({ status: 'failed', detail: 'LINE answered 400: The request body has 1 error(s)' });
  });

  it.each([
    ['no body', ''],
    ['a body that is not JSON', '<html>Bad Gateway</html>'],
    ['a body without a message', '{"details":[]}'],
    ['a message that is not text', '{"message":42}'],
  ])("answers failed, with LINE's status alone, when its refusal has %s", async (_label, body) => {
    useFetch(answers(500, body));
    expect(await pushMessages(API, CUSTOMER, HI)).toEqual({ status: 'failed', detail: 'LINE answered 500.' });
  });

  it("gives LINE 8 seconds, and answers failed when it doesn't answer in time", async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    useFetch(rejects(new DOMException('The operation was aborted due to timeout', 'TimeoutError')));

    expect(await pushMessages(API, CUSTOMER, HI)).toEqual({ status: 'failed', detail: "LINE didn't answer within 8 seconds." });

    expect(PUSH_TIMEOUT_MS).toBe(8000);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(8000);
    expect(requested().init.signal).toBe(timeout.mock.results[0].value);
  });

  it.each([
    [
      'fetch failed, and says why in its cause',
      Object.assign(new TypeError('fetch failed'), { cause: new Error('connect ECONNREFUSED 127.0.0.1:4010') }),
      "LINE couldn't be reached: connect ECONNREFUSED 127.0.0.1:4010",
    ],
    ['an error without a cause', new TypeError('Invalid URL'), "LINE couldn't be reached: Invalid URL"],
    ['something that is not an error', 'boom', "LINE couldn't be reached: boom"],
  ])("answers failed, with the reason, when LINE can't be reached: %s", async (_label, error, detail) => {
    useFetch(rejects(error));
    expect(await pushMessages(API, CUSTOMER, HI)).toEqual({ status: 'failed', detail });
  });
});

describe('getDisplayName', () => {
  it("asks LINE's Get profile API for the customer with the token, and answers the display name, trimmed", async () => {
    useFetch(answers(200, '{"displayName":"  Paul "}'));

    expect(await getDisplayName(API, 'Uabc')).toBe('Paul');

    expect(fetchMock).toHaveBeenCalledOnce();
    const { url, init } = requested();
    expect(url).toBe('http://127.0.0.1:4010/v2/bot/profile/Uabc');
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(init.body).toBeUndefined();
  });

  it('keeps the user ID inside the path it asks for', async () => {
    useFetch(answers(200, '{"displayName":"Paul"}'));
    await getDisplayName(API, 'U/../x?y#z');
    expect(requested().url).toBe('http://127.0.0.1:4010/v2/bot/profile/U%2F..%2Fx%3Fy%23z');
  });

  it.each([
    ['a 404, as for someone who is not a friend and has not written to the account', 404, '{"message":"Not found"}'],
    ['a refusal of the token', 401, '{"message":"Authentication failed"}'],
    ['a refusal, whatever name its body carries', 403, '{"displayName":"Paul"}'],
    ['a body that is not JSON', 200, 'nope'],
    ['a body that is null', 200, 'null'],
    ['a body without a displayName', 200, '{"userId":"Uabc"}'],
    ['a displayName that is not text', 200, '{"displayName":42}'],
    ['an empty displayName', 200, '{"displayName":""}'],
    ['a displayName of spaces only', 200, '{"displayName":"   "}'],
  ])('answers null for %s', async (_label, status, body) => {
    useFetch(answers(status, body));
    expect(await getDisplayName(API, 'Uabc')).toBeNull();
  });

  it.each([
    ['fetch rejects', new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:4010') })],
    ["LINE doesn't answer in time", new DOMException('The operation was aborted due to timeout', 'TimeoutError')],
  ])('answers null, and never throws, when %s', async (_label, error) => {
    useFetch(rejects(error));
    expect(await getDisplayName(API, 'Uabc')).toBeNull();
  });

  it('gives LINE 3 seconds for the name', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    useFetch(answers(200, '{"displayName":"Paul"}'));

    await getDisplayName(API, 'Uabc');

    expect(PROFILE_TIMEOUT_MS).toBe(3000);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(3000);
    expect(requested().init.signal).toBe(timeout.mock.results[0].value);
  });

  // The question's customerName holds 100 UTF-16 units (Strapi's maxLength counts them, so 100 emoji don't fit).
  it.each([
    ['a name of 150 letters to 99 and an ellipsis, 100 units', 'n'.repeat(150), `${'n'.repeat(99)}…`],
    ['a name of 150 emoji to 49 and an ellipsis, 99 units, none cut in half', '😀'.repeat(150), `${'😀'.repeat(49)}…`],
  ])('cuts %s', async (_label, name, cut) => {
    useFetch(answers(200, JSON.stringify({ displayName: name })));
    const displayName = await getDisplayName(API, 'Uabc');
    expect(displayName).toBe(cut);
    expect(displayName?.length).toBeLessThanOrEqual(100);
  });
});

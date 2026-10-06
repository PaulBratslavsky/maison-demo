import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_PATHS,
  CUSTOM_EVENT,
  STARTERS,
  adminTokenFrom,
  askTabState,
  canSend,
  customEventNote,
  errorNotice,
  isStatus,
  shouldSendOnKey,
  toolLineOf,
  toolResultOf,
  type PartLike,
} from '../../admin/src/assistant';
import { READ_TOOL_NAMES } from '../../server/src/assistant/tools';
import routes from '../../server/src/routes';
import { CUSTOM_EVENTS } from '../../server/src/services/assistant';

describe('the assistant paths', () => {
  // Admin routes are served at /maison<path>, so the page's paths are the server's own with that prefix.
  it("are the routes the server has, under the plugin's admin prefix", () => {
    const served = (method: string, handler: string) => {
      const found = routes.admin.routes.filter((route) => route.method === method && route.handler === handler);
      expect(found, `${method} ${handler}`).toHaveLength(1);
      return `/maison${found[0].path}`;
    };
    expect(ASSISTANT_PATHS).toEqual({ status: served('GET', 'assistant.status'), chat: served('POST', 'assistant.chat') });
  });
});

describe('STARTERS', () => {
  it('are the three questions the tab suggests, as the spec words them', () => {
    expect(STARTERS).toEqual(['What are customers asking about today?', 'Any complaints this week?', 'Which visits are waiting for staff?']);
  });
});

describe('isStatus', () => {
  it.each([
    [{ ready: true, model: 'claude-sonnet-5-5' }, true],
    [{ ready: false, reason: 'The assistant works with Anthropic only. AI_PROVIDER is set to openai.' }, true],
    [{ ready: true }, false],
    [{ ready: true, model: 5 }, false],
    [{ ready: false }, false],
    [{ ready: false, reason: 5 }, false],
    [{ ready: 'yes', model: 'm' }, false],
    [{ model: 'm' }, false],
    [{}, false],
    [null, false],
    [undefined, false],
    ['ready', false],
    [[], false],
    [{ error: { message: 'Forbidden' } }, false],
  ])('is %j: %s', (value, expected) => {
    expect(isStatus(value)).toBe(expected);
  });
});

describe('askTabState', () => {
  it('is loading until the status answers, with no error', () => {
    expect(askTabState(null, null)).toEqual({ kind: 'loading' });
  });

  it('says the assistant could not be checked, with the error, when the status call failed and there is no status', () => {
    expect(askTabState(null, 'Forbidden')).toEqual({ kind: 'failed', text: "Couldn't check the assistant: Forbidden" });
    expect(askTabState(null, 'The answer was not a status.')).toEqual({ kind: 'failed', text: "Couldn't check the assistant: The answer was not a status." });
  });

  it("shows the server's reason, and no text box, when the assistant is not ready", () => {
    expect(askTabState({ ready: false, reason: 'The assistant works with Anthropic only. AI_PROVIDER is set to openai.' }, null)).toEqual({
      kind: 'not-ready',
      text: 'The assistant works with Anthropic only. AI_PROVIDER is set to openai.',
    });
  });

  it('is the chat, with the model, when the assistant is ready', () => {
    expect(askTabState({ ready: true, model: 'claude-sonnet-5-5' }, null)).toEqual({ kind: 'chat', model: 'claude-sonnet-5-5' });
  });

  it('keeps showing a status it has when a later check failed', () => {
    expect(askTabState({ ready: true, model: 'claude-sonnet-5-5' }, 'Failed to fetch')).toEqual({ kind: 'chat', model: 'claude-sonnet-5-5' });
  });
});

describe('customEventNote', () => {
  it('words the two events the server adds', () => {
    expect(customEventNote('max_turns')).toBe('The assistant stopped after 6 steps. Ask a narrower question.');
    expect(customEventNote('declined')).toBe('The model declined to answer this. Rephrase the question.');
  });

  it('says nothing for any other event, the names every object has included', () => {
    for (const name of ['', 'structured-output.complete', 'approval-requested', 'toString', '__proto__', 'constructor']) expect(customEventNote(name), name).toBeNull();
  });

  it("uses the names the server's wrapper sends", () => {
    expect(CUSTOM_EVENT).toEqual(CUSTOM_EVENTS);
  });
});

describe('errorNotice', () => {
  const fromEvent = (code: string, message: string) => Object.assign(new Error(message), { code });

  it('shows the staff text of an error from a RUN_ERROR as it is: the server already wrote it', () => {
    expect(errorNotice(fromEvent('401', 'Anthropic refused the key. Check AI_API_KEY.'))).toEqual({ text: 'Anthropic refused the key. Check AI_API_KEY.', newChat: false });
    expect(errorNotice(fromEvent('timeout', 'The assistant took too long and stopped. Try again.'))).toEqual({
      text: 'The assistant took too long and stopped. Try again.',
      newChat: false,
    });
    expect(errorNotice(fromEvent('max_tokens', 'The answer was cut off because it was too long. Ask for less.')).newChat).toBe(false);
  });

  it('offers a new chat when the server says the chat is too long or cannot continue', () => {
    expect(errorNotice(fromEvent('chat_too_long', 'This chat is long. Start a new chat.'))).toEqual({ text: 'This chat is long. Start a new chat.', newChat: true });
    expect(errorNotice(fromEvent('history_rejected', "This chat can't continue. Start a new chat."))).toEqual({ text: "This chat can't continue. Start a new chat.", newChat: true });
  });

  it('falls back to the general text for a RUN_ERROR with no message', () => {
    expect(errorNotice(fromEvent('unknown', ''))).toEqual({ text: 'Something went wrong. Try again.', newChat: false });
  });

  it.each([
    [400, 'Something went wrong. Try again.', false],
    [403, "Your role can't use the assistant any more. Reload the page.", false],
    [413, 'This chat is long. Start a new chat.', true],
    [401, 'Something went wrong. Try again.', false],
    [500, 'Something went wrong. Try again.', false],
    [502, 'Something went wrong. Try again.', false],
  ])('reads an HTTP error by its status, as ai-client words it: %s', (status, text, newChat) => {
    expect(errorNotice(new Error(`HTTP error! status: ${status} Some Status Text`))).toEqual({ text, newChat });
    expect(errorNotice(new Error(`HTTP error! status: ${status} `))).toEqual({ text, newChat });
  });

  it.each([
    new TypeError('Failed to fetch'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new TypeError('Load failed'),
    new Error('Failed to fetch'),
    new Error('Network error'),
    new Error('load failed'),
  ])('says the connection was lost for %s', (error) => {
    expect(errorNotice(error)).toEqual({ text: 'The connection to Strapi was lost. Try again.', newChat: false });
  });

  // A bug in the page throws a TypeError too. Only the messages browsers give for a failed request mean a lost connection.
  it('does not take a TypeError from the page itself for a lost connection', () => {
    for (const message of ['Cannot read properties of undefined', "undefined is not an object (evaluating 'x.y')", 'x is not a function', 'terminated']) {
      expect(errorNotice(new TypeError(message)), message).toEqual({ text: 'Something went wrong. Try again.', newChat: false });
    }
  });

  it('gives the general text for anything else, undefined and things that are not errors included', () => {
    for (const error of [undefined, null, 'oops', 42, {}, new Error('Something broke'), new Error('')]) {
      expect(errorNotice(error), String(error)).toEqual({ text: 'Something went wrong. Try again.', newChat: false });
    }
  });

  it('never shows a message that is not staff text: not a stack, a JSON parse error or a provider body', () => {
    for (const message of ['x is not a function\n    at foo (bar.js:1:1)', 'Unexpected token < in JSON at position 0', '401 {"error":{"message":"invalid x-api-key"}}']) {
      expect(errorNotice(new Error(message)).text, message).toBe('Something went wrong. Try again.');
    }
  });

  it('does not mistake an error with a numeric code, such as an abort, for a RUN_ERROR', () => {
    expect(errorNotice(Object.assign(new Error('The operation was aborted.'), { code: 20 }))).toEqual({ text: 'Something went wrong. Try again.', newChat: false });
  });
});

describe('canSend', () => {
  const ok = { text: 'Which visits are waiting?', busy: false, ready: true };

  it('is true for a message, when the assistant is ready and not answering', () => {
    expect(canSend(ok)).toBe(true);
  });

  it('is false while the assistant is answering: a second message waits, and nothing is queued out of sight', () => {
    expect(canSend({ ...ok, busy: true })).toBe(false);
  });

  it('is false until the assistant is ready', () => {
    expect(canSend({ ...ok, ready: false })).toBe(false);
  });

  it.each(['', ' ', '   ', '\n', ' \n\t ', '　', '　 　'])('is false for a message with nothing but spaces in it: %j', (text) => {
    expect(canSend({ ...ok, text })).toBe(false);
  });

  it('is true for a message with spaces around its words, in either language', () => {
    expect(canSend({ ...ok, text: '  hello  ' })).toBe(true);
    expect(canSend({ ...ok, text: '今日の問い合わせは？' })).toBe(true);
  });
});

describe('shouldSendOnKey', () => {
  const key = (event: Partial<{ key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }>) => ({ key: '', shiftKey: false, ...event });

  it('sends on Enter', () => {
    expect(shouldSendOnKey(key({ key: 'Enter', keyCode: 13 }))).toBe(true);
    expect(shouldSendOnKey(key({ key: 'Enter' }))).toBe(true);
  });

  it('adds a line break, and sends nothing, on Shift+Enter', () => {
    expect(shouldSendOnKey(key({ key: 'Enter', shiftKey: true }))).toBe(false);
  });

  // Staff typing Japanese press Enter to confirm a conversion. That Enter belongs to the input method.
  it('sends nothing while an input method composes: Enter there confirms the conversion', () => {
    expect(shouldSendOnKey(key({ key: 'Enter', isComposing: true }))).toBe(false);
    expect(shouldSendOnKey(key({ key: 'Enter', isComposing: true, keyCode: 229 }))).toBe(false);
  });

  it('sends nothing for keyCode 229, which Safari reports for the Enter that ends a composition, after it has stopped composing', () => {
    expect(shouldSendOnKey(key({ key: 'Enter', isComposing: false, keyCode: 229 }))).toBe(false);
  });

  it('ignores every other key', () => {
    for (const other of ['a', ' ', 'Tab', 'Escape', 'ArrowUp', 'Backspace', 'Process']) expect(shouldSendOnKey(key({ key: other })), other).toBe(false);
  });
});

describe('toolResultOf', () => {
  const parts: PartLike[] = [
    { type: 'text', content: 'Looking.' },
    { type: 'tool-call', id: 'call-1', name: 'list_requests', arguments: '{}', state: 'complete' },
    { type: 'tool-result', toolCallId: 'call-1', content: '{"requests":[]}', state: 'complete' },
    { type: 'tool-call', id: 'call-2', name: 'list_questions', arguments: '{}', state: 'input-complete' },
  ];

  it('finds the tool-result part of a call by its id', () => {
    expect(toolResultOf(parts, 'call-1')).toBe(parts[2]);
  });

  it('finds nothing for a call with no result yet, or an id nobody has', () => {
    expect(toolResultOf(parts, 'call-2')).toBeUndefined();
    expect(toolResultOf(parts, 'call-9')).toBeUndefined();
    expect(toolResultOf([], 'call-1')).toBeUndefined();
  });

  it('does not take a tool-call part with that id for a result', () => {
    expect(toolResultOf([parts[1]], 'call-1')).toBeUndefined();
  });
});

describe('toolLineOf', () => {
  const call = (name: string, fields: Partial<PartLike> = {}): PartLike => ({ type: 'tool-call', id: 'call-1', name, arguments: '{}', state: 'complete', ...fields });
  const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ n: index }));

  it.each([
    ['list_requests', 'requests'],
    ['list_questions', 'questions'],
    ['list_inquiries', 'inquiries'],
    ['inquiry_counts', 'inquiry counts'],
    ['search_knowledge', 'knowledge'],
    ['search_products', 'products'],
    ['view_product', 'product'],
  ])('calls %s "%s"', (name, what) => {
    expect(toolLineOf(call(name, { state: 'input-complete' }), undefined)).toEqual({ text: `Maison · ${what} …`, tone: 'running' });
  });

  it('has a line for each of the seven read tools, and only those', () => {
    for (const name of READ_TOOL_NAMES) expect(toolLineOf(call(name), undefined), name).not.toBeNull();
  });

  it.each(['awaiting-input', 'input-streaming', 'input-complete', 'approval-requested', 'approval-responded'])('is running, with an ellipsis, while the state is %s', (state) => {
    expect(toolLineOf(call('list_inquiries', { state }), undefined)).toEqual({ text: 'Maison · inquiries …', tone: 'running' });
  });

  it('counts the results: the length of the array the tool answered', () => {
    expect(toolLineOf(call('list_inquiries', { output: { inquiries: rows(12), capped: false } }), undefined)).toEqual({ text: 'Maison · inquiries ✓ 12 results', tone: 'ok' });
    expect(toolLineOf(call('list_requests', { output: { requests: rows(3), capped: false } }), undefined)).toEqual({ text: 'Maison · requests ✓ 3 results', tone: 'ok' });
    expect(toolLineOf(call('list_questions', { output: { questions: rows(50), capped: true } }), undefined)).toEqual({ text: 'Maison · questions ✓ 50 results', tone: 'ok' });
    expect(toolLineOf(call('search_knowledge', { output: { locale: 'en', entries: rows(4) } }), undefined)).toEqual({ text: 'Maison · knowledge ✓ 4 results', tone: 'ok' });
    expect(toolLineOf(call('search_products', { output: { locale: 'en', total: 8, products: rows(8) } }), undefined)).toEqual({ text: 'Maison · products ✓ 8 results', tone: 'ok' });
  });

  it('says "1 result" for one, and "0 results" for none', () => {
    expect(toolLineOf(call('list_requests', { output: { requests: rows(1), capped: false } }), undefined)?.text).toBe('Maison · requests ✓ 1 result');
    expect(toolLineOf(call('list_requests', { output: { requests: [], capped: false } }), undefined)?.text).toBe('Maison · requests ✓ 0 results');
  });

  it('has no count for inquiry_counts and view_product', () => {
    expect(toolLineOf(call('inquiry_counts', { output: { needsAnswer: 4, complaint: 2, praise: 1, notLabelled: 3 } }), undefined)).toEqual({ text: 'Maison · inquiry counts ✓', tone: 'ok' });
    expect(toolLineOf(call('view_product', { output: { product: { slug: 'weekender-50' } } }), undefined)).toEqual({ text: 'Maison · product ✓', tone: 'ok' });
  });

  it('shows the tick with no count when a done call has no output to count', () => {
    expect(toolLineOf(call('list_inquiries'), undefined)).toEqual({ text: 'Maison · inquiries ✓', tone: 'ok' });
    expect(toolLineOf(call('list_inquiries', { output: { inquiries: 'not a list' } }), undefined)?.text).toBe('Maison · inquiries ✓');
  });

  // A reference that matches nothing, or an inquiry deleted since the row loaded: the tool answers not_found.
  it('turns red with the tool message when the tool answered not_found, and never shows "0 results" for it', () => {
    const output = { error: { code: 'not_found', message: 'No request APT-4812.', hint: 'Check the reference.' } };
    expect(toolLineOf(call('list_requests', { output }), undefined)).toEqual({ text: 'Maison · requests ✕ No request APT-4812.', tone: 'error' });
    const inquiry = { error: { code: 'not_found', message: 'No inquiry "k9".', hint: 'Reload the Inquiries tab: it may have been deleted.' } };
    expect(toolLineOf(call('list_inquiries', { output: inquiry }), undefined)).toEqual({ text: 'Maison · inquiries ✕ No inquiry "k9".', tone: 'error' });
  });

  it('turns red for any tool failure: the state error, a result part in error, or an output with an error', () => {
    expect(toolLineOf(call('list_questions', { state: 'error', output: { error: 'The tool exploded.' } }), undefined)).toEqual({ text: 'Maison · questions ✕ The tool exploded.', tone: 'error' });
    expect(toolLineOf(call('list_questions'), { type: 'tool-result', toolCallId: 'call-1', content: '{}', state: 'error', error: 'The tool failed in a way.' })).toEqual({
      text: 'Maison · questions ✕ The tool failed in a way.',
      tone: 'error',
    });
    expect(toolLineOf(call('list_questions', { output: { error: { code: 'invalid_input', message: 'since: Use YYYY-MM-DD.', hint: 'x' } } }), undefined)?.tone).toBe('error');
  });

  it('uses the message of the output when it has one, then the result part, then a general line', () => {
    expect(toolLineOf(call('list_questions', { state: 'error', output: { error: { message: 'From the output.' } } }), { type: 'tool-result', toolCallId: 'call-1', state: 'error', error: 'From the part.' })?.text).toBe('Maison · questions ✕ From the output.');
    expect(toolLineOf(call('list_questions', { state: 'error' }), { type: 'tool-result', toolCallId: 'call-1', state: 'error', error: 'From the part.' })?.text).toBe('Maison · questions ✕ From the part.');
    expect(toolLineOf(call('list_questions', { state: 'error' }), undefined)?.text).toBe('Maison · questions ✕ The tool failed.');
    expect(toolLineOf(call('list_questions', { state: 'error', output: { error: {} } }), undefined)?.text).toBe('Maison · questions ✕ The tool failed.');
  });

  it('is red even while the state still says input-complete, when the result part is in error', () => {
    expect(toolLineOf(call('list_requests', { state: 'input-complete' }), { type: 'tool-result', toolCallId: 'call-1', state: 'error', error: 'Gone.' })).toEqual({ text: 'Maison · requests ✕ Gone.', tone: 'error' });
  });

  it('has no line for the draft tools, whose card is their result, or for any other name', () => {
    for (const name of ['draft_reply', 'draft_answer', 'confirm_appointment', 'something_else', '', 'toString', '__proto__']) expect(toolLineOf(call(name), undefined), name).toBeNull();
  });

  it('has no line for a part that is not a tool call', () => {
    expect(toolLineOf({ type: 'text', content: 'Hello' }, undefined)).toBeNull();
    expect(toolLineOf({ type: 'tool-result', toolCallId: 'call-1', name: 'list_requests', state: 'complete' }, undefined)).toBeNull();
    expect(toolLineOf({ type: 'thinking', content: '...' }, undefined)).toBeNull();
  });
});

describe('adminTokenFrom', () => {
  const COOKIE = 'jwtToken';

  it('reads the token Strapi stores in localStorage, a JSON string', () => {
    expect(adminTokenFrom({ stored: '"abc.def.ghi"', cookie: '', cookieName: COOKIE })).toBe('abc.def.ghi');
  });

  it('reads a bare token too', () => {
    expect(adminTokenFrom({ stored: 'abc.def.ghi', cookie: '', cookieName: COOKIE })).toBe('abc.def.ghi');
  });

  it('prefers localStorage to the cookie', () => {
    expect(adminTokenFrom({ stored: '"from-storage"', cookie: 'jwtToken=from-cookie', cookieName: COOKIE })).toBe('from-storage');
  });

  it('reads the cookie when there is nothing in localStorage, and decodes it', () => {
    expect(adminTokenFrom({ stored: null, cookie: 'theme=dark; jwtToken=abc.def%2Bghi; other=1', cookieName: COOKIE })).toBe('abc.def+ghi');
    expect(adminTokenFrom({ stored: null, cookie: 'jwtToken=abc', cookieName: COOKIE })).toBe('abc');
    expect(adminTokenFrom({ stored: '', cookie: 'jwtToken=abc', cookieName: COOKIE })).toBe('abc');
  });

  it('reads the cookie under the name the admin build was given', () => {
    expect(adminTokenFrom({ stored: null, cookie: 'jwtToken=old; strapi_jwt=new', cookieName: 'strapi_jwt' })).toBe('new');
  });

  it('does not take another cookie whose name ends the same way', () => {
    expect(adminTokenFrom({ stored: null, cookie: 'notjwtToken=wrong; xjwtToken=wrong', cookieName: COOKIE })).toBeNull();
    expect(adminTokenFrom({ stored: null, cookie: 'jwtToken2=wrong', cookieName: COOKIE })).toBeNull();
  });

  it('is null when there is no token anywhere, or it is empty', () => {
    expect(adminTokenFrom({ stored: null, cookie: '', cookieName: COOKIE })).toBeNull();
    expect(adminTokenFrom({ stored: null, cookie: 'theme=dark', cookieName: COOKIE })).toBeNull();
    expect(adminTokenFrom({ stored: null, cookie: 'jwtToken=', cookieName: COOKIE })).toBeNull();
    expect(adminTokenFrom({ stored: '""', cookie: '', cookieName: COOKIE })).toBeNull();
  });

  it('ignores a stored value that is not a token, and goes on to the cookie', () => {
    expect(adminTokenFrom({ stored: 'null', cookie: 'jwtToken=abc', cookieName: COOKIE })).toBe('abc');
    expect(adminTokenFrom({ stored: '{"a":1}', cookie: 'jwtToken=abc', cookieName: COOKIE })).toBe('abc');
  });

  it('keeps a cookie value that is not valid encoding as it is, instead of throwing', () => {
    expect(adminTokenFrom({ stored: null, cookie: 'jwtToken=100%', cookieName: COOKIE })).toBe('100%');
  });

  it('keeps an equals sign inside the value: tokens can be padded', () => {
    expect(adminTokenFrom({ stored: null, cookie: 'jwtToken=abc==', cookieName: COOKIE })).toBe('abc==');
  });
});

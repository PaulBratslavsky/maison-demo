// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskTab } from '../../admin/src/components/assistant/AskTab';
import { AssistantProvider, useAssistant } from '../../admin/src/components/assistant/AssistantProvider';
import { renderInTheme } from './render';

/*
 * The Ask tab as staff meet it: the real provider, with `useChat` and the real connection adapter, over a stand-in for Strapi's fetch client
 * (the status call) and for `fetch` (the chat stream). Nothing here reaches a server or a model.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => client }));

const TOOLS = [
  { name: 'list_requests', label: 'Visit requests' },
  { name: 'inquiry_counts', label: 'Inquiry counts' },
];
const READY = { ready: true, model: 'claude-sonnet-5-5', tools: TOOLS };
const NOT_SET_UP = { ready: false, reason: 'The assistant works with Anthropic only. AI_PROVIDER is set to openai.' };

const encoder = new TextEncoder();
const event = (type: string, extra: Record<string, unknown> = {}) => ({ type, timestamp: Date.now(), threadId: 't', runId: 'r', ...extra });
/** A server-sent event stream of AG-UI events, as the server's chat route answers one. It ends after the last event. */
const stream = (events: Array<Record<string, unknown>>) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const item of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
/** An answer in one text message. Each has a message ID of its own: a message with an ID the chat already has is added to that message. */
let answers = 0;
const answer = (text: string) => {
  answers += 1;
  const messageId = `answer-${answers}`;
  return [
    event('RUN_STARTED'),
    event('TEXT_MESSAGE_START', { messageId, role: 'assistant' }),
    event('TEXT_MESSAGE_CONTENT', { messageId, delta: text }),
    event('TEXT_MESSAGE_END', { messageId }),
    event('RUN_FINISHED', { finishReason: 'stop' }),
  ];
};

/** A chat as the server holds it: its row, and its messages. */
interface SavedChat {
  documentId: string;
  title: string;
  updatedAt: string;
  messages: unknown[];
}
const staffSays = (id: string, content: string) => ({ id, role: 'user', parts: [{ type: 'text', content }] });
const assistantSays = (id: string, content: string) => ({ id, role: 'assistant', parts: [{ type: 'text', content }] });
const savedChat = (documentId: string, title: string, messages: unknown[] = [staffSays(`${documentId}-u`, title), assistantSays(`${documentId}-a`, `The answer to ${title}`)], updatedAt = '2026-10-06T00:00:00.000Z'): SavedChat => ({
  documentId,
  title,
  updatedAt,
  messages,
});
/** The 404 Strapi's fetch client throws for a chat that is not there. */
const notFound = () => Object.assign(new Error('There is no saved chat with that ID.'), { status: 404 });

/**
 * The page over stand-ins: Strapi's fetch client, which answers the status and holds the admin's saved chats (newest first, as the server
 * lists them), and `fetch`, which answers each chat request with the next stream scripted for it. `server.rows` is what is saved.
 */
const world = ({ status = READY as unknown, chat = [] as Array<() => Response | Promise<Response>>, saved = [] as SavedChat[], mount = true } = {}) => {
  const rows: SavedChat[] = [...saved];
  let created = 0;
  let clock = Date.parse('2026-10-07T00:00:00.000Z');
  const row = ({ messages: _messages, ...summary }: SavedChat) => summary;
  const idOf = (url: string) => decodeURIComponent(url.split('/').at(-1) as string);

  for (const method of [client.get, client.post, client.put, client.del]) method.mockReset();
  client.get.mockImplementation(async (url: string) => {
    if (url === '/maison/assistant/status') {
      if (status instanceof Error) throw status;
      return { data: status };
    }
    if (url === '/maison/conversations') return { data: { conversations: rows.map(row) } };
    if (url.startsWith('/maison/conversations/')) {
      const found = rows.find((chatRow) => chatRow.documentId === idOf(url));
      if (!found) throw notFound();
      return { data: { conversation: found } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  client.post.mockImplementation(async (url: string, body: { title: string; messages: unknown[] }) => {
    if (url !== '/maison/conversations') throw new Error(`Unexpected POST ${url}`);
    created += 1;
    clock += 1000;
    const made = { documentId: `saved-${created}`, title: body.title, messages: body.messages, updatedAt: new Date(clock).toISOString() };
    rows.unshift(made);
    return { data: { conversation: row(made) } };
  });
  client.put.mockImplementation(async (url: string, body: { title?: string; messages?: unknown[] }) => {
    const index = rows.findIndex((chatRow) => chatRow.documentId === idOf(url));
    if (index < 0) throw notFound();
    clock += 1000;
    const [found] = rows.splice(index, 1);
    const changed = { ...found, ...body, updatedAt: new Date(clock).toISOString() };
    rows.unshift(changed as SavedChat);
    return { data: { conversation: row(changed as SavedChat) } };
  });
  client.del.mockImplementation(async (url: string) => {
    const index = rows.findIndex((chatRow) => chatRow.documentId === idOf(url));
    if (index < 0) throw notFound();
    rows.splice(index, 1);
    return { data: { documentId: idOf(url) } };
  });

  const answers = [...chat];
  const fetchMock = vi.fn(async () => {
    const next = answers.shift();
    if (!next) throw new Error('No answer was scripted for this request.');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  /** Puts the Ask tab, or another tree, inside the provider. A test that changes the stand-ins first passes `mount: false` and calls this itself. */
  const show = (ui: ReactElement = <AskTab />) =>
    renderInTheme(
      <AssistantProvider>
        {ui}
      </AssistantProvider>
    );
  if (mount) show();
  return { fetchMock, rows, show };
};

const box = () => screen.getByRole('textbox', { name: 'Chat message' }) as HTMLTextAreaElement;
const region = () => screen.getByRole('region', { name: 'Chat messages' });
/** Waits until the chat is on the screen and shows `text` in its messages. */
const shows = async (text: string) => within(await screen.findByRole('region', { name: 'Chat messages' })).findByText(text);
/** The body of the request the page sent to the chat route. */
const sentBody = (fetchMock: ReturnType<typeof vi.fn>, index = 0) => JSON.parse((fetchMock.mock.calls[index] as unknown as [string, { body: string }])[1].body);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('before the chat', () => {
  it('shows "Checking the assistant…" with a loader, and no text box, until the status answers', async () => {
    let answerStatus: (value: unknown) => void = () => {};
    client.get.mockReset();
    client.get.mockImplementation(() => new Promise((resolve) => (answerStatus = resolve)));
    renderInTheme(
      <AssistantProvider>
        <AskTab />
      </AssistantProvider>
    );
    expect(screen.getByText('Checking the assistant…')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    answerStatus({ data: READY });
    expect(await screen.findByRole('textbox', { name: 'Chat message' })).toBeTruthy();
    expect(screen.queryByText('Checking the assistant…')).toBeNull();
  });

  it('shows the reason and Check again, and no text box, when the assistant is not set up', async () => {
    world({ status: NOT_SET_UP });
    expect(await screen.findByRole('heading', { name: "The assistant isn't set up" })).toBeTruthy();
    expect(screen.getByText(NOT_SET_UP.reason)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('asks again when Check again is pressed, and shows the chat once the assistant is ready', async () => {
    world({ status: NOT_SET_UP });
    await screen.findByRole('button', { name: 'Check again' });
    client.get.mockImplementation(async () => ({ data: READY }));
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('textbox', { name: 'Chat message' })).toBeTruthy();
  });

  it("says the assistant could not be checked, in the server's words, when the status call fails, with Check again", async () => {
    world({ status: new Error('Forbidden') });
    expect(await screen.findByText("Couldn't check the assistant: Forbidden")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says so, with no chat, for an admin who has no assistant at all', () => {
    renderInTheme(<AskTab />);
    expect(screen.getByText('The assistant is not available for your role.')).toBeTruthy();
  });
});

describe('the chat area', () => {
  it('has the tools, the model and New chat in the top bar, the starters in the empty state, and the composer', async () => {
    world();
    expect(await screen.findByRole('button', { name: 'Tools (2)' })).toBeTruthy();
    expect(screen.getByText('claude-sonnet-5-5')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Which visits are waiting for staff?' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('a turn', () => {
  it('sends what staff typed with Enter, draws the answer as Markdown, and brings Send back', async () => {
    const table = ['| Reference | Status |', '| --- | --- |', '| APT-4821 | requested |'].join('\n');
    const { fetchMock } = world({ chat: [() => stream(answer(table))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    // The question is in the chat at once, and the box is empty again.
    expect(await within(region()).findByText('Which visits are waiting?')).toBeTruthy();
    expect(box().value).toBe('');
    // The answer comes as a table.
    expect(await within(region()).findByRole('table')).toBeTruthy();
    expect(within(region()).getByRole('cell', { name: 'APT-4821' })).toBeTruthy();
    // The turn is over: Stop has gone, and Send waits only for the next question.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    // The request carried the question, to the assistant's chat route.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/maison/assistant/chat');
    expect(sentBody(fetchMock).messages.at(-1)).toMatchObject({ role: 'user', content: 'Which visits are waiting?' });
    // The empty state has gone, and New chat works.
    expect(screen.queryByText('Ask Maison')).toBeNull();
    expect((screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends a starter as it is written, and leaves what staff typed in the box', async () => {
    const { fetchMock } = world({ chat: [() => stream(answer('Two visits wait.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'A half-written question');

    await userEvent.click(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }));

    expect(await within(region()).findByText('Two visits wait.')).toBeTruthy();
    expect(sentBody(fetchMock).messages.at(-1)).toMatchObject({ role: 'user', content: 'Which visits are waiting for staff?' });
    expect(box().value).toBe('A half-written question');
  });

  it('puts the focus back in the text box after a send, from a starter and from the Send button alike, so the next question can be typed', async () => {
    world({ chat: [() => stream(answer('One.')), () => stream(answer('Two.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.click(screen.getByRole('button', { name: 'Which visits are waiting for staff?' }));
    await within(region()).findByText('One.');
    expect(document.activeElement).toBe(box());

    await userEvent.type(box(), 'And the questions?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await within(region()).findByText('Two.');
    expect(document.activeElement).toBe(box());
  });

  // Radix unmounts the content of a tab that is not open, so the page keeps the chat in the provider, above the tabs.
  it('keeps the chat and what staff typed while they look at another tab, and shows both when they come back', async () => {
    const { show } = world({ chat: [() => stream(answer('Two visits wait.'))], mount: false });
    const view = show();
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'Which visits are waiting?{Enter}');
    await within(region()).findByText('Two visits wait.');
    await userEvent.type(box(), 'And the questions');

    view.rerender(
      <AssistantProvider>
        <p>Another tab</p>
      </AssistantProvider>
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    view.rerender(
      <AssistantProvider>
        <AskTab />
      </AssistantProvider>
    );

    expect(box().value).toBe('And the questions');
    expect(within(region()).getByText('Two visits wait.')).toBeTruthy();
  });

  it('shows a tool box for a tool call, in the order it came, closed, and opens it to the result', async () => {
    const calls = [
      event('RUN_STARTED'),
      event('TEXT_MESSAGE_START', { messageId: 'm1', role: 'assistant' }),
      event('TEXT_MESSAGE_CONTENT', { messageId: 'm1', delta: 'Let me look. ' }),
      event('TEXT_MESSAGE_END', { messageId: 'm1' }),
      event('TOOL_CALL_START', { toolCallId: 'c1', toolCallName: 'list_requests', parentMessageId: 'm1' }),
      event('TOOL_CALL_ARGS', { toolCallId: 'c1', delta: '{}' }),
      event('TOOL_CALL_END', { toolCallId: 'c1', toolCallName: 'list_requests', input: {} }),
      event('TOOL_CALL_RESULT', { toolCallId: 'c1', messageId: 'r1', content: JSON.stringify({ requests: [{ reference: 'APT-4821', note: '<customer_note>For my father.</customer_note>' }], capped: false }) }),
      event('TEXT_MESSAGE_START', { messageId: 'm2', role: 'assistant' }),
      event('TEXT_MESSAGE_CONTENT', { messageId: 'm2', delta: 'One visit waits.' }),
      event('TEXT_MESSAGE_END', { messageId: 'm2' }),
      event('RUN_FINISHED', { finishReason: 'stop' }),
    ];
    world({ chat: [() => stream(calls)] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    const header = await within(region()).findByRole('button', { name: /Tool: list_requests/ });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(header.textContent).toContain('1 result'));
    await userEvent.click(header);
    const body = region().querySelector('pre') as HTMLElement;
    expect(body.textContent).toContain('"reference": "APT-4821"');
    expect(body.textContent).toContain('For my father.');
    expect(body.textContent).not.toContain('customer_note');
  });

  it('shows the error in a red alert, takes the failed question back into the box, and clears the error on the next send', async () => {
    const failed = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })];
    world({ chat: [() => stream(failed), () => stream(answer('Fine.'))] });
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');

    const alert = (await screen.findByText('Anthropic is busy. Try again in a minute.')).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    // The turn that failed before anything came back leaves the chat, and its question goes back in the box.
    await waitFor(() => expect(box().value).toBe('Which visits are waiting?'));
    expect(within(region()).queryByText('Which visits are waiting?')).toBeNull();
    expect(screen.getByText('Ask Maison')).toBeTruthy();

    await userEvent.type(box(), '{Enter}');
    expect(await within(region()).findByText('Fine.')).toBeTruthy();
    expect(screen.queryByText('Anthropic is busy. Try again in a minute.')).toBeNull();
  });

  it('shows the words "New chat" on the button when the chat is too long to go on, and starts over when it is pressed', async () => {
    const tooLong = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'This chat is long. Start a new chat.', code: 'chat_too_long' })];
    world({ chat: [() => stream(answer('Hello.')), () => stream(tooLong)] });
    await screen.findByRole('textbox', { name: 'Chat message' });
    await userEvent.type(box(), 'First{Enter}');
    await within(region()).findByText('Hello.');
    await userEvent.type(box(), 'Second{Enter}');

    await screen.findByText('This chat is long. Start a new chat.');
    const newChat = screen.getByRole('button', { name: 'New chat' });
    expect(newChat.textContent).toBe('New chat');

    await userEvent.click(newChat);
    expect(screen.queryByText('This chat is long. Start a new chat.')).toBeNull();
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New chat' }).textContent).toBe('');
  });

  it('stops an answer that is on its way with Stop, keeps what came, and shows no error', async () => {
    let started: () => void = () => {};
    const began = new Promise<void>((resolve) => (started = resolve));
    const slow = (signal?: AbortSignal) =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
            started();
            signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')));
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    world();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => slow(init?.signal)));
    await screen.findByRole('textbox', { name: 'Chat message' });

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');
    await began;
    expect(await within(region()).findByText('Looking into it')).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    expect(within(region()).getByText('Looking into it')).toBeTruthy();
    // The design system's own live region is an empty alert, so what is looked for is an alert with words in it.
    expect(Array.from(document.querySelectorAll('[role="alert"]')).filter((alert) => alert.textContent)).toEqual([]);
  });
});

describe('saved chats', () => {
  const sidebar = () => screen.getByLabelText('Saved chats');
  const openSidebar = async () => userEvent.click(screen.getByRole('button', { name: 'History' }));
  const rowOf = (title: string) => within(sidebar()).getByRole('button', { name: title });
  const titlesInSidebar = () =>
    within(sidebar())
      .getAllByRole('button')
      .filter((button) => !button.getAttribute('aria-label') && button.textContent !== 'New chat')
      .map((button) => button.textContent);
  /** Types a question and presses Enter, then waits until the turn is over. */
  const ask = async (text: string, answerText?: string) => {
    await userEvent.type(box(), `${text}{Enter}`);
    if (answerText) await shows(answerText);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
  };

  it('has the sidebar closed at first and out of reach, and opens it with History, which then says "Hide history"', async () => {
    world();
    await screen.findByRole('textbox', { name: 'Chat message' });
    expect(sidebar().hasAttribute('inert')).toBe(true);
    expect(sidebar().getAttribute('aria-hidden')).toBe('true');

    await openSidebar();
    expect(sidebar().hasAttribute('inert')).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide history' }).getAttribute('aria-expanded')).toBe('true');
    expect(within(sidebar()).getByText('No saved chats yet.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Hide history' }));
    expect(sidebar().hasAttribute('inert')).toBe(true);
  });

  it('shows the empty state, and loads no chat, when the admin has no saved chat', async () => {
    world();
    await screen.findByRole('textbox', { name: 'Chat message' });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/maison/conversations'));
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(client.get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/maison\/conversations\/./));
  });

  it('reopens the most recent chat when the assistant is ready, and lists the others, newest first, with the open one marked', async () => {
    world({ saved: [savedChat('c2', 'Any complaints this week?'), savedChat('c1', 'Which visits are waiting?')] });
    expect(await shows('The answer to Any complaints this week?')).toBeTruthy();
    expect(within(region()).getByText('Any complaints this week?')).toBeTruthy();
    expect(screen.queryByText('Ask Maison')).toBeNull();
    expect(client.get).toHaveBeenCalledWith('/maison/conversations/c2');
    expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1');

    await openSidebar();
    expect(titlesInSidebar()).toEqual(['Any complaints this week?', 'Which visits are waiting?']);
    expect(rowOf('Any complaints this week?').getAttribute('aria-current')).toBe('true');
    expect(rowOf('Which visits are waiting?').hasAttribute('aria-current')).toBe(false);
  });

  it('does not reopen the most recent chat over a chat staff have begun while the list was loading', async () => {
    let answerList: (value: unknown) => void = () => {};
    const { show } = world({ saved: [savedChat('c1', 'An older chat')], chat: [() => stream(answer('Two visits wait.'))], mount: false });
    client.get.mockImplementation(async (url: string) => {
      if (url === '/maison/assistant/status') return { data: READY };
      if (url === '/maison/conversations') return new Promise((resolve) => (answerList = resolve));
      throw new Error(`Unexpected GET ${url}`);
    });
    show();
    await screen.findByRole('textbox', { name: 'Chat message' });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/maison/conversations'));

    await ask('Which visits are waiting?', 'Two visits wait.');
    answerList({ data: { conversations: [{ documentId: 'c1', title: 'An older chat', updatedAt: '2026-10-06T00:00:00.000Z' }] } });
    await openSidebar();
    await waitFor(() => expect(titlesInSidebar()).toContain('An older chat'));

    expect(within(region()).getByText('Two visits wait.')).toBeTruthy();
    expect(within(region()).queryByText('The answer to An older chat')).toBeNull();
    expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1');
  });

  it('does not reopen the most recent chat over a turn that failed while the list was loading: staff have begun, though nothing of it is left in the chat', async () => {
    let answerList: (value: unknown) => void = () => {};
    const failed = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })];
    const { show } = world({ saved: [savedChat('c1', 'An older chat')], chat: [() => stream(failed)], mount: false });
    client.get.mockImplementation(async (url: string) => {
      if (url === '/maison/assistant/status') return { data: READY };
      if (url === '/maison/conversations') return new Promise((resolve) => (answerList = resolve));
      throw new Error(`Unexpected GET ${url}`);
    });
    show();
    await screen.findByRole('textbox', { name: 'Chat message' });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/maison/conversations'));

    await userEvent.type(box(), 'Which visits are waiting?{Enter}');
    await screen.findByText('Anthropic is busy. Try again in a minute.');
    await waitFor(() => expect(box().value).toBe('Which visits are waiting?'));
    answerList({ data: { conversations: [{ documentId: 'c1', title: 'An older chat', updatedAt: '2026-10-06T00:00:00.000Z' }] } });
    await openSidebar();
    await waitFor(() => expect(titlesInSidebar()).toContain('An older chat'));

    expect(screen.getByText('Anthropic is busy. Try again in a minute.')).toBeTruthy();
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1');
  });

  it('opens a saved chat that has no messages, as one the server could not read, as an empty chat, and saves the next turn into it', async () => {
    world({ saved: [savedChat('c1', 'A chat that could not be read', [])], chat: [() => stream(answer('Two visits wait.'))] });
    expect(await screen.findByText('Ask Maison')).toBeTruthy();
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/maison/conversations/c1'));
    await openSidebar();
    await waitFor(() => expect(rowOf('A chat that could not be read').getAttribute('aria-current')).toBe('true'));

    await ask('Which visits are waiting?', 'Two visits wait.');

    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    expect(client.put.mock.calls[0][0]).toBe('/maison/conversations/c1');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('opens a chat that is chosen in the sidebar, in place of the one on the screen, and marks it', async () => {
    world({ saved: [savedChat('c2', 'Any complaints this week?'), savedChat('c1', 'Which visits are waiting?')] });
    await shows('The answer to Any complaints this week?');
    await openSidebar();

    await userEvent.click(rowOf('Which visits are waiting?'));

    expect(await shows('The answer to Which visits are waiting?')).toBeTruthy();
    expect(within(region()).queryByText('The answer to Any complaints this week?')).toBeNull();
    expect(rowOf('Which visits are waiting?').getAttribute('aria-current')).toBe('true');
  });

  it('opens the chat that was chosen last when two are chosen one after the other: the answer that comes late is dropped', async () => {
    let answerFirst: () => void = () => {};
    world({ saved: [savedChat('c3', 'Newest chat'), savedChat('c2', 'Middle chat'), savedChat('c1', 'Oldest chat')] });
    await shows('The answer to Newest chat');
    const get = client.get.getMockImplementation() as (url: string) => Promise<unknown>;
    client.get.mockImplementation((url: string) => (url === '/maison/conversations/c1' ? new Promise((resolve) => (answerFirst = () => resolve(get(url)))) : get(url)));
    await openSidebar();

    await userEvent.click(rowOf('Oldest chat'));
    await userEvent.click(rowOf('Middle chat'));
    await shows('The answer to Middle chat');
    answerFirst();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(within(region()).getByText('The answer to Middle chat')).toBeTruthy();
    expect(within(region()).queryByText('The answer to Oldest chat')).toBeNull();
    expect(rowOf('Middle chat').getAttribute('aria-current')).toBe('true');
  });

  it('waits for a save that is on its way before it opens another chat, so the chat that is left is saved as it was', async () => {
    let finishSave: () => void = () => {};
    world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')], chat: [() => stream(answer('More.'))] });
    await shows('The answer to Newer chat');
    const put = client.put.getMockImplementation() as (...args: any[]) => Promise<unknown>;
    client.put.mockImplementation((...args: any[]) => new Promise((resolve) => (finishSave = () => resolve(put(...args)))));
    await ask('Tell me more', 'More.');
    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    await openSidebar();

    await userEvent.click(rowOf('Older chat'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1');

    finishSave();
    expect(await shows('The answer to Older chat')).toBeTruthy();
    expect(client.put.mock.calls[0][0]).toBe('/maison/conversations/c2');
  });

  // Anthropic refuses a history whose signed thinking block was changed, so what is opened is what is saved again, key for key.
  it('keeps every key of every part of a chat it opens, so it saves the chat again as it was: a thinking part keeps its signature', async () => {
    const thinking = { type: 'thinking', content: 'Let me look.', signature: 'EqQBCkYIBRgC', providerMetadata: { anthropic: { index: 0 } } };
    const messages = [staffSays('u1', 'Which visits are waiting?'), { id: 'a1', role: 'assistant', createdAt: '2026-10-07T01:02:03.000Z', parts: [thinking, { type: 'text', content: 'Two visits wait.' }] }];
    world({ saved: [savedChat('c1', 'Which visits are waiting?', messages)], chat: [() => stream(answer('Three.'))] });
    await shows('Two visits wait.');

    await ask('And the questions?', 'Three.');

    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    const saved = client.put.mock.calls[0][1].messages as Array<{ parts: unknown[] }>;
    expect(saved).toHaveLength(4);
    expect(saved[1]).toEqual(messages[1]);
    expect(saved[1].parts[0]).toEqual(thinking);
  });

  it('counts a reopened chat toward what is sent: the request carries every message, the saved ones and the new question', async () => {
    const { fetchMock } = world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [() => stream(answer('Three.'))] });
    await shows('The answer to Which visits are waiting?');

    await ask('And the questions?', 'Three.');

    expect(sentBody(fetchMock).messages.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant', 'user']);
  });

  describe('saving', () => {
    it('creates the chat after the first turn, with the question as its title and the cleaned messages, and updates it after the next', async () => {
      const { rows } = world({ chat: [() => stream(answer('Two visits wait.')), () => stream(answer('Three questions.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });

      await ask('Which visits are waiting?', 'Two visits wait.');
      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      const [url, body] = client.post.mock.calls[0];
      expect(url).toBe('/maison/conversations');
      expect(body.title).toBe('Which visits are waiting?');
      expect(body.messages.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant']);
      expect(body.messages[1].parts[0]).toMatchObject({ type: 'text', content: 'Two visits wait.' });

      await ask('And the questions?', 'Three questions.');
      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
      expect(client.put.mock.calls[0][0]).toBe('/maison/conversations/saved-1');
      expect(client.put.mock.calls[0][1].messages).toHaveLength(4);
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(rows).toHaveLength(1);
    });

    it('lists the new chat in the sidebar, marked as the open one, once', async () => {
      world({ chat: [() => stream(answer('Two visits wait.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('Which visits are waiting?', 'Two visits wait.');
      await openSidebar();
      await waitFor(() => expect(titlesInSidebar()).toEqual(['Which visits are waiting?']));
      expect(rowOf('Which visits are waiting?').getAttribute('aria-current')).toBe('true');
    });

    it('cuts the title to 80 characters', async () => {
      world({ chat: [() => stream(answer('Fine.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('x'.repeat(200), 'Fine.');
      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      expect(client.post.mock.calls[0][1].title).toBe('x'.repeat(80));
    });

    it('saves a chat of a reopened chat in the same chat, and moves it to the top of the list', async () => {
      world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')], chat: [() => stream(answer('More.'))] });
      await shows('The answer to Newer chat');
      await openSidebar();
      await userEvent.click(rowOf('Older chat'));
      await shows('The answer to Older chat');

      await ask('Tell me more', 'More.');

      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
      expect(client.put.mock.calls[0][0]).toBe('/maison/conversations/c1');
      expect(client.post).not.toHaveBeenCalled();
      await waitFor(() => expect(titlesInSidebar()).toEqual(['Older chat', 'Newer chat']));
    });

    // The turn was stopped in the middle of a tool call. The saved chat must not hold the call: reopened, it would show "…" for ever, and
    // the next send would replay a call with no answer to Anthropic.
    it('saves only the cleaned messages: a tool call that Stop cut off is not in the saved chat', async () => {
      const aborted = (signal?: AbortSignal) =>
        new Response(
          new ReadableStream({
            start(controller) {
              const events = [
                event('RUN_STARTED'),
                event('TEXT_MESSAGE_START', { messageId: 'm1', role: 'assistant' }),
                event('TEXT_MESSAGE_CONTENT', { messageId: 'm1', delta: 'Looking. ' }),
                event('TEXT_MESSAGE_END', { messageId: 'm1' }),
                event('TOOL_CALL_START', { toolCallId: 'c1', toolCallName: 'list_requests', parentMessageId: 'm1' }),
                event('TOOL_CALL_ARGS', { toolCallId: 'c1', delta: '{"sta' }),
              ];
              for (const item of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
              signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')));
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      world();
      vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => aborted(init?.signal)));
      await screen.findByRole('textbox', { name: 'Chat message' });

      await userEvent.type(box(), 'Which visits are waiting?{Enter}');
      await within(region()).findByRole('button', { name: /Tool: list_requests/ });
      await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));

      await waitFor(() => expect(client.post).toHaveBeenCalled());
      const saved = client.post.mock.calls.at(-1)?.[1].messages as Array<{ parts: Array<{ type: string; content?: string }> }>;
      expect(saved.map((message) => message.parts.map((part) => part.type))).toEqual([['text'], ['text']]);
      expect(saved[1].parts[0].content).toBe('Looking. ');
      expect(within(region()).queryByRole('button', { name: /Tool: list_requests/ })).toBeNull();
    });

    it('saves nothing for a turn that failed before anything came back, and nothing for an empty chat', async () => {
      world({ chat: [() => stream([event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })])] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await userEvent.type(box(), 'Which visits are waiting?{Enter}');
      await screen.findByText('Anthropic is busy. Try again in a minute.');
      await waitFor(() => expect(box().value).toBe('Which visits are waiting?'));
      expect(client.post).not.toHaveBeenCalled();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('does not save a chat again when nothing in it has changed', async () => {
      world({ saved: [savedChat('c1', 'Which visits are waiting?')] });
      await shows('The answer to Which visits are waiting?');
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(client.post).not.toHaveBeenCalled();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('says the chat could not be saved, and goes on: the answer stays, and the next turn saves it', async () => {
      world({ chat: [() => stream(answer('Two visits wait.')), () => stream(answer('Three questions.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      client.post.mockRejectedValueOnce(new Error('Gateway timeout'));

      await ask('Which visits are waiting?', 'Two visits wait.');

      expect(await screen.findByText("Couldn't save this chat.")).toBeTruthy();
      expect(screen.getByText("Couldn't save this chat.").closest('[role="alert"]')).not.toBeNull();
      expect(within(region()).getByText('Two visits wait.')).toBeTruthy();
      client.post.mockImplementation(async (_url: string, body: { title: string }) => ({ data: { conversation: { documentId: 'saved-9', title: body.title, updatedAt: '2026-10-07T05:00:00.000Z' } } }));

      await ask('And the questions?', 'Three questions.');
      await waitFor(() => expect(screen.queryByText("Couldn't save this chat.")).toBeNull());
      expect(client.post).toHaveBeenCalledTimes(2);
      expect(client.post.mock.calls[1][1].messages).toHaveLength(4);
    });

    it('saves a chat that was deleted elsewhere as a new chat, with no error', async () => {
      const { rows } = world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [() => stream(answer('More.'))] });
      await shows('The answer to Which visits are waiting?');
      rows.splice(0, rows.length);

      await ask('Tell me more', 'More.');

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      expect(client.put).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Couldn't save this chat.")).toBeNull();
      expect(rows).toHaveLength(1);
    });
  });

  describe('New chat', () => {
    it('starts an empty chat, and keeps the old one in the sidebar: nothing is deleted', async () => {
      world({ chat: [() => stream(answer('Two visits wait.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('Which visits are waiting?', 'Two visits wait.');
      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));

      await userEvent.click(screen.getByRole('button', { name: 'New chat' }));

      expect(screen.getByText('Ask Maison')).toBeTruthy();
      expect(within(region()).queryByText('Two visits wait.')).toBeNull();
      await openSidebar();
      expect(titlesInSidebar()).toEqual(['Which visits are waiting?']);
      expect(within(sidebar()).getByText('Which visits are waiting?').closest('button')?.hasAttribute('aria-current')).toBe(false);
      expect(client.del).not.toHaveBeenCalled();
    });

    it('saves the chat as it is when New chat stops an answer on its way: what had come stays in the chat it belongs to', async () => {
      const slow = (signal?: AbortSignal) =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
              signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')));
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      world();
      vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => slow(init?.signal)));
      await screen.findByRole('textbox', { name: 'Chat message' });
      await userEvent.type(box(), 'Which visits are waiting?{Enter}');
      await within(region()).findByText('Looking into it');

      await userEvent.click(screen.getByRole('button', { name: 'New chat' }));

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      const saved = client.post.mock.calls[0][1] as { title: string; messages: Array<{ role: string; parts: Array<{ content?: string }> }> };
      expect(saved.title).toBe('Which visits are waiting?');
      expect(saved.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
      expect(saved.messages[1].parts[0].content).toBe('Looking into it');
      expect(screen.getByText('Ask Maison')).toBeTruthy();
    });

    it('gives the old chat back when its row is pressed, and saves the next chat as a chat of its own', async () => {
      world({ chat: [() => stream(answer('Two visits wait.')), () => stream(answer('Fine.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('Which visits are waiting?', 'Two visits wait.');
      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      await userEvent.click(screen.getByRole('button', { name: 'New chat' }));

      await ask('Any complaints this week?', 'Fine.');

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(2));
      expect(client.put).not.toHaveBeenCalled();
      await openSidebar();
      await waitFor(() => expect(titlesInSidebar()).toEqual(['Any complaints this week?', 'Which visits are waiting?']));
      await userEvent.click(rowOf('Which visits are waiting?'));
      expect(await shows('Two visits wait.')).toBeTruthy();
      expect(within(region()).queryByText('Fine.')).toBeNull();
    });

    it('leaves what staff have typed in the box', async () => {
      world({ chat: [() => stream(answer('Two visits wait.'))] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      await ask('Which visits are waiting?', 'Two visits wait.');
      await userEvent.type(box(), 'A half-written question');
      await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
      expect(box().value).toBe('A half-written question');
    });

    it('keeps the draft across a change of chat too', async () => {
      world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')] });
      await shows('The answer to Newer chat');
      await userEvent.type(box(), 'Not sent yet');
      await openSidebar();
      await userEvent.click(rowOf('Older chat'));
      await shows('The answer to Older chat');
      expect(box().value).toBe('Not sent yet');
    });
  });

  describe('deleting', () => {
    it('deletes a chat at once, from its trash button, and takes its row out', async () => {
      world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')] });
      await shows('The answer to Newer chat');
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Older chat' }));

      await waitFor(() => expect(titlesInSidebar()).toEqual(['Newer chat']));
      expect(client.del).toHaveBeenCalledExactlyOnceWith('/maison/conversations/c1');
      // The chat that was open stays open.
      expect(within(region()).getByText('The answer to Newer chat')).toBeTruthy();
    });

    it('empties the screen when the chat that is deleted is the open one', async () => {
      world({ saved: [savedChat('c1', 'Which visits are waiting?')] });
      await shows('The answer to Which visits are waiting?');
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting?' }));

      expect(await screen.findByText('Ask Maison')).toBeTruthy();
      expect(within(region()).queryByText('The answer to Which visits are waiting?')).toBeNull();
      expect(within(sidebar()).getByText('No saved chats yet.')).toBeTruthy();
    });

    it('saves the next chat as a new one after the open chat was deleted', async () => {
      world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [() => stream(answer('Fine.'))] });
      await shows('The answer to Which visits are waiting?');
      await openSidebar();
      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting?' }));
      await screen.findByText('Ask Maison');

      await ask('Any complaints this week?', 'Fine.');

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
      expect(client.put).not.toHaveBeenCalled();
    });

    // A save that ran after the delete would find no chat to save into, and say "Couldn't save this chat."
    it('waits for a save that is on its way before it deletes the chat', async () => {
      let finishSave: (value: unknown) => void = () => {};
      world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [() => stream(answer('More.'))] });
      await shows('The answer to Which visits are waiting?');
      const put = client.put.getMockImplementation() as (...args: any[]) => Promise<unknown>;
      client.put.mockImplementation((...args: any[]) => new Promise((resolve) => (finishSave = () => resolve(put(...args)))));
      await ask('Tell me more', 'More.');
      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting?' }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(client.del).not.toHaveBeenCalled();

      finishSave(undefined);
      await waitFor(() => expect(client.del).toHaveBeenCalledExactlyOnceWith('/maison/conversations/c1'));
      expect(screen.queryByText("Couldn't save this chat.")).toBeNull();
    });

    it('says so, and keeps the row, when the chat could not be deleted', async () => {
      world({ saved: [savedChat('c1', 'Which visits are waiting?')] });
      await shows('The answer to Which visits are waiting?');
      client.del.mockRejectedValueOnce(Object.assign(new Error('Server Error'), { status: 500 }));
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Which visits are waiting?' }));

      expect(await screen.findByText("Couldn't delete that chat.")).toBeTruthy();
      expect(titlesInSidebar()).toEqual(['Which visits are waiting?']);
      expect(within(region()).getByText('The answer to Which visits are waiting?')).toBeTruthy();
    });

    it('takes the row out when the chat was already gone: it is deleted all the same', async () => {
      const { rows } = world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')] });
      await shows('The answer to Newer chat');
      rows.splice(1, 1);
      await openSidebar();

      await userEvent.click(screen.getByRole('button', { name: 'Delete chat: Older chat' }));

      await waitFor(() => expect(titlesInSidebar()).toEqual(['Newer chat']));
      expect(screen.queryByText("Couldn't delete that chat.")).toBeNull();
    });
  });

  describe('while an answer comes', () => {
    it('switches off the sidebar: its rows, New chat and the trash buttons', async () => {
      const slow = () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [slow] });
      await shows('The answer to Which visits are waiting?');
      await openSidebar();
      await userEvent.type(box(), 'Another question{Enter}');
      await shows('Looking into it');

      for (const button of within(sidebar()).getAllByRole('button') as HTMLButtonElement[]) expect(button.disabled, button.getAttribute('aria-label') ?? button.textContent ?? '').toBe(true);
      await userEvent.click(rowOf('Which visits are waiting?'));
      expect(within(region()).getByText('Looking into it')).toBeTruthy();
      expect(client.get).not.toHaveBeenCalledWith('/maison/conversations/c1', expect.anything());
    });
  });

  it('does nothing when it is asked to open or delete a chat while an answer comes: that is part of what the page offers', async () => {
    const Probe = () => {
      const assistant = useAssistant();
      return (
        <>
          <button onClick={() => void assistant?.history.openChat('c1')}>probe open</button>
          <button onClick={() => void assistant?.history.deleteChat('c1')}>probe delete</button>
        </>
      );
    };
    const slow = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const item of answer('Looking into it').slice(0, 3)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    const { rows, show } = world({ saved: [savedChat('c1', 'Which visits are waiting?')], chat: [slow], mount: false });
    show(
      <>
        <AskTab />
        <Probe />
      </>
    );
    await shows('The answer to Which visits are waiting?');
    await userEvent.type(box(), 'Another question{Enter}');
    await within(region()).findByText('Looking into it');

    await userEvent.click(screen.getByRole('button', { name: 'probe open' }));
    await userEvent.click(screen.getByRole('button', { name: 'probe delete' }));

    expect(within(region()).getByText('Looking into it')).toBeTruthy();
    expect(client.del).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    // The chat was opened once, when Ask opened, and not again for the probe.
    expect(client.get.mock.calls.filter(([url]) => url === '/maison/conversations/c1')).toHaveLength(1);
  });

  describe('when a call to the saved chats fails', () => {
    it('says the list could not be loaded, and the chat still works', async () => {
      const { show } = world({ chat: [() => stream(answer('Two visits wait.'))], mount: false });
      client.get.mockImplementation(async (url: string) => {
        if (url === '/maison/assistant/status') return { data: READY };
        throw new Error('Gateway timeout');
      });
      show();
      expect(await screen.findByText("Couldn't load your saved chats.")).toBeTruthy();
      await userEvent.type(box(), 'Which visits are waiting?{Enter}');
      expect(await shows('Two visits wait.')).toBeTruthy();
    });

    it('says the chat could not be opened, and loads the list again: the chat may be gone', async () => {
      const { rows } = world({ saved: [savedChat('c2', 'Newer chat'), savedChat('c1', 'Older chat')] });
      await shows('The answer to Newer chat');
      await openSidebar();
      rows.splice(1, 1);
      const listCalls = client.get.mock.calls.filter(([url]) => url === '/maison/conversations').length;

      await userEvent.click(rowOf('Older chat'));

      expect(await screen.findByText("Couldn't open that chat.")).toBeTruthy();
      await waitFor(() => expect(client.get.mock.calls.filter(([url]) => url === '/maison/conversations').length).toBe(listCalls + 1));
      await waitFor(() => expect(titlesInSidebar()).toEqual(['Newer chat']));
      expect(within(region()).getByText('The answer to Newer chat')).toBeTruthy();
    });

    it("shows a turn's error before a problem with the saved chats, when both are there", async () => {
      const failed = [event('RUN_STARTED'), event('RUN_ERROR', { message: 'Anthropic is busy. Try again in a minute.', code: '529' })];
      world({ chat: [() => stream(answer('Two visits wait.')), () => stream(failed)] });
      await screen.findByRole('textbox', { name: 'Chat message' });
      client.post.mockRejectedValue(new Error('Gateway timeout'));
      await ask('Which visits are waiting?', 'Two visits wait.');
      expect(await screen.findByText("Couldn't save this chat.")).toBeTruthy();

      await userEvent.type(box(), 'And the questions?{Enter}');

      expect(await screen.findByText('Anthropic is busy. Try again in a minute.')).toBeTruthy();
      expect(screen.queryByText("Couldn't save this chat.")).toBeNull();
    });
  });
});

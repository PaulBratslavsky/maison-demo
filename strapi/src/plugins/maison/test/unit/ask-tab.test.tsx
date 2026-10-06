// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskTab } from '../../admin/src/components/assistant/AskTab';
import { AssistantProvider } from '../../admin/src/components/assistant/AssistantProvider';
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

const world = ({ status = READY as unknown, chat = [] as Array<() => Response | Promise<Response>> } = {}) => {
  client.get.mockReset();
  client.get.mockImplementation(async (url: string) => {
    if (url === '/maison/assistant/status') {
      if (status instanceof Error) throw status;
      return { data: status };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const scripted = [...chat];
  const fetchMock = vi.fn(async () => {
    const next = scripted.shift();
    if (!next) throw new Error('No answer was scripted for this request.');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  const view = renderInTheme(
    <AssistantProvider>
      <AskTab />
    </AssistantProvider>
  );
  return { fetchMock, view };
};

const box = () => screen.getByRole('textbox', { name: 'Chat message' }) as HTMLTextAreaElement;
const region = () => screen.getByRole('region', { name: 'Chat messages' });
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
    const { view } = world({ chat: [() => stream(answer('Two visits wait.'))] });
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

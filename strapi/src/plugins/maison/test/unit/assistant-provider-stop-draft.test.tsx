// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantProvider, useAssistant } from '../../admin/src/components/assistant/AssistantProvider';
import type { PartLike } from '../../admin/src/assistant';
import assistantService from '../../server/src/services/assistant';
import { assistantWorld } from './fake-assistant-world';
import { fakeStrapi } from './fake-strapi';
import { fakeTextAdapter, textTurn, toolCallTurn, type ScriptedTurn } from './fake-text-adapter';
import { renderInTheme } from './render';

/*
 * Stop in the last moments of a draft call. The server ends a draft run with the call, a snapshot of the messages and a RUN_FINISHED that carries
 * the interrupt, one after another. ai-client reads them as they arrive and processes each one a moment later, so a Stop that lands between the
 * arrival and the processing leaves chunks that are still processed afterwards. Before the fix, those ran the page's draft tool, which started
 * the follow-up request by itself (Stop did not stop), or, with the provider's cleanup in between, ended in a request the server refused and a red
 * "Something went wrong. Try again." after Stop. After Stop, nothing may run by itself.
 *
 * The real provider, the real chat client, the real service and a scripted model. The fetch is counted: every call to it is a request to the server.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => client }));

// What the page's draft tool returned each time ai-client ran it. A tool that shows the draft returns { shown: true }.
const ran = vi.hoisted(() => ({ outputs: [] as unknown[] }));
vi.mock('@tanstack/ai/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@tanstack/ai/client')>();
  return {
    ...original,
    toolDefinition: (config: Parameters<typeof original.toolDefinition>[0]) => {
      const definition = original.toolDefinition(config);
      const client = definition.client.bind(definition);
      return {
        ...definition,
        client: (execute: (...args: any[]) => unknown) =>
          client(((...args: any[]) => {
            const output = execute(...args);
            ran.outputs.push(output);
            return output;
          }) as never),
      };
    },
  };
});

const DRAFT = { documentId: 'inq4abc', text: 'Thank you for telling us.' };
const ASK = 'Draft a reply to inquiry inq4abc.';

/**
 * Stops the chat the first time it sees a draft call that is open: it has no output yet. That is the moment after the call has been read from the
 * stream and before the page's tool has run. It shows what the provider holds, and has a button for a second question.
 */
const Probe = ({ stopOn = 'draft' }: { stopOn?: 'draft' | 'text' }) => {
  const assistant = useAssistant();
  const stopped = React.useRef(false);
  const messages = assistant?.messages ?? [];
  const calls = messages.flatMap((message) => (message.parts as PartLike[]).filter((part) => part.type === 'tool-call'));
  const openDraft = calls.some((call) => call.name === 'draft_reply' && call.output === undefined);
  const hasText = messages.some((message) => message.role === 'assistant' && (message.parts as PartLike[]).some((part) => part.type === 'text' && part.content));
  const open = stopOn === 'draft' ? openDraft : hasText;
  React.useEffect(() => {
    if (open && !stopped.current) {
      stopped.current = true;
      assistant?.stop();
    }
  });
  if (!assistant) return null;
  return (
    <>
      <button type="button" onClick={() => void assistant.send(ASK, 'box')}>
        Ask
      </button>
      <button type="button" onClick={() => void assistant.send('And the questions?', 'box')}>
        Ask again
      </button>
      <p data-testid="busy">{String(assistant.busy)}</p>
      <p data-testid="notice">{assistant.notice?.text ?? ''}</p>
      <p data-testid="draft-box">{assistant.draft}</p>
      <p data-testid="calls">{calls.map((call) => `${call.name}:${call.state}:${call.output === undefined ? 'no output' : 'output'}`).join(',')}</p>
      <p data-testid="said">
        {messages.map((message) => `${message.role}:${(message.parts as PartLike[]).filter((part) => part.type === 'text').map((part) => part.content).join('')}`).join('|')}
      </p>
    </>
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  ran.outputs.length = 0;
});

/** The chat request goes to the server's own service, with a scripted model, and each request is counted. */
const world = (turns: Parameters<typeof fakeTextAdapter>[0]) => {
  assistantWorld(client);
  const { adapter, requests } = fakeTextAdapter(turns);
  const service = assistantService({ strapi: fakeStrapi({ config: { aiProvider: 'anthropic', aiApiKey: 'sk-ant-test' } }) });
  const fetched: Array<Record<string, any>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      fetched.push(body);
      return service.turn(await service.parseBody(body), { ability: { can: () => true }, adminId: 1, responseController: new AbortController(), adapterFor: () => adapter });
    })
  );
  return { fetched, requests };
};

const show = (stopOn: 'draft' | 'text' = 'draft') =>
  renderInTheme(
    <AssistantProvider started>
      <Probe stopOn={stopOn} />
    </AssistantProvider>
  );
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

describe('Stop in the last moments of a draft call', () => {
  it('stops for good: no second request, no error, the question stays in the chat, and the draft call does not run', async () => {
    const { fetched, requests } = world([toolCallTurn('draft_reply', DRAFT), textTurn('The draft is ready.')]);
    show();
    await waitFor(() => expect(client.get).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(fetched).toHaveLength(1));
    await settle();

    // Nothing started by itself after Stop: the one request is the one staff made, and the model was asked once.
    expect(fetched).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(screen.getByTestId('busy').textContent).toBe('false');
    // Staff pressed Stop, so there is nothing to tell them.
    expect(screen.getByTestId('notice').textContent).toBe('');
    // The question is still there, and the box did not get it back. The call that was cut off is gone, and no card was made from it.
    expect(screen.getByTestId('said').textContent).toContain('user:' + ASK);
    expect(screen.getByTestId('draft-box').textContent).toBe('');
    expect(screen.getByTestId('calls').textContent).toBe('');
    // The page's draft tool did not show a draft: it was reached after Stop, and left alone.
    expect(ran.outputs.filter((output) => (output as { shown?: boolean }).shown === true)).toEqual([]);
  });

  it('can send again afterwards: the interrupt of the stopped run does not block the next message', async () => {
    const { fetched } = world([toolCallTurn('draft_reply', DRAFT), textTurn('A second answer.')]);
    show();
    await waitFor(() => expect(client.get).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(fetched).toHaveLength(1));
    await settle();

    await userEvent.click(screen.getByRole('button', { name: 'Ask again' }));

    await waitFor(() => expect(screen.getByTestId('said').textContent).toContain('assistant:A second answer.'));
    expect(fetched).toHaveLength(2);
    // The second request is an ordinary one: it carries no resume of the stopped run.
    expect(fetched[1].resume).toBeUndefined();
    expect(screen.getByTestId('notice').textContent).toBe('');
  });

  // The same Stop, with an error behind it: the run fails right after its first words. Staff pressed Stop, so a failure of the run they stopped is not
  // news to them. Without the rule, the notice and the question put back in the box would appear after Stop.
  it('shows no error for a failure that arrives after Stop, and does not take the question out of the chat', async () => {
    const failing: ScriptedTurn = [
      { type: 'RUN_STARTED' },
      { type: 'TEXT_MESSAGE_START', messageId: 'm-late', role: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm-late', delta: 'Looking', content: 'Looking' },
      { type: 'RUN_ERROR', message: 'overloaded', code: '529', error: { message: 'overloaded', code: '529' } },
    ];
    const { fetched } = world([failing]);
    show('text');
    await waitFor(() => expect(client.get).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(fetched).toHaveLength(1));
    await settle();

    expect(screen.getByTestId('notice').textContent).toBe('');
    expect(screen.getByTestId('said').textContent).toContain('user:' + ASK);
    expect(screen.getByTestId('draft-box').textContent).toBe('');
  });
});

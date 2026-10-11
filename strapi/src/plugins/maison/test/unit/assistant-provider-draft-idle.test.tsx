// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantProvider, useAssistant } from '../../admin/src/components/assistant/AssistantProvider';
import type { PartLike } from '../../admin/src/assistant';
import assistantService from '../../server/src/services/assistant';
import { assistantWorld } from './fake-assistant-world';
import { fakeStrapi } from './fake-strapi';
import { fakeTextAdapter, textTurn, toolCallTurn } from './fake-text-adapter';
import { renderInTheme } from './render';

/*
 * The provider's cleanup takes out a tool call that was cut off: one with no output and no tool-result, whenever nothing is answering. A draft call has
 * no output while the page's draft tool runs. The cleanup must never meet it then, or the card would never appear and the follow-up would replay a call
 * with no answer. The chat is loading from the call to the end of the follow-up, so the cleanup waits. These tests hold the page's draft tool open with
 * a promise, and look at what the provider holds meanwhile.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => client }));

const held = vi.hoisted(() => ({ entered: 0, release: (_value: unknown): void => {} }));
vi.mock('../../admin/src/assistant-client-tools', async () => {
  const { toolDefinition } = await import('@tanstack/ai/client');
  const definition = toolDefinition({
    name: 'draft_reply',
    description: 'A draft tool whose page part waits for the test.',
    inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, text: { type: 'string' } }, required: ['documentId', 'text'] },
  });
  const tools = () => [
    definition.client(
      () =>
        new Promise((resolve) => {
          held.entered += 1;
          held.release = resolve;
        })
    ),
  ];
  return { DRAFT_CLIENT_TOOLS: tools(), draftClientTools: tools };
});

const DRAFT = { documentId: 'inq4abc', text: 'Thank you for telling us.' };

/** Shows what the provider holds: each tool call of the chat, with its state and whether it has an output. */
const Probe = () => {
  const assistant = useAssistant();
  if (!assistant) return null;
  const calls = assistant.messages.flatMap((message) => (message.parts as PartLike[]).filter((part) => part.type === 'tool-call'));
  return (
    <>
      <button type="button" onClick={() => void assistant.send('Draft a reply to inquiry inq4abc.', 'box')}>
        Ask
      </button>
      <p data-testid="busy">{String(assistant.busy)}</p>
      <p data-testid="calls">{calls.map((call) => `${call.name}:${call.state}:${call.output === undefined ? 'no output' : 'output'}`).join(',')}</p>
    </>
  );
};

afterEach(() => {
  held.entered = 0;
  vi.unstubAllGlobals();
});

describe('the provider\'s cleanup and a draft call whose page part is still running', () => {
  it('leaves the call in the chat while the page\'s tool runs, and the card\'s call is complete with its output once the follow-up is over', async () => {
    assistantWorld(client);
    const { adapter } = fakeTextAdapter([toolCallTurn('draft_reply', DRAFT), textTurn('The draft is ready.')]);
    const service = assistantService({ strapi: fakeStrapi({ config: { aiProvider: 'anthropic', aiApiKey: 'sk-ant-test' } }) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) =>
        service.turn(await service.parseBody(JSON.parse(String(init?.body))), { ability: { can: () => true }, adminId: 1, responseController: new AbortController(), adapterFor: () => adapter })
      )
    );
    renderInTheme(
      <AssistantProvider started>
        <Probe />
      </AssistantProvider>
    );
    await waitFor(() => expect(client.get).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(held.entered).toBe(1));
    // Let the provider's effects run for the messages it has now: the call is open, and the chat is loading.
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(screen.getByTestId('busy').textContent).toBe('true');
    expect(screen.getByTestId('calls').textContent).toBe('draft_reply:input-complete:no output');

    held.release({ shown: true });

    await waitFor(() => expect(screen.getByTestId('busy').textContent).toBe('false'));
    expect(screen.getByTestId('calls').textContent).toBe('draft_reply:complete:output');
  });
});

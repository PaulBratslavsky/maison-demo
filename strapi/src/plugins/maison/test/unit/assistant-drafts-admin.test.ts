import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client';
import { describe, expect, it, vi } from 'vitest';
import {
  DRAFT_TOOLS,
  cardTitle,
  draftOf,
  drawableParts,
  showsWorking,
  toolBoxOf,
  toolLineOf,
  withoutFailedTurn,
  withoutOpenToolCalls,
  type MessageLike,
  type PartLike,
} from '../../admin/src/assistant';
import { DRAFT_CLIENT_TOOLS } from '../../admin/src/assistant-client-tools';
import type { PageDraft } from '../../admin/src/drafts';
import { DRAFT_TOOL_NAMES, assistantTools } from '../../server/src/assistant/tools';
import { inquiryView } from '../../server/src/assistant/views';
import assistantService from '../../server/src/services/assistant';
import { PENDING_VIEW } from './fake-inquiries';
import { fakeStrapi } from './fake-strapi';
import { fakeTextAdapter, textTurn, toolCallTurn } from './fake-text-adapter';

/*
 * The rules for a draft in the chat, apart from React: when a draft call is a card, what the card is titled, what counts as something to draw,
 * and the browser's part of the two draft tools. The last block joins the real chat client to the server's service, with a scripted model.
 */

const SERVER_TOOLS = assistantTools(fakeStrapi(), { can: () => true });

describe('the draft tools the page runs', () => {
  it('are the two the server offers', () => {
    expect(Object.values(DRAFT_TOOLS)).toEqual([...DRAFT_TOOL_NAMES]);
    expect(DRAFT_CLIENT_TOOLS.map((tool) => tool.name)).toEqual([...DRAFT_TOOL_NAMES]);
  });

  it("take the fields the server's draft tools take, all of them required", () => {
    for (const tool of DRAFT_CLIENT_TOOLS) {
      const server = SERVER_TOOLS.find((spec) => spec.name === tool.name);
      const json = (server?.inputSchema as any)['~standard'].jsonSchema.input({ target: 'draft-07' });
      const schema = tool.inputSchema as { properties: Record<string, unknown>; required: string[] };
      expect(Object.keys(schema.properties).sort(), tool.name).toEqual(Object.keys(json.properties).sort());
      expect([...schema.required].sort(), tool.name).toEqual([...json.required].sort());
    }
  });

  it('show nothing and send nothing: the result is { shown: true }, whatever the input', async () => {
    for (const tool of DRAFT_CLIENT_TOOLS) {
      expect(tool.execute, tool.name).toBeTypeOf('function');
      await expect(Promise.resolve(tool.execute?.({} as never))).resolves.toEqual({ shown: true });
    }
  });
});

describe('draftOf', () => {
  const REPLY_ARGS = { documentId: 'inq4abc', text: 'Thank you for telling us.\nA member of our team will write to you today.' };
  const ANSWER_ARGS = { reference: 'Q-4821', text: 'Yes. A watch up to 42 mm fits in the coffret.' };
  /** A draft_reply call as the page holds it once its `show` has run: complete, with the output `{ shown: true }`. */
  const replyCall = (fields: Record<string, unknown> = {}): PartLike => ({
    type: 'tool-call',
    id: 'call_1',
    name: 'draft_reply',
    arguments: JSON.stringify(REPLY_ARGS),
    input: REPLY_ARGS,
    state: 'complete',
    output: { shown: true },
    ...fields,
  });
  const answerCall = (fields: Record<string, unknown> = {}): PartLike => ({
    type: 'tool-call',
    id: 'call_2',
    name: 'draft_answer',
    arguments: JSON.stringify(ANSWER_ARGS),
    input: ANSWER_ARGS,
    state: 'complete',
    output: { shown: true },
    ...fields,
  });

  it('is a reply card for a draft_reply call that is complete and has its output', () => {
    const part = replyCall();
    expect(draftOf(part, [part])).toEqual({ callId: 'call_1', draft: { kind: 'reply', documentId: 'inq4abc', text: REPLY_ARGS.text } });
  });

  it('is an answer card for a draft_answer call', () => {
    const part = answerCall();
    expect(draftOf(part, [part])).toEqual({ callId: 'call_2', draft: { kind: 'answer', reference: 'Q-4821', text: ANSWER_ARGS.text } });
  });

  it('keeps the text as the model wrote it, with its line breaks', () => {
    const part = replyCall();
    expect((draftOf(part, [part])?.draft as { text: string }).text).toBe('Thank you for telling us.\nA member of our team will write to you today.');
  });

  it.each(['awaiting-input', 'input-streaming', 'input-complete', 'approval-requested', 'approval-responded', 'error'])(
    'is no card while the call is %s: only a complete call has been through the server and the page',
    (state) => {
      const part = replyCall({ state });
      expect(draftOf(part, [part])).toBeNull();
    }
  );

  it('is no card for a complete call with no output yet', () => {
    for (const output of [undefined, null]) {
      const part = replyCall({ output });
      expect(draftOf(part, [part])).toBeNull();
    }
  });

  it('is no card when the output holds an error, though the state says complete', () => {
    const part = replyCall({ output: { error: 'Input validation failed for tool draft_reply: Too big' } });
    expect(draftOf(part, [part])).toBeNull();
  });

  it('is no card when the call has a tool-result part in error', () => {
    const part = replyCall();
    const result: PartLike = { type: 'tool-result', toolCallId: 'call_1', state: 'error', content: '{"error":"refused"}' };
    expect(draftOf(part, [part, result])).toBeNull();
  });

  it('is still a card when the tool-result in error belongs to another call', () => {
    const part = replyCall();
    const other: PartLike = { type: 'tool-result', toolCallId: 'call_9', state: 'error', content: '{"error":"refused"}' };
    expect(draftOf(part, [part, other])).not.toBeNull();
  });

  it('reads the arguments text when the call has no parsed input', () => {
    const part = replyCall({ input: undefined });
    expect(draftOf(part, [part])?.draft).toEqual({ kind: 'reply', documentId: 'inq4abc', text: REPLY_ARGS.text });
  });

  it.each([
    ['text that is not a string', { input: { documentId: 'inq4abc', text: 7 } }],
    ['no text', { input: { documentId: 'inq4abc' } }],
    ['no documentId', { input: { text: 'Thank you.' } }],
    ['a blank documentId', { input: { documentId: '', text: 'Thank you.' } }],
    ['arguments that are not JSON', { input: undefined, arguments: '{"documentId":' }],
    ['arguments that are not an object', { input: undefined, arguments: '"inq4abc"' }],
    ['neither input nor arguments', { input: undefined, arguments: undefined }],
  ])('is no card for %s', (_label, fields) => {
    const part = replyCall(fields);
    expect(draftOf(part, [part])).toBeNull();
  });

  it('is no card for a draft_answer call with no reference', () => {
    const part = answerCall({ input: { text: 'Yes.' } });
    expect(draftOf(part, [part])).toBeNull();
  });

  it('is no card for any other tool, or any other part', () => {
    const lookup = replyCall({ name: 'list_inquiries' });
    expect(draftOf(lookup, [lookup])).toBeNull();
    const text: PartLike = { type: 'text', content: 'Here is the draft.' };
    expect(draftOf(text, [text])).toBeNull();
  });

  it('is a card with no tool line and no tool box: the card is the draft tool\'s result', () => {
    const part = replyCall();
    expect(toolLineOf(part, undefined)).toBeNull();
    expect(toolBoxOf(part, undefined)).toBeNull();
  });
});

describe('what counts as something to draw, with drafts', () => {
  const draftCall = (fields: Record<string, unknown> = {}): PartLike => ({
    type: 'tool-call',
    id: 'call_1',
    name: 'draft_reply',
    arguments: '{}',
    input: { documentId: 'inq4abc', text: 'Thank you.' },
    state: 'complete',
    output: { shown: true },
    ...fields,
  });
  const result: PartLike = { type: 'tool-result', toolCallId: 'call_1', state: 'complete', content: '{"shown":true}' };
  const text: PartLike = { type: 'text', content: 'Here is the draft.' };

  it('counts a complete draft call, in the order it arrived, and not its tool-result', () => {
    const call = draftCall();
    expect(drawableParts([text, call, result])).toEqual([text, call]);
  });

  it.each([
    ['one that is still input-complete', { state: 'input-complete', output: undefined }],
    ['one with no output', { output: undefined }],
    ['one that failed', { state: 'error', output: { error: 'refused' } }],
    ['one whose input is not a draft', { input: { documentId: 'inq4abc' }, arguments: '{}' }],
  ])('does not count %s', (_label, fields) => {
    expect(drawableParts([draftCall(fields)])).toEqual([]);
  });

  it('does not say the assistant is working once a message holds only a draft card', () => {
    const staff: MessageLike = { role: 'user', parts: [{ type: 'text', content: 'Draft a reply.' }] };
    const card: MessageLike = { role: 'assistant', parts: [draftCall(), result] };
    expect(showsWorking(true, [staff, card])).toBe(false);
  });

  // A draft-only message that was not counted would be taken away as a failed turn, with the staff member's question.
  it('keeps an assistant message that holds only a draft card, and the question before it', () => {
    const staff: MessageLike = { role: 'user', parts: [{ type: 'text', content: 'Draft a reply.' }] };
    const card: MessageLike = { role: 'assistant', parts: [draftCall(), result] };
    const messages = [staff, card];
    expect(withoutFailedTurn(messages)).toBe(messages);
  });

  it('takes away an empty assistant message that follows a card: a failed follow-up leaves the card', () => {
    const staff: MessageLike = { role: 'user', parts: [{ type: 'text', content: 'Draft a reply.' }] };
    const card: MessageLike = { role: 'assistant', parts: [draftCall(), result] };
    const empty: MessageLike = { role: 'assistant', parts: [] };
    expect(withoutFailedTurn([staff, card, empty])).toEqual([staff, card]);
  });
});

describe('cardTitle', () => {
  const REPLY: PageDraft = { kind: 'reply', documentId: 'inq4abc', text: 'Thank you.' };
  /** A list_inquiries call with its answer, as the page holds it. */
  const lookup = (inquiries: unknown[], fields: Record<string, unknown> = {}): PartLike => ({
    type: 'tool-call',
    id: 'call_0',
    name: 'list_inquiries',
    arguments: '{}',
    state: 'complete',
    output: { inquiries, capped: false },
    ...fields,
  });
  const ROW = { documentId: 'inq4abc', customer: 'line:U4af…88', receivedAt: '2026-10-06T10:12:00+09:00' };

  it('names the answer by its reference', () => {
    expect(cardTitle({ kind: 'answer', reference: 'Q-4821', text: 'Yes.' }, [])).toBe('Draft answer for Q-4821');
  });

  it("names a reply's customer and the time it came in, from the chat's lookup of the inquiry", () => {
    expect(cardTitle(REPLY, [{ parts: [lookup([ROW])] }])).toBe('Draft reply on LINE: line:U4af…88, received 2026-10-06 10:12');
  });

  it('reads the title from the rows the server gives the model: the masked customer and the time in the boutique zone', () => {
    // The row is the model's view of the inquiry that the Inquiries tab shows as 10:12 on 3 October, Tokyo time.
    const row = inquiryView(PENDING_VIEW as never, { mode: 'list', timezone: 'Asia/Tokyo' });
    const title = cardTitle({ kind: 'reply', documentId: row.documentId, text: 'Thank you.' }, [{ parts: [lookup([row])] }]);
    expect(title).toBe('Draft reply on LINE: line:U4af…88, received 2026-10-03 10:12');
    expect(title).not.toMatch(/U[0-9a-f]{32}/);
  });

  it('reads the lookup from its tool-result when the call itself holds no output', () => {
    const call = lookup([], { output: undefined });
    const result: PartLike = { type: 'tool-result', toolCallId: 'call_0', state: 'complete', content: JSON.stringify({ inquiries: [ROW], capped: false }) };
    expect(cardTitle(REPLY, [{ parts: [call, result] }])).toBe('Draft reply on LINE: line:U4af…88, received 2026-10-06 10:12');
  });

  it('writes midnight as 00:05, with the day it belongs to', () => {
    const row = { ...ROW, receivedAt: '2026-10-06T00:05:00+09:00' };
    expect(cardTitle(REPLY, [{ parts: [lookup([row])] }])).toBe('Draft reply on LINE: line:U4af…88, received 2026-10-06 00:05');
  });

  it('shows the documentId alone when the chat never looked the inquiry up', () => {
    expect(cardTitle(REPLY, [])).toBe('Draft reply on LINE: inq4abc');
    expect(cardTitle(REPLY, [{ parts: [{ type: 'text', content: 'Hello.' }] }])).toBe('Draft reply on LINE: inq4abc');
  });

  it('shows the documentId alone when the lookups held other inquiries: a wrong documentId shows on the card', () => {
    const other = { ...ROW, documentId: 'inq9zzz' };
    expect(cardTitle(REPLY, [{ parts: [lookup([other])] }])).toBe('Draft reply on LINE: inq4abc');
  });

  it('uses the latest lookup that holds the inquiry, the newest message and the newest part first', () => {
    const older = { ...ROW, customer: 'line:Uaaa…aa' };
    const newer = { ...ROW, customer: 'line:Ubbb…bb' };
    const messages = [{ parts: [lookup([older])] }, { parts: [{ type: 'text', content: 'Done.' }] }, { parts: [lookup([older]), lookup([newer])] }];
    expect(cardTitle(REPLY, messages)).toBe('Draft reply on LINE: line:Ubbb…bb, received 2026-10-06 10:12');
  });

  it('skips a lookup that failed', () => {
    const failed = lookup([ROW], { state: 'error', output: { error: 'The tool failed.' } });
    expect(cardTitle(REPLY, [{ parts: [failed] }])).toBe('Draft reply on LINE: inq4abc');
  });

  it('skips a row with no customer or time, and a lookup that is not a list', () => {
    const rows = [{ documentId: 'inq4abc' }, { documentId: 'inq4abc', customer: 'line:U4af…88' }];
    expect(cardTitle(REPLY, [{ parts: [lookup(rows)] }])).toBe('Draft reply on LINE: inq4abc');
    expect(cardTitle(REPLY, [{ parts: [lookup([], { output: { inquiries: 'none' } })] }])).toBe('Draft reply on LINE: inq4abc');
  });

  it('shows a time that is not a date as it came, so one odd row cannot fail the card', () => {
    const row = { ...ROW, receivedAt: 'yesterday' };
    expect(cardTitle(REPLY, [{ parts: [lookup([row])] }])).toBe('Draft reply on LINE: line:U4af…88, received yesterday');
  });

  it('reads only list_inquiries: another tool that returns the same row does not count', () => {
    const other = lookup([ROW], { name: 'list_questions' });
    expect(cardTitle(REPLY, [{ parts: [other] }])).toBe('Draft reply on LINE: inq4abc');
  });
});

describe('a draft, from the model to the card, through the real chat client', () => {
  const REPLY = { documentId: 'inq4abc', text: 'Thank you for telling us.\nA member of our team will write to you today.' };
  const ANSWER = { reference: 'Q-4821', text: 'Yes. A watch up to 42 mm fits in the coffret.' };

  /**
   * The browser's chat client, joined straight to the server's service with no network, and a scripted model. It runs the draft tools as the
   * page does, and sends the follow-up that carries their result, as `useChat` does. It records what the page's idle cleanup would meet: each
   * time the chat is not loading, whether `withoutOpenToolCalls` would take something out; and, as a check that this has something to fail on,
   * how often a draft call was open while the chat was loading.
   */
  const chatWith = (
    turns: Parameters<typeof fakeTextAdapter>[0],
    tools: ConstructorParameters<typeof ChatClient>[0]['tools'] = DRAFT_CLIENT_TOOLS,
    services: Record<string, unknown> = {}
  ) => {
    const { adapter, requests } = fakeTextAdapter(turns);
    const service = assistantService({ strapi: fakeStrapi({ services, config: { aiProvider: 'anthropic', aiApiKey: 'sk-ant-test' } }) });
    const fetchClient = async (_url: unknown, init?: RequestInit) =>
      service.turn(await service.parseBody(JSON.parse(String(init?.body))), {
        ability: { can: () => true },
        adminId: 1,
        responseController: new AbortController(),
        adapterFor: () => adapter,
      });
    const idleCuts: unknown[] = [];
    let busyOpenDrafts = 0;
    let loading = false;
    let messages: MessageLike[] = [];
    const snap = () => {
      const open = messages.some((message) => (message.parts as PartLike[]).some((part) => part.type === 'tool-call' && part.output === undefined && !(message.parts as PartLike[]).some((other) => other.type === 'tool-result' && other.toolCallId === part.id)));
      if (loading) {
        if (open) busyOpenDrafts += 1;
      } else if (withoutOpenToolCalls(messages) !== messages) {
        idleCuts.push(messages);
      }
    };
    const client = new ChatClient({
      connection: fetchServerSentEvents('http://strapi.test/maison/assistant/chat', { fetchClient: fetchClient as typeof fetch }),
      tools,
      // As the page sets it: a message sent while an answer comes is dropped.
      queue: 'drop',
      onMessagesChange: (next) => {
        messages = next as unknown as MessageLike[];
        snap();
      },
      onLoadingChange: (next) => {
        loading = next;
        snap();
      },
    });
    return { client, requests, idleCuts, busyOpenDrafts: () => busyOpenDrafts };
  };
  /** The tool calls of a chat, each with the parts of its own message, as the page hands them to `draftOf`. */
  const callsOf = (client: ChatClient) =>
    client.getMessages().flatMap((message) => message.parts.filter((part) => part.type === 'tool-call').map((part) => ({ part: part as PartLike, parts: message.parts as PartLike[] })));

  it('turns a draft_reply into a card once the page has run it, and the model then answers in a second turn', async () => {
    const { client, requests, idleCuts, busyOpenDrafts } = chatWith([toolCallTurn('draft_reply', REPLY), textTurn('The draft is ready.')]);

    await client.sendMessage('Draft a reply to inquiry inq4abc.');

    const [{ part, parts }] = callsOf(client);
    expect(part).toMatchObject({ name: 'draft_reply', state: 'complete', output: { shown: true } });
    expect(draftOf(part, parts)).toEqual({ callId: part.id, draft: { kind: 'reply', documentId: 'inq4abc', text: REPLY.text } });
    expect(drawableParts(parts)).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(client.getMessages().at(-1)?.parts).toEqual([{ type: 'text', content: 'The draft is ready.' }]);
    // The page's idle cleanup never met an open draft call: the chat is loading from the call to the follow-up's end, and the call has its output by then.
    expect(idleCuts).toEqual([]);
    expect(busyOpenDrafts()).toBeGreaterThan(0);
  });

  it('turns a draft_answer into a card the same way', async () => {
    const { client, idleCuts } = chatWith([toolCallTurn('draft_answer', ANSWER), textTurn('The draft is ready.')]);

    await client.sendMessage('Draft an answer to Q-4821.');

    const [{ part, parts }] = callsOf(client);
    expect(draftOf(part, parts)).toEqual({ callId: part.id, draft: { kind: 'answer', reference: 'Q-4821', text: ANSWER.text } });
    expect(idleCuts).toEqual([]);
  });

  it('shows no card for a draft the server refused: the call ends in error, and the model writes a shorter one', async () => {
    const { client, requests, idleCuts } = chatWith([
      toolCallTurn('draft_reply', { documentId: 'inq4abc', text: 'x'.repeat(2501) }),
      textTurn('I will write a shorter reply.'),
    ]);

    await client.sendMessage('Draft a reply to inquiry inq4abc.');

    const [{ part, parts }] = callsOf(client);
    expect(part.state).toBe('error');
    expect(draftOf(part, parts)).toBeNull();
    // Nothing of the refused call is drawn: the message may hold the model's next words, and only those.
    expect(drawableParts(parts).filter((drawn) => drawn.type === 'tool-call')).toEqual([]);
    expect(requests).toHaveLength(2);
    expect(idleCuts).toEqual([]);
  });

  // The page's cleanup removes a tool call that has no output. A draft call has none while the page's tool runs, so the cleanup must not meet it then:
  // the chat stays loading until the tool has returned and the follow-up is over.
  it('is not taken out by the idle cleanup while the page\'s tool is still running', async () => {
    let release: (value: { shown: boolean }) => void = () => {};
    let seenInside: { loading: boolean; part: PartLike | undefined } | null = null;
    const held = {
      ...DRAFT_CLIENT_TOOLS[0],
      execute: async () => {
        const [first] = callsOf(chat.client);
        seenInside = { loading: chat.client.getIsLoading(), part: first?.part };
        return new Promise<{ shown: boolean }>((resolve) => {
          release = resolve;
        });
      },
    };
    const chat = chatWith([toolCallTurn('draft_reply', REPLY), textTurn('The draft is ready.')], [held] as never);

    const sent = chat.client.sendMessage('Draft a reply to inquiry inq4abc.');
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Inside the tool: the chat is loading, the call is open, and the cleanup would take it out if it ran.
    expect(seenInside).not.toBeNull();
    expect(seenInside!.loading).toBe(true);
    expect(seenInside!.part).toMatchObject({ name: 'draft_reply', state: 'input-complete' });
    expect(seenInside!.part?.output).toBeUndefined();
    expect(chat.client.getIsLoading()).toBe(true);

    release({ shown: true });
    await sent;

    const [{ part }] = callsOf(chat.client);
    expect(part).toMatchObject({ state: 'complete', output: { shown: true } });
    expect(chat.idleCuts).toEqual([]);
  });

  it('titles the card from the lookup that came before the draft, in the same chat, with the customer masked as the server masks it', async () => {
    const view = vi.fn(async () => ({ ok: true, value: PENDING_VIEW }));
    const draft = { documentId: PENDING_VIEW.documentId, text: 'Thank you for telling us.' };
    const { client } = chatWith(
      [toolCallTurn('list_inquiries', { documentId: PENDING_VIEW.documentId }), toolCallTurn('draft_reply', draft), textTurn('The draft is ready.')],
      DRAFT_CLIENT_TOOLS,
      { inquiries: { view } }
    );

    await client.sendMessage('Draft a reply to the inquiry.');

    const messages = client.getMessages();
    const model = messages.flatMap((message) => (message.parts as PartLike[]).map((part) => draftOf(part, message.parts as PartLike[]))).find(Boolean);
    expect(model?.draft).toMatchObject({ kind: 'reply', documentId: PENDING_VIEW.documentId });
    const title = cardTitle(model!.draft, messages as unknown as Array<{ parts: readonly PartLike[] }>);
    expect(title).toBe('Draft reply on LINE: line:U4af…88, received 2026-10-03 10:12');
    expect(title).not.toMatch(/U[0-9a-f]{32}/);
  });
});

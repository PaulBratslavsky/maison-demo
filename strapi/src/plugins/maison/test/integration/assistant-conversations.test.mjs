import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { bootStrapi } from './harness.mjs';

const CONVERSATION = 'plugin::maison.conversation';
const NO_CHAT = 'There is no saved chat with that ID.';
const NOT_SAVED = 'This chat could not be saved.';

/** The messages of a chat as the page saves them: TanStack AI's UIMessage, with the parts a real chat has. */
const CHAT = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', content: '今日のお客様からの問い合わせは? 😀' }] },
  {
    id: 'a1',
    role: 'assistant',
    createdAt: '2026-10-07T01:02:03.000Z',
    parts: [
      { type: 'thinking', content: 'Let me look.', signature: 'EqQBCkYIBRgCIkD+/=', providerMetadata: { anthropic: { index: 0 } } },
      { type: 'text', content: 'Looking.\n\n| a | b |\n| - | - |\n| 1 | 2 |', metadata: { anthropic: { citations: [] } } },
      { type: 'tool-call', id: 'c1', name: 'list_inquiries', arguments: '{}', state: 'complete', input: {}, output: { inquiries: [{ documentId: 'k1', customer: 'line:U4af…88', message: '<customer_message>Hello</customer_message>' }], capped: false } },
      { type: 'tool-result', toolCallId: 'c1', content: '{"inquiries":[]}', state: 'complete' },
      { type: 'structured-output', status: 'complete', raw: '{}', data: { nested: [1, [2, { three: null }]], line: 'a b' } },
    ],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A Koa context with what the controller reads, and Strapi's error helpers, which the HTTP stack adds and a direct call lacks. */
const ctxFor = (admin, { params = {}, body } = {}) => {
  const ctx = { state: admin === null ? {} : { user: { id: admin } }, params, request: { body }, status: 200, body: undefined };
  for (const [helper, status] of Object.entries({ badRequest: 400, unauthorized: 401, notFound: 404 })) {
    ctx[helper] = (message, details) => {
      ctx.status = status;
      ctx.body = { error: { message, details } };
    };
  }
  return ctx;
};

describe('the Ask tab\'s saved chats, on a real Strapi', () => {
  let strapi;
  let chats;
  let seed;

  /** Runs one of the controller's handlers as `admin`, and answers the context it left. */
  const call = async (handler, admin, options) => {
    const ctx = ctxFor(admin, options);
    await chats[handler](ctx);
    return ctx;
  };
  const stored = () => strapi.documents(CONVERSATION).findMany({ limit: 500 });

  before(async () => {
    strapi = await bootStrapi('assistant-conversations');
    chats = strapi.plugin('maison').controller('conversations');
    seed = strapi.plugin('maison').service('seed');
  });
  after(async () => {
    await strapi?.destroy();
  });

  it('is a content type that Strapi loaded, hidden from the Content Manager and the Content-Type Builder', () => {
    const type = strapi.contentTypes[CONVERSATION];
    assert.ok(type, 'plugin::maison.conversation is loaded');
    assert.equal(type.collectionName, 'maison_conversations');
    assert.equal(type.options.draftAndPublish, false);
    assert.equal(type.pluginOptions['content-manager'].visible, false);
    assert.equal(type.pluginOptions['content-type-builder'].visible, false);
  });

  it('saves a chat, lists it and opens it, and every key of every part comes back as it was saved', async () => {
    const created = await call('create', 1, { body: { title: '今日のお客様からの問い合わせは? 😀', messages: CHAT } });
    assert.equal(created.status, 201);
    const { documentId, title } = created.body.conversation;
    assert.equal(title, '今日のお客様からの問い合わせは? 😀');
    assert.deepEqual(Object.keys(created.body.conversation).sort(), ['documentId', 'title', 'updatedAt']);

    const listed = await call('list', 1);
    assert.deepEqual(listed.body.conversations.map((chat) => chat.documentId), [documentId]);

    const opened = await call('findOne', 1, { params: { documentId } });
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.body.conversation.messages, CHAT);
    // A text part keeps its metadata too: a text part that did not keep extra keys would lose it on save, with no error.
    assert.deepEqual(opened.body.conversation.messages[1].parts[1].metadata, { anthropic: { citations: [] } });
    // In the database it is the envelope.
    const row = await strapi.documents(CONVERSATION).findOne({ documentId });
    assert.deepEqual(row.messages, { v: 1, messages: CHAT });
    assert.equal(row.adminUserId, 1);
  });

  it("keeps one admin's chat from another: it is not in their list, and opening, saving and deleting it answer 404, as an ID nobody has does", async () => {
    const mine = (await call('create', 11, { body: { title: 'Mine', messages: CHAT } })).body.conversation.documentId;

    assert.deepEqual((await call('list', 12)).body.conversations, []);
    const message = { message: NO_CHAT, details: { code: 'not_found', hint: 'Reload the page: it may have been deleted.' } };
    for (const [handler, options] of [
      ['findOne', {}],
      ['update', { body: { title: 'Theirs now' } }],
      ['remove', {}],
    ]) {
      const theirs = await call(handler, 12, { ...options, params: { documentId: mine } });
      const nobody = await call(handler, 12, { ...options, params: { documentId: 'no-such-chat' } });
      assert.equal(theirs.status, 404, handler);
      assert.deepEqual(theirs.body, { error: message }, handler);
      assert.deepEqual(nobody.body, theirs.body, handler);
    }

    // Nothing of it changed, and its admin still has it.
    const row = await strapi.documents(CONVERSATION).findOne({ documentId: mine });
    assert.equal(row.title, 'Mine');
    assert.equal(row.adminUserId, 11);
    assert.equal((await call('findOne', 11, { params: { documentId: mine } })).status, 200);
  });

  it('takes the admin from the session, never from the body', async () => {
    const created = await call('create', 13, { body: { title: 'x', messages: CHAT, adminUserId: 99 } });
    const row = await strapi.documents(CONVERSATION).findOne({ documentId: created.body.conversation.documentId });
    assert.equal(row.adminUserId, 13);
    await call('update', 13, { params: { documentId: row.documentId }, body: { adminUserId: 99, title: 'y' } });
    assert.equal((await strapi.documents(CONVERSATION).findOne({ documentId: row.documentId })).adminUserId, 13);
  });

  it('answers 400 with a staff text for a body that is not a chat, and saves nothing', async () => {
    const before = (await stored()).length;
    for (const body of [undefined, 'hello', [], { title: 'x' }, { title: 'x', messages: 'hello' }, { title: 'x', messages: [{ id: 'm1', role: 'wizard', parts: [] }] }]) {
      const created = await call('create', 14, { body });
      assert.equal(created.status, 400, JSON.stringify(body));
      assert.equal(created.body.error.message, NOT_SAVED);
      assert.equal(created.body.error.details.code, 'invalid_input');
    }
    assert.equal((await stored()).length, before);

    const id = (await call('create', 14, { body: { title: 'Keep', messages: CHAT } })).body.conversation.documentId;
    const bad = await call('update', 14, { params: { documentId: id }, body: { title: 'Lost', messages: 'hello' } });
    assert.equal(bad.status, 400);
    const row = await strapi.documents(CONVERSATION).findOne({ documentId: id });
    assert.equal(row.title, 'Keep');
    assert.deepEqual(row.messages, { v: 1, messages: CHAT });
  });

  it('lists the newest first: a chat saved again moves to the top', async () => {
    const admin = 15;
    const ids = [];
    for (const title of ['First', 'Second', 'Third']) {
      ids.push((await call('create', admin, { body: { title, messages: CHAT } })).body.conversation.documentId);
      await sleep(15);
    }
    assert.deepEqual((await call('list', admin)).body.conversations.map((chat) => chat.title), ['Third', 'Second', 'First']);

    await call('update', admin, { params: { documentId: ids[0] }, body: { messages: [...CHAT, { id: 'u2', role: 'user', parts: [{ type: 'text', content: 'More' }] }] } });
    assert.deepEqual((await call('list', admin)).body.conversations.map((chat) => chat.title), ['First', 'Third', 'Second']);
  });

  it('lists at most 100 chats: the newest', async () => {
    const admin = 16;
    for (let index = 0; index < 101; index += 1) {
      await strapi.documents(CONVERSATION).create({ data: { title: `Chat ${String(index).padStart(3, '0')}`, messages: { v: 1, messages: [] }, adminUserId: admin } });
      // updatedAt has the precision of a millisecond: each chat gets a moment of its own, so "newest" has one answer.
      await sleep(2);
    }
    const { conversations } = (await call('list', admin)).body;
    assert.equal(conversations.length, 100);
    assert.equal(conversations[0].title, 'Chat 100');
    assert.ok(!conversations.some((chat) => chat.title === 'Chat 000'));
  });

  it('cuts a long title to 80 characters, and never splits an emoji or a Japanese character', async () => {
    const created = await call('create', 17, { body: { title: '😀'.repeat(100), messages: CHAT } });
    assert.equal(created.body.conversation.title, '😀'.repeat(80));
    const japanese = '今日のお客様からの問い合わせを教えてください。'.repeat(5);
    const second = await call('create', 17, { body: { title: japanese, messages: CHAT } });
    assert.equal(Array.from(second.body.conversation.title).length, 80);
    assert.ok(japanese.startsWith(second.body.conversation.title));
  });

  it('opens a chat whose stored messages cannot be read as an empty chat, and leaves the stored value alone', async () => {
    const row = await strapi.documents(CONVERSATION).create({ data: { title: 'Damaged', messages: { v: 9, other: 'shape' }, adminUserId: 18 } });
    const opened = await call('findOne', 18, { params: { documentId: row.documentId } });
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.body.conversation.messages, []);
    assert.deepEqual((await strapi.documents(CONVERSATION).findOne({ documentId: row.documentId })).messages, { v: 9, other: 'shape' });
  });

  it('deletes a chat at once', async () => {
    const id = (await call('create', 19, { body: { title: 'Gone', messages: CHAT } })).body.conversation.documentId;
    const removed = await call('remove', 19, { params: { documentId: id } });
    assert.deepEqual(removed.body, { documentId: id });
    assert.equal(await strapi.documents(CONVERSATION).findOne({ documentId: id }), null);
  });

  it("is cleared by Reset demo activity: every admin's chats, and nothing else of the answer changes", async () => {
    assert.ok((await stored()).length > 0, 'there are chats to clear');
    assert.deepEqual(await seed.resetDemoAppointments(), { appointments: 0, notifications: 0, questions: 0, inquiries: 0, knowledge: 0 });
    assert.equal(await strapi.documents(CONVERSATION).count(), 0);
    assert.deepEqual((await call('list', 1)).body.conversations, []);
  });
});

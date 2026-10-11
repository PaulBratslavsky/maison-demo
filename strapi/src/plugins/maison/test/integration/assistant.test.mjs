import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { errorTurn, fakeTextAdapter, textTurn, toolCallTurn } from './fake-text-adapter.mjs';
import { bootStrapi } from './harness.mjs';

const INQUIRY = 'plugin::maison.inquiry';
const QUESTION = 'plugin::maison.question';

const ACTION = {
  assistantUse: 'plugin::maison.assistant.use',
  appointmentsReview: 'plugin::maison.appointments.review',
  questionsRead: 'plugin::maison.questions.read',
  questionsAnswer: 'plugin::maison.questions.answer',
  inquiriesView: 'plugin::maison.inquiries.view',
  inquiriesReply: 'plugin::maison.inquiries.reply',
  catalogRead: 'plugin::maison.catalog.read',
};
const EVERYTHING = Object.values(ACTION);

/** The presenter's own LINE account, made up for these tests: Load demo activity gives it three items. */
const PAUL_ID = `U${'5ca1ab1e'.repeat(4)}`;
/** The five made-up customers' display names (server/seed/activity.json). The question rows carry them, and no model may read them. */
const DEMO_NAMES = ['Aiko T.', 'Kenji M.', 'Sophie L.', 'Daniel R.', 'Mei W.'];
/** A full LINE user ID, anywhere in a text. */
const LINE_USER_ID = /U[0-9a-f]{32}/;
/** A made-up key. It makes the chat ready, and no test sends it anywhere. */
const FAKE_KEY = 'maison-test-chat-key';
const NOT_SET_UP = "The assistant isn't set up. It needs an Anthropic API key in AI_API_KEY, with AI_PROVIDER unset or anthropic. Then restart Strapi.";
const CHAT_TOO_LONG = 'This chat is long. Start a new chat.';

const READ_TOOLS = ['list_requests', 'list_questions', 'list_inquiries', 'inquiry_counts', 'search_knowledge', 'search_products', 'view_product'];
const DRAFT_TOOLS = ['draft_reply', 'draft_answer'];
const DRAFT_LABELS = { draft_reply: 'Draft a LINE reply', draft_answer: 'Draft an answer' };

/** Everything a model must never read: a full LINE user ID, or one of the five made-up customers' names. */
const forbiddenIn = (text) => [...(text.match(new RegExp(LINE_USER_ID, 'g')) ?? []), ...DEMO_NAMES.filter((name) => text.includes(name))];

/** The events of a server-sent event stream, in order. */
const eventsOf = (text) =>
  text
    .split('\n\n')
    .map((block) => block.split('\n').find((line) => line.startsWith('data: ')))
    .filter(Boolean)
    .map((line) => JSON.parse(line.slice('data: '.length)));
const textOf = (events) => events.filter((event) => event.type === 'TEXT_MESSAGE_CONTENT').map((event) => event.delta).join('');

/** What a fake model was sent in one call, as text: the system prompt, the messages, and the tools' names and descriptions. */
const modelSaw = (request) =>
  JSON.stringify({
    systemPrompts: request.systemPrompts,
    messages: request.messages,
    tools: (request.tools ?? []).map(({ name, description }) => ({ name, description })),
  });

/** A question reference like Q-1234 that none of `taken` is. */
const absentReference = (taken) => {
  for (let number = 1000; ; number += 1) {
    const reference = `Q-${number}`;
    if (!taken.includes(reference)) return reference;
  }
};

describe('the assistant on a real Strapi', () => {
  let strapi;
  let service;
  let inquiries;
  let questions;
  let baseUrl;

  /** An admin whose role holds `actions`, with a session token for the routes and the ability Strapi builds for them. */
  const adminWith = async (name, actions) => {
    const roles = strapi.service('admin::role');
    const role = await roles.create({ name: `Maison test: ${name}`, description: 'Created by the Maison integration tests' });
    await roles.assignPermissions(role.id, actions.map((action) => ({ action, subject: null, properties: {}, conditions: [] })));
    const user = await strapi.service('admin::user').create({ email: `${name}@maison.test`, firstname: name, lastname: 'Test', isActive: true, roles: [role.id] });
    const sessions = strapi.sessionManager('admin');
    const { token: refreshToken } = await sessions.generateRefreshToken(String(user.id), `maison-test-${name}`, { type: 'session' });
    const token = (await sessions.generateAccessToken(refreshToken)).token;
    const withRoles = await strapi.db.query('admin::user').findOne({ where: { id: user.id }, populate: ['roles'] });
    const ability = await strapi.service('admin::permission').engine.generateUserAbility(withRoles);
    return { token, ability };
  };

  /** One request to an admin route, with a JSON body when given one. Tokens are sent, never logged. */
  const call = async (method, path, token, body) => {
    const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
    const response = await fetch(new URL(path, baseUrl), { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, body: text.startsWith('{') ? JSON.parse(text) : null };
  };

  /** Strapi's log lines while `work` runs, as [level, text]. */
  const logged = async (work) => {
    const lines = [];
    const kept = { info: strapi.log.info, error: strapi.log.error };
    strapi.log.info = (...parts) => lines.push(['info', parts.map(String).join(' ')]);
    strapi.log.error = (...parts) => lines.push(['error', parts.map(String).join(' ')]);
    try {
      return { result: await work(), lines };
    } finally {
      Object.assign(strapi.log, kept);
    }
  };

  /** Polls `predicate` until it holds, and fails once `timeoutMs` has passed. */
  const waitFor = async (predicate, what, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Still waiting for ${what} after ${timeoutMs} ms`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };

  before(async () => {
    strapi = await bootStrapi('assistant', { maisonConfig: { demoLineUserId: PAUL_ID } });
    const maison = strapi.plugin('maison');
    await maison.service('seed').loadDemoCatalog();
    const loaded = await maison.service('seed').loadDemoActivity();
    assert.equal(loaded.ok, true, JSON.stringify(loaded));
    service = maison.service('assistant');
    inquiries = maison.service('inquiries');
    questions = maison.service('questions');
    await new Promise((resolve, reject) => {
      strapi.server.listen(0, '127.0.0.1', resolve).once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
  });

  after(async () => {
    await strapi?.destroy();
  });

  describe('the tools an admin gets', () => {
    const namesFor = async (name, actions) => {
      const { ability } = await adminWith(name, actions);
      return service.tools(ability).map((tool) => tool.name);
    };

    it('follow the role: each tool needs its own permission, and a draft tool needs the permission to look the item up and the one to write to it', async () => {
      assert.deepEqual(await namesFor('tools-none', [ACTION.assistantUse]), []);
      assert.deepEqual(await namesFor('tools-requests', [ACTION.appointmentsReview]), ['list_requests']);
      assert.deepEqual(await namesFor('tools-inquiries', [ACTION.inquiriesView]), ['list_inquiries', 'inquiry_counts']);
      assert.deepEqual(await namesFor('tools-catalog', [ACTION.catalogRead]), ['search_knowledge', 'search_products', 'view_product']);
      // One permission of a pair is not enough, whichever it is.
      assert.deepEqual(await namesFor('tools-reply-alone', [ACTION.inquiriesReply]), []);
      assert.deepEqual(await namesFor('tools-answer-alone', [ACTION.questionsAnswer]), []);
      assert.deepEqual(await namesFor('tools-reply-with-questions', [ACTION.inquiriesView, ACTION.questionsAnswer]), ['list_inquiries', 'inquiry_counts']);
      assert.deepEqual(await namesFor('tools-inquiries-both', [ACTION.inquiriesView, ACTION.inquiriesReply]), ['list_inquiries', 'inquiry_counts', 'draft_reply']);
      assert.deepEqual(await namesFor('tools-questions-both', [ACTION.questionsRead, ACTION.questionsAnswer]), ['list_questions', 'draft_answer']);
    });

    it('are the seven read tools and the two draft tools for a role that holds everything, and the draft tools alone have no server side', async () => {
      const { ability } = await adminWith('tools-everything', EVERYTHING);
      const tools = service.tools(ability);
      assert.deepEqual(tools.map((tool) => tool.name), [...READ_TOOLS, ...DRAFT_TOOLS]);
      assert.deepEqual(tools.filter((tool) => tool.execute === undefined).map((tool) => tool.name), DRAFT_TOOLS, 'the browser runs only the draft tools');
    });

    it('are the ones GET /maison/assistant/status lists for the admin, labelled as staff read them', async () => {
      strapi.config.set('plugin::maison.aiApiKey', FAKE_KEY);
      try {
        const drafter = await adminWith('status-drafter', [ACTION.assistantUse, ACTION.inquiriesView, ACTION.inquiriesReply]);
        const { status, body, text } = await call('GET', '/maison/assistant/status', drafter.token);
        assert.equal(status, 200);
        assert.deepEqual(body.tools, [
          { name: 'list_inquiries', label: 'Inquiries' },
          { name: 'inquiry_counts', label: 'Inquiry counts' },
          { name: 'draft_reply', label: DRAFT_LABELS.draft_reply },
        ]);
        assert.ok(!text.includes(FAKE_KEY), 'never the key');
      } finally {
        strapi.config.set('plugin::maison.aiApiKey', null);
      }
    });
  });

  describe('one turn, with a scripted model in place of Claude', () => {
    let runNumber = 0;
    const bodyOf = (text) => ({ threadId: 'thread-1', runId: `run-${(runNumber += 1)}`, messages: [{ id: `message-${runNumber}`, role: 'user', content: text }], tools: [], context: [] });

    /** A turn with the chat ready (it has a key), the model scripted as `turns`, and what the model was sent kept. */
    const turnWith = async (turns, { ability, ask = 'What are customers asking about today?', ...request } = {}) => {
      strapi.config.set('plugin::maison.aiApiKey', FAKE_KEY);
      try {
        const fake = fakeTextAdapter(turns);
        const params = await service.parseBody(bodyOf(ask));
        const response = await service.turn(params, {
          ability: ability ?? (await adminWith(`turn-${runNumber}`, EVERYTHING)).ability,
          adminId: 7,
          responseController: new AbortController(),
          adapterFor: () => fake.adapter,
          ...request,
        });
        const raw = await response.text();
        return { ...fake, raw, events: eventsOf(raw) };
      } finally {
        strapi.config.set('plugin::maison.aiApiKey', null);
      }
    };
    const lastFinished = (events) => events.filter((event) => event.type === 'RUN_FINISHED').at(-1);

    it('runs a list_inquiries call against the real service, then asks the model again with its result', async () => {
      const { requests, events } = await turnWith([toolCallTurn('list_inquiries', { filter: 'all', limit: 5 }), textTurn('Ten customers wrote in.')]);

      assert.equal(requests.length, 2, 'the tool ran, then the model answered');
      assert.deepEqual(requests[0].tools.map((tool) => tool.name), [...READ_TOOLS, ...DRAFT_TOOLS]);
      assert.match(requests[0].systemPrompts.join('\n'), /Today is \w+ \d{4}-\d{2}-\d{2} \(Asia\/Tokyo\)\./);
      const result = JSON.parse(requests[1].messages.at(-1).content);
      assert.equal(requests[1].messages.at(-1).role, 'tool');
      assert.equal(result.inquiries.length, 5);
      assert.equal(result.capped, true);
      assert.equal(textOf(events), 'Ten customers wrote in.');
      assert.deepEqual(events.filter((event) => event.type === 'RUN_ERROR'), []);
      assert.equal(lastFinished(events).outcome, undefined, 'a finished run, not one that waits for the browser');
    });

    describe('a draft tool', () => {
      const reply = (documentId) => ({ documentId, text: 'Thank you for telling us.\nA member of our team will write to you today.' });

      it('ends the run with a client-tool interrupt, runs nothing on the server, and does not call the model again until the browser answers', async () => {
        const [first] = (await inquiries.list({ filter: 'all', limit: 1 })).value;
        const { requests, events } = await turnWith([toolCallTurn('draft_reply', reply(first.documentId)), textTurn('This is never asked for.')]);

        const finished = lastFinished(events);
        assert.equal(finished.outcome.type, 'interrupt');
        assert.equal(finished.outcome.interrupts.length, 1);
        assert.equal(finished.outcome.interrupts[0].reason, 'tanstack:client_tool_execution');
        assert.equal(finished.outcome.interrupts[0].metadata.toolName, 'draft_reply');
        assert.deepEqual(finished.outcome.interrupts[0].metadata.input, reply(first.documentId));
        assert.equal(events.some((event) => event.type === 'TOOL_CALL_RESULT'), false, 'no result: nothing ran');
        assert.equal(requests.length, 1, 'the model waits for the browser');
        assert.equal(events.some((event) => event.type === 'CUSTOM'), false, 'and staff are told nothing about a limit');
      });

      it('writes nothing: no row of any kind changes while the draft is made', async () => {
        const count = async () => ({
          inquiries: await strapi.documents(INQUIRY).count(),
          questions: await strapi.documents(QUESTION).count(),
          replied: await strapi.documents(INQUIRY).count({ filters: { status: { $ne: 'open' } } }),
        });
        const [first] = (await inquiries.list({ filter: 'all', limit: 1 })).value;
        const before = await count();

        await turnWith([toolCallTurn('draft_reply', reply(first.documentId))]);

        assert.deepEqual(await count(), before);
      });

      it('is an unknown tool to an admin who lacks one permission of its pair: the model gets the refusal, and the browser nothing to run', async () => {
        const { ability } = await adminWith('draft-view-only', [ACTION.assistantUse, ACTION.inquiriesView]);
        const { requests, events } = await turnWith([toolCallTurn('draft_reply', reply('whatever')), textTurn('I can not draft a reply with this role.')], { ability });

        assert.deepEqual(requests[0].tools.map((tool) => tool.name), ['list_inquiries', 'inquiry_counts']);
        assert.equal(events.some((event) => event.type === 'RUN_FINISHED' && event.outcome?.type === 'interrupt'), false);
        const refusal = JSON.parse(events.find((event) => event.type === 'TOOL_CALL_RESULT').content);
        assert.equal(refusal.error, 'Unknown tool: draft_reply');
        assert.equal(requests.length, 2);
      });
    });

    // In a chat() turn the SDK checks a tool's input against its schema before the tool runs. What it answers is its own sentence, as a string, not
    // Maison's { error: { code, message, hint } }. The page never shows that sentence: it names the tool and holds the model's input, so the tool box
    // says "Maison could not read that request." instead (test/unit/assistant-drafts-admin.test.ts holds that side, with the real chat client).
    it('refuses a tool input the schema does not take in the SDK\'s own words, as a tool result the page never shows, and not as an error of the run', async () => {
      const { requests, events } = await turnWith([toolCallTurn('list_requests', { limit: 999 }), textTurn('I will ask for fewer.')]);

      assert.equal(requests.length, 2, 'the model reads the refusal and answers');
      assert.equal(requests[1].messages.at(-1).role, 'tool');
      const result = events.find((event) => event.type === 'TOOL_CALL_RESULT');
      const refusal = JSON.parse(result.content);
      assert.equal(typeof refusal.error, 'string', 'a string, so the page treats it as the SDK\'s and shows a fixed sentence');
      assert.match(refusal.error, /^Input validation failed for tool list_requests: /);
      assert.deepEqual(events.filter((event) => event.type === 'RUN_ERROR'), [], 'staff see no error of the run');
      assert.equal(textOf(events), 'I will ask for fewer.');
      assert.equal(events.at(-1).type, 'RUN_FINISHED');
    });

    it('refuses a draft the schema does not take, such as a text of 2,500 characters, the same way, and the browser draws no card', async () => {
      const [first] = (await inquiries.list({ filter: 'all', limit: 1 })).value;
      const { requests, events } = await turnWith([toolCallTurn('draft_reply', { documentId: first.documentId, text: 'x'.repeat(2500) }), textTurn('I will write a shorter reply.')]);

      assert.equal(events.some((event) => event.type === 'RUN_FINISHED' && event.outcome?.type === 'interrupt'), false, 'nothing to run in the browser');
      assert.match(JSON.parse(events.find((event) => event.type === 'TOOL_CALL_RESULT').content).error, /^Input validation failed for tool draft_reply: /);
      assert.equal(requests.length, 2);
    });

    it('gives a model no tool, tells it so, and gives the browser nothing to run, to an admin who may use the assistant but read nothing', async () => {
      const { ability } = await adminWith('turn-no-reads', [ACTION.assistantUse]);
      const { requests, events } = await turnWith([textTurn('I can not look anything up with this role.')], { ability });

      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].tools, []);
      assert.match(requests[0].systemPrompts.join('\n'), /You have no tools/);
      assert.equal(textOf(events), 'I can not look anything up with this role.');
    });

    it('shows staff plain text for a provider error, keeps the provider words and the key out of the stream and the log, and logs the error once', async () => {
      const { result, lines } = await logged(() => turnWith([errorTurn('401', `invalid x-api-key: ${FAKE_KEY}`)]));

      const [error] = result.events.filter((event) => event.type === 'RUN_ERROR');
      assert.equal(error.message, 'Anthropic refused the key. Check AI_API_KEY.');
      assert.equal('rawEvent' in error, false);
      assert.ok(!result.raw.includes(FAKE_KEY));
      assert.ok(!result.raw.includes('invalid x-api-key'));
      const errors = lines.filter(([level]) => level === 'error');
      assert.equal(errors.length, 1, 'the original goes to the log once');
      assert.ok(!errors[0][1].includes(FAKE_KEY), 'without the key');
    });

    it('stops the model call when the response is closed', async () => {
      strapi.config.set('plugin::maison.aiApiKey', FAKE_KEY);
      try {
        const { adapter, requests } = fakeTextAdapter(['never']);
        const closing = new AbortController();
        const params = await service.parseBody(bodyOf('What are customers asking about today?'));
        const { ability } = await adminWith('turn-closing', EVERYTHING);
        const response = await service.turn(params, { ability, adminId: 7, responseController: closing, adapterFor: () => adapter });
        const reading = response.text();
        await waitFor(() => requests.length > 0, 'the model call');

        closing.abort();

        assert.equal(await Promise.race([reading, new Promise((resolve) => setTimeout(() => resolve('still open'), 3000))]), '', 'the stream ends with nothing more');
        assert.equal(requests[0].request.signal.aborted, true, 'and the model call was told to stop');
      } finally {
        strapi.config.set('plugin::maison.aiApiKey', null);
      }
    });
  });

  describe('over the admin routes', () => {
    let user;
    let outsider;
    let assistantOnly;

    before(async () => {
      user = await adminWith('routes-user', [ACTION.assistantUse, ACTION.inquiriesView, ACTION.questionsRead]);
      outsider = await adminWith('routes-outsider', [ACTION.inquiriesView, ACTION.questionsRead]);
      assistantOnly = await adminWith('routes-assistant-only', [ACTION.assistantUse]);
    });

    it('GET /maison/assistant/status answers an admin who may use the assistant, and nobody else', async () => {
      assert.equal((await call('GET', '/maison/assistant/status')).status, 401);
      assert.equal((await call('GET', '/maison/assistant/status', outsider.token)).status, 403);
      const { status, body } = await call('GET', '/maison/assistant/status', user.token);
      assert.equal(status, 200);
      assert.deepEqual(body, { ready: false, reason: NOT_SET_UP });
    });

    it('POST /maison/assistant/chat answers a chat with no key as a 200 event stream with one RUN_ERROR, not_ready', async () => {
      const chat = { threadId: 't', runId: 'r', messages: [{ id: 'm', role: 'user', content: 'Hello' }], tools: [], context: [] };
      assert.equal((await call('POST', '/maison/assistant/chat', undefined, chat)).status, 401);
      assert.equal((await call('POST', '/maison/assistant/chat', outsider.token, chat)).status, 403);

      const { status, headers, text } = await call('POST', '/maison/assistant/chat', user.token, chat);
      assert.equal(status, 200);
      assert.match(headers.get('content-type'), /^text\/event-stream/);
      const events = eventsOf(text);
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'RUN_ERROR');
      assert.equal(events[0].code, 'not_ready');
      assert.equal(events[0].message, NOT_SET_UP);
    });

    it('refuses a body that is not a chat with a 400, and a 21st staff message as a 200 event stream with one RUN_ERROR, chat_too_long', async () => {
      strapi.config.set('plugin::maison.aiApiKey', FAKE_KEY);
      try {
        const bad = await call('POST', '/maison/assistant/chat', user.token, { messages: 'hello' });
        assert.equal(bad.status, 400);
        assert.match(bad.body.error.message, /AG-UI/);

        const history = (staffMessages) =>
          Array.from({ length: staffMessages * 2 - 1 }, (_, index) =>
            index % 2 === 0 ? { id: `u-${index}`, role: 'user', content: `Question ${index}` } : { id: `a-${index}`, role: 'assistant', content: `Answer ${index}` }
          );
        const tooLong = await call('POST', '/maison/assistant/chat', user.token, { threadId: 't', runId: 'r', messages: history(21), tools: [], context: [] });
        assert.equal(tooLong.status, 200);
        const events = eventsOf(tooLong.text);
        assert.equal(events.length, 1);
        assert.equal(events[0].code, 'chat_too_long');
        assert.equal(events[0].message, CHAT_TOO_LONG);
      } finally {
        strapi.config.set('plugin::maison.aiApiKey', null);
      }
    });

    // The one test that streams a real turn through Koa: the four headers on a real turn, the SDK's event stream through the response, and a closed
    // tab stopping the model call. The close listener itself is held by the controller's unit test; this holds the whole path.
    it('streams a real turn, with the admin\'s own tools, and stops the model call when the connection is closed in the middle of it', { timeout: 30_000 }, async () => {
      const { adapter, requests } = fakeTextAdapter([toolCallTurn('list_inquiries', { filter: 'all', limit: 5 }), 'never']);
      const original = service.turn;
      const patched = (params, request) => original.call(service, params, { ...request, adapterFor: () => adapter });
      service.turn = patched;
      const leaving = new AbortController();
      try {
        // That is the function the route will call. With no key the route answers not_ready, so a patch that did not take reaches no model.
        assert.equal(strapi.plugin('maison').service('assistant').turn, patched);
        strapi.config.set('plugin::maison.aiApiKey', FAKE_KEY);

        const chat = { threadId: 't', runId: 'r', messages: [{ id: 'm', role: 'user', content: 'What are customers asking about today?' }], tools: [], context: [] };
        const response = await fetch(new URL('/maison/assistant/chat', baseUrl), {
          method: 'POST',
          headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(chat),
          signal: AbortSignal.any([leaving.signal, AbortSignal.timeout(15_000)]),
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /^text\/event-stream/);
        assert.equal(response.headers.get('x-accel-buffering'), 'no');
        assert.match(response.headers.get('cache-control'), /no-cache/);
        const first = await response.body.getReader().read();
        const text = new TextDecoder().decode(first.value);
        assert.ok(text.startsWith('data: '), text);
        assert.ok(text.includes('"type":"RUN_STARTED"'), text);

        await waitFor(() => requests.length === 2, 'the second model call');
        // Only the tools this admin's role allows reached the model: Strapi's sign-in put the admin's ability in front of the turn.
        assert.deepEqual(requests[0].tools.map((tool) => tool.name), ['list_questions', 'list_inquiries', 'inquiry_counts']);
        assert.equal(requests[1].messages.at(-1).role, 'tool');
        assert.equal(requests[1].request.signal.aborted, false, 'the model call runs while the tab is open');

        leaving.abort();

        await waitFor(() => requests[1].request.signal.aborted, 'the model call to be told to stop');
      } finally {
        leaving.abort();
        service.turn = original;
        strapi.config.set('plugin::maison.aiApiKey', null);
      }
    });

    it('GET /maison/inquiries/:documentId gives one inquiry as staff see it, 404 for an unknown one, and leaves /summary and /quota alone', async () => {
      const [first] = (await inquiries.list({ filter: 'all', limit: 5 })).value;
      assert.equal((await call('GET', `/maison/inquiries/${first.documentId}`)).status, 401);
      assert.equal((await call('GET', `/maison/inquiries/${first.documentId}`, assistantOnly.token)).status, 403);

      const found = await call('GET', `/maison/inquiries/${first.documentId}`, user.token);
      assert.equal(found.status, 200);
      assert.equal(found.body.inquiry.documentId, first.documentId);
      assert.match(found.body.inquiry.customer, /^line:U[0-9a-f]{3}…[0-9a-f]{2}$/);
      assert.doesNotMatch(found.text, LINE_USER_ID);

      const missing = await call('GET', '/maison/inquiries/no-such-inquiry', user.token);
      assert.equal(missing.status, 404);
      assert.equal(missing.body.error.details.code, 'not_found');

      const summary = await call('GET', '/maison/inquiries/summary', user.token);
      assert.equal(summary.status, 200, 'summary is not read as a documentId');
      assert.deepEqual(Object.keys(summary.body).sort(), ['complaint', 'needsAnswer', 'notLabelled', 'praise']);
      const quota = await call('GET', '/maison/inquiries/quota', user.token);
      assert.equal(quota.status, 200, 'quota is not read as a documentId');
      assert.equal(quota.body.configured, false);
    });

    it('GET /maison/questions/:reference gives one question as staff see it, 404 for an unknown one, and 400 for a reference that is not one', async () => {
      const [first] = (await questions.list({ status: 'all', limit: 5 })).value;
      assert.equal((await call('GET', `/maison/questions/${first.reference}`)).status, 401);
      assert.equal((await call('GET', `/maison/questions/${first.reference}`, assistantOnly.token)).status, 403);

      const found = await call('GET', `/maison/questions/${first.reference}`, user.token);
      assert.equal(found.status, 200);
      assert.equal(found.body.question.reference, first.reference);
      assert.match(found.body.question.customer, /^line:U[0-9a-f]{3}…[0-9a-f]{2}$/);
      assert.doesNotMatch(found.text, LINE_USER_ID);

      const all = (await questions.list({ status: 'all', limit: 50 })).value.map((row) => row.reference);
      const missing = await call('GET', `/maison/questions/${absentReference(all)}`, user.token);
      assert.equal(missing.status, 404);
      assert.equal(missing.body.error.details.code, 'not_found');

      const bad = await call('GET', '/maison/questions/BAD-1', user.token);
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.details.code, 'invalid_input');
      assert.equal(bad.body.error.details.hint, 'Use a reference like Q-4821.');
    });

    it('shows a question that the demo marked as the presenter\'s own as yourLine, and never shows the ID', async () => {
      const mine = (await questions.list({ status: 'all', limit: 50 })).value.filter((row) => row.yourLine);
      assert.ok(mine.length > 0, 'Load demo activity gave the presenter\'s account a question');
      const found = await call('GET', `/maison/questions/${mine[0].reference}`, user.token);
      assert.equal(found.body.question.yourLine, true);
      assert.ok(!found.text.includes(PAUL_ID));
    });
  });

  // It builds its own state, so it can run alone.
  it('puts no full LINE user ID or display name in anything a model was sent or any tool returned, and none in any answer of the item routes', async () => {
    const rows = await strapi.documents(QUESTION).findMany({ limit: 100 });
    assert.ok(rows.some((row) => LINE_USER_ID.test(row.customer)), 'the database holds full LINE user IDs');
    assert.ok(rows.some((row) => DEMO_NAMES.includes(row.customerName)), "and the made-up customers' names");
    assert.ok(forbiddenIn(JSON.stringify(rows)).length > 0, 'so the scan can tell');
    assert.deepEqual(forbiddenIn('line:U' + 'a'.repeat(32) + ' Aiko T.'), ['U' + 'a'.repeat(32), 'Aiko T.'], 'and it can tell when there is one');

    const scan = await adminWith('scan-user', EVERYTHING);
    const outputs = [];
    for (const [name, args] of [
      ['list_requests', { status: 'all', limit: 50 }],
      ['list_questions', { status: 'all', limit: 50 }],
      ['list_inquiries', { filter: 'all', limit: 50 }],
      ['inquiry_counts', {}],
    ]) {
      const tool = service.tools(scan.ability).find((candidate) => candidate.name === name);
      outputs.push(JSON.stringify(await tool.execute(args)));
    }
    // One item of each, which keeps its full text.
    const [aRequest] = JSON.parse(outputs[0]).requests;
    const [aQuestion] = JSON.parse(outputs[1]).questions;
    const [anInquiry] = JSON.parse(outputs[2]).inquiries;
    outputs.push(
      JSON.stringify(await service.tools(scan.ability).find((tool) => tool.name === 'list_requests').execute({ reference: aRequest.reference })),
      JSON.stringify(await service.tools(scan.ability).find((tool) => tool.name === 'list_questions').execute({ reference: aQuestion.reference })),
      JSON.stringify(await service.tools(scan.ability).find((tool) => tool.name === 'list_inquiries').execute({ documentId: anInquiry.documentId }))
    );
    assert.ok(outputs.some((text) => text.includes('line:Udec…0')), 'the tools returned the masked made-up customers');
    for (const text of outputs) assert.deepEqual(forbiddenIn(text), [], text.slice(0, 120));

    // And what a model is sent in a turn that reads them.
    strapi.config.set('plugin::maison.aiApiKey', FAKE_KEY);
    try {
      const fake = fakeTextAdapter([
        toolCallTurn('list_requests', { status: 'all' }),
        toolCallTurn('list_questions', { status: 'all' }),
        toolCallTurn('list_inquiries', { filter: 'all', limit: 50 }),
        textTurn('Done.'),
      ]);
      const params = await service.parseBody({ threadId: 't', runId: 'r', messages: [{ id: 'm', role: 'user', content: 'Read everything.' }], tools: [], context: [] });
      const response = await service.turn(params, { ability: scan.ability, adminId: 7, responseController: new AbortController(), adapterFor: () => fake.adapter });
      await response.text();
      assert.equal(fake.requests.length, 4);
      const saw = modelSaw(fake.requests.at(-1));
      assert.ok(saw.includes('line:Udec…0'), 'the model was sent the masked customers');
      assert.deepEqual(forbiddenIn(saw), []);
    } finally {
      strapi.config.set('plugin::maison.aiApiKey', null);
    }
  });
});

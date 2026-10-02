import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createStandIn, fileLog, labelsFor } from './anthropic-stand-in.mjs';

const SCRIPT = fileURLToPath(new URL('./anthropic-stand-in.mjs', import.meta.url));
const KEY = 'stand-in-key-that-must-never-be-logged';

const folders = [];
const servers = [];
after(() => {
  servers.forEach((server) => server.close());
  folders.forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

/** A request that fails after 5 seconds, so a stand-in that breaks while answering fails its test and doesn't hang it. */
const send = (url, init = {}) => fetch(url, { signal: AbortSignal.timeout(5000), ...init });

/** The stand-in on a free port of 127.0.0.1, with what it logs collected in `entries`. */
const standIn = async () => {
  const entries = [];
  const server = createStandIn({ log: (entry) => entries.push(entry) });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { entries, url: `http://127.0.0.1:${server.address().port}` };
};

/** The user message Maison's labelling sends (labelUserMessage), for a message and its facts. */
const exchange = (message, { reply = 'A reply.', knowledgeFound = false, handedOff = false } = {}) =>
  [
    '<customer_message>',
    message,
    '</customer_message>',
    '<concierge_reply>',
    reply,
    '</concierge_reply>',
    `Knowledge found: ${knowledgeFound ? 'yes' : 'no'}. Handed to staff: ${handedOff ? 'yes' : 'no'}.`,
  ].join('\n');

/** A labelling request as Maison sends it: a forced record_labels call. */
const labelling = (content, { headers = {}, toolName = 'record_labels' } = {}) => ({
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...headers },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: 'You label one exchange.',
    messages: [{ role: 'user', content }],
    tools: [{ name: toolName, input_schema: { type: 'object' } }],
    tool_choice: { type: 'tool', name: toolName },
  }),
});

test('labels a message that names a problem as a negative complaint', () => {
  const labels = labelsFor(exchange('The strap broke on my bag after a week.'));
  assert.equal(labels.kind, 'complaint');
  assert.equal(labels.sentimentLabel, 'negative');
  assert.equal(labels.sentimentScore, -0.6);
});

test('labels thanks as positive praise, in English or Japanese', () => {
  for (const message of ['Thank you, the bag is beautiful.', '素敵なバッグをありがとうございます。']) {
    const labels = labelsFor(exchange(message));
    assert.equal(labels.kind, 'praise', message);
    assert.equal(labels.sentimentLabel, 'positive', message);
  }
});

test('labels anything else a neutral question, answered only when knowledge was found and nothing was handed off', () => {
  assert.equal(labelsFor(exchange('How long does delivery take?', { knowledgeFound: true })).answered, true);
  assert.equal(labelsFor(exchange('How long does delivery take?')).answered, false);
  assert.equal(labelsFor(exchange('How long does delivery take?', { knowledgeFound: true, handedOff: true })).answered, false);
  const labels = labelsFor(exchange('Is the canvas waterproof?'));
  assert.deepEqual({ kind: labels.kind, sentimentScore: labels.sentimentScore, sentimentLabel: labels.sentimentLabel }, { kind: 'question', sentimentScore: 0, sentimentLabel: 'neutral' });
});

test('matches whole English words only, so "translate" and "chocolate" are no complaint', () => {
  assert.equal(labelsFor(exchange('Can you translate the care card?')).kind, 'question');
  assert.equal(labelsFor(exchange('Is the chocolate brown in stock?')).kind, 'question');
});

test("reads only the customer's message: words in the reply don't change the kind", () => {
  assert.equal(labelsFor(exchange('Is the canvas waterproof?', { reply: 'Thank you! Sorry it broke.' })).kind, 'question');
});

test('every label has a reason and a topic, in English, within what Maison accepts', () => {
  for (const message of ['It broke.', 'Thank you!', 'When do you open?']) {
    const { reason, topic } = labelsFor(exchange(message));
    assert.ok(reason.length > 0 && reason.length <= 400);
    assert.ok(topic.length > 0 && topic.length <= 80);
  }
});

test('answers a labelling request as the Messages API does, with one record_labels tool_use block, and logs the labels, never the key', async () => {
  const { entries, url } = await standIn();
  const response = await send(`${url}/v1/messages`, labelling(exchange('The zip broke.')));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.type, 'message');
  assert.equal(body.role, 'assistant');
  assert.equal(body.model, 'claude-haiku-4-5-20251001');
  assert.equal(body.stop_reason, 'tool_use');
  assert.equal(body.content.length, 1);
  assert.equal(body.content[0].type, 'tool_use');
  assert.equal(body.content[0].name, 'record_labels');
  assert.equal(body.content[0].input.kind, 'complaint');
  assert.deepEqual(entries.map(({ at, ...entry }) => entry), [{ kind: 'labels', model: 'claude-haiku-4-5-20251001', labels: body.content[0].input }]);
  assert.equal(JSON.stringify(entries).includes(KEY), false);
});

test('answers 529, as an overloaded API does, for a message that asks for a failure, so a failed label can be checked', async () => {
  const { entries, url } = await standIn();
  const response = await send(`${url}/v1/messages`, labelling(exchange('Please stand-in fail this one.')));
  assert.equal(response.status, 529);
  assert.equal((await response.json()).error.type, 'overloaded_error');
  assert.deepEqual(entries.map(({ at, ...entry }) => entry), [{ kind: 'failure', model: 'claude-haiku-4-5-20251001' }]);
});

test("answers 401 without a key, 400 for a body that isn't JSON or isn't a record_labels call, 404 for every other route, and logs none of them", async () => {
  const { entries, url } = await standIn();
  assert.equal((await send(`${url}/v1/messages`, labelling(exchange('Hi'), { headers: { 'x-api-key': '' } }))).status, 401);
  assert.equal((await send(`${url}/v1/messages`, { method: 'POST', headers: { 'x-api-key': KEY }, body: 'not json' })).status, 400);
  assert.equal((await send(`${url}/v1/messages`, labelling(exchange('Hi'), { toolName: 'something_else' }))).status, 400);
  assert.equal((await send(`${url}/v1/messages`)).status, 404); // a GET: messages are POSTs
  assert.equal((await send(`${url}/v1/complete`, { method: 'POST', body: '{}' })).status, 404);
  assert.equal((await send(`${url}/`)).status, 404);
  assert.deepEqual(entries, []);
});

test('writes each entry as a line of JSON in a file, in a folder it creates, and the file never has the key', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'maison-anthropic-stand-in-'));
  folders.push(folder);
  const file = join(folder, 'not-yet', '.tmp', 'anthropic-stand-in.jsonl');
  const server = createStandIn({ log: fileLog(file) });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  await send(`${url}/v1/messages`, labelling(exchange('It broke.')));
  await send(`${url}/v1/messages`, labelling(exchange('Thank you!')));
  const text = readFileSync(file, 'utf8');
  assert.equal(text.includes(KEY), false);
  const lines = text.trimEnd().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((line) => line.labels.kind), ['complaint', 'praise']);
});

/** A port that something already listens on, on 127.0.0.1. */
const takenPort = async () => {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: server.address().port, close: () => server.close() };
};

test('exits 1, with what to check, when its port is taken, as by another stand-in', async () => {
  const taken = await takenPort();
  try {
    const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ANTHROPIC_STAND_IN_PORT: String(taken.port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => (output += chunk));
    const [code] = await once(child, 'exit');
    assert.equal(code, 1);
    assert.equal(output.trim(), `Port ${taken.port} is in use: is another Anthropic stand-in running?`);
  } finally {
    taken.close();
  }
});

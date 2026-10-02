import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { DISPLAY_NAME, createStandIn, fileLog } from './line-stand-in.mjs';

const SCRIPT = fileURLToPath(new URL('./line-stand-in.mjs', import.meta.url));
const USER = `U${'0123456789abcdef'.repeat(2)}`; // as LINE gives a user ID
const TOKEN = 'channel-access-token-that-must-never-be-logged';

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

test('answers a push as LINE does, 200 with the messages it sent, and logs what was pushed, never the channel access token', async () => {
  const { entries, url } = await standIn();
  const body = { to: USER, messages: [{ type: 'text', text: 'Hello, this is Jane, a client advisor at Maison.' }] };
  const response = await send(`${url}/v2/bot/message/push`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  assert.equal(Array.isArray((await response.json()).sentMessages), true);
  assert.deepEqual(entries.map(({ at, ...entry }) => entry), [{ kind: 'push', body }]);
  assert.match(entries[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.stringify(entries).includes(TOKEN), false);
});

test('answers a profile lookup with a made-up display name, for the user ID in the path, and logs the lookup', async () => {
  const { entries, url } = await standIn();
  const response = await send(`${url}/v2/bot/profile/${encodeURIComponent(USER)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: USER, displayName: DISPLAY_NAME });
  assert.deepEqual(entries.map(({ at, ...entry }) => entry), [{ kind: 'profile', userId: USER }]);
  assert.equal(JSON.stringify(entries).includes(TOKEN), false);
  // A query string is no part of the route, or of the user ID.
  const withQuery = await send(`${url}/v2/bot/profile/${USER}?x=1`);
  assert.equal(withQuery.status, 200);
  assert.equal((await withQuery.json()).userId, USER);
});

test("answers every other route 404 and a push that isn't JSON 400, and logs neither", async () => {
  const { entries, url } = await standIn();
  assert.equal((await send(`${url}/`)).status, 404);
  assert.equal((await send(`${url}/v2/bot/message/push`)).status, 404); // a GET: pushes are POSTs
  assert.equal((await send(`${url}/v2/bot/profile/${USER}`, { method: 'POST' })).status, 404);
  assert.equal((await send(`${url}/v2/bot/profile/${USER}/extra`)).status, 404);
  assert.equal((await send(`${url}/v2/bot/message/multicast`, { method: 'POST', body: '{}' })).status, 404);
  assert.equal((await send(`${url}/v2/bot/profile/%E0%A4%A`)).status, 404); // a path that isn't valid percent-encoding
  assert.equal((await send(`${url}/v2/bot/message/push`, { method: 'POST', body: 'not json' })).status, 400);
  assert.deepEqual(entries, []);
});

test('writes each entry as a line of JSON in a file, in a folder it creates, and the file never has the token', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'maison-stand-in-'));
  folders.push(folder);
  const file = join(folder, 'not-yet', '.tmp', 'line-stand-in.jsonl');
  const server = createStandIn({ log: fileLog(file) });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
  await send(`${url}/v2/bot/message/push`, { method: 'POST', headers, body: JSON.stringify({ to: USER, messages: [{ type: 'text', text: 'One' }] }) });
  await send(`${url}/v2/bot/message/push`, { method: 'POST', headers, body: JSON.stringify({ to: USER, messages: [{ type: 'text', text: 'Two' }] }) });
  const text = readFileSync(file, 'utf8');
  assert.equal(text.includes(TOKEN), false);
  const lines = text.trimEnd().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((line) => line.body.messages[0].text), ['One', 'Two']);
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
    const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, LINE_STAND_IN_PORT: String(taken.port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => (output += chunk));
    const [code] = await once(child, 'exit');
    assert.equal(code, 1);
    assert.equal(output.trim(), `Port ${taken.port} is in use: is another LINE stand-in running?`);
  } finally {
    taken.close();
  }
});

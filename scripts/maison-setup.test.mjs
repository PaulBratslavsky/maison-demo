import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { readEnv } from './line-mode.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SETUP = new URL('../strapi/scripts/maison-setup.mjs', import.meta.url);
const DEMO_ADMIN = { DEMO_ADMIN_EMAIL: 'admin@maison.example', DEMO_ADMIN_PASSWORD: 'Maison1-not-a-real-password' };

const servers = [];
const folders = [];
after(() => {
  servers.forEach((server) => server.close());
  folders.forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

/**
 * Strapi on a free port. It answers every request with answer(request), [status, body] (404 until a test sets one),
 * and lists each request it gets as "METHOD /path" in `seen`.
 */
const fakeStrapi = async () => {
  const fake = { seen: [], answer: () => [404, { data: null, error: { status: 404, name: 'NotFoundError', message: 'Not Found' } }] };
  const server = createServer((request, response) => {
    fake.seen.push(`${request.method} ${request.url}`);
    const [status, body] = fake.answer(request);
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  fake.url = `http://127.0.0.1:${server.address().port}`;
  return fake;
};

// The script reads STRAPI_URL when it loads, so the fake Strapi comes first.
const strapi = await fakeStrapi();
process.env.STRAPI_URL = strapi.url;
const { call, writeEnv } = await import(SETUP);

const node = promisify(execFile);

test('importing the script runs nothing: no request to Strapi, no output and no exit code', async () => {
  const quiet = await fakeStrapi();
  // With the demo admin's variables set, as npm run setup sets them, so main() would get as far as Strapi if it ran.
  const env = { ...process.env, STRAPI_URL: quiet.url, ...DEMO_ADMIN };
  const { stdout, stderr } = await node(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(SETUP.href)}); console.log('imported');`], { env });
  assert.equal(stdout, 'imported\n');
  assert.equal(stderr, '');
  assert.deepEqual(quiet.seen, []);
});

test('run as npm run setup runs it, from the repo root, it sets up: it asks Strapi first', async () => {
  const fresh = await fakeStrapi();
  const env = { ...process.env, STRAPI_URL: fresh.url, ...DEMO_ADMIN };
  await assert.rejects(node(process.execPath, ['strapi/scripts/maison-setup.mjs'], { cwd: ROOT, env }), (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, `Setting up the Maison demo on ${fresh.url}.\n`);
    assert.match(error.stderr, /^Setup failed: GET \/admin\/init failed with 404: /);
    return true;
  });
  assert.deepEqual(fresh.seen, ['GET /admin/init']);
});

const signIn = () => call('POST', '/admin/login', { email: DEMO_ADMIN.DEMO_ADMIN_EMAIL, password: DEMO_ADMIN.DEMO_ADMIN_PASSWORD });
const failure = (status, name, message) => [status, { data: null, error: { status, name, message, details: {} } }];
const START_OVER = '"Start over with a clean database" in README.md';

test("a sign-in that fails, but for 429, says the demo admin may not be this database's first admin, and where to start over", async () => {
  // 400 is what Strapi answers for a wrong email or password.
  for (const answer of [failure(400, 'ApplicationError', 'Invalid credentials'), failure(401, 'UnauthorizedError', 'Unauthorized'), failure(500, 'InternalServerError', 'Internal Server Error')]) {
    strapi.answer = () => answer;
    await assert.rejects(signIn(), (error) => {
      assert.ok(error.message.startsWith(`POST /admin/login failed with ${answer[0]}: ${JSON.stringify(answer[1].error)} `), error.message);
      assert.match(error.message, /DEMO_ADMIN_EMAIL/);
      assert.match(error.message, /first admin/);
      assert.ok(error.message.endsWith(`See ${START_OVER}.`), error.message);
      return true;
    });
  }
  // The README has that section.
  assert.match(readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /^### Start over with a clean database$/m);
});

test('a sign-in answered 429 keeps its own message, and other calls get no sign-in hint', async () => {
  strapi.answer = () => failure(429, 'RateLimitError', 'Too many requests, please try again later.');
  await assert.rejects(signIn(), { message: 'POST /admin/login answered 429: Strapi allows 5 admin sign-ins per 5 minutes. Wait, or restart Strapi.' });
  strapi.answer = () => failure(401, 'UnauthorizedError', 'Missing or invalid credentials');
  await assert.rejects(call('GET', '/strapi-oauth-mcp-manager/clients', undefined, 'expired-jwt'), (error) => {
    assert.equal(error.message, 'GET /strapi-oauth-mcp-manager/clients failed with 401: {"status":401,"name":"UnauthorizedError","message":"Missing or invalid credentials","details":{}}');
    return true;
  });
});

/** A folder of its own, with `files` written in it ({ name: text }), and the path of its .env. */
const folderWith = (files) => {
  const folder = mkdtempSync(join(tmpdir(), 'maison-setup-'));
  folders.push(folder);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text, { mode: 0o600 });
  return join(folder, '.env');
};
const fileMode = (file) => statSync(file).mode & 0o777;

test('writes a value with $&, $1 and $$ in it as it is', () => {
  const file = folderWith({ '.env': 'NEXT_PUBLIC_STRAPI_URL=http://localhost:1338\nNEXT_PUBLIC_MAISON_CLIENT_ID=mcp_client_old\n' });
  writeEnv(file, { NEXT_PUBLIC_MAISON_CLIENT_ID: 'mcp_$&_$1_$$_x', NEXT_PUBLIC_STRAPI_URL: 'http://localhost:1338/$1' });
  assert.equal(readFileSync(file, 'utf8'), 'NEXT_PUBLIC_STRAPI_URL=http://localhost:1338/$1\nNEXT_PUBLIC_MAISON_CLIENT_ID=mcp_$&_$1_$$_x\n');
});

test('updates a key written as export KEY=… where it stands, adding no second one', () => {
  const file = folderWith({ '.env': 'export NEXT_PUBLIC_STRAPI_URL=http://localhost:1338\nOLLAMA_MODEL=qwen3-14b-32k\n' });
  writeEnv(file, { NEXT_PUBLIC_STRAPI_URL: 'http://localhost:1339' });
  assert.equal(readFileSync(file, 'utf8'), 'export NEXT_PUBLIC_STRAPI_URL=http://localhost:1339\nOLLAMA_MODEL=qwen3-14b-32k\n');
});

test('updates every line that sets the key, a later one too, so the new value is the one read, adding none', () => {
  // dotenv, which Next reads liff/.env with, and Node's --env-file both take the last line that sets a key.
  const file = folderWith({ '.env': 'OLLAMA_MODEL=qwen3-14b-32k\nNEXT_PUBLIC_MAISON_CLIENT_ID=mcp_client_old\nSTRAPI_URL=http://127.0.0.1:1338\nNEXT_PUBLIC_MAISON_CLIENT_ID=mcp_client_older\n' });
  writeEnv(file, { NEXT_PUBLIC_MAISON_CLIENT_ID: 'mcp_client_new' });
  assert.equal(
    readFileSync(file, 'utf8'),
    'OLLAMA_MODEL=qwen3-14b-32k\nNEXT_PUBLIC_MAISON_CLIENT_ID=mcp_client_new\nSTRAPI_URL=http://127.0.0.1:1338\nNEXT_PUBLIC_MAISON_CLIENT_ID=mcp_client_new\n'
  );
  assert.equal(readEnv(file).NEXT_PUBLIC_MAISON_CLIENT_ID, 'mcp_client_new');
});

test('without a .env, copies .env.example, then writes the values into it, readable by you only', () => {
  const example = 'NEXT_PUBLIC_STRAPI_URL=\nNEXT_PUBLIC_MAISON_CLIENT_ID=\n# Ollama, when there is no API key\nOLLAMA_MODEL=qwen3-14b-32k\n';
  const file = folderWith({ '.env.example': example });
  chmodSync(join(file, '..', '.env.example'), 0o644);
  assert.equal(existsSync(file), false);
  writeEnv(file, { NEXT_PUBLIC_STRAPI_URL: 'http://localhost:1338', NEXT_PUBLIC_MAISON_CLIENT_ID: 'mcp_client_new' });
  assert.equal(
    readFileSync(file, 'utf8'),
    'NEXT_PUBLIC_STRAPI_URL=http://localhost:1338\nNEXT_PUBLIC_MAISON_CLIENT_ID=mcp_client_new\n# Ollama, when there is no API key\nOLLAMA_MODEL=qwen3-14b-32k\n'
  );
  assert.equal(fileMode(file), 0o600);
  assert.equal(readFileSync(join(file, '..', '.env.example'), 'utf8'), example, '.env.example is left as it was');
});

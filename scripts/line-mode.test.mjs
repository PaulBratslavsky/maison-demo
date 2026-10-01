import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { main, readEnv } from './line-mode.mjs';

const SECRET = 'jwt-secret-that-must-never-print';
const INPUTS = { LINE_MODE_LIFF_ID: '1234567891-AbcdEfgh', LINE_MODE_CHANNEL_ID: '1234567891', LINE_MODE_DOMAIN: 'maison-test.ngrok-free.dev' };

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/**
 * A demo checkout in local mode, as `npm install` and `npm run setup` leave it, plus `liffExtra` in liff/.env. liff/.env
 * is readable by others (644), as an editor may leave a file it saved: the switch makes it 600.
 */
const demo = (liffExtra = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'maison-mode-'));
  roots.push(root);
  mkdirSync(join(root, 'strapi'));
  mkdirSync(join(root, 'liff'));
  const lines = (values) => Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
  writeFileSync(
    join(root, 'strapi', '.env'),
    lines({ PORT: '1338', JWT_SECRET: SECRET, LINE_LOGIN_CHANNEL_ID: '1234567890', LINE_VERIFY_URL: 'http://127.0.0.1:4545/verify', MAISON_LIFF_URL: 'http://localhost:3003', MAISON_APP_ORIGIN: '', PUBLIC_URL: '' }),
    { mode: 0o600 }
  );
  writeFileSync(join(root, 'liff', '.env'), lines({ NEXT_PUBLIC_STRAPI_URL: 'http://localhost:1338', NEXT_PUBLIC_MAISON_CLIENT_ID: 'mcp_client_test', ...liffExtra }));
  chmodSync(join(root, 'liff', '.env'), 0o644); // whatever the umask
  return root;
};
const fileMode = (root, app) => statSync(join(root, app, '.env')).mode & 0o777;
const run = (args, root) => {
  const lines = [];
  const code = main(args, { root, log: (line) => lines.push(line) });
  return { code, out: lines.join('\n') };
};
const env = (root, app) => readEnv(join(root, app, '.env'));
const pick = (values, keys) => Object.fromEntries(keys.map((key) => [key, values[key]]));
const STRAPI_KEYS = ['LINE_LOGIN_CHANNEL_ID', 'LINE_VERIFY_URL', 'MAISON_LIFF_URL', 'PUBLIC_URL'];
const LIFF_KEYS = ['NEXT_PUBLIC_LIFF_MOCK', 'NEXT_PUBLIC_LIFF_ID', 'NEXT_PUBLIC_STRAPI_URL', 'STRAPI_URL'];

test('switches to LINE mode and back, and a second run of either changes nothing', () => {
  const root = demo(INPUTS);
  assert.match(run(['status'], root).out, /^Mode: local /);
  assert.equal(fileMode(root, 'liff'), 0o644);

  assert.equal(run(['line'], root).code, 0);
  for (const app of ['strapi', 'liff']) assert.equal(fileMode(root, app), 0o600, `${app}/.env is readable by you only`);
  assert.deepEqual(pick(env(root, 'strapi'), STRAPI_KEYS), {
    LINE_LOGIN_CHANNEL_ID: '1234567891',
    LINE_VERIFY_URL: '',
    MAISON_LIFF_URL: 'https://liff.line.me/1234567891-AbcdEfgh',
    PUBLIC_URL: 'https://maison-test.ngrok-free.dev',
  });
  assert.deepEqual(pick(env(root, 'liff'), LIFF_KEYS), {
    NEXT_PUBLIC_LIFF_MOCK: 'false',
    NEXT_PUBLIC_LIFF_ID: '1234567891-AbcdEfgh',
    NEXT_PUBLIC_STRAPI_URL: 'https://maison-test.ngrok-free.dev',
    // The app's server reaches Strapi on this machine, never through the tunnel (the proxy and the concierge).
    STRAPI_URL: 'http://127.0.0.1:1338',
  });
  const files = () => ['strapi', 'liff'].map((app) => readFileSync(join(root, app, '.env'), 'utf8')).join('\n');
  const once = files();
  run(['line'], root);
  assert.equal(files(), once);
  assert.match(run(['status'], root).out, /^Mode: LINE /);
  assert.equal(run(['require-line'], root).code, 0);

  assert.equal(run(['local'], root).code, 0);
  assert.deepEqual(pick(env(root, 'strapi'), STRAPI_KEYS), {
    LINE_LOGIN_CHANNEL_ID: '1234567890',
    LINE_VERIFY_URL: 'http://127.0.0.1:4545/verify',
    MAISON_LIFF_URL: 'http://localhost:3003',
    PUBLIC_URL: '',
  });
  assert.deepEqual(pick(env(root, 'liff'), LIFF_KEYS), {
    NEXT_PUBLIC_LIFF_MOCK: 'true',
    NEXT_PUBLIC_LIFF_ID: '',
    NEXT_PUBLIC_STRAPI_URL: 'http://localhost:1338',
    STRAPI_URL: 'http://127.0.0.1:1338',
  });
  const local = files();
  run(['local'], root);
  assert.equal(files(), local);
  assert.equal(env(root, 'strapi').JWT_SECRET, SECRET);
  assert.equal(env(root, 'liff').NEXT_PUBLIC_MAISON_CLIENT_ID, 'mcp_client_test');
  for (const app of ['strapi', 'liff']) assert.equal(fileMode(root, app), 0o600);
  assert.match(run(['status'], root).out, /^Mode: local /);
  assert.equal(run(['require-line'], root).code, 1);
});

test('back in local mode, says to stop ngrok first: a tunnel left open would reach the app on the LIFF mock', () => {
  const root = demo(INPUTS);
  run(['line'], root);
  const { code, out } = run(['local'], root);
  assert.equal(code, 0);
  assert.match(out, /^Stop ngrok first \(Ctrl-C in its terminal\)\./m);
});

const REFUSE_DEV = 'The app is in LINE mode. For the stage, run npm run mode:local, then restart Strapi.';

test('require-local, which npm run dev runs first, refuses LINE mode and lets local mode through', () => {
  const root = demo(INPUTS);
  assert.equal(run(['require-local'], root).code, 0);
  run(['line'], root);
  const { code, out } = run(['require-local'], root);
  assert.equal(code, 1);
  assert.ok(out.split('\n').includes(REFUSE_DEV), out);
  run(['local'], root);
  assert.equal(run(['require-local'], root).code, 0);
});

test('require-local refuses whenever the app is set for LINE, though the rest is mixed, and lets the LIFF mock through', () => {
  // The app's own setting decides what npm run dev would start: next dev on the LIFF mock, or on LINE.
  const lineApp = demo({ ...INPUTS, NEXT_PUBLIC_LIFF_MOCK: 'false' });
  assert.match(run(['status'], lineApp).out, /^Mode: mixed\./);
  assert.equal(run(['require-local'], lineApp).code, 1);
  const mockApp = demo({ NEXT_PUBLIC_LIFF_MOCK: 'true' });
  assert.equal(run(['require-local'], mockApp).code, 0);
});

test('npm run dev and npm run dev:app run require-local before they start anything', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['dev', 'dev:app']) assert.match(scripts[name], /^node scripts\/line-mode\.mjs require-local && /, name);
});

// Strapi reads strapi/.env with dotenv, which also takes CRLF lines, `export KEY=…`, spaces around `=` and `KEY: value`,
// and lets a later line override an earlier one. The switch reads and rewrites the files the same way.
const DOTENV_FORMS = {
  export: 'export LINE_VERIFY_URL=http://127.0.0.1:4545/verify\n',
  spaced: 'LINE_VERIFY_URL = http://127.0.0.1:4545/verify\n',
  colon: 'LINE_VERIFY_URL: http://127.0.0.1:4545/verify\n',
  crlf: 'LINE_VERIFY_URL=http://127.0.0.1:4545/verify\r\n',
};

test("reads every form Strapi's dotenv reads: a LINE_VERIFY_URL added later in any of them leaves LINE mode", () => {
  for (const [form, line] of Object.entries(DOTENV_FORMS)) {
    const root = demo(INPUTS);
    run(['line'], root);
    appendFileSync(join(root, 'strapi', '.env'), line);
    assert.equal(env(root, 'strapi').LINE_VERIFY_URL, 'http://127.0.0.1:4545/verify', form);
    assert.doesNotMatch(run(['status'], root).out, /^Mode: LINE /, form);
    assert.equal(run(['require-line'], root).code, 1, form);
    // Switching again rewrites that line too, so it can't override LINE mode's.
    assert.equal(run(['line'], root).code, 0, form);
    assert.equal(env(root, 'strapi').LINE_VERIFY_URL, '', form);
    assert.match(run(['status'], root).out, /^Mode: LINE /, form);
  }
});

test('rewrites each key where it stands, in its form, keeping CRLF line endings and the file readable by you only', () => {
  const root = demo(INPUTS);
  const file = join(root, 'strapi', '.env');
  const crlf = (lines) => lines.map((line) => `${line}\r\n`).join('');
  writeFileSync(
    file,
    crlf(['PORT=1338', `JWT_SECRET=${SECRET}`, 'export LINE_LOGIN_CHANNEL_ID=1234567890', 'LINE_VERIFY_URL = http://127.0.0.1:4545/verify', 'MAISON_LIFF_URL: http://localhost:3003', 'PUBLIC_URL=']),
    { mode: 0o600 }
  );
  assert.deepEqual(pick(env(root, 'strapi'), STRAPI_KEYS), {
    LINE_LOGIN_CHANNEL_ID: '1234567890',
    LINE_VERIFY_URL: 'http://127.0.0.1:4545/verify',
    MAISON_LIFF_URL: 'http://localhost:3003',
    PUBLIC_URL: '',
  });
  assert.match(run(['status'], root).out, /^Mode: local /);

  assert.equal(run(['line'], root).code, 0);
  const line = crlf([
    'PORT=1338',
    `JWT_SECRET=${SECRET}`,
    'export LINE_LOGIN_CHANNEL_ID=1234567891',
    'LINE_VERIFY_URL=',
    'MAISON_LIFF_URL=https://liff.line.me/1234567891-AbcdEfgh',
    'PUBLIC_URL=https://maison-test.ngrok-free.dev',
  ]);
  assert.equal(readFileSync(file, 'utf8'), line);
  assert.match(run(['status'], root).out, /^Mode: LINE /);
  run(['line'], root);
  assert.equal(readFileSync(file, 'utf8'), line);

  assert.equal(run(['local'], root).code, 0);
  const local = crlf(['PORT=1338', `JWT_SECRET=${SECRET}`, 'export LINE_LOGIN_CHANNEL_ID=1234567890', 'LINE_VERIFY_URL=http://127.0.0.1:4545/verify', 'MAISON_LIFF_URL=http://localhost:3003', 'PUBLIC_URL=']);
  assert.equal(readFileSync(file, 'utf8'), local);
  run(['local'], root);
  assert.equal(readFileSync(file, 'utf8'), local);
  assert.equal(fileMode(root, 'strapi'), 0o600);
});

test("refuses LINE mode without your LINE values, or with the mock's channel, and changes nothing", () => {
  for (const liffExtra of [{}, { ...INPUTS, LINE_MODE_CHANNEL_ID: '1234567890' }, { ...INPUTS, LINE_MODE_DOMAIN: 'https://maison-test.ngrok-free.dev' }]) {
    const root = demo(liffExtra);
    const before = readFileSync(join(root, 'strapi', '.env'), 'utf8');
    const { code, out } = run(['line'], root);
    assert.equal(code, 1);
    assert.match(out, /LINE_MODE_/);
    assert.equal(readFileSync(join(root, 'strapi', '.env'), 'utf8'), before);
  }
});

test('never prints a value from either file', () => {
  const root = demo(INPUTS);
  const out = ['status', 'line', 'status', 'require-line', 'require-local', 'local', 'require-line', 'require-local'].map((command) => run([command], root).out).join('\n');
  for (const value of [SECRET, ...Object.values(INPUTS), 'mcp_client_test']) assert.ok(!out.includes(value), `printed ${value}`);
});

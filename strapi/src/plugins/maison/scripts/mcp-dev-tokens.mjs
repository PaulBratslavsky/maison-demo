// Loads the demo catalog on a running Strapi and creates three admin API tokens for the MCP smoke tests.
// Tokens are written to test/mcp/.tokens.json (gitignored, readable by you only) and never printed.
// Usage: node --env-file=<strapi app>/.env scripts/mcp-dev-tokens.mjs
import { chmodSync, existsSync, writeFileSync } from 'node:fs';

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1338';
const email = process.env.ADMIN_EMAIL ?? process.env.LOCAL_TEST_ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD ?? process.env.LOCAL_TEST_ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (or LOCAL_TEST_ADMIN_EMAIL and LOCAL_TEST_ADMIN_PASSWORD) for an admin of that Strapi.');
}

const post = async (path, body, jwt) => {
  const response = await fetch(new URL(path, STRAPI_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`POST ${path} failed with ${response.status}: ${JSON.stringify(json.error ?? json)}`);
  return json.data ?? json;
};

const { token: jwt } = await post('/admin/login', { email, password });
const seeded = await post('/maison/demo/seed', {}, jwt);
console.log(seeded.created ? 'Loaded the demo catalog.' : 'Demo catalog already loaded.');

const stamp = Date.now();
const mint = async (name, actions) => {
  const token = await post(
    '/admin/admin-tokens',
    {
      name: `${name}-${stamp}`,
      description: 'Maison MCP smoke tests',
      lifespan: null,
      adminPermissions: actions.map((action) => ({ action, subject: null, properties: {}, conditions: [] })),
    },
    jwt
  );
  return token.accessKey;
};

const tokens = {
  customer: await mint('maison-customer', ['plugin::maison.catalog.read', 'plugin::maison.appointments.request']),
  staff: await mint('maison-staff', [
    'plugin::maison.catalog.read',
    'plugin::maison.appointments.review',
    'plugin::maison.appointments.confirm',
  ]),
  ops: await mint('maison-ops', ['plugin::maison.confirmations.send']),
};
const tokensFile = new URL('../test/mcp/.tokens.json', import.meta.url);
// `mode` applies only when the file is created, so tighten a file left by an earlier run before writing into it.
if (existsSync(tokensFile)) chmodSync(tokensFile, 0o600);
writeFileSync(tokensFile, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
console.log('Saved a customer, a staff and an ops token to test/mcp/.tokens.json.');

// Sets up the Maison demo on a running Strapi. Safe to run again: it replaces what it made before.
//   1. on a fresh database, registers the demo admin (DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD) as its first admin
//   2. loads the demo catalog, and lets websites read it over REST: the Public role gets Maison's four catalog actions
//   3. (re)creates the admin tokens "Maison customer" and "Maison ops"
//   4. (re)creates the OAuth client "Maison app" (customer sign-in with LINE, mapped to "Maison customer").
//      oauth-mcp-manager allows one active LINE client, so any other active one is deactivated first.
//   5. writes the app's Strapi URL and client ID to liff/.env, and the ops token to strapi/.tmp/maison-ops-token
// Usage from the repo root: npm run setup (Strapi at STRAPI_URL, or on PORT from strapi/.env).
// Never prints a secret.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// `||`, not `??`: a key left empty in .env counts as unset.
const STRAPI_URL = (process.env.STRAPI_URL || `http://localhost:${process.env.PORT || 1338}`).replace(/\/+$/, '');
const email = process.env.DEMO_ADMIN_EMAIL;
const password = process.env.DEMO_ADMIN_PASSWORD;

const HINTS = {
  '/maison/demo/seed': 'The Maison plugin is not loaded. Check config/plugins.ts, then run npm install in strapi/.',
  '/strapi-oauth-mcp-manager/overview': 'oauth-mcp-manager is not loaded. Check config/plugins.ts and strapi/package.json.',
};

const call = async (method, path, body, jwt) => {
  let response;
  try {
    response = await fetch(`${STRAPI_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Strapi isn't answering at ${STRAPI_URL}. Start it first (npm run dev), or set STRAPI_URL.`);
  }
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(`${method} ${path} answered 429: Strapi allows 5 admin sign-ins per 5 minutes. Wait, or restart Strapi.`);
    }
    const hint = response.status === 404 && HINTS[path] ? ` ${HINTS[path]}` : '';
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(json.error ?? json)}${hint}`);
  }
  return json.data ?? json;
};

/** Sets KEY=value lines in an env file, creating it from .env.example when missing. Leaves it readable by you only. */
const writeEnv = (file, values) => {
  mkdirSync(dirname(file), { recursive: true });
  const example = file.replace(/\.env$/, '.env.example');
  const created = !existsSync(file);
  let text = !created ? readFileSync(file, 'utf8') : existsSync(example) ? readFileSync(example, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n*$/, '\n')}${line}\n`;
  }
  // `mode` applies only when the file is created, so tighten an existing one too (it may hold an API key).
  if (!created) chmodSync(file, 0o600);
  writeFileSync(file, text, { mode: 0o600 });
};

/**
 * What a website may read without credentials: Maison's catalog over REST (GET /api/maison/collections, /products,
 * /products/:slug and /boutiques). Booking and "my visits" there take the customer's LINE session, whatever a role holds.
 */
const PUBLIC_CATALOG_ACTIONS = [
  'plugin::maison.collections.find',
  'plugin::maison.products.find',
  'plugin::maison.products.findOne',
  'plugin::maison.boutiques.find',
];

/** Every action a role's permission tree enables, as "plugin::maison.products.find": its type, controller and action joined by dots. */
const enabledActions = (permissions) =>
  Object.entries(permissions ?? {}).flatMap(([type, { controllers = {} }]) =>
    Object.entries(controllers).flatMap(([controller, actions]) =>
      Object.entries(actions)
        .filter(([, permission]) => permission.enabled)
        .map(([name]) => `${type}.${controller}.${name}`)
    )
  );

/**
 * Lets the Public role call PUBLIC_CATALOG_ACTIONS and changes nothing else about it. users-permissions takes the tree
 * sent to PUT /users-permissions/roles/:id as the role's whole set, and deletes every action not enabled in it, so this
 * reads the role's full tree, enables the four actions in it and sends all of it back. It then reads the role again and
 * fails if an action the role had is gone or a catalog action is still off, so "changes nothing else" holds by check, not
 * only by how users-permissions treats the tree. With the four actions already enabled it sends nothing.
 * Answers whether anything changed.
 */
const grantPublicCatalog = async (api) => {
  const { roles } = await api('GET', '/users-permissions/roles');
  const publicRole = roles.find((role) => role.type === 'public');
  if (!publicRole) throw new Error('users-permissions has no Public role. Check config/plugins.ts.');
  const { role } = await api('GET', `/users-permissions/roles/${publicRole.id}`);
  // Taken before the loop below enables anything in the same tree.
  const enabledBefore = enabledActions(role.permissions);
  let changed = false;
  for (const action of PUBLIC_CATALOG_ACTIONS) {
    // plugin::maison.collections.find is permissions['plugin::maison'].controllers.collections.find in the tree.
    const [type, controller, name] = action.split('.');
    const permission = role.permissions?.[type]?.controllers?.[controller]?.[name];
    if (!permission) {
      throw new Error(`Strapi has no ${action}: the Maison copy it runs predates the REST door. Copy Maison again, run npm install in strapi/ with Strapi stopped, then restart Strapi.`);
    }
    if (!permission.enabled) {
      permission.enabled = true;
      changed = true;
    }
  }
  if (changed) {
    await api('PUT', `/users-permissions/roles/${role.id}`, { name: role.name, description: role.description, permissions: role.permissions });
    const { role: updated } = await api('GET', `/users-permissions/roles/${role.id}`);
    const enabledAfter = new Set(enabledActions(updated.permissions));
    const lost = enabledBefore.filter((action) => !enabledAfter.has(action));
    // A catalog action the role had and lost is already named in `lost`.
    const missing = PUBLIC_CATALOG_ACTIONS.filter((action) => !enabledAfter.has(action) && !lost.includes(action));
    if (lost.length || missing.length) {
      const problems = [...(lost.length ? [`it no longer allows ${lost.join(', ')}`] : []), ...(missing.length ? [`it still doesn't allow ${missing.join(', ')}`] : [])];
      throw new Error(`The Public role isn't as expected after the update: ${problems.join(' and ')}. Check it under Settings > Roles > Public.`);
    }
  }
  return changed;
};

const main = async () => {
  if (!email || !password) {
    throw new Error('Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD in strapi/.env. `npm install` at the repo root creates them.');
  }
  console.log(`Setting up the Maison demo on ${STRAPI_URL}.`);

  // 1. A fresh database has no admin yet: register the demo admin as its first one.
  const { hasAdmin } = await call('GET', '/admin/init');
  const { token: jwt } = hasAdmin
    ? await call('POST', '/admin/login', { email, password })
    : await call('POST', '/admin/register-admin', { email, password, firstname: 'Maison', lastname: 'Demo' });
  if (!hasAdmin) console.log('Registered the first admin of this database (DEMO_ADMIN_EMAIL in strapi/.env).');
  const api = (method, path, body) => call(method, path, body, jwt);

  // Fail early, with the fix, if this Strapi can't sign customers in.
  const overview = await api('GET', '/strapi-oauth-mcp-manager/overview');
  if (!overview.mcpEnabled) throw new Error('Strapi MCP is off. Set mcp.enabled in config/server.ts (MCP_ENABLED).');
  if (!overview.encryptionKeyConfigured) throw new Error('Set ENCRYPTION_KEY in strapi/.env, then restart Strapi.');
  if (!overview.lineSignIn?.configured) throw new Error('Set LINE_LOGIN_CHANNEL_ID in strapi/.env, then restart Strapi.');
  // npm run mode:line and npm run mode:local switch the channel in strapi/.env, and Strapi reads it when it starts.
  if (overview.lineSignIn.channelId !== process.env.LINE_LOGIN_CHANNEL_ID) {
    throw new Error('Strapi signs customers in with another LINE channel than strapi/.env names. Restart Strapi.');
  }
  const lineMode = process.env.LINE_LOGIN_CHANNEL_ID !== '1234567890';
  console.log(lineMode ? 'LINE sign-in: your LINE Login channel (LINE mode).' : 'LINE sign-in: the LIFF mock (local mode).');

  // 2. The catalog, and reading it over REST without credentials.
  const seeded = await api('POST', '/maison/demo/seed', {});
  console.log(seeded.created ? 'Loaded the demo catalog.' : 'Demo catalog already loaded.');
  const actions = PUBLIC_CATALOG_ACTIONS.join(', ');
  console.log(
    (await grantPublicCatalog(api))
      ? `Let the Public role read the catalog over REST: ${actions}.`
      : `The Public role already reads the catalog over REST: ${actions}.`
  );

  // 3. The old client first, then the tokens: a client mapped to a deleted token would refuse to connect.
  const clients = await api('GET', '/strapi-oauth-mcp-manager/clients');
  for (const client of clients.filter((c) => c.name === 'Maison app')) {
    await api('DELETE', `/strapi-oauth-mcp-manager/clients/${client.id}`);
  }
  const TOKEN_NAMES = ['Maison customer', 'Maison ops'];
  for (const token of await api('GET', '/admin/admin-tokens')) {
    if (TOKEN_NAMES.includes(token.name)) await api('DELETE', `/admin/admin-tokens/${token.id}`);
  }
  const mint = (name, actions, description) =>
    api('POST', '/admin/admin-tokens', {
      name,
      description,
      lifespan: null,
      adminPermissions: actions.map((action) => ({ action, subject: null, properties: {}, conditions: [] })),
    });
  const customer = await mint(
    'Maison customer',
    ['plugin::maison.catalog.read', 'plugin::maison.appointments.request'],
    'Every customer session of the Maison app runs with this token.'
  );
  const ops = await mint('Maison ops', ['plugin::maison.confirmations.send'], 'The ops agent (Claude Desktop) in the Maison demo.');

  // 4. One active LINE client at a time: any other one is deactivated (not deleted; reactivate it on the MCP OAuth page).
  for (const client of clients.filter((c) => c.name !== 'Maison app' && c.endUserProvider === 'line' && c.active)) {
    await api('PUT', `/strapi-oauth-mcp-manager/clients/${client.id}`, { active: false });
    console.log(`Deactivated the LINE client "${client.name}": oauth-mcp-manager allows one active LINE client.`);
  }
  const app = await api('POST', '/strapi-oauth-mcp-manager/clients', {
    name: 'Maison app',
    endUserProvider: 'line',
    redirectUris: [],
    adminTokenId: customer.id,
  });

  // 5. Where the app and the ops agent find them.
  // In LINE mode the browser reaches Strapi through the app's own public origin, PUBLIC_URL, which proxies it.
  writeEnv(join(root, 'liff', '.env'), {
    NEXT_PUBLIC_STRAPI_URL: process.env.PUBLIC_URL || STRAPI_URL,
    NEXT_PUBLIC_MAISON_CLIENT_ID: app.clientId,
  });
  mkdirSync(join(root, 'strapi', '.tmp'), { recursive: true });
  const opsTokenFile = join(root, 'strapi', '.tmp', 'maison-ops-token');
  // `mode` applies only when the file is created, so tighten one left by an earlier run before writing into it.
  if (existsSync(opsTokenFile)) chmodSync(opsTokenFile, 0o600);
  writeFileSync(opsTokenFile, `${ops.accessKey}\n`, { mode: 0o600 });

  console.log(`Created the "Maison app" client ${app.clientId} and wrote it to liff/.env (restart the app to pick it up).`);
  console.log('Wrote the "Maison ops" token to strapi/.tmp/maison-ops-token (README: "Claude Desktop, the ops agent").');
};

try {
  await main();
} catch (error) {
  // One line, with the fix, rather than a stack trace.
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
}

// Creates strapi/.env and liff/.env from their .env.example files the first time, and fills in Strapi's
// secrets and the demo admin's password. `npm install` runs it. Safe to run again: it only fills in values
// that are still placeholders, never prints one, and leaves both files readable by you only.
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const secret = () => randomBytes(16).toString('base64');

/** Strapi's keys and salts, made the way create-strapi makes them, and the demo admin's password. */
const GENERATED = {
  APP_KEYS: () => [secret(), secret(), secret(), secret()].join(','),
  API_TOKEN_SALT: secret,
  ADMIN_JWT_SECRET: secret,
  TRANSFER_TOKEN_SALT: secret,
  JWT_SECRET: secret,
  ENCRYPTION_KEY: secret,
  // Strapi wants a lower-case letter, a capital and a digit.
  DEMO_ADMIN_PASSWORD: () => `Maison1-${randomBytes(18).toString('base64url')}`,
};
const isPlaceholder = (value) => value === '' || /^"?tobemodified/i.test(value);

for (const app of ['strapi', 'liff']) {
  const example = join(root, app, '.env.example');
  const file = join(root, app, '.env');
  if (!existsSync(example)) continue;
  if (!existsSync(file)) {
    copyFileSync(example, file);
    console.log(`Created ${app}/.env from ${app}/.env.example.`);
  }
  chmodSync(file, 0o600);

  let text = readFileSync(file, 'utf8');
  const filled = [];
  for (const [key, make] of Object.entries(GENERATED)) {
    const line = new RegExp(`^${key}=(.*)$`, 'm');
    const current = text.match(line)?.[1].trim();
    if (current === undefined || !isPlaceholder(current)) continue;
    text = text.replace(line, () => `${key}=${make()}`);
    filled.push(key);
  }
  if (filled.length > 0) {
    writeFileSync(file, text);
    console.log(`Generated ${filled.join(', ')} in ${app}/.env.`);
  }
}

import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const SUBJECT_A = `line:U${'a'.repeat(32)}`;
export const SUBJECT_B = `line:U${'b'.repeat(32)}`;

const appDirectory = () => {
  const appDir = process.env.STRAPI_APP_DIR;
  if (!appDir) {
    throw new Error('Set STRAPI_APP_DIR to the Strapi app that links this plugin, e.g. ~/work/launchpad-fork-latest/strapi');
  }
  return appDir;
};

/** Loads a package the way the Strapi app resolves it, e.g. the app's own copy of @strapi/utils. */
export const requireFromApp = (id) => createRequire(path.join(appDirectory(), 'package.json'))(id);

/** Boots the Strapi app (with this plugin yalc-linked) against .tmp/maison-test-<name>.db. */
export async function bootStrapi(name) {
  const appDir = appDirectory();
  const dbFile = `.tmp/maison-test-${name}.db`;
  rmSync(path.join(appDir, dbFile), { force: true });
  process.env.DATABASE_FILENAME = dbFile;
  process.chdir(appDir);
  const { createStrapi, compileStrapi } = requireFromApp('@strapi/strapi');
  const appContext = await compileStrapi({ appDir });
  const strapi = createStrapi(appContext);
  await strapi.load();
  return strapi;
}

export async function ensureLocales(strapi) {
  const locales = strapi.plugin('i18n').service('locales');
  for (const [code, name] of [['ja', 'Japanese (ja)'], ['en', 'English (en)']]) {
    if (!(await locales.findByCode(code))) await locales.create({ code, name });
  }
}

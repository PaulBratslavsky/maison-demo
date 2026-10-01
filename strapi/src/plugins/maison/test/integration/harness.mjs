import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const SUBJECT_A = `line:U${'a'.repeat(32)}`;
export const SUBJECT_B = `line:U${'b'.repeat(32)}`;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * The calendar date in Tokyo `days` days from now, as YYYY-MM-DD. Tests that run against the real clock book their
 * visits relative to it, so they never expire. With `weekday` (0 is Sunday, 2 Tuesday), the first such day on or
 * after that date.
 */
export const tokyoDate = (days, { weekday } = {}) => {
  // Shifted by Tokyo's offset, the UTC fields read as Tokyo's calendar (Japan has no daylight saving time).
  const day = new Date(Date.now() + TOKYO_OFFSET_MS + days * DAY_MS);
  if (weekday !== undefined) day.setUTCDate(day.getUTCDate() + ((weekday - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
};

/** `date` at `time` (HH:MM) in Tokyo, the way the app sends a visit and the services answer it. */
export const tokyoTime = (date, time) => `${date}T${time}:00+09:00`;

/** A moment the way the services write one: Tokyo wall-clock time and offset, in whole seconds ("2026-10-10T14:00:00+09:00"). */
export const tokyoIso = (moment) => `${new Date(moment.getTime() + TOKYO_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;

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

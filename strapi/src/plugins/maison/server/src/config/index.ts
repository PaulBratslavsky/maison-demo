import type { Core } from '@strapi/strapi';

import { LOCALES, PLUGIN_ID, TOOL_NAMES, type Locale, type ToolName } from '../constants';

export interface MaisonConfig {
  /** Base of links into the customer app, e.g. https://liff.line.me/<LIFF ID>. Needed for confirmations. */
  liffUrl: string | null;
  timezone: string;
  defaultLocale: Locale;
  maxOpenRequestsPerCustomer: number;
  houseName: { ja: string; en: string };
  disabledTools: ToolName[];
}

export const defaultConfig: MaisonConfig = {
  liffUrl: null,
  timezone: 'Asia/Tokyo',
  defaultLocale: 'ja',
  maxOpenRequestsPerCustomer: 3,
  houseName: { ja: 'メゾン', en: 'Maison' },
  disabledTools: [],
};

const fail = (message: string): never => {
  throw new Error(`[${PLUGIN_ID}] ${message}`);
};

/** https anywhere, or plain http on this machine for local development. */
const APP_URL = /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?)$/;

export function validateConfig(config: Partial<MaisonConfig>): void {
  const merged = { ...defaultConfig, ...config };

  // `MAISON_LIFF_URL=` in an env file gives '', which means not set: it must never stop Strapi from starting.
  if (merged.liffUrl !== null && merged.liffUrl !== '') {
    if (typeof merged.liffUrl !== 'string' || !APP_URL.test(merged.liffUrl) || merged.liffUrl.endsWith('/')) {
      fail(
        'config.liffUrl must be an https URL (or http://localhost for local development) without a trailing slash, e.g. https://liff.line.me/<LIFF ID>'
      );
    }
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: merged.timezone });
  } catch {
    fail(`config.timezone "${merged.timezone}" is not a valid IANA time zone`);
  }
  if (!(LOCALES as readonly string[]).includes(merged.defaultLocale)) {
    fail(`config.defaultLocale must be one of ${LOCALES.join(', ')}`);
  }
  if (!Number.isInteger(merged.maxOpenRequestsPerCustomer) || merged.maxOpenRequestsPerCustomer < 1) {
    fail('config.maxOpenRequestsPerCustomer must be an integer of at least 1');
  }
  if (
    typeof merged.houseName?.ja !== 'string' ||
    merged.houseName.ja.trim() === '' ||
    typeof merged.houseName?.en !== 'string' ||
    merged.houseName.en.trim() === ''
  ) {
    fail('config.houseName needs non-empty ja and en strings');
  }
  if (!Array.isArray(merged.disabledTools) || merged.disabledTools.some((name) => !(TOOL_NAMES as readonly string[]).includes(name))) {
    fail(`config.disabledTools may only contain: ${TOOL_NAMES.join(', ')}`);
  }
}

export const getConfig = (strapi: Core.Strapi): MaisonConfig => {
  const config = { ...defaultConfig, ...(strapi.config.get(`plugin::${PLUGIN_ID}`) as Partial<MaisonConfig>) };
  // An empty liffUrl is the same as none.
  return { ...config, liffUrl: config.liffUrl || null };
};

export default {
  default: defaultConfig,
  validator: validateConfig,
};

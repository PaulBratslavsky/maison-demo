import type { Core } from '@strapi/strapi';

import { AI_PROVIDERS, type AiProvider } from '../ai/provider';
import { LOCALES, PLUGIN_ID, TOOL_NAMES, type Locale, type ToolName } from '../constants';

export interface MaisonConfig {
  /** Base of links into the customer app, e.g. https://liff.line.me/<LIFF ID>. Needed for confirmations. */
  liffUrl: string | null;
  timezone: string;
  defaultLocale: Locale;
  maxOpenRequestsPerCustomer: number;
  houseName: { ja: string; en: string };
  disabledTools: ToolName[];
  /** The LINE Messaging API channel access token Strapi sends confirmations with. Without one, Strapi sends none. */
  lineChannelAccessToken: string | null;
  /** Where the LINE Messaging API answers. Tests point it at a stand-in on this machine. */
  lineApiBaseUrl: string;
  /**
   * The model that labels inquiries. These are Pulse's AI_PROVIDER, AI_MODEL, AI_API_KEY and AI_BASE_URL, which the app
   * maps onto them. Without a key (or, for openai-compatible, a base URL), labelling is off and new inquiries wait
   * under Not labelled.
   */
  aiProvider: AiProvider;
  /** The provider's default model when null. */
  aiModel: string | null;
  aiApiKey: string | null;
  /** Where an openai-compatible server answers, e.g. http://127.0.0.1:11434/v1 for Ollama. Only that provider uses it. */
  aiBaseUrl: string | null;
}

export const defaultConfig: MaisonConfig = {
  liffUrl: null,
  timezone: 'Asia/Tokyo',
  defaultLocale: 'ja',
  maxOpenRequestsPerCustomer: 3,
  houseName: { ja: 'メゾン', en: 'Maison' },
  disabledTools: [],
  lineChannelAccessToken: null,
  lineApiBaseUrl: 'https://api.line.me',
  aiProvider: 'anthropic',
  aiModel: null,
  aiApiKey: null,
  aiBaseUrl: null,
};

const fail = (message: string): never => {
  throw new Error(`[${PLUGIN_ID}] ${message}`);
};

/** https anywhere, or plain http on this machine for local development. */
const APP_URL = /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?)$/;
/** LINE's API over https, or a stand-in on a port of this machine, for tests. */
const LINE_API_URL = /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1):\d+(\/\S*)?)$/;

/** An http or https URL: the model server may be on this machine, or hosted. */
const AI_BASE_URL = /^https?:\/\/\S+$/;

/** null, undefined and '' all mean not set: `NAME=` in an env file gives '', and that must never stop Strapi from starting. */
const isSet = (value: unknown) => value !== null && value !== undefined && value !== '';

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
  // The message never repeats the token.
  const token: unknown = merged.lineChannelAccessToken;
  if (isSet(token) && (typeof token !== 'string' || /\s/.test(token))) {
    fail('config.lineChannelAccessToken must be a LINE channel access token, a string without spaces, or null to send no confirmations from Strapi');
  }
  const lineApi: unknown = merged.lineApiBaseUrl;
  if (isSet(lineApi) && (typeof lineApi !== 'string' || !LINE_API_URL.test(lineApi) || lineApi.endsWith('/'))) {
    fail(
      'config.lineApiBaseUrl must be an https URL without a trailing slash, e.g. https://api.line.me, or http://127.0.0.1:<port> for a stand-in on this machine'
    );
  }
  // `AI_PROVIDER=` and the like in an env file give '', which means not set.
  const provider: unknown = merged.aiProvider;
  if (isSet(provider) && !(AI_PROVIDERS as readonly unknown[]).includes(provider)) {
    fail(`config.aiProvider must be one of ${AI_PROVIDERS.join(', ')}`);
  }
  const model: unknown = merged.aiModel;
  if (isSet(model) && (typeof model !== 'string' || /\s/.test(model))) {
    fail("config.aiModel must be a model ID, a string without spaces, or null for the provider's default model");
  }
  // The message never repeats the key.
  const key: unknown = merged.aiApiKey;
  if (isSet(key) && (typeof key !== 'string' || /\s/.test(key))) {
    fail('config.aiApiKey must be an API key for the model provider, a string without spaces, or null to label no inquiries');
  }
  const aiBase: unknown = merged.aiBaseUrl;
  if (isSet(aiBase) && (typeof aiBase !== 'string' || !AI_BASE_URL.test(aiBase) || aiBase.endsWith('/'))) {
    fail('config.aiBaseUrl must be an http or https URL without a trailing slash, e.g. http://127.0.0.1:11434/v1');
  }
}

export const getConfig = (strapi: Core.Strapi): MaisonConfig => {
  const config = { ...defaultConfig, ...(strapi.config.get(`plugin::${PLUGIN_ID}`) as Partial<MaisonConfig>) };
  // An empty value is the same as none: no liffUrl, no token, LINE's own API, Anthropic as the provider, and no model, key or base URL.
  return {
    ...config,
    liffUrl: config.liffUrl || null,
    lineChannelAccessToken: config.lineChannelAccessToken || null,
    lineApiBaseUrl: config.lineApiBaseUrl || defaultConfig.lineApiBaseUrl,
    aiProvider: config.aiProvider || defaultConfig.aiProvider,
    aiModel: config.aiModel || null,
    aiApiKey: config.aiApiKey || null,
    aiBaseUrl: config.aiBaseUrl || null,
  };
};

export default {
  default: defaultConfig,
  validator: validateConfig,
};

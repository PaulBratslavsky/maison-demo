import { describe, expect, it } from 'vitest';
import { defaultConfig, getConfig, validateConfig } from '../../server/src/config';
import { fakeStrapi } from './fake-strapi';

describe('validateConfig', () => {
  it('accepts the defaults and a full valid config', () => {
    expect(() => validateConfig(defaultConfig)).not.toThrow();
    expect(() =>
      validateConfig({ ...defaultConfig, liffUrl: 'https://liff.line.me/1234567890-AbCdEfGh', disabledTools: ['find_boutiques'] })
    ).not.toThrow();
  });

  it('accepts an http://localhost app URL for local development', () => {
    expect(() => validateConfig({ ...defaultConfig, liffUrl: 'http://localhost:3003' })).not.toThrow();
  });

  it('treats an empty liffUrl (MAISON_LIFF_URL= in .env) as not set, so Strapi still starts', () => {
    expect(() => validateConfig({ ...defaultConfig, liffUrl: '' })).not.toThrow();
    expect(getConfig(fakeStrapi({ config: { ...defaultConfig, liffUrl: '' } })).liffUrl).toBeNull();
  });

  it.each([
    ['an http liffUrl', { liffUrl: 'http://liff.line.me/x' }, /liffUrl/],
    ['a liffUrl with a trailing slash', { liffUrl: 'https://liff.line.me/x/' }, /liffUrl/],
    ['an unknown time zone', { timezone: 'Mars/Olympus' }, /timezone/],
    ['an unsupported default locale', { defaultLocale: 'fr' }, /defaultLocale/],
    ['a zero request limit', { maxOpenRequestsPerCustomer: 0 }, /maxOpenRequestsPerCustomer/],
    ['an empty house name', { houseName: { ja: '', en: 'Maison' } }, /houseName/],
    ['an unknown tool', { disabledTools: ['delete_everything'] }, /disabledTools/],
  ])('rejects %s', (_label, override, message) => {
    expect(() => validateConfig({ ...defaultConfig, ...(override as object) })).toThrow(message);
  });
});

describe('the LINE settings', () => {
  it('send nothing from Strapi and use LINE itself by default', () => {
    expect(defaultConfig.lineChannelAccessToken).toBeNull();
    expect(defaultConfig.lineApiBaseUrl).toBe('https://api.line.me');
    const config = getConfig(fakeStrapi({ config: {} }));
    expect(config.lineChannelAccessToken).toBeNull();
    expect(config.lineApiBaseUrl).toBe('https://api.line.me');
  });

  it.each(['https://api.line.me', 'http://127.0.0.1:4010', 'http://localhost:4010'])('accept a token, with %s as the API', (url) => {
    expect(() => validateConfig({ ...defaultConfig, lineChannelAccessToken: 'tok3n+/=', lineApiBaseUrl: url })).not.toThrow();
  });

  it('treat empty values (LINE_CHANNEL_ACCESS_TOKEN= in .env) as not set, so Strapi still starts', () => {
    expect(() => validateConfig({ ...defaultConfig, lineChannelAccessToken: '', lineApiBaseUrl: '' })).not.toThrow();
    const config = getConfig(fakeStrapi({ config: { lineChannelAccessToken: '', lineApiBaseUrl: '' } }));
    expect(config.lineChannelAccessToken).toBeNull();
    expect(config.lineApiBaseUrl).toBe('https://api.line.me');
  });

  it.each([
    ['a token that is not a string', { lineChannelAccessToken: 42 }, /lineChannelAccessToken/],
    ['a token with a space in it', { lineChannelAccessToken: 'tok en' }, /lineChannelAccessToken/],
    ['plain http to another machine', { lineApiBaseUrl: 'http://api.line.me' }, /lineApiBaseUrl/],
    ['plain http on this machine without a port', { lineApiBaseUrl: 'http://127.0.0.1' }, /lineApiBaseUrl/],
    ['a trailing slash', { lineApiBaseUrl: 'https://api.line.me/' }, /lineApiBaseUrl/],
    ['an API that is not a URL', { lineApiBaseUrl: 'api.line.me' }, /lineApiBaseUrl/],
  ])('reject %s', (_label, override, message) => {
    expect(() => validateConfig({ ...defaultConfig, ...(override as object) })).toThrow(message);
  });

  it('never repeat the token in an error', () => {
    let message = '';
    try {
      validateConfig({ ...defaultConfig, lineChannelAccessToken: 'secret value' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/lineChannelAccessToken/);
    expect(message).not.toContain('secret');
  });
});

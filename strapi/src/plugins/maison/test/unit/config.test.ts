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

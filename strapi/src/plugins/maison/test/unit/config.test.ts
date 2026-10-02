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

describe('the AI settings', () => {
  it("are Pulse's, with anthropic as the provider and nothing else set: labelling is off until a key is", () => {
    expect(defaultConfig.aiProvider).toBe('anthropic');
    expect(defaultConfig.aiModel).toBeNull();
    expect(defaultConfig.aiApiKey).toBeNull();
    expect(defaultConfig.aiBaseUrl).toBeNull();
    const config = getConfig(fakeStrapi({ config: {} }));
    expect(config).toMatchObject({ aiProvider: 'anthropic', aiModel: null, aiApiKey: null, aiBaseUrl: null });
  });

  it.each([
    ['an Anthropic key', { aiApiKey: 'sk-ant-api03-abc_DEF-123' }],
    ['a model', { aiModel: 'claude-sonnet-4-5' }],
    ['openai, with a key and a model', { aiProvider: 'openai', aiApiKey: 'sk-proj-abc', aiModel: 'gpt-5-mini' }],
    ['openai-compatible on Ollama, with no key', { aiProvider: 'openai-compatible', aiBaseUrl: 'http://127.0.0.1:11434/v1', aiModel: 'llama3.1' }],
    ['openai-compatible on a hosted service', { aiProvider: 'openai-compatible', aiBaseUrl: 'https://api.together.xyz/v1', aiApiKey: 'tok-123' }],
    ['a base URL with a port and no path', { aiBaseUrl: 'http://localhost:8080' }],
  ])('accept %s', (_what, override) => {
    expect(() => validateConfig({ ...defaultConfig, ...(override as object) })).not.toThrow();
  });

  it('treat empty values (AI_PROVIDER= and the rest in an env file) as not set, so Strapi still starts', () => {
    const empty = { aiProvider: '', aiModel: '', aiApiKey: '', aiBaseUrl: '' };
    expect(() => validateConfig({ ...defaultConfig, ...(empty as object) })).not.toThrow();
    expect(getConfig(fakeStrapi({ config: empty }))).toMatchObject({ aiProvider: 'anthropic', aiModel: null, aiApiKey: null, aiBaseUrl: null });
  });

  it('treat null as not set', () => {
    const unset = { aiProvider: null, aiModel: null, aiApiKey: null, aiBaseUrl: null };
    expect(() => validateConfig({ ...defaultConfig, ...(unset as object) })).not.toThrow();
    expect(getConfig(fakeStrapi({ config: unset }))).toMatchObject({ aiProvider: 'anthropic', aiModel: null, aiApiKey: null, aiBaseUrl: null });
  });

  it('keep the values they are given', () => {
    const given = { aiProvider: 'openai-compatible', aiModel: 'llama3.1', aiApiKey: 'tok-123', aiBaseUrl: 'http://127.0.0.1:11434/v1' };
    expect(getConfig(fakeStrapi({ config: given }))).toMatchObject(given);
  });

  it.each([
    ['a provider that is not supported', { aiProvider: 'gemini' }, /aiProvider/],
    ['a provider in capitals', { aiProvider: 'Anthropic' }, /aiProvider/],
    ['a provider that is not a string', { aiProvider: 42 }, /aiProvider/],
    ['a model that is not a string', { aiModel: 42 }, /aiModel/],
    ['a model with a space in it', { aiModel: 'claude haiku' }, /aiModel/],
    ['a key that is not a string', { aiApiKey: 42 }, /aiApiKey/],
    ['a key with a space in it', { aiApiKey: 'sk-ant abc' }, /aiApiKey/],
    ['a key with a line break in it', { aiApiKey: 'sk-ant-abc\n' }, /aiApiKey/],
    ['a base URL that is not a string', { aiBaseUrl: 42 }, /aiBaseUrl/],
    ['a base URL with no scheme', { aiBaseUrl: '127.0.0.1:11434/v1' }, /aiBaseUrl/],
    ['a base URL that is not http or https', { aiBaseUrl: 'ftp://127.0.0.1/v1' }, /aiBaseUrl/],
    ['a base URL with a trailing slash', { aiBaseUrl: 'http://127.0.0.1:11434/v1/' }, /aiBaseUrl/],
    ['a base URL with a space in it', { aiBaseUrl: 'http://127.0.0.1:11434/v 1' }, /aiBaseUrl/],
  ])('reject %s', (_what, override, message) => {
    expect(() => validateConfig({ ...defaultConfig, ...(override as object) })).toThrow(message);
  });

  it('list the providers when one is not supported, as Pulse does', () => {
    expect(() => validateConfig({ ...defaultConfig, aiProvider: 'gemini' as never })).toThrow(
      '[maison] config.aiProvider must be one of anthropic, openai, openai-compatible'
    );
  });

  it('never repeat the key in an error', () => {
    for (const aiApiKey of ['secret value', 'secret\tvalue']) {
      let message = '';
      try {
        validateConfig({ ...defaultConfig, aiApiKey });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/aiApiKey/);
      expect(message).not.toContain('secret');
    }
  });
});

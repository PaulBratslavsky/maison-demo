import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_PROVIDERS,
  DEFAULT_MODEL,
  aiEnabled,
  languageModelOf,
  modelIdOf,
  modelVersionOf,
  type AiSettings,
} from '../../server/src/ai/provider';

// The three provider packages are stood in for. Each factory answers a provider, and a provider answers a model that
// says which factory made it and for which model ID, so a test can read where `languageModelOf` went.
const sdk = vi.hoisted(() => ({ createAnthropic: vi.fn(), createOpenAI: vi.fn(), createOpenAICompatible: vi.fn() }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: sdk.createAnthropic }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: sdk.createOpenAI }));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: sdk.createOpenAICompatible }));

beforeEach(() => {
  for (const [factory, create] of Object.entries(sdk)) create.mockReset().mockImplementation(() => (id: string) => ({ factory, id }));
});

const settings = (overrides: Partial<AiSettings> = {}): AiSettings => ({
  aiProvider: 'anthropic',
  aiModel: null,
  aiApiKey: null,
  aiBaseUrl: null,
  ...overrides,
});

const OLLAMA = 'http://127.0.0.1:11434/v1';

describe('AI_PROVIDERS', () => {
  it('are the three Pulse has: anthropic, openai and openai-compatible', () => {
    expect([...AI_PROVIDERS]).toEqual(['anthropic', 'openai', 'openai-compatible']);
  });
});

describe('DEFAULT_MODEL', () => {
  it.each([
    ['anthropic', 'claude-haiku-4-5-20251001'],
    ['openai', 'gpt-5-mini'],
    ['openai-compatible', 'llama3.1'],
  ] as const)('gives %s the model %s, as Pulse does', (provider, model) => {
    expect(DEFAULT_MODEL[provider]).toBe(model);
  });

  it('has a model for every provider and for no other', () => {
    expect(Object.keys(DEFAULT_MODEL).sort()).toEqual([...AI_PROVIDERS].sort());
  });
});

describe('modelIdOf', () => {
  it('is the model the settings name', () => {
    expect(modelIdOf(settings({ aiModel: 'claude-sonnet-4-5' }))).toBe('claude-sonnet-4-5');
  });

  it.each(AI_PROVIDERS)('is the default model of %s when the settings name none', (aiProvider) => {
    expect(modelIdOf(settings({ aiProvider }))).toBe(DEFAULT_MODEL[aiProvider]);
  });

  it('is the default model when the name is empty', () => {
    expect(modelIdOf(settings({ aiModel: '' }))).toBe('claude-haiku-4-5-20251001');
  });
});

describe('modelVersionOf', () => {
  it.each([
    ['the default model of anthropic', {}, 'anthropic/claude-haiku-4-5-20251001'],
    ['the default model of openai', { aiProvider: 'openai' as const }, 'openai/gpt-5-mini'],
    ['the default model of openai-compatible', { aiProvider: 'openai-compatible' as const }, 'openai-compatible/llama3.1'],
    ['a model the settings name', { aiModel: 'claude-sonnet-4-5' }, 'anthropic/claude-sonnet-4-5'],
  ])('is the provider and the model, for %s', (_what, overrides, version) => {
    expect(modelVersionOf(settings(overrides))).toBe(version);
  });
});

describe('aiEnabled', () => {
  it.each([
    ['anthropic, with a key', { aiProvider: 'anthropic' as const, aiApiKey: 'k' }, true],
    ['openai, with a key', { aiProvider: 'openai' as const, aiApiKey: 'k' }, true],
    ['openai-compatible, with a key', { aiProvider: 'openai-compatible' as const, aiApiKey: 'k' }, true],
    ['openai-compatible, with a base URL and no key: a local server wants none', { aiProvider: 'openai-compatible' as const, aiBaseUrl: OLLAMA }, true],
    ['anthropic, with no key', { aiProvider: 'anthropic' as const }, false],
    ['openai, with no key', { aiProvider: 'openai' as const }, false],
    ['openai-compatible, with no key and no base URL', { aiProvider: 'openai-compatible' as const }, false],
    ['anthropic, with a base URL and no key: only openai-compatible takes one', { aiProvider: 'anthropic' as const, aiBaseUrl: OLLAMA }, false],
    ['openai, with a base URL and no key', { aiProvider: 'openai' as const, aiBaseUrl: OLLAMA }, false],
    ['anthropic, with an empty key', { aiProvider: 'anthropic' as const, aiApiKey: '' }, false],
    ['openai-compatible, with an empty base URL and no key', { aiProvider: 'openai-compatible' as const, aiBaseUrl: '' }, false],
  ])('is decided for %s', (_what, overrides, enabled) => {
    expect(aiEnabled(settings(overrides))).toBe(enabled);
  });
});

describe('languageModelOf', () => {
  it('makes an anthropic model with the settings key, from the factory and not the singleton, which reads ANTHROPIC_API_KEY', () => {
    const model = languageModelOf(settings({ aiApiKey: 'key-1' }));

    expect(sdk.createAnthropic).toHaveBeenCalledExactlyOnceWith({ apiKey: 'key-1' });
    expect(model).toEqual({ factory: 'createAnthropic', id: 'claude-haiku-4-5-20251001' });
    expect(sdk.createOpenAI).not.toHaveBeenCalled();
    expect(sdk.createOpenAICompatible).not.toHaveBeenCalled();
  });

  it('makes an openai model with the settings key, from the factory and not the singleton, which reads OPENAI_API_KEY', () => {
    const model = languageModelOf(settings({ aiProvider: 'openai', aiApiKey: 'key-2' }));

    expect(sdk.createOpenAI).toHaveBeenCalledExactlyOnceWith({ apiKey: 'key-2' });
    expect(model).toEqual({ factory: 'createOpenAI', id: 'gpt-5-mini' });
    expect(sdk.createAnthropic).not.toHaveBeenCalled();
    expect(sdk.createOpenAICompatible).not.toHaveBeenCalled();
  });

  it('makes an openai-compatible model named custom, at the base URL, with the settings key', () => {
    const model = languageModelOf(settings({ aiProvider: 'openai-compatible', aiApiKey: 'key-3', aiBaseUrl: OLLAMA }));

    expect(sdk.createOpenAICompatible).toHaveBeenCalledExactlyOnceWith({ name: 'custom', baseURL: OLLAMA, apiKey: 'key-3' });
    expect(model).toEqual({ factory: 'createOpenAICompatible', id: 'llama3.1' });
    expect(sdk.createAnthropic).not.toHaveBeenCalled();
    expect(sdk.createOpenAI).not.toHaveBeenCalled();
  });

  it.each([
    ['no key', null],
    ['an empty key', ''],
  ])('gives an openai-compatible server a placeholder key when it has %s: the SDK still expects one', (_what, aiApiKey) => {
    languageModelOf(settings({ aiProvider: 'openai-compatible', aiApiKey, aiBaseUrl: OLLAMA }));
    expect(sdk.createOpenAICompatible).toHaveBeenCalledExactlyOnceWith({ name: 'custom', baseURL: OLLAMA, apiKey: 'not-needed' });
  });

  it('refuses openai-compatible without a base URL, and says what to set', () => {
    expect(() => languageModelOf(settings({ aiProvider: 'openai-compatible', aiApiKey: 'key-3' }))).toThrow(
      "aiProvider 'openai-compatible' needs aiBaseUrl (e.g. http://127.0.0.1:11434/v1)"
    );
    expect(sdk.createOpenAICompatible).not.toHaveBeenCalled();
  });

  it.each([
    ['anthropic', 'createAnthropic'],
    ['openai', 'createOpenAI'],
    ['openai-compatible', 'createOpenAICompatible'],
  ] as const)('asks %s for the model the settings name', (aiProvider, factory) => {
    const model = languageModelOf(settings({ aiProvider, aiModel: 'a-model', aiApiKey: 'k', aiBaseUrl: OLLAMA }));
    expect(model).toEqual({ factory, id: 'a-model' });
  });

  it('makes the model again on every call, so a new key takes effect on the next sweep without a restart', () => {
    languageModelOf(settings({ aiApiKey: 'old-key' }));
    languageModelOf(settings({ aiApiKey: 'new-key' }));

    expect(sdk.createAnthropic.mock.calls).toEqual([[{ apiKey: 'old-key' }], [{ apiKey: 'new-key' }]]);
  });
});

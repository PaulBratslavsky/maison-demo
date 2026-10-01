import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from 'ai';

export type ConciergeModel = {
  model: LanguageModel;
  /** Which model answers, for logs and error messages. Never contains a key. */
  label: string;
};

/**
 * Claude Sonnet 5 with ANTHROPIC_API_KEY, or through Vercel AI Gateway with AI_GATEWAY_API_KEY. With neither, a local
 * model through Ollama's OpenAI-compatible API: OLLAMA_MODEL (qwen3-14b-32k) at OLLAMA_BASE_URL (http://localhost:11434/v1).
 */
export const conciergeModel = (env: Record<string, string | undefined> = process.env): ConciergeModel => {
  if (env.ANTHROPIC_API_KEY) return { model: anthropic('claude-sonnet-5'), label: 'Claude Sonnet 5 (Anthropic)' };
  if (env.AI_GATEWAY_API_KEY) return { model: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5 (AI Gateway)' };
  const baseURL = env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
  const modelId = env.OLLAMA_MODEL || 'qwen3-14b-32k';
  const ollama = createOpenAICompatible({ name: 'ollama', baseURL });
  return {
    // Qwen3 thinks before every reply unless told not to, which is slow on a laptop: reasoning_effort "none" turns
    // it off. Ollama returns thinking in a field of its own, so none of it would reach the chat either way.
    model: wrapLanguageModel({
      model: ollama.chatModel(modelId),
      middleware: defaultSettingsMiddleware({ settings: { providerOptions: { ollama: { reasoningEffort: 'none' } } } }),
    }),
    label: `${modelId} (Ollama at ${baseURL})`,
  };
};

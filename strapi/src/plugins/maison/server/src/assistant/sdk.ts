/**
 * The only file in the server that names @tanstack/*, and the only place the SDK is loaded.
 *
 * Maison's server is CommonJS, and @tanstack/ai and its adapter ship ESM only: their exports have no `require`
 * condition, so a `require` of either fails with ERR_PACKAGE_PATH_NOT_EXPORTED. A dynamic `import()` loads them from
 * CommonJS, and it costs nothing here, since every caller is async. The build keeps each `import()` as it is, and
 * `scripts/check-esm-import.mjs` fails if a built bundle loads either package statically.
 *
 * Nothing else in `server/src` imports @tanstack/*, so "does Strapi load the SDK at boot?" is answered by reading imports:
 * it doesn't. A unit test holds that. This file's type-only import is erased when it is built.
 */
import type { AnyTextAdapter } from '@tanstack/ai';

import type { AssistantToolSpec } from './tools';

export type ChatAdapter = AnyTextAdapter;
export type Sdk = typeof import('@tanstack/ai');
/** What `chatParamsFromRequestBody` gives: the AG-UI run input, with `messages` ready for `chat()`. */
export type ChatParams = Awaited<ReturnType<Sdk['chatParamsFromRequestBody']>>;

/** Said when a package can't be loaded: the SDK ships with the plugin, so it points at the install and keeps the cause. */
const notLoaded = (name: string, error: unknown) =>
  Object.assign(
    new Error(
      `[maison] The assistant needs ${name}, and it could not be loaded. It is a dependency of this plugin, so this usually means a broken install: run npm install, then restart Strapi. Original error: ${error instanceof Error ? error.message : String(error)}`
    ),
    { cause: error }
  );

let sdk: Sdk | null = null;

/** @tanstack/ai, loaded once. */
export const loadSdk = async (): Promise<Sdk> => {
  if (sdk) return sdk;
  try {
    sdk = await import('@tanstack/ai');
    return sdk;
  } catch (error) {
    throw notLoaded('@tanstack/ai', error);
  }
};

/**
 * The Anthropic chat adapter for a model and a key. `createAnthropicChat` takes them positionally. `anthropicText()` is
 * not used: it reads ANTHROPIC_API_KEY from the environment, and Maison's key is its own setting. The model is cast
 * because the adapter's list of model IDs is older than `claude-sonnet-5-5`: the ID passes through to Anthropic unchanged.
 */
export const createAnthropicAdapter = async (model: string, apiKey: string): Promise<ChatAdapter> => {
  let anthropic: typeof import('@tanstack/ai-anthropic');
  try {
    anthropic = await import('@tanstack/ai-anthropic');
  } catch (error) {
    throw notLoaded('@tanstack/ai-anthropic', error);
  }
  return anthropic.createAnthropicChat(model as never, apiKey) as unknown as ChatAdapter;
};

/**
 * The specs as tools for `chat()`. A spec with an `execute` becomes a server tool, which `chat()` runs. A spec without one
 * is a client tool: `chat()` ends the run when the model calls it, and the browser runs it. The service passes the result
 * to `chat()` with a cast, where the SDK's generics can't follow a list built at run time.
 */
export const toTools = async (specs: readonly AssistantToolSpec[]): Promise<unknown[]> => {
  const { toolDefinition } = await loadSdk();
  return specs.map((spec) => {
    const definition = toolDefinition({ name: spec.name, description: spec.description, inputSchema: spec.inputSchema });
    return spec.execute ? definition.server(spec.execute) : definition;
  });
};

/** Forgets what was loaded, so a test can load it again. */
export const resetSdkForTests = (): void => {
  sdk = null;
};

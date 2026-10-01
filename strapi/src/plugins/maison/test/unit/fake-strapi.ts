import { vi } from 'vitest';

interface FakeOptions {
  services?: Record<string, unknown>;
  config?: Record<string, unknown>;
  /** Other plugins by id, e.g. { 'strapi-oauth-mcp-manager': { oauth: { resolveSubject } } } */
  plugins?: Record<string, Record<string, unknown>>;
  /** Stand-in for strapi.ai.mcp */
  mcp?: { isEnabled: () => boolean; registerTool: (...args: any[]) => void; registerPrompt: (...args: any[]) => void };
}

/** Just enough of Core.Strapi for services and tool handlers under test. */
export const fakeStrapi = ({ services = {}, config = {}, plugins = {}, mcp }: FakeOptions = {}) =>
  ({
    plugin: (id: string) => {
      if (id === 'maison') return { service: (name: string) => services[name] };
      const other = plugins[id];
      return other ? { service: (name: string) => other[name] } : undefined;
    },
    config: {
      get: (key: string) => (key === 'plugin::maison' ? config : key === 'server.url' ? 'https://cms.example.test' : undefined),
    },
    ai: mcp ? { mcp } : undefined,
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }) as any;

export const extraWith = (headers: Record<string, string | string[]>) => ({ requestInfo: { headers } });

export const fakeMcp = (enabled = true) => ({ isEnabled: () => enabled, registerTool: vi.fn(), registerPrompt: vi.fn() });

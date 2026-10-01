import { spawn } from 'node:child_process';

export const STRAPI_URL = (process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1338').replace(/\/+$/, '');

/** Whether anything answers a GET to `url` within two seconds (any status counts). */
export const reachable = async (url: string): Promise<boolean> => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
};

/** Ollama answers /api/version at its root, whatever path its OpenAI-compatible base URL has. */
export const ollamaUp = (baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1') =>
  reachable(new URL('/api/version', baseURL).toString());

export const strapiUp = () => reachable(`${STRAPI_URL}/_health`);

/** The `data:` events of a server-sent event stream, parsed. */
export const sseEvents = (text: string): Array<Record<string, any>> =>
  text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((data) => data && data !== '[DONE]')
    .flatMap((data) => {
      try {
        return [JSON.parse(data)];
      } catch {
        return [];
      }
    });

/**
 * Strapi verifies ID tokens against the app's LINE verify mock. `npm run dev` runs it; if nothing answers on its port,
 * start one for this test run. Returns the function that stops it.
 */
export const ensureVerifyMock = async (): Promise<() => void> => {
  const url = `http://127.0.0.1:${process.env.MOCK_LINE_VERIFY_PORT ?? 4545}/verify`;
  if (await reachable(url)) return () => {};
  const child = spawn(process.execPath, ['scripts/mock-line-verify.mjs'], { stdio: 'ignore', env: process.env });
  for (let attempt = 0; attempt < 50 && !(await reachable(url)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return () => child.kill();
};

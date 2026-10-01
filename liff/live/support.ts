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

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The calendar dates an English reply mentions, as YYYY-MM-DD in `year`: "October 3", "3 October", "3rd of October" and
 * 2026-10-03. A reply that says "Saturday, October 2" for a visit on the 3rd is caught by comparing these.
 */
export const datesIn = (text: string, year: number): string[] => {
  const dates: string[] = [];
  const add = (monthName: string, day: string) => {
    const month = MONTHS.findIndex((name) => name.startsWith(monthName.toLowerCase().slice(0, 3))) + 1;
    dates.push(`${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`);
  };
  for (const found of text.matchAll(new RegExp(`\\b${MONTH}\\b\\.?\\s+(\\d{1,2})(?!\\d)`, 'gi'))) add(found[1], found[2]);
  for (const found of text.matchAll(new RegExp(`(?<![\\d-])(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`, 'gi'))) add(found[2], found[1]);
  dates.push(...(text.match(/\d{4}-\d{2}-\d{2}/g) ?? []));
  return dates;
};

/** The weekday names an English reply mentions ("Saturday", "Saturdays"), as written in WEEKDAYS. */
export const weekdaysIn = (text: string): string[] => WEEKDAYS.filter((name) => new RegExp(`\\b${name}s?\\b`, 'i').test(text));

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

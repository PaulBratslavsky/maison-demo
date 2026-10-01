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

/** The words that make a confirmation one still to come: "once it is confirmed", "it is confirmed once they reply". */
const STILL_TO_COME = String.raw`\b(?:once|when|whenever|after|as soon as|until|till|before|if|whether)\b`;
const STILL_TO_COME_BEFORE = new RegExp(STILL_TO_COME, 'i');
const ADVERBS = String.raw`(?:\s+(?:now|already|all|also|just|officially|fully))*`;
/** The word itself, unless a condition follows it: "is confirmed once the boutique accepts it". */
const CONFIRMED_WORD = String.raw`\s+confirmed\b(?!\s+(?:only\s+)?${STILL_TO_COME})`;
/**
 * A visit called confirmed, in English: "is confirmed", "it's confirmed", "has already been confirmed", "you're all
 * confirmed"; or someone saying they confirmed it: "I've confirmed", "the boutique has confirmed". Not the customer's
 * "you've confirmed" (their yes), nor "isn't confirmed" or "hasn't been confirmed".
 */
const CONFIRMED = new RegExp(
  String.raw`(?:\b(?:is|are|was|were)|['’](?:s|re)|(?:\b(?:has|have|had)|['’](?:s|ve|d))${ADVERBS}\s+been)${ADVERBS}${CONFIRMED_WORD}` +
    String.raw`|(?<!\byou)(?:['’]ve|\s+(?:have|has|had))${ADVERBS}${CONFIRMED_WORD}`,
  'gi'
);
/**
 * Where an English clause ends: a sentence or a line, a semicolon or a colon, or a comma with a new subject after it
 * ("After checking, your visit is confirmed"). A comma inside a clause, as in a date ("Saturday, October 3, is
 * confirmed"), doesn't end it.
 */
const CLAUSE_END = /[.!?;:\n]+|,\s*(?=(?:I|we|you|they|it|your|our|the|this|that|everything)\b)/i;
/** The same in Japanese: 確定しました, 確定いたしました, 確定です. Not 確定しましたら ("once it is"), nor 未確定 ("not yet"). */
const CONFIRMED_JA = /(?<![未不])確定(?:しました|いたしました|致しました|しております|しています|となりました|になりました|されました|済み|です)(?![らか])/;

/**
 * Whether a reply, in English or Japanese, says a visit is confirmed. A request is only requested: the boutique confirms
 * it, on LINE. A confirmation still to come is fine ("once it is confirmed", "when …", "after …", "as soon as …",
 * "until …", "it is confirmed once they reply", 確定しましたら, 確定次第), and so are "will confirm", "not yet confirmed"
 * and 未確定. A bare "Confirmed: Saturday at 2 pm" isn't caught.
 */
export const saysConfirmed = (text: string): boolean =>
  CONFIRMED_JA.test(text) ||
  text
    .split(CLAUSE_END)
    .some((clause) => [...clause.matchAll(CONFIRMED)].some((claim) => !STILL_TO_COME_BEFORE.test(clause.slice(0, claim.index))));

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

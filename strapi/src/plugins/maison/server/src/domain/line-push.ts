/**
 * LINE's Messaging API, as Strapi calls it: a push to one customer, and a customer's display name. Neither ever throws:
 * what went wrong becomes the detail, or no name.
 */
import { fitUnits } from './text';

/** Where LINE answers, and Strapi's channel access token. */
export interface LineApi {
  apiBaseUrl: string;
  token: string;
}

/** The message objects Strapi sends: a confirmation's flex message, or a staff member's text. */
export type LineMessage = { type: 'flex'; altText: string; contents: unknown } | { type: 'text'; text: string };

/**
 * LINE gets this long to answer a push. A publish outside a transaction (Confirm, confirm_appointment) waits for its
 * confirmation this long at most; one inside a transaction (the Content Manager's Publish) doesn't wait, and sends
 * after the commit.
 */
export const PUSH_TIMEOUT_MS = 8000;
/** LINE gets this long to give a customer's display name. A hand-off never waits longer for it. */
export const PROFILE_TIMEOUT_MS = 3000;

/** The `message` of LINE's error body, `{ "message": "…", "details": […] }`, or '' when there's none. */
const lineMessageOf = (body: string): string => {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.message === 'string' ? parsed.message : '';
  } catch {
    return '';
  }
};

/** Why a push got no answer, after waiting `timeoutMs` for one. */
const unreachable = (error: unknown, timeoutMs: number): string => {
  if ((error as Error | undefined)?.name === 'TimeoutError') return `LINE didn't answer within ${timeoutMs / 1000} seconds.`;
  // fetch says only "fetch failed"; its cause says what failed, such as "connect ECONNREFUSED 127.0.0.1:4010".
  const cause = (error as { cause?: { message?: unknown } } | undefined)?.cause?.message;
  return `LINE couldn't be reached: ${typeof cause === 'string' ? cause : String((error as Error | undefined)?.message ?? error)}`;
};

/** One push to a customer, of up to five messages. It never throws: what went wrong becomes the detail. */
export const pushMessages = async (
  { apiBaseUrl, token }: LineApi,
  to: string,
  messages: LineMessage[]
): Promise<{ status: 'sent' | 'failed'; detail: string }> => {
  try {
    const response = await fetch(`${apiBaseUrl}/v2/bot/message/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages }),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    const body = await response.text().catch(() => '');
    if (response.ok) return { status: 'sent', detail: body || `LINE answered ${response.status}.` };
    const lineMessage = lineMessageOf(body);
    return { status: 'failed', detail: lineMessage ? `LINE answered ${response.status}: ${lineMessage}` : `LINE answered ${response.status}.` };
  } catch (error) {
    return { status: 'failed', detail: unreachable(error, PUSH_TIMEOUT_MS) };
  }
};

/**
 * A customer's LINE display name, from LINE's Get profile API, or null when LINE gives none within PROFILE_TIMEOUT_MS:
 * someone who isn't a friend and hasn't written to the account, a refusal, or no answer. Trimmed, and cut to fit the
 * question's `customerName`, 100 UTF-16 units, ending with "…" when it was cut.
 */
export const getDisplayName = async ({ apiBaseUrl, token }: LineApi, userId: string): Promise<string | null> => {
  try {
    const response = await fetch(`${apiBaseUrl}/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { displayName?: unknown } | null;
    const name = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    return name ? fitUnits(name, 100) : null;
  } catch {
    return null;
  }
};

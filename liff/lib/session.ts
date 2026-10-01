export const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';

/** A failed token exchange. `code` is the OAuth error, e.g. invalid_grant or temporarily_unavailable. */
export class SessionError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'SessionError';
  }

  /** invalid_grant: LINE refused the ID token (invalid or expired). Only a new LINE sign-in helps. */
  get signInAgain(): boolean {
    return this.code === 'invalid_grant';
  }

  /** temporarily_unavailable (503): LINE couldn't be reached, or the LINE client needs an admin. Try again later. */
  get retryLater(): boolean {
    return this.code === 'temporarily_unavailable';
  }
}

export interface SessionOptions {
  strapiUrl: string;
  clientId: string;
  getIdToken: () => string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** The longest the app waits before its one automatic retry, whatever Retry-After says, so a screen never hangs. */
const MAX_RETRY_WAIT_SECONDS = 10;
const DEFAULT_RETRY_WAIT_SECONDS = 5;

/**
 * A customer's MCP session: the LINE ID token exchanged at oauth-mcp-manager's token endpoint.
 * Kept in memory only. There is no refresh token, so it exchanges the ID token again when needed.
 */
export const createSession = ({
  strapiUrl,
  clientId,
  getIdToken,
  fetchImpl = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: SessionOptions) => {
  let current: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  const exchangeOnce = async (): Promise<string> => {
    const response = await fetchImpl(
      `${strapiUrl}/api/strapi-oauth-mcp-manager/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: TOKEN_EXCHANGE,
          client_id: clientId,
          subject_token: getIdToken(),
          subject_token_type: ID_TOKEN_TYPE,
          resource: `${strapiUrl}/mcp`,
        }),
      }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== 'string') {
      // Strapi's CORS settings expose Retry-After to the app (Task 1).
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new SessionError(
        body.error ?? 'server_error',
        body.error_description ?? `Sign-in failed (${response.status})`,
        retryAfter > 0 ? retryAfter : null
      );
    }
    current = {
      token: body.access_token,
      expiresAt: now() + (Number(body.expires_in) || 3600) * 1000,
    };
    return current.token;
  };

  /** One exchange. temporarily_unavailable is retried once, after Retry-After; invalid_grant never is. */
  const exchange = async (): Promise<string> => {
    try {
      return await exchangeOnce();
    } catch (error) {
      if (!(error instanceof SessionError) || !error.retryLater) throw error;
      await sleep(
        Math.min(
          error.retryAfterSeconds ?? DEFAULT_RETRY_WAIT_SECONDS,
          MAX_RETRY_WAIT_SECONDS
        ) * 1000
      );
      return exchangeOnce();
    }
  };

  /** A new exchange. Concurrent callers share it. */
  const refresh = (): Promise<string> =>
    (pending ??= exchange().finally(() => {
      pending = null;
    }));

  return {
    /** The current session token, or a new one when there is none or it expires within a minute. */
    async getToken(): Promise<string> {
      if (current && current.expiresAt - now() > 60_000) return current.token;
      return refresh();
    },
    refresh,
  };
};

export type Session = ReturnType<typeof createSession>;

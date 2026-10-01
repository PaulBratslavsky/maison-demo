import type { ExtendedInit, LiffMockApi } from '@line/liff-mock';

import { config } from './config';
import type { Locale } from './types';

export interface LiffState {
  getIdToken: () => string;
  locale: Locale;
  mock: boolean;
  /** Inside LINE: a new LINE login, for when the token endpoint answers invalid_grant. It reloads the page. */
  signInAgain: () => void;
}

const LINE_USER_ID = /^U[0-9a-f]{32}$/;
const DEMO_USER_KEY = 'maison.demoUser';
const SIGNED_IN_AGAIN_AT = 'maison.signedInAgainAt';
let ready: Promise<LiffState> | null = null;

export const toLocale = (language: string | undefined): Locale =>
  language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';

/** Mock mode only: ?demoUser=U… signs in another demo customer in this tab (tests, second-customer check). */
const demoUserId = (): string => {
  const fromQuery = new URLSearchParams(window.location.search).get('demoUser');
  try {
    if (fromQuery && LINE_USER_ID.test(fromQuery))
      window.sessionStorage.setItem(DEMO_USER_KEY, fromQuery);
    const stored = window.sessionStorage.getItem(DEMO_USER_KEY);
    if (stored && LINE_USER_ID.test(stored)) return stored;
  } catch {
    // storage unavailable: use the default demo customer
  }
  return config.demoLineUserId;
};

const init = async (): Promise<LiffState> => {
  const liff = (await import('@line/liff')).default;

  if (config.liffMock) {
    const { LiffMockPlugin } = await import('@line/liff-mock');
    liff.use(new LiffMockPlugin());
    await (liff.init as unknown as ExtendedInit)({
      liffId: config.liffId || 'maison-demo',
      mock: true,
    });
    const userId = demoUserId();
    // Always the function form: set() with a plain object replaces the whole mock store.
    (liff as unknown as { $mock: LiffMockApi }).$mock.set((previous) => ({
      ...previous,
      isLoggedIn: true,
      getIDToken: `valid.${userId}`,
      getAppLanguage: config.demoLocale,
      getLanguage: config.demoLocale,
    }));
  } else {
    await liff.init({ liffId: config.liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return new Promise<LiffState>(() => {}); // the page is leaving for LINE Login
    }
  }

  if (!liff.getIDToken()) {
    throw new Error(
      'LINE gave no ID token. The LIFF app needs the openid scope.'
    );
  }
  return {
    getIdToken: () => liff.getIDToken() ?? '',
    locale: toLocale(liff.getAppLanguage()),
    mock: config.liffMock,
    signInAgain: () => {
      // LINE's way: log out, then reload. Inside LINE, liff.init() signs in again by itself, and liff.login() can't be
      // used there; in an external browser, init() above calls liff.login(). At most once a minute: refused again right
      // after a new sign-in, the app and Strapi disagree about the LINE channel, and the screen shows the error instead.
      // The same minute absorbs a second call for one refusal: maison.ts wraps both getToken() and refresh(), which
      // share one exchange.
      try {
        if (Date.now() - Number(window.sessionStorage.getItem(SIGNED_IN_AGAIN_AT)) < 60_000) return;
        window.sessionStorage.setItem(SIGNED_IN_AGAIN_AT, String(Date.now()));
      } catch {
        return; // without storage a loop can't be told apart: show the error
      }
      liff.logout(); // drops the expired ID token
      window.location.reload();
    },
  };
};

/** Initializes LIFF once per page load; a failed start can be tried again. Browser only. */
export const initLiff = (): Promise<LiffState> =>
  (ready ??= init().catch((error) => {
    ready = null;
    throw error;
  }));

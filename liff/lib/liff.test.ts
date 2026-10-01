import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real LIFF SDK, as the app uses it inside LINE (NEXT_PUBLIC_LIFF_MOCK=false).
const liff = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  isLoggedIn: vi.fn(() => true),
  getIDToken: vi.fn(() => 'eyJ.line.idtoken'),
  getAppLanguage: vi.fn(() => 'ja'),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('@line/liff', () => ({ default: liff }));

/** The LIFF browser: its location, and the tab's session storage, which outlives a reload. */
const browser = (sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>) => {
  const store = new Map<string, string>();
  const location = { href: 'https://maison.example/visits', search: '', reload: vi.fn() };
  vi.stubGlobal('window', {
    location,
    sessionStorage: sessionStorage ?? {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  return location;
};

describe('initLiff inside LINE', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_LIFF_MOCK', 'false');
    vi.stubEnv('NEXT_PUBLIC_LIFF_ID', '1234567890-AbcdEfgh');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts LIFF with the app's LIFF ID and passes on LINE's ID token and language", async () => {
    browser();
    const { initLiff } = await import('./liff');
    const state = await initLiff();
    expect(liff.init).toHaveBeenCalledWith({ liffId: '1234567890-AbcdEfgh' });
    expect(state).toMatchObject({ locale: 'ja', mock: false });
    expect(state.getIdToken()).toBe('eyJ.line.idtoken');
  });

  it('signs in again the way LINE documents it: log out and reload, never liff.login(), and only once a minute', async () => {
    const location = browser();
    const { initLiff } = await import('./liff');
    const state = await initLiff();
    state.signInAgain();
    expect(liff.logout).toHaveBeenCalledTimes(1);
    expect(location.reload).toHaveBeenCalledTimes(1);
    // A second call right after is one sign-in, not two: one refused exchange reaches signInAgain through both of
    // maison.ts's session wrappers. And refused again after the reload, the app and Strapi disagree about the channel:
    // the screen shows the error rather than reload for ever.
    state.signInAgain();
    expect(liff.logout).toHaveBeenCalledTimes(1);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(liff.login).not.toHaveBeenCalled();
  });

  it('signs in again a minute later: an ID token lasts an hour, and the next one expires too', async () => {
    const location = browser();
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 7, 10));
    const { initLiff } = await import('./liff');
    const state = await initLiff();
    state.signInAgain();
    now.mockReturnValue(Date.UTC(2026, 9, 7, 10, 1));
    state.signInAgain();
    expect(liff.logout).toHaveBeenCalledTimes(2);
    expect(location.reload).toHaveBeenCalledTimes(2);
  });

  it("doesn't reload without session storage, where a loop can't be told apart: the screen shows the error", async () => {
    const location = browser({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    const { initLiff } = await import('./liff');
    const state = await initLiff();
    state.signInAgain();
    expect(liff.logout).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });
});

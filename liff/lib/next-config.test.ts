// The X-Maison-Liff header next.config.mjs puts on every answer, which `npm run tunnel` reads before it opens the tunnel.
// Only a production build in LINE mode answers line: the build `npm run start:line` serves.
import { afterEach, describe, expect, it, vi } from 'vitest';

import nextConfig from '../next.config.mjs';

const liffHeader = async () => {
  const rules = await nextConfig.headers!();
  expect(rules).toHaveLength(1);
  expect(rules[0].source).toBe('/:path*');
  return rules[0].headers.find(({ key }) => key === 'X-Maison-Liff')?.value;
};

describe('next.config.mjs: X-Maison-Liff', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    { NODE_ENV: 'production', NEXT_PUBLIC_LIFF_MOCK: 'false', value: 'line' }, // npm run start:line
    { NODE_ENV: 'production', NEXT_PUBLIC_LIFF_MOCK: 'true', value: 'mock' },
    { NODE_ENV: 'production', NEXT_PUBLIC_LIFF_MOCK: undefined, value: 'mock' },
    { NODE_ENV: 'development', NEXT_PUBLIC_LIFF_MOCK: 'false', value: 'line-dev' }, // next dev in LINE mode
    { NODE_ENV: 'development', NEXT_PUBLIC_LIFF_MOCK: 'true', value: 'mock' }, // npm run dev, the stage
  ])('NODE_ENV=$NODE_ENV and NEXT_PUBLIC_LIFF_MOCK=$NEXT_PUBLIC_LIFF_MOCK: $value', async ({ NODE_ENV, NEXT_PUBLIC_LIFF_MOCK, value }) => {
    vi.stubEnv('NODE_ENV', NODE_ENV);
    vi.stubEnv('NEXT_PUBLIC_LIFF_MOCK', NEXT_PUBLIC_LIFF_MOCK);
    expect(await liffHeader()).toBe(value);
  });
});

describe('next.config.mjs: the stage', () => {
  it("shows no development indicator: the stage runs on next dev, and Next's badge would sit in a corner of the projected screen", () => {
    expect(nextConfig.devIndicators).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** The TanStack AI set the spec was checked against. Exact: a range lets npm put two copies of the SDK side by side. */
const PINNED = {
  '@tanstack/ai': '0.52.3',
  '@tanstack/ai-anthropic': '0.18.3',
  '@tanstack/ai-react': '0.22.4',
  '@tanstack/ai-client': '0.29.2',
} as const;

describe('the TanStack AI packages', () => {
  it.each(Object.entries(PINNED))('pin %s to exactly %s in dependencies', (name, version) => {
    expect(manifest.dependencies[name]).toBe(version);
  });

  it('use no range for any @tanstack package', () => {
    const tanstack = Object.entries(manifest.dependencies).filter(([name]) => name.startsWith('@tanstack/'));
    expect(tanstack).toHaveLength(4);
    for (const [name, version] of tanstack) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

/** The Markdown renderer the Ask tab draws answers with. They are in `dependencies`, as strapi-plugin-tanstack-ai 1.6.0 has them. */
describe('the Markdown packages', () => {
  it.each([
    ['react-markdown', '^9.1.0'],
    ['remark-gfm', '^4.0.1'],
  ])('declare %s %s in dependencies', (name, range) => {
    expect(manifest.dependencies[name]).toBe(range);
  });
});

/** What the component tests run on. They are only for the tests, so they are in `devDependencies` and never ship with the plugin. */
describe('the component test packages', () => {
  it.each([
    ['jsdom', '^25.0.1'],
    ['@testing-library/react', '^16.3.2'],
    ['@testing-library/user-event', '^14.6.1'],
  ])('declare %s %s in devDependencies, and not in dependencies', (name, range) => {
    expect(manifest.devDependencies[name]).toBe(range);
    expect(manifest.dependencies[name]).toBeUndefined();
  });
});

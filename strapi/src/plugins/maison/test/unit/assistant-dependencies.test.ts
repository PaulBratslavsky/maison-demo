import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };

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

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../server/src/', import.meta.url));

/** Every file under server/src, as a path from it. */
const filesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(path.join(directory, entry.name)) : [path.relative(root, path.join(directory, entry.name))]
  );

/** An import, a dynamic import, a require, or a bare import of an @tanstack package, with either kind of quote. */
const NAMES_TANSTACK = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']@tanstack\//;

describe('the @tanstack packages', () => {
  const files = filesUnder(root).filter((file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file));

  it('finds the server files', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain(path.join('assistant', 'sdk.ts'));
  });

  it('are named by assistant/sdk.ts alone: they ship ESM only, and one file loads them with import()', () => {
    const naming = files.filter((file) => NAMES_TANSTACK.test(readFileSync(path.join(root, file), 'utf8')));
    expect(naming).toEqual([path.join('assistant', 'sdk.ts')]);
  });

  it('are loaded by sdk.ts with import(), and never with require or a static import', () => {
    const source = readFileSync(path.join(root, 'assistant', 'sdk.ts'), 'utf8');
    expect(source).toMatch(/await import\('@tanstack\/ai'\)/);
    expect(source).toMatch(/await import\('@tanstack\/ai-anthropic'\)/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    // The one static import is the type of the adapter, which the build erases.
    const staticImports = [...source.matchAll(/^import\s+(type\s+)?[^;]*from\s+'@tanstack\/[^']+';/gm)];
    expect(staticImports.map((match) => match[0])).toEqual(["import type { AnyTextAdapter } from '@tanstack/ai';"]);
  });
});

describe('scripts/check-esm-import.mjs', () => {
  const script = fileURLToPath(new URL('../../scripts/check-esm-import.mjs', import.meta.url));

  /** A folder holding index.js and index.mjs with these sources, checked by the script. */
  const check = (sources: { js?: string; mjs?: string }) => {
    const folder = mkdtempSync(path.join(tmpdir(), 'maison-bundle-'));
    try {
      if (sources.js !== undefined) writeFileSync(path.join(folder, 'index.js'), sources.js);
      if (sources.mjs !== undefined) writeFileSync(path.join(folder, 'index.mjs'), sources.mjs);
      const result = spawnSync(process.execPath, [script, folder], { encoding: 'utf8' });
      return { status: result.status, output: `${result.stdout}${result.stderr}` };
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };

  const LOADS_DYNAMICALLY = 'async function load() {\n  sdk = await import("@tanstack/ai");\n  adapter = await import("@tanstack/ai-anthropic");\n}\n';

  it('passes a bundle that loads the packages only with import(), and counts the sites', () => {
    const result = check({ js: LOADS_DYNAMICALLY, mjs: LOADS_DYNAMICALLY });
    expect(result.status).toBe(0);
    expect(result.output).toContain('index.js: no static load of @tanstack/ai (2 dynamic import sites)');
    expect(result.output).toContain('index.mjs: no static load of @tanstack/ai (2 dynamic import sites)');
  });

  it.each([
    ['a require of the SDK', 'const ai = require("@tanstack/ai");\n'],
    ['a require of the adapter', "const anthropic = require('@tanstack/ai-anthropic');\n"],
    ['an import with bindings', 'import { chat } from "@tanstack/ai";\n'],
    ['an import over several lines', 'import {\n  chat,\n  toolDefinition\n} from "@tanstack/ai";\n'],
    ['a bare import, which still loads the module', 'import "@tanstack/ai-anthropic";\n'],
  ])('fails a bundle with %s, and names the package', (_what, line) => {
    for (const sources of [{ js: `${LOADS_DYNAMICALLY}${line}`, mjs: LOADS_DYNAMICALLY }, { js: LOADS_DYNAMICALLY, mjs: `${line}${LOADS_DYNAMICALLY}` }]) {
      const result = check(sources);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/loads the SDK statically: @tanstack\/ai/);
    }
  });

  it('fails when a bundle is missing, and says to build first', () => {
    const result = check({ js: LOADS_DYNAMICALLY });
    expect(result.status).toBe(1);
    expect(result.output).toContain('index.mjs is missing: run npm run build first');
  });

  it('ignores other @tanstack packages: only the AI packages are the plugin\'s concern', () => {
    const result = check({ js: 'const x = require("@tanstack/react-virtual");\nimport { y } from "@tanstack/virtual-core";\n', mjs: LOADS_DYNAMICALLY });
    expect(result.status).toBe(0);
  });
});

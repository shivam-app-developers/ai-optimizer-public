import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPluginPacks } from './plugin-loader.js';

describe('loadPluginPacks', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-plugins-'));
    writeFileSync(join(dir, 'package.json'), '{"name":"host","type":"module"}');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty when no plugins configured', async () => {
    const result = await loadPluginPacks(undefined, dir);
    expect(result).toEqual({ packs: [], errors: [] });
  });

  it('loads a relative-path plugin and returns the pack', async () => {
    const code = `export default {
      id: 'demo',
      name: 'Demo',
      detect: async () => true,
      ignoreGlobs: ['demo-build/**'],
    };`;
    writeFileSync(join(dir, 'plugin.mjs'), code);
    const result = await loadPluginPacks(['./plugin.mjs'], dir);
    expect(result.errors).toEqual([]);
    expect(result.packs).toHaveLength(1);
    expect(result.packs[0]!.id).toBe('demo');
  });

  it('captures errors without throwing', async () => {
    writeFileSync(join(dir, 'broken.mjs'), `export default { id: '', name: '', detect: 1 }`);
    const result = await loadPluginPacks(['./broken.mjs'], dir);
    expect(result.packs).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.spec).toBe('./broken.mjs');
    expect(result.errors[0]!.message).toMatch(/id|name|detect/);
  });

  it('rejects pack with non-RegExp generatedFilePatterns', async () => {
    const code = `export default {
      id: 'x',
      name: 'X',
      detect: async () => true,
      ignoreGlobs: [],
      generatedFilePatterns: ['not-a-regex'],
    };`;
    writeFileSync(join(dir, 'p.mjs'), code);
    const result = await loadPluginPacks(['./p.mjs'], dir);
    expect(result.packs).toEqual([]);
    expect(result.errors[0]!.message).toMatch(/RegExp/);
  });

  it('continues loading when one plugin fails', async () => {
    writeFileSync(join(dir, 'good.mjs'), `export default {
      id: 'good', name: 'G', detect: async () => true, ignoreGlobs: [],
    };`);
    writeFileSync(join(dir, 'bad.mjs'), `export default { id: '', name: '' };`);
    const result = await loadPluginPacks(['./bad.mjs', './good.mjs'], dir);
    expect(result.packs).toHaveLength(1);
    expect(result.packs[0]!.id).toBe('good');
    expect(result.errors).toHaveLength(1);
  });

  it('rejects modules without a default export', async () => {
    writeFileSync(
      join(dir, 'named.mjs'),
      `export const pack = { id: 'x', name: 'X', detect: async () => true, ignoreGlobs: [] };`,
    );
    const result = await loadPluginPacks(['./named.mjs'], dir);
    expect(result.packs).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it('handles absolute paths', async () => {
    const absPath = join(dir, 'abs.mjs');
    writeFileSync(absPath, `export default {
      id: 'abs', name: 'Abs', detect: async () => true, ignoreGlobs: [],
    };`);
    const result = await loadPluginPacks([absPath], dir);
    expect(result.packs).toHaveLength(1);
    expect(result.packs[0]!.id).toBe('abs');
  });
});

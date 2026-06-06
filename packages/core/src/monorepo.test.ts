import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectMonorepoLayout, scopePackToPrefix } from './monorepo.js';
import { detectProject } from './detector.js';
import { loadFreePacks } from './pack-loader.js';
import { Interceptor } from './interceptor.js';
import { SavingsCounter } from './counter.js';

function writeTree(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
}

describe('detectMonorepoLayout', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-mono-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects different packs in top-level subdirs', async () => {
    writeTree(dir, {
      'frontend/package.json': '{}',
      'backend/pyproject.toml': '',
    });
    const layout = await detectMonorepoLayout(dir, loadFreePacks());
    expect(layout.rootPacks).toEqual([]);
    expect(layout.subdirs).toHaveLength(2);
    const byPrefix = Object.fromEntries(
      layout.subdirs.map((s) => [s.prefix, s.packs.map((p) => p.id)]),
    );
    expect(byPrefix['frontend']).toEqual(['javascript']);
    expect(byPrefix['backend']).toEqual(['python']);
  });

  it('skips a pack from a subdir when it is already detected at root', async () => {
    writeTree(dir, {
      'package.json': '{}',
      'apps/web/package.json': '{}',
    });
    const layout = await detectMonorepoLayout(dir, loadFreePacks());
    expect(layout.rootPacks.map((p) => p.id)).toEqual(['javascript']);
    // apps/web shouldn't appear because root already covers it via global globs
    expect(layout.subdirs).toEqual([]);
  });

  it('descends one level inside packages/, apps/, services/', async () => {
    writeTree(dir, {
      'packages/api/pyproject.toml': '',
      'apps/web/package.json': '{}',
      'services/worker/package.json': '{}',
    });
    const layout = await detectMonorepoLayout(dir, loadFreePacks());
    const prefixes = layout.subdirs.map((s) => s.prefix).sort();
    expect(prefixes).toEqual(['apps/web', 'packages/api', 'services/worker']);
  });

  it('does not descend into node_modules / target / .git', async () => {
    writeTree(dir, {
      'node_modules/some-dep/package.json': '{}',
      'target/foo/Cargo.toml': '',
      '.git/config': '',
    });
    const layout = await detectMonorepoLayout(dir, loadFreePacks());
    expect(layout.subdirs).toEqual([]);
  });
});

describe('scopePackToPrefix', () => {
  it('prefixes ignore globs but leaves global **/ patterns alone', () => {
    const pack = {
      id: 'demo',
      name: 'Demo',
      detect: async () => true,
      ignoreGlobs: ['target/**', '/dist/**', '**/node_modules/**', 'cache/**'],
    };
    const scoped = scopePackToPrefix(pack, 'frontend');
    expect(scoped.id).toBe('demo@frontend');
    expect(scoped.ignoreGlobs).toEqual([
      'frontend/target/**',
      'frontend/dist/**',
      '**/node_modules/**',
      'frontend/cache/**',
    ]);
  });

  it('strips trailing slashes from prefix', () => {
    const scoped = scopePackToPrefix(
      { id: 'x', name: 'X', detect: async () => true, ignoreGlobs: ['build/**'] },
      'apps/web/',
    );
    expect(scoped.ignoreGlobs).toEqual(['apps/web/build/**']);
  });
});

describe('detectProject monorepo integration', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-mono-int-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('isIgnored only filters paths under the matching prefix', async () => {
    writeTree(dir, {
      'frontend/package.json': '{}',
      'frontend/node_modules/react/index.js': 'x',
      'frontend/src/App.js': 'x',
      'backend/pyproject.toml': '',
      'backend/__pycache__/foo.pyc': 'x',
      'backend/app.py': 'x',
      'README.md': '#',
    });
    const ctx = await detectProject(dir, loadFreePacks());
    const interceptor = new Interceptor(ctx, new SavingsCounter());
    expect(interceptor.isIgnored('frontend/node_modules/react/index.js')).toBe(true);
    expect(interceptor.isIgnored('backend/__pycache__/foo.pyc')).toBe(true);
    expect(interceptor.isIgnored('frontend/src/App.js')).toBe(false);
    expect(interceptor.isIgnored('backend/app.py')).toBe(false);
    expect(interceptor.isIgnored('README.md')).toBe(false);
  });

  it('opts.monorepo=false returns flat root-only behavior', async () => {
    writeTree(dir, {
      'frontend/package.json': '{}',
      'backend/pyproject.toml': '',
    });
    const ctx = await detectProject(dir, loadFreePacks(), { monorepo: false });
    expect(ctx.detectedFrameworks).toEqual([]);
  });
});

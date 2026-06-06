import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProject } from './detector.js';
import { loadFreePacks } from './pack-loader.js';

describe('detectProject', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-detect-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects Python via pyproject.toml', async () => {
    writeFileSync(join(dir, 'pyproject.toml'), '');
    const ctx = await detectProject(dir, loadFreePacks());
    expect(ctx.detectedFrameworks).toContain('python');
  });

  it('detects Python via requirements.txt', async () => {
    writeFileSync(join(dir, 'requirements.txt'), 'flask\n');
    const ctx = await detectProject(dir, loadFreePacks());
    expect(ctx.detectedFrameworks).toContain('python');
  });

  it('detects JavaScript via package.json', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const ctx = await detectProject(dir, loadFreePacks());
    expect(ctx.detectedFrameworks).toContain('javascript');
  });

  it('detects both Python and JavaScript in mixed projects', async () => {
    writeFileSync(join(dir, 'pyproject.toml'), '');
    writeFileSync(join(dir, 'package.json'), '{}');
    const ctx = await detectProject(dir, loadFreePacks());
    expect(ctx.detectedFrameworks).toContain('python');
    expect(ctx.detectedFrameworks).toContain('javascript');
  });

  it('detects nothing in an empty project', async () => {
    const ctx = await detectProject(dir, loadFreePacks());
    expect(ctx.detectedFrameworks).toEqual([]);
    expect(ctx.activePacks).toEqual([]);
  });

  it('loads gitignore matcher when .gitignore is present', async () => {
    mkdirSync(join(dir, 'secret'));
    writeFileSync(join(dir, '.gitignore'), 'secret/\n');
    const ctx = await detectProject(dir, loadFreePacks());
    expect(ctx.gitignoreMatcher).toBeDefined();
    expect(ctx.gitignoreMatcher?.('secret/foo.txt')).toBe(true);
    expect(ctx.gitignoreMatcher?.('public/foo.txt')).toBe(false);
  });

  it('skips gitignore matcher when no .gitignore exists', async () => {
    const ctx = await detectProject(dir, loadFreePacks());
    expect(ctx.gitignoreMatcher).toBeUndefined();
  });
});

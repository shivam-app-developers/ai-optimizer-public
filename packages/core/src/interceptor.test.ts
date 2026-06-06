import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProject } from './detector.js';
import { loadFreePacks } from './pack-loader.js';
import { SavingsCounter } from './counter.js';
import { Interceptor } from './interceptor.js';

async function setup(dir: string) {
  const ctx = await detectProject(dir, loadFreePacks());
  const counter = new SavingsCounter();
  return { ctx, counter, ix: new Interceptor(ctx, counter) };
}

describe('Interceptor', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-ix-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('skips files matching framework ignore patterns', async () => {
    writeFileSync(join(dir, 'pyproject.toml'), '');
    mkdirSync(join(dir, '__pycache__'));
    writeFileSync(join(dir, '__pycache__', 'main.cpython-312.pyc'), 'binary');
    writeFileSync(join(dir, 'app.py'), 'print("hi")');

    const { ix, counter } = await setup(dir);

    const skipped = await ix.readFile('__pycache__/main.cpython-312.pyc');
    expect(skipped.skipped).toBe(true);
    expect(skipped.estimatedTokensSaved).toBeGreaterThan(0);
    expect(counter.snapshot().tokensSaved).toBeGreaterThan(0);

    const allowed = await ix.readFile('app.py');
    expect(allowed.skipped).toBe(false);
    expect(allowed.content).toContain('print');
  });

  it('honors gitignore patterns over framework packs', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    mkdirSync(join(dir, 'secret'));
    writeFileSync(join(dir, 'secret', 'keys.txt'), 'API_KEY=abc');
    writeFileSync(join(dir, '.gitignore'), 'secret/\n');

    const { ix } = await setup(dir);
    const result = await ix.readFile('secret/keys.txt');
    expect(result.skipped).toBe(true);
  });

  it('slices files by line range', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(join(dir, 'big.txt'), lines);

    const { ix } = await setup(dir);
    const sliced = await ix.readFile('big.txt', { startLine: 10, endLine: 14 });
    expect(sliced.content).toBe('line 10\nline 11\nline 12\nline 13\nline 14');
    expect(sliced.estimatedTokensSaved).toBeGreaterThan(0);
  });

  it('lists files with framework filtering', async () => {
    writeFileSync(join(dir, 'pyproject.toml'), '');
    writeFileSync(join(dir, 'app.py'), '');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'utils.py'), '');
    mkdirSync(join(dir, '__pycache__'));
    writeFileSync(join(dir, '__pycache__', 'app.cpython-312.pyc'), '');
    mkdirSync(join(dir, '.venv'));
    writeFileSync(join(dir, '.venv', 'fake.py'), '');

    const { ix } = await setup(dir);
    const listing = await ix.listFiles('.');
    const paths = listing.paths.map((p) => p.replace(/\\/g, '/'));
    expect(paths).toContain('app.py');
    expect(paths).toContain('src/utils.py');
    expect(paths).toContain('pyproject.toml');
    expect(paths.some((p) => p.includes('__pycache__'))).toBe(false);
    expect(paths.some((p) => p.includes('.venv'))).toBe(false);
  });

  it('lists files filtered by glob pattern', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'a.ts'), '');
    writeFileSync(join(dir, 'b.js'), '');
    writeFileSync(join(dir, 'c.md'), '');

    const { ix } = await setup(dir);
    const listing = await ix.listFiles('.', { pattern: '**/*.ts' });
    const paths = listing.paths.map((p) => p.replace(/\\/g, '/'));
    expect(paths).toContain('a.ts');
    expect(paths).not.toContain('b.js');
    expect(paths).not.toContain('c.md');
  });

  it('greps file contents with ignore filtering', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'app.ts'), 'function login() {}\nfunction logout() {}');
    writeFileSync(join(dir, 'README.md'), 'This app supports login.');
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'leak.js'), 'function login() {}');

    const { ix } = await setup(dir);
    const result = await ix.grep('function login');
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches.every((m) => !m.path.includes('node_modules'))).toBe(true);
  });

  it('reports filtered counts in listFiles', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'a.js'), '');
    writeFileSync(join(dir, 'index.ts'), '');

    const { ix } = await setup(dir);
    const result = await ix.listFiles('.');
    expect(result.totalFiltered).toBeGreaterThan(0);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parseArgs } from './cli.js';

describe('parseArgs', () => {
  it('defaults to cwd, no input override, dryRun=false', () => {
    const o = parseArgs([]);
    expect(o.rootDir).toBe(process.cwd());
    expect(o.inputPath).toBeUndefined();
    expect(o.dryRun).toBe(false);
  });

  it('accepts --root and --input and --dry-run', () => {
    const o = parseArgs(['--root', '/tmp/foo', '--input', '/tmp/cfg.json', '--dry-run']);
    expect(o.rootDir).toContain('foo');
    expect(o.inputPath).toContain('cfg.json');
    expect(o.dryRun).toBe(true);
  });

  it('treats --preview-only as a dry-run alias', () => {
    expect(parseArgs(['--preview-only']).dryRun).toBe(true);
  });
});

describe('main (end-to-end)', () => {
  let dir: string;
  let stdout: string;
  let stderr: string;
  const originalWrite = { stdout: process.stdout.write, stderr: process.stderr.write };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-import-cli-'));
    stdout = '';
    stderr = '';
    process.stdout.write = ((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.stdout.write = originalWrite.stdout;
    process.stderr.write = originalWrite.stderr;
    vi.restoreAllMocks();
  });

  it('returns 1 and writes a hint when no config is found', async () => {
    const code = await main(['--root', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/No context-mode config found/);
  });

  it('translates a JSON config and writes .optimizerrc.json', async () => {
    writeFileSync(
      join(dir, '.contextmode.json'),
      JSON.stringify({ framework: 'react', ignore: ['build/**'], maxTokens: 5000 }),
    );
    const code = await main(['--root', dir]);
    expect(code).toBe(0);
    const target = join(dir, '.optimizerrc.json');
    expect(existsSync(target)).toBe(true);
    const written = JSON.parse(readFileSync(target, 'utf-8'));
    expect(written.extraIgnoreGlobs).toEqual(['build/**']);
    expect(written.budgetCaps).toEqual({ perSessionTokens: 5000 });
    expect(stdout).toMatch(/Pro pack/);
  });

  it('does NOT write when --dry-run is passed', async () => {
    writeFileSync(join(dir, '.contextmode.json'), JSON.stringify({ ignore: ['x'] }));
    const code = await main(['--root', dir, '--dry-run']);
    expect(code).toBe(0);
    expect(existsSync(join(dir, '.optimizerrc.json'))).toBe(false);
    expect(stdout).toMatch(/--dry-run set/);
  });

  it('honours --input pointing at a YAML elsewhere', async () => {
    const inputPath = join(dir, 'somewhere.yml');
    writeFileSync(inputPath, 'framework: python\nmaxTokens: 1000\n');
    const code = await main(['--root', dir, '--input', inputPath]);
    expect(code).toBe(0);
    const written = JSON.parse(readFileSync(join(dir, '.optimizerrc.json'), 'utf-8'));
    expect(written.budgetCaps).toEqual({ perSessionTokens: 1000 });
  });

  it('reports a clear error and returns 1 on malformed JSON', async () => {
    writeFileSync(join(dir, '.contextmode.json'), '{{{ broken');
    const code = await main(['--root', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/could not parse JSON/);
  });
});

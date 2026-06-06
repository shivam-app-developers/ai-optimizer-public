import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findContextModeConfig,
  parseContextModeFile,
  parseSimpleYaml,
} from './parser.js';

describe('findContextModeConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-import-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined when no file exists', () => {
    expect(findContextModeConfig(dir)).toBeUndefined();
  });

  it('finds .contextmode.json with first-match priority', () => {
    writeFileSync(join(dir, '.contextmode.json'), '{}');
    writeFileSync(join(dir, '.contextmode.yml'), '');
    expect(findContextModeConfig(dir)).toBe(join(dir, '.contextmode.json'));
  });

  it('finds yaml when only yaml exists', () => {
    writeFileSync(join(dir, '.contextmode.yaml'), 'framework: python\n');
    expect(findContextModeConfig(dir)).toBe(join(dir, '.contextmode.yaml'));
  });
});

describe('parseContextModeFile (JSON)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-import-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('parses an object', () => {
    const p = join(dir, '.contextmode.json');
    writeFileSync(p, JSON.stringify({ framework: 'python', ignore: ['build/**'] }));
    expect(parseContextModeFile(p)).toEqual({ framework: 'python', ignore: ['build/**'] });
  });

  it('throws on a non-object top level', () => {
    const p = join(dir, '.contextmode.json');
    writeFileSync(p, '[1,2,3]');
    expect(() => parseContextModeFile(p)).toThrow(/object at top level/);
  });

  it('throws on malformed JSON', () => {
    const p = join(dir, '.contextmode.json');
    writeFileSync(p, '{ this isnt json');
    expect(() => parseContextModeFile(p)).toThrow(/could not parse JSON/);
  });
});

describe('parseSimpleYaml', () => {
  it('parses key: value scalars with type coercion', () => {
    const out = parseSimpleYaml(
      [
        'framework: python',
        'maxTokens: 25000',
        'enabled: true',
        'note: "quoted string"',
      ].join('\n'),
    );
    expect(out).toEqual({
      framework: 'python',
      maxTokens: 25000,
      enabled: true,
      note: 'quoted string',
    });
  });

  it('parses block lists', () => {
    const out = parseSimpleYaml(
      [
        'ignore:',
        '  - build/**',
        '  - .venv/**',
        '  - "node_modules/**"',
        'framework: react',
      ].join('\n'),
    );
    expect(out).toEqual({
      ignore: ['build/**', '.venv/**', 'node_modules/**'],
      framework: 'react',
    });
  });

  it('skips comments and blank lines', () => {
    const out = parseSimpleYaml(
      [
        '# top comment',
        '',
        'framework: go  # trailing comment',
        '',
        '# another',
        'maxTokens: 5000',
      ].join('\n'),
    );
    expect(out).toEqual({ framework: 'go', maxTokens: 5000 });
  });

  it('parses nothing usable from a YAML with only flow style or anchors', () => {
    // We deliberately don't support these — output should be empty / not throw.
    const out = parseSimpleYaml('frameworks: { primary: python, secondary: rust }\n');
    expect(typeof out).toBe('object');
    // The line is captured but the value is left as a literal string — translator will skip it.
    expect(out.frameworks).toBe('{ primary: python, secondary: rust }');
  });
});

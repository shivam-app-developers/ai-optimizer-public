import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseArgs } from './cli.js';

describe('parseArgs', () => {
  it('uses cwd by default', () => {
    const o = parseArgs([]);
    expect(o.rootDir).toBe(process.cwd());
    expect(o.yes).toBe(false);
    expect(o.no).toBe(false);
    expect(o.preview).toBe(false);
  });

  it('parses --root, --yes, --no, --preview-only', () => {
    const o = parseArgs(['--root', '/tmp/x', '--yes']);
    expect(o.rootDir).toBe(resolve('/tmp/x'));
    expect(o.yes).toBe(true);

    const o2 = parseArgs(['--no']);
    expect(o2.no).toBe(true);

    const o3 = parseArgs(['--preview-only']);
    expect(o3.preview).toBe(true);

    const o4 = parseArgs(['--dry-run']);
    expect(o4.preview).toBe(true);

    const o5 = parseArgs(['-y']);
    expect(o5.yes).toBe(true);
  });

  it('ignores unknown flags without crashing', () => {
    const o = parseArgs(['--no-such-flag', '--root', '/t']);
    expect(o.rootDir).toBe(resolve('/t'));
  });
});

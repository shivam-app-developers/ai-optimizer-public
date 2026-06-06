import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StatusFileWriter, type StatusSnapshot } from './status-file.js';

function snap(overrides: Partial<StatusSnapshot> = {}): StatusSnapshot {
  return {
    ts: Date.now(),
    tokensSaved: 1234,
    operations: 5,
    frameworks: ['javascript'],
    packs: ['javascript'],
    dollarsSaved: 0.0037,
    rootDir: '/tmp/proj',
    ...overrides,
  };
}

describe('StatusFileWriter', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-status-'));
    path = join(dir, 'sub', 'status.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the latest snapshot and creates the parent directory', () => {
    const w = new StatusFileWriter({ path, minIntervalMs: 0 });
    w.update(snap());
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(parsed.tokensSaved).toBe(1234);
    expect(parsed.frameworks).toEqual(['javascript']);
  });

  it('coalesces bursts when minIntervalMs > 0', async () => {
    const w = new StatusFileWriter({ path, minIntervalMs: 50 });
    w.update(snap({ tokensSaved: 1 }));
    // First write goes through immediately because lastFlushAt = 0
    expect(JSON.parse(readFileSync(path, 'utf-8')).tokensSaved).toBe(1);
    w.update(snap({ tokensSaved: 2 }));
    w.update(snap({ tokensSaved: 3 }));
    w.update(snap({ tokensSaved: 4 }));
    // No additional write until interval elapses — file still shows 1
    expect(JSON.parse(readFileSync(path, 'utf-8')).tokensSaved).toBe(1);
    await new Promise((r) => setTimeout(r, 80));
    expect(JSON.parse(readFileSync(path, 'utf-8')).tokensSaved).toBe(4);
  });

  it('flushNow forces an immediate write of the latest pending snapshot', () => {
    const w = new StatusFileWriter({ path, minIntervalMs: 5000 });
    w.update(snap({ tokensSaved: 10 }));
    // First update hits disk immediately
    w.update(snap({ tokensSaved: 99 })); // queued
    w.flushNow();
    expect(JSON.parse(readFileSync(path, 'utf-8')).tokensSaved).toBe(99);
  });

  it('shutdown is idempotent and survives no-update calls', () => {
    const w = new StatusFileWriter({ path, minIntervalMs: 1000 });
    expect(() => {
      w.shutdown();
      w.shutdown();
    }).not.toThrow();
    expect(existsSync(path)).toBe(false);
  });

  it('does not throw if the directory cannot be written (e.g. permission)', () => {
    // Use a clearly invalid path on Windows. mkdirSync will fail and be swallowed.
    const w = new StatusFileWriter({ path: 'Z:\\nope\\status.json', minIntervalMs: 0 });
    expect(() => w.update(snap())).not.toThrow();
  });
});

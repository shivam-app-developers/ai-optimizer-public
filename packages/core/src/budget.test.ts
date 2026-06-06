import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetTracker } from './budget.js';

describe('BudgetTracker', () => {
  let dir: string;
  let storagePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-budget-'));
    storagePath = join(dir, 'budget-day.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('tracks session and day usage independently', () => {
    const t = new BudgetTracker({ caps: {}, storagePath });
    t.consume(100);
    t.consume(200);
    const snap = t.snapshot();
    expect(snap.sessionUsed).toBe(300);
    expect(snap.dayUsed).toBe(300);
    expect(snap.exceeded).toBe(false);
  });

  it('reports exceeded when per-session cap is breached', () => {
    const t = new BudgetTracker({ caps: { perSessionTokens: 500 }, storagePath });
    t.consume(400);
    expect(t.snapshot().exceeded).toBe(false);
    t.consume(200);
    const snap = t.snapshot();
    expect(snap.exceeded).toBe(true);
    expect(snap.exceededReason).toContain('per-session cap reached');
  });

  it('wouldExceed predicts breach without actually consuming', () => {
    const t = new BudgetTracker({ caps: { perSessionTokens: 100 }, storagePath });
    expect(t.wouldExceed(50)).toBe(false);
    expect(t.wouldExceed(150)).toBe(true);
    expect(t.snapshot().sessionUsed).toBe(0);
  });

  it('reports exceeded when per-day cap is breached', () => {
    const t = new BudgetTracker({ caps: { perDayTokens: 1000 }, storagePath });
    t.consume(900);
    expect(t.snapshot().exceeded).toBe(false);
    t.consume(200);
    const snap = t.snapshot();
    expect(snap.exceeded).toBe(true);
    expect(snap.exceededReason).toContain('per-day cap reached');
  });

  it('persists day usage to disk', () => {
    const t = new BudgetTracker({ caps: {}, storagePath });
    t.consume(123);
    expect(existsSync(storagePath)).toBe(true);
    const parsed = JSON.parse(readFileSync(storagePath, 'utf-8'));
    expect(parsed.tokens).toBe(123);
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reloads day usage from disk across instances on the same day', () => {
    const t1 = new BudgetTracker({ caps: {}, storagePath });
    t1.consume(500);
    const t2 = new BudgetTracker({ caps: {}, storagePath });
    expect(t2.snapshot().dayUsed).toBe(500);
    // Session does not persist
    expect(t2.snapshot().sessionUsed).toBe(0);
  });

  it('does not reload day usage when the date no longer matches today', () => {
    // Write a stale entry from a different date.
    const stale = { date: '1999-01-01', tokens: 99999 };
    const fs = require('node:fs') as typeof import('node:fs');
    fs.mkdirSync(join(storagePath, '..'), { recursive: true });
    fs.writeFileSync(storagePath, JSON.stringify(stale));
    const t = new BudgetTracker({ caps: {}, storagePath });
    expect(t.snapshot().dayUsed).toBe(0);
  });

  it('rolls the day counter at UTC midnight via the now() override', () => {
    let clock = Date.UTC(2026, 4, 6, 23, 59, 0); // 2026-05-06 23:59 UTC
    const t = new BudgetTracker({ caps: {}, storagePath, now: () => clock });
    t.consume(100);
    expect(t.snapshot().dayUsed).toBe(100);
    clock = Date.UTC(2026, 4, 7, 0, 1, 0); // crossed UTC midnight
    t.consume(50);
    const snap = t.snapshot();
    expect(snap.dayUsed).toBe(50);
    expect(snap.dayKey).toBe('2026-05-07');
  });

  it('reset zeroes session and day counts', () => {
    const t = new BudgetTracker({ caps: { perSessionTokens: 100 }, storagePath });
    t.consume(80);
    t.reset();
    expect(t.snapshot()).toMatchObject({ sessionUsed: 0, dayUsed: 0 });
  });

  it('ignores zero or negative consumption', () => {
    const t = new BudgetTracker({ caps: {}, storagePath });
    t.consume(0);
    t.consume(-50);
    expect(t.snapshot().sessionUsed).toBe(0);
  });

  it('never throws on a corrupted persisted file', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    fs.mkdirSync(join(storagePath, '..'), { recursive: true });
    fs.writeFileSync(storagePath, 'not json {{{');
    expect(() => new BudgetTracker({ caps: {}, storagePath })).not.toThrow();
  });
});

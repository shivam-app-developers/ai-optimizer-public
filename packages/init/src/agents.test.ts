import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planTargets, KNOWN_MANUAL_AGENTS } from './agents.js';

describe('planTargets', () => {
  let rootDir: string;
  let home: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'aiopt-init-root-'));
    home = mkdtempSync(join(tmpdir(), 'aiopt-init-home-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('always includes Claude Code (project) even when nothing is detected', () => {
    const targets = planTargets({ rootDir, home });
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      id: 'claude-code',
      displayName: 'Claude Code',
      detected: false,
    });
    expect(targets[0]!.configPath).toContain('.mcp.json');
  });

  it('marks Claude Code detected when ~/.claude.json exists', () => {
    writeFileSync(join(home, '.claude.json'), '{}', 'utf-8');
    const targets = planTargets({ rootDir, home });
    expect(targets[0]!.detected).toBe(true);
    expect(targets[0]!.reason).toMatch(/detected/);
  });

  it('marks Claude Code detected when project .claude/ exists', () => {
    mkdirSync(join(rootDir, '.claude'), { recursive: true });
    const targets = planTargets({ rootDir, home });
    expect(targets[0]!.detected).toBe(true);
  });

  it('adds Cursor target when ~/.cursor exists', () => {
    mkdirSync(join(home, '.cursor'), { recursive: true });
    const targets = planTargets({ rootDir, home });
    expect(targets).toHaveLength(2);
    expect(targets[1]).toMatchObject({
      id: 'cursor',
      displayName: 'Cursor',
      detected: true,
    });
    expect(targets[1]!.configPath).toBe(join(rootDir, '.cursor', 'mcp.json'));
  });

  it('adds Cursor target when project .cursor/ exists', () => {
    mkdirSync(join(rootDir, '.cursor'), { recursive: true });
    const targets = planTargets({ rootDir, home });
    expect(targets.find((t) => t.id === 'cursor')?.detected).toBe(true);
  });

  it('omits Cursor target when nothing cursor-related is present', () => {
    const targets = planTargets({ rootDir, home });
    expect(targets.find((t) => t.id === 'cursor')).toBeUndefined();
  });

  it('exposes a non-empty manual-agents hint list', () => {
    expect(KNOWN_MANUAL_AGENTS.length).toBeGreaterThan(0);
    expect(KNOWN_MANUAL_AGENTS.every((a) => a.name && a.configHint)).toBe(true);
  });
});

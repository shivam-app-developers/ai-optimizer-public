import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyClaudeCodeProjectConfig, applyMcpConfig, PROJECT_MCP_FILENAME } from './writer.js';

describe('applyClaudeCodeProjectConfig', () => {
  let dir: string;
  let cfgPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-init-'));
    cfgPath = join(dir, PROJECT_MCP_FILENAME);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates .mcp.json when missing', () => {
    const r = applyClaudeCodeProjectConfig(dir);
    expect(r.action).toBe('created');
    expect(r.beforeHadServer).toBe(false);
    expect(existsSync(cfgPath)).toBe(true);

    const json = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    expect(json.mcpServers['ai-optimizer']).toEqual({
      command: 'ai-optimizer',
      args: [],
      env: {},
    });
  });

  it('preserves other top-level keys and other mcpServers entries', () => {
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            'some-other': { command: 'other', args: ['--x'] },
          },
          comment: 'do not touch',
        },
        null,
        2,
      ),
      'utf-8',
    );

    const r = applyClaudeCodeProjectConfig(dir);
    expect(r.action).toBe('updated');
    expect(r.beforeHadServer).toBe(false);

    const json = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    expect(json.comment).toBe('do not touch');
    expect(json.mcpServers['some-other']).toEqual({ command: 'other', args: ['--x'] });
    expect(json.mcpServers['ai-optimizer']).toBeDefined();
  });

  it('reports beforeHadServer=true when ai-optimizer was already configured', () => {
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            'ai-optimizer': { command: 'ai-optimizer', args: ['--legacy'], env: {} },
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const r = applyClaudeCodeProjectConfig(dir, { args: [] });
    expect(r.action).toBe('updated');
    expect(r.beforeHadServer).toBe(true);
    const json = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    expect(json.mcpServers['ai-optimizer'].args).toEqual([]);
  });

  it('returns "unchanged" when the file already has the exact entry', () => {
    const desired = {
      mcpServers: {
        'ai-optimizer': { command: 'ai-optimizer', args: [], env: {} },
      },
    };
    writeFileSync(cfgPath, JSON.stringify(desired, null, 2) + '\n', 'utf-8');

    const r = applyClaudeCodeProjectConfig(dir);
    expect(r.action).toBe('unchanged');
    expect(r.beforeHadServer).toBe(true);
  });

  it('overwrites cleanly when the existing file is corrupted JSON', () => {
    writeFileSync(cfgPath, '{ this is not json', 'utf-8');
    const r = applyClaudeCodeProjectConfig(dir);
    expect(r.action).toBe('updated');
    const json = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    expect(json.mcpServers['ai-optimizer']).toBeDefined();
  });

  it('honours custom command, args, env, and serverName', () => {
    const r = applyClaudeCodeProjectConfig(dir, {
      serverName: 'aiopt-custom',
      command: '/usr/local/bin/ai-optimizer',
      args: ['--root', '.'],
      env: { AI_OPTIMIZER_LSP: '0' },
    });
    expect(r.action).toBe('created');
    const json = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    expect(json.mcpServers['aiopt-custom']).toEqual({
      command: '/usr/local/bin/ai-optimizer',
      args: ['--root', '.'],
      env: { AI_OPTIMIZER_LSP: '0' },
    });
  });
});

describe('applyMcpConfig (generic)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-init-generic-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes to an arbitrary path and creates missing parent dirs', () => {
    const target = join(dir, 'nested', 'deep', '.cursor', 'mcp.json');
    const r = applyMcpConfig(target);
    expect(r.action).toBe('created');
    expect(r.path).toBe(target);
    expect(existsSync(target)).toBe(true);
    const json = JSON.parse(readFileSync(target, 'utf-8'));
    expect(json.mcpServers['ai-optimizer']).toBeDefined();
  });

  it('merges into an existing arbitrary-path config across calls', () => {
    const target = join(dir, 'sub', 'mcp.json');
    let r = applyMcpConfig(target, { args: ['--legacy'] });
    expect(r.action).toBe('created');
    r = applyMcpConfig(target);
    expect(r.action).toBe('updated');
    expect(r.beforeHadServer).toBe(true);
    const json = JSON.parse(readFileSync(target, 'utf-8'));
    expect(json.mcpServers['ai-optimizer'].args).toEqual([]);
  });
});

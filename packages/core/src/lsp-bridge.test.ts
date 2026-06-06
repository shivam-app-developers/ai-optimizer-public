import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LspBridge, type LspServerConfig } from './lsp-bridge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_SERVER = join(HERE, '__fixtures__', 'fake-lsp-server.mjs');

function fakeServerConfig(): LspServerConfig {
  return {
    id: 'fake',
    command: process.execPath,
    args: [FAKE_SERVER],
    fileExtensions: ['.fake'],
    languageId: 'fake',
  };
}

describe('LspBridge', () => {
  let dir: string;
  let bridge: LspBridge | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-lsp-'));
  });

  afterEach(async () => {
    await bridge?.shutdown();
    bridge = undefined;
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((res) => setTimeout(res, 50));
      }
    }
  });

  it('returns diagnostics from a fake LSP server via stdio framing', async () => {
    const file = join(dir, 'sample.fake');
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(file, lines);

    bridge = new LspBridge({ rootDir: dir, servers: [fakeServerConfig()] });
    expect(bridge.hasServerFor('a.fake')).toBe(true);
    expect(bridge.hasServerFor('a.txt')).toBe(false);

    const diagnostics = await bridge.getDiagnostics(file);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      line: 5,
      severity: 'error',
      message: 'Undefined name "foo"',
      source: 'fake-lsp',
      code: 'F401',
    });
    expect(diagnostics[1]).toMatchObject({ line: 12, severity: 'warning' });
  });

  it('returns narrow error context slices and reports tokens saved', async () => {
    const file = join(dir, 'sample.fake');
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(file, lines);

    bridge = new LspBridge({ rootDir: dir, servers: [fakeServerConfig()] });
    const ctx = await bridge.errorContext(file, { contextLines: 3 });

    expect(ctx.fullLineCount).toBe(200);
    expect(ctx.diagnostics).toHaveLength(2);
    // diagnostics on line 5 and 12, contextLines=3 -> ranges [2..8] and [9..15]
    // adjacent ranges should merge into one slice
    expect(ctx.slices).toHaveLength(1);
    expect(ctx.slices[0]).toMatchObject({ startLine: 2, endLine: 15 });
    expect(ctx.contextLineCount).toBe(14);
    expect(ctx.estimatedTokensSaved).toBeGreaterThan(0);
  });

  it('returns empty diagnostics when no server is registered for an extension', async () => {
    const file = join(dir, 'sample.unknown');
    writeFileSync(file, 'hello');
    bridge = new LspBridge({ rootDir: dir, servers: [fakeServerConfig()] });
    const diagnostics = await bridge.getDiagnostics(file);
    expect(diagnostics).toEqual([]);
  });
});

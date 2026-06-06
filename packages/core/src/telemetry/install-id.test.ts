import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getOrCreateInstallId, TELEMETRY_INSTALL_ID_FIELD } from './install-id.js';

describe('getOrCreateInstallId', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'aiopt-instid-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('creates a new id and persists it under the user-global config', () => {
    let count = 0;
    const id = getOrCreateInstallId({
      home,
      env: {},
      generate: () => `gen-${++count}`,
    });
    expect(id).toBe('gen-1');
    // Re-call: should reuse the same id rather than generate a new one.
    const id2 = getOrCreateInstallId({
      home,
      env: {},
      generate: () => `gen-${++count}`,
    });
    expect(id2).toBe('gen-1');
    expect(count).toBe(1);
  });

  it('writes the id under the right field in the config file', () => {
    const id = getOrCreateInstallId({ home, env: {}, generate: () => 'fixed-id' });
    // Find the config file — the helper computes the path internally; we read
    // every file under the temp home to find it.
    // (userConfigFilePath places it under home/AppData/Roaming/ai-optimizer or
    // home/.config/ai-optimizer depending on platform.)
    const cfgPath = findConfigFile(home);
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
    expect(cfg[TELEMETRY_INSTALL_ID_FIELD]).toBe('fixed-id');
    expect(id).toBe('fixed-id');
  });

  it('preserves existing user-config keys when adding the install id', () => {
    // Prime the user config with an existing setting
    const cfgPath = userConfigPathFor(home);
    require('node:fs').mkdirSync(require('node:path').dirname(cfgPath), { recursive: true });
    require('node:fs').writeFileSync(
      cfgPath,
      JSON.stringify({ telemetry: 'on', features: { lsp: false } }, null, 2),
      'utf-8',
    );

    const id = getOrCreateInstallId({ home, env: {}, generate: () => 'new-id' });
    expect(id).toBe('new-id');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
    expect(cfg.telemetry).toBe('on');
    expect((cfg.features as { lsp: boolean }).lsp).toBe(false);
    expect(cfg[TELEMETRY_INSTALL_ID_FIELD]).toBe('new-id');
  });
});

function userConfigPathFor(home: string): string {
  // Mirror userConfigFilePath logic for an isolated test home — assumes
  // env={} so neither APPDATA nor XDG_CONFIG_HOME is set, falling back to the
  // platform default rooted at home.
  if (process.platform === 'win32') {
    return join(home, 'AppData', 'Roaming', 'ai-optimizer', 'config.json');
  }
  return join(home, '.config', 'ai-optimizer', 'config.json');
}

function findConfigFile(home: string): string {
  return userConfigPathFor(home);
}

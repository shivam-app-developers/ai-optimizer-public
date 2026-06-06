import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadConfig,
  writeProjectConfig,
  writeUserConfig,
  userConfigFilePath,
  applyConfigPatch,
  tokensToDollars,
  formatDollars,
  formatTokensWithDollars,
  DEFAULT_CONFIG,
  DEFAULT_MODEL_PRICING,
  PROJECT_CONFIG_FILENAME,
  type OptimizerConfig,
} from './config.js';

describe('loadConfig', () => {
  let dir: string;
  let home: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-cfg-proj-'));
    home = mkdtempSync(join(tmpdir(), 'aiopt-cfg-home-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('returns defaults when no config files or env vars are present', () => {
    const { config, sources } = loadConfig({ rootDir: dir, env: {}, homeDir: home });
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(sources.envOverrides).toEqual([]);
    expect(sources.userConfigPath).toBeUndefined();
    expect(sources.projectConfigPath).toBeUndefined();
  });

  it('merges a project config over defaults', () => {
    writeFileSync(
      join(dir, PROJECT_CONFIG_FILENAME),
      JSON.stringify({ features: { scheduling: true }, telemetry: 'off' }),
    );
    const { config, sources } = loadConfig({ rootDir: dir, env: {}, homeDir: home });
    expect(config.features.scheduling).toBe(true);
    expect(config.features.lsp).toBe(true); // default preserved
    expect(config.telemetry).toBe('off');
    expect(sources.projectConfigPath).toContain(PROJECT_CONFIG_FILENAME);
  });

  it('project config wins over user-global config', () => {
    const userPath = userConfigFilePath(home, {});
    mkdirSync(join(userPath, '..'), { recursive: true });
    writeFileSync(userPath, JSON.stringify({ features: { scheduling: false, compactor: false } }));
    writeFileSync(
      join(dir, PROJECT_CONFIG_FILENAME),
      JSON.stringify({ features: { scheduling: true } }),
    );
    const { config } = loadConfig({ rootDir: dir, env: {}, homeDir: home });
    expect(config.features.scheduling).toBe(true); // from project
    expect(config.features.compactor).toBe(false); // from user
  });

  it('env vars win over both files', () => {
    const userPath = userConfigFilePath(home, {});
    mkdirSync(join(userPath, '..'), { recursive: true });
    writeFileSync(userPath, JSON.stringify({ features: { scheduling: false } }));
    writeFileSync(
      join(dir, PROJECT_CONFIG_FILENAME),
      JSON.stringify({ features: { scheduling: false } }),
    );
    const { config, sources } = loadConfig({
      rootDir: dir,
      env: { AI_OPTIMIZER_SCHEDULING: 'on' },
      homeDir: home,
    });
    expect(config.features.scheduling).toBe(true);
    expect(sources.envOverrides).toContain('AI_OPTIMIZER_SCHEDULING');
  });

  it('parses 0 / 1 / true / false / on / off as bool env values', () => {
    for (const truthy of ['1', 'true', 'on', 'TRUE', 'On']) {
      const { config } = loadConfig({
        rootDir: dir,
        env: { AI_OPTIMIZER_LSP: truthy },
        homeDir: home,
      });
      expect(config.features.lsp).toBe(true);
    }
    for (const falsy of ['0', 'false', 'off', 'FALSE', 'Off']) {
      const { config } = loadConfig({
        rootDir: dir,
        env: { AI_OPTIMIZER_LSP: falsy },
        homeDir: home,
      });
      expect(config.features.lsp).toBe(false);
    }
  });

  it('rejects invalid bool env values without crashing (keeps default)', () => {
    const { config } = loadConfig({
      rootDir: dir,
      env: { AI_OPTIMIZER_LSP: 'maybe' },
      homeDir: home,
    });
    expect(config.features.lsp).toBe(true);
  });

  it('loads telemetry mode from env (off / opt-in / on)', () => {
    for (const mode of ['off', 'opt-in', 'on'] as const) {
      const { config } = loadConfig({
        rootDir: dir,
        env: { AI_OPTIMIZER_TELEMETRY: mode },
        homeDir: home,
      });
      expect(config.telemetry).toBe(mode);
    }
  });

  it('loads model pricing overrides from env', () => {
    const { config } = loadConfig({
      rootDir: dir,
      env: {
        AI_OPTIMIZER_PRICE_INPUT_PER_M: '5',
        AI_OPTIMIZER_PRICE_OUTPUT_PER_M: '20',
        AI_OPTIMIZER_MODEL_LABEL: 'claude-opus-4-7',
      },
      homeDir: home,
    });
    expect(config.modelPricing.inputPerMillion).toBe(5);
    expect(config.modelPricing.outputPerMillion).toBe(20);
    expect(config.modelPricing.modelLabel).toBe('claude-opus-4-7');
  });

  it('loads budget caps from env', () => {
    const { config } = loadConfig({
      rootDir: dir,
      env: {
        AI_OPTIMIZER_BUDGET_PER_SESSION: '50000',
        AI_OPTIMIZER_BUDGET_PER_DAY: '500000',
      },
      homeDir: home,
    });
    expect(config.budgetCaps?.perSessionTokens).toBe(50000);
    expect(config.budgetCaps?.perDayTokens).toBe(500000);
  });

  it('survives a malformed project config file (falls back to defaults)', () => {
    writeFileSync(join(dir, PROJECT_CONFIG_FILENAME), '{ this is not json');
    const { config } = loadConfig({ rootDir: dir, env: {}, homeDir: home });
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});

describe('writeProjectConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-cfg-write-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the project config file with the patch contents', () => {
    const path = writeProjectConfig(dir, { features: { scheduling: true } });
    expect(path).toContain(PROJECT_CONFIG_FILENAME);
    const onDisk = JSON.parse(readFileSync(path, 'utf-8'));
    expect(onDisk.features.scheduling).toBe(true);
  });

  it('merges into an existing config rather than overwriting it', () => {
    writeProjectConfig(dir, { features: { scheduling: true } });
    writeProjectConfig(dir, { telemetry: 'off' });
    const onDisk = JSON.parse(readFileSync(join(dir, PROJECT_CONFIG_FILENAME), 'utf-8'));
    expect(onDisk.features.scheduling).toBe(true);
    expect(onDisk.telemetry).toBe('off');
  });
});

describe('writeUserConfig', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'aiopt-cfg-home-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('creates the user config directory and file', () => {
    const path = writeUserConfig({ telemetry: 'on' }, home, {});
    expect(path).toContain('ai-optimizer');
    expect(path).toContain(home); // must stay inside the test home
    const onDisk = JSON.parse(readFileSync(path, 'utf-8'));
    expect(onDisk.telemetry).toBe('on');
  });
});

describe('applyConfigPatch', () => {
  it('does not mutate the input config', () => {
    const before = JSON.stringify(DEFAULT_CONFIG);
    applyConfigPatch(DEFAULT_CONFIG, { features: { scheduling: true } });
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
  });

  it('produces a new config with the patch applied', () => {
    const next = applyConfigPatch(DEFAULT_CONFIG, { features: { workStealing: true } });
    expect(next.features.workStealing).toBe(true);
    expect(DEFAULT_CONFIG.features.workStealing).toBe(false);
  });
});

describe('tokensToDollars / formatDollars', () => {
  it('computes input cost using the configured pricing', () => {
    const cost = tokensToDollars(1_000_000, DEFAULT_MODEL_PRICING, 'input');
    expect(cost).toBe(DEFAULT_MODEL_PRICING.inputPerMillion);
  });

  it('computes output cost using the configured pricing', () => {
    const cost = tokensToDollars(500_000, DEFAULT_MODEL_PRICING, 'output');
    expect(cost).toBeCloseTo(DEFAULT_MODEL_PRICING.outputPerMillion / 2, 5);
  });

  it('formats zero, sub-cent, and normal amounts distinctly', () => {
    expect(formatDollars(0)).toBe('$0.00');
    expect(formatDollars(0.001)).toBe('< $0.01');
    expect(formatDollars(1.234)).toBe('$1.23');
    expect(formatDollars(47.5)).toBe('$47.50');
  });
});

describe('formatTokensWithDollars', () => {
  function makeConfig(showDollars: boolean): OptimizerConfig {
    return {
      ...DEFAULT_CONFIG,
      features: { ...DEFAULT_CONFIG.features, showDollarValues: showDollars },
    };
  }

  it('returns just the number when the flag is off', () => {
    expect(formatTokensWithDollars(1234, makeConfig(false))).toBe('1234');
    expect(formatTokensWithDollars(0, makeConfig(false))).toBe('0');
  });

  it('appends a dollar approximation when the flag is on', () => {
    // 1M input tokens at default Sonnet pricing = $3.00
    expect(formatTokensWithDollars(1_000_000, makeConfig(true), 'input')).toBe('1000000 (≈ $3.00)');
    // tiny amount → "< $0.01"
    expect(formatTokensWithDollars(100, makeConfig(true), 'input')).toBe('100 (≈ < $0.01)');
    // exactly zero → "$0.00"
    expect(formatTokensWithDollars(0, makeConfig(true))).toBe('0 (≈ $0.00)');
  });

  it('switches between input and output pricing', () => {
    const cfg = makeConfig(true);
    // 1M output tokens = $15.00 default
    expect(formatTokensWithDollars(1_000_000, cfg, 'output')).toBe('1000000 (≈ $15.00)');
  });
});

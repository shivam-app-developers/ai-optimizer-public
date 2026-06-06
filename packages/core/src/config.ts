import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';

export type TelemetryMode = 'off' | 'opt-in' | 'on';

export interface ModelPricing {
  /** Dollars per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** Dollars per 1,000,000 output tokens. */
  outputPerMillion: number;
  /** Human-readable label, e.g. "claude-sonnet-4-6". */
  modelLabel: string;
}

export interface FeatureFlags {
  /** Spawn LSP servers (pyright / typescript-language-server) for diagnostics. */
  lsp: boolean;
  /** Strip ANSI / npm / Maven / JVM noise from Bash output. */
  bashCleaner: boolean;
  /** History compactor (Pro). */
  compactor: boolean;
  /** Cron-style task scheduler (Pro). Off by default — delays execution. */
  scheduling: boolean;
  /** Quota-aware multi-provider routing (Team). Off by default — data crosses provider boundaries. */
  workStealing: boolean;
  /**
   * Audit / redact / policy bundle (Team). Off by default — alters the bytes
   * the agent sees (redacted content) and adds an outbound log file.
   */
  audit: boolean;
  /** Display dollar-cost savings alongside token counts. Display-only, on by default. */
  showDollarValues: boolean;
}

export interface BudgetCaps {
  /** Hard limit on tokens per agent session. Aborts the agent if exceeded. */
  perSessionTokens?: number;
  /** Hard limit on tokens per UTC day across all sessions. */
  perDayTokens?: number;
}

export interface TeamAuditConfig {
  /** Where to write the NDJSON audit log. Required when features.audit = true. */
  logFile?: string;
  /** Glob list of paths to block. */
  denyPaths?: string[];
  /** Glob list — when non-empty, ONLY these paths are allowed. */
  allowPaths?: string[];
  /** Glob list per tool name. */
  perToolDeny?: Record<string, string[]>;
  /** Names of redactor kinds to disable (default: all enabled). */
  redactDisableKinds?: string[];
  /** Bytes before rotating the audit log. Default 50 MiB. 0 disables rotation. */
  rotateBytes?: number;
}

export interface TeamConfig {
  audit?: TeamAuditConfig;
}

export interface OptimizerConfig {
  features: FeatureFlags;
  telemetry: TelemetryMode;
  modelPricing: ModelPricing;
  budgetCaps?: BudgetCaps;
  /** Extra ignore globs added on top of pack and gitignore rules. */
  extraIgnoreGlobs?: string[];
  /**
   * Community framework packs to load. Each entry is a relative path or a
   * node module name; the module must default-export a FrameworkPack.
   * Resolved at server start; errors are reported but don't abort boot.
   */
  plugins?: string[];
  team?: TeamConfig;
}

export const DEFAULT_MODEL_PRICING: ModelPricing = {
  modelLabel: 'claude-sonnet-4-6',
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
};

export const DEFAULT_CONFIG: OptimizerConfig = {
  features: {
    lsp: true,
    bashCleaner: true,
    compactor: true,
    scheduling: false,
    workStealing: false,
    audit: false,
    showDollarValues: true,
  },
  telemetry: 'opt-in',
  modelPricing: DEFAULT_MODEL_PRICING,
};

export const PROJECT_CONFIG_FILENAME = '.optimizerrc.json';

export interface LoadConfigOptions {
  rootDir?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export interface LoadedConfig {
  config: OptimizerConfig;
  sources: {
    defaults: true;
    userConfigPath?: string;
    projectConfigPath?: string;
    envOverrides: string[];
  };
}

export function loadConfig(opts: LoadConfigOptions = {}): LoadedConfig {
  const env = opts.env ?? process.env;
  const home = opts.homeDir ?? homedir();
  const rootDir = opts.rootDir ?? process.cwd();

  const sources: LoadedConfig['sources'] = {
    defaults: true,
    envOverrides: [],
  };

  let merged = cloneConfig(DEFAULT_CONFIG);

  const userConfigPath = userConfigFilePath(home, env);
  if (existsSync(userConfigPath)) {
    const partial = readPartial(userConfigPath);
    if (partial) {
      merged = mergeConfig(merged, partial);
      sources.userConfigPath = userConfigPath;
    }
  }

  const projectConfigPath = join(rootDir, PROJECT_CONFIG_FILENAME);
  if (existsSync(projectConfigPath)) {
    const partial = readPartial(projectConfigPath);
    if (partial) {
      merged = mergeConfig(merged, partial);
      sources.projectConfigPath = projectConfigPath;
    }
  }

  applyEnvOverrides(merged, env, sources.envOverrides);

  return { config: merged, sources };
}

export function userConfigFilePath(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform() === 'win32') {
    const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(appData, 'ai-optimizer', 'config.json');
  }
  const xdg = env.XDG_CONFIG_HOME ?? join(home, '.config');
  return join(xdg, 'ai-optimizer', 'config.json');
}

export function writeProjectConfig(rootDir: string, patch: DeepPartial<OptimizerConfig>): string {
  const path = join(rootDir, PROJECT_CONFIG_FILENAME);
  const existing = existsSync(path) ? readPartial(path) : undefined;
  const next = mergeConfig(existing ?? {}, patch);
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  return path;
}

export function writeUserConfig(
  patch: DeepPartial<OptimizerConfig>,
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const path = userConfigFilePath(home, env);
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) ? readPartial(path) : undefined;
  const next = mergeConfig(existing ?? {}, patch);
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  return path;
}

export function tokensToDollars(
  tokens: number,
  pricing: ModelPricing = DEFAULT_MODEL_PRICING,
  kind: 'input' | 'output' = 'input',
): number {
  const rate = kind === 'input' ? pricing.inputPerMillion : pricing.outputPerMillion;
  return (tokens / 1_000_000) * rate;
}

export function formatDollars(amount: number): string {
  if (amount === 0) return '$0.00';
  if (Math.abs(amount) < 0.01) return '< $0.01';
  return `$${amount.toFixed(2)}`;
}

/**
 * Render a token count with an inline dollar approximation when the
 * showDollarValues flag is on, otherwise just the number. Used by every
 * tool response so the entire surface speaks the same currency.
 */
export function formatTokensWithDollars(
  tokens: number,
  config: OptimizerConfig,
  kind: 'input' | 'output' = 'input',
): string {
  if (!config.features.showDollarValues) return String(tokens);
  const dollars = tokensToDollars(tokens, config.modelPricing, kind);
  return `${tokens} (≈ ${formatDollars(dollars)})`;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object | undefined ? DeepPartial<NonNullable<T[K]>> : T[K];
};

function readPartial(path: string): DeepPartial<OptimizerConfig> | undefined {
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;
    return parsed as DeepPartial<OptimizerConfig>;
  } catch {
    return undefined;
  }
}

function cloneConfig(c: OptimizerConfig): OptimizerConfig {
  return {
    features: { ...c.features },
    telemetry: c.telemetry,
    modelPricing: { ...c.modelPricing },
    budgetCaps: c.budgetCaps ? { ...c.budgetCaps } : undefined,
    extraIgnoreGlobs: c.extraIgnoreGlobs ? [...c.extraIgnoreGlobs] : undefined,
    plugins: c.plugins ? [...c.plugins] : undefined,
    team: c.team ? cloneTeam(c.team) : undefined,
  };
}

function cloneTeam(t: TeamConfig): TeamConfig {
  return {
    audit: t.audit
      ? {
          ...t.audit,
          denyPaths: t.audit.denyPaths ? [...t.audit.denyPaths] : undefined,
          allowPaths: t.audit.allowPaths ? [...t.audit.allowPaths] : undefined,
          perToolDeny: t.audit.perToolDeny
            ? Object.fromEntries(Object.entries(t.audit.perToolDeny).map(([k, v]) => [k, [...v]]))
            : undefined,
          redactDisableKinds: t.audit.redactDisableKinds
            ? [...t.audit.redactDisableKinds]
            : undefined,
        }
      : undefined,
  };
}

function mergeConfig<T extends OptimizerConfig | DeepPartial<OptimizerConfig> | object>(
  base: T,
  patch: DeepPartial<OptimizerConfig>,
): T {
  const out = { ...(base as Record<string, unknown>) };
  if (patch.features) {
    out.features = {
      ...((base as { features?: object }).features ?? {}),
      ...patch.features,
    };
  }
  if (patch.telemetry !== undefined) out.telemetry = patch.telemetry;
  if (patch.modelPricing) {
    out.modelPricing = {
      ...((base as { modelPricing?: object }).modelPricing ?? {}),
      ...patch.modelPricing,
    };
  }
  if (patch.budgetCaps !== undefined) {
    out.budgetCaps = patch.budgetCaps
      ? {
          ...((base as { budgetCaps?: object }).budgetCaps ?? {}),
          ...patch.budgetCaps,
        }
      : undefined;
  }
  if (patch.extraIgnoreGlobs !== undefined) {
    out.extraIgnoreGlobs = patch.extraIgnoreGlobs ? [...patch.extraIgnoreGlobs] : undefined;
  }
  if (patch.plugins !== undefined) {
    out.plugins = patch.plugins ? [...patch.plugins] : undefined;
  }
  if (patch.team !== undefined) {
    const baseTeam = (base as { team?: TeamConfig }).team;
    out.team = {
      ...(baseTeam ?? {}),
      ...(patch.team.audit !== undefined
        ? {
            audit: {
              ...(baseTeam?.audit ?? {}),
              ...patch.team.audit,
            },
          }
        : {}),
    };
  }
  return out as T;
}

function applyEnvOverrides(cfg: OptimizerConfig, env: NodeJS.ProcessEnv, applied: string[]): void {
  const boolEnv = (key: string): boolean | undefined => {
    const v = env[key];
    if (v === undefined) return undefined;
    if (v === '0' || v.toLowerCase() === 'false' || v.toLowerCase() === 'off') return false;
    if (v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'on') return true;
    return undefined;
  };

  const boolFlag = (key: keyof FeatureFlags, env1: string): void => {
    const v = boolEnv(env1);
    if (v !== undefined) {
      cfg.features[key] = v;
      applied.push(env1);
    }
  };

  boolFlag('lsp', 'AI_OPTIMIZER_LSP');
  boolFlag('bashCleaner', 'AI_OPTIMIZER_BASH_CLEANER');
  boolFlag('compactor', 'AI_OPTIMIZER_COMPACTOR');
  boolFlag('scheduling', 'AI_OPTIMIZER_SCHEDULING');
  boolFlag('workStealing', 'AI_OPTIMIZER_WORK_STEALING');
  boolFlag('audit', 'AI_OPTIMIZER_AUDIT');
  boolFlag('showDollarValues', 'AI_OPTIMIZER_SHOW_DOLLAR_VALUES');

  const tel = env.AI_OPTIMIZER_TELEMETRY;
  if (tel === 'off' || tel === 'opt-in' || tel === 'on') {
    cfg.telemetry = tel;
    applied.push('AI_OPTIMIZER_TELEMETRY');
  }

  const inputPx = numEnv(env.AI_OPTIMIZER_PRICE_INPUT_PER_M);
  if (inputPx !== undefined) {
    cfg.modelPricing.inputPerMillion = inputPx;
    applied.push('AI_OPTIMIZER_PRICE_INPUT_PER_M');
  }
  const outputPx = numEnv(env.AI_OPTIMIZER_PRICE_OUTPUT_PER_M);
  if (outputPx !== undefined) {
    cfg.modelPricing.outputPerMillion = outputPx;
    applied.push('AI_OPTIMIZER_PRICE_OUTPUT_PER_M');
  }
  const label = env.AI_OPTIMIZER_MODEL_LABEL;
  if (label && label.trim() !== '') {
    cfg.modelPricing.modelLabel = label.trim();
    applied.push('AI_OPTIMIZER_MODEL_LABEL');
  }

  const sessionCap = numEnv(env.AI_OPTIMIZER_BUDGET_PER_SESSION);
  const dayCap = numEnv(env.AI_OPTIMIZER_BUDGET_PER_DAY);
  if (sessionCap !== undefined || dayCap !== undefined) {
    cfg.budgetCaps = {
      ...(cfg.budgetCaps ?? {}),
      ...(sessionCap !== undefined ? { perSessionTokens: sessionCap } : {}),
      ...(dayCap !== undefined ? { perDayTokens: dayCap } : {}),
    };
    if (sessionCap !== undefined) applied.push('AI_OPTIMIZER_BUDGET_PER_SESSION');
    if (dayCap !== undefined) applied.push('AI_OPTIMIZER_BUDGET_PER_DAY');
  }
}

function numEnv(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function applyConfigPatch(
  current: OptimizerConfig,
  patch: DeepPartial<OptimizerConfig>,
): OptimizerConfig {
  return mergeConfig(cloneConfig(current), patch);
}

export type ConfigPatch = DeepPartial<OptimizerConfig>;

export function resolveProjectConfigPath(rootDir: string): string {
  return resolve(rootDir, PROJECT_CONFIG_FILENAME);
}

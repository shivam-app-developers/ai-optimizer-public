import {
  startServer,
  type ProExtensions,
  type SchedulerExtensionLike,
  type AuditExtensionLike,
} from './server.js';
import { loadConfig } from './config.js';
import type { FrameworkPack } from './types.js';

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const rootDir = parseRootDir(argv) ?? process.cwd();
  const { packs, proExtensions } = await loadProIfLicensed();
  try {
    await startServer({ rootDir, extraPacks: packs, proExtensions });
  } catch (err) {
    process.stderr.write(`[ai-optimizer] fatal: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

function parseRootDir(argv: string[]): string | undefined {
  const idx = argv.indexOf('--root');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return undefined;
}

interface ProModule {
  loadProPacks: (licenseKey: string) => Promise<{
    packs: FrameworkPack[];
    validation: {
      valid: boolean;
      reason?: string;
      payload?: { tier: string; seats: number };
    };
  }>;
  compactHistory: NonNullable<ProExtensions['compactHistory']>;
  createSchedulerExtension: (opts?: {
    onTaskComplete?: (e: {
      taskId: string;
      label?: string;
      result?: { exitCode: number | null; durationMs: number; timedOut: boolean };
      error?: Error;
      workStealing?: { servedBy?: string; attempts: Array<{ provider: string; ok: boolean; quotaExhausted: boolean }> };
    }) => void;
    workStealing?: ProviderDispatcherLike;
  }) => SchedulerExtensionLike;
  createWorkStealingDispatcher: (opts: {
    providers: Array<{ name: string; binary: string; buildArgs: (i: { prompt: string; agent?: string }) => string[] }>;
  }) => ProviderDispatcherLike;
  DEFAULT_PROVIDERS: Array<{ name: string; binary: string; buildArgs: (i: { prompt: string; agent?: string }) => string[] }>;
  createAuditExtension: (opts?: {
    policy?: {
      denyPaths?: string[];
      allowPaths?: string[];
      perToolDeny?: Record<string, string[]>;
    };
    logger?: { logFile: string; rotateBytes?: number };
    redact?: { disableKinds?: string[] };
  }) => AuditExtensionLike;
}

interface ProviderDispatcherLike {
  dispatch(input: { prompt: string; agent?: string }): Promise<unknown>;
  describeProviders(): Array<{ name: string; binary: string }>;
}

interface LoadProResult {
  packs: FrameworkPack[];
  proExtensions?: ProExtensions;
}

async function loadProIfLicensed(): Promise<LoadProResult> {
  const license = process.env.AI_OPTIMIZER_LICENSE;
  if (!license) return { packs: [] };
  let pro: ProModule;
  try {
    pro = (await import('@ai-optimizer/pro' as string)) as unknown as ProModule;
  } catch {
    process.stderr.write(
      '[ai-optimizer] AI_OPTIMIZER_LICENSE set but @ai-optimizer/pro is not installed; install it to enable Pro packs.\n',
    );
    return { packs: [] };
  }
  const result = await pro.loadProPacks(license);
  if (!result.validation.valid) {
    process.stderr.write(`[ai-optimizer] license invalid: ${result.validation.reason}\n`);
    return { packs: [] };
  }
  process.stderr.write(
    `[ai-optimizer] loaded ${result.packs.length} Pro pack(s) for tier=${result.validation.payload?.tier}\n`,
  );
  // Work-stealing dispatcher: opt-in via features.workStealing AND a Team license.
  // Default OFF — data crosses provider boundaries when this is on.
  const cfgForScheduler = loadConfig().config;
  const wsEnabled =
    cfgForScheduler.features.workStealing && result.validation.payload?.tier === 'team';
  let workStealing: ProviderDispatcherLike | undefined;
  if (wsEnabled) {
    try {
      workStealing = pro.createWorkStealingDispatcher({ providers: pro.DEFAULT_PROVIDERS });
      const provs = workStealing.describeProviders().map((p) => `${p.name}(${p.binary})`).join(' → ');
      process.stderr.write(`[ai-optimizer/work-stealing] enabled — providers: ${provs}\n`);
    } catch (err) {
      process.stderr.write(
        `[ai-optimizer/work-stealing] failed to init: ${(err as Error).message}\n`,
      );
    }
  } else if (cfgForScheduler.features.workStealing && result.validation.payload?.tier !== 'team') {
    process.stderr.write(
      '[ai-optimizer/work-stealing] features.workStealing is on but license tier is not Team — work-stealing disabled.\n',
    );
  }

  const scheduler = pro.createSchedulerExtension({
    workStealing,
    onTaskComplete: (e) => {
      const labelPart = e.label ? ` "${e.label}"` : '';
      if (e.workStealing) {
        const served = e.workStealing.servedBy ?? 'none';
        const route = e.workStealing.attempts
          .map((a) => `${a.provider}${a.quotaExhausted ? '!' : a.ok ? '' : '×'}`)
          .join(' → ');
        process.stderr.write(
          `[ai-optimizer/scheduler] ${e.taskId}${labelPart} served by ${served} (route: ${route})\n`,
        );
        return;
      }
      if (e.error) {
        process.stderr.write(
          `[ai-optimizer/scheduler] ${e.taskId}${labelPart} dispatch error: ${e.error.message}\n`,
        );
      } else if (e.result) {
        const status = e.result.timedOut
          ? 'timed-out'
          : e.result.exitCode === 0
            ? 'ok'
            : `exit=${e.result.exitCode}`;
        process.stderr.write(
          `[ai-optimizer/scheduler] ${e.taskId}${labelPart} ${status} (${e.result.durationMs}ms)\n`,
        );
      }
    },
  });
  // Audit / redact / policy is gated on Team license + features.audit on.
  // We construct the extension up front (when both conditions hold) so server.ts
  // can decide whether to wire it without re-loading config from cli.ts.
  const cfg = loadConfig().config;
  const auditEnabled = cfg.features.audit && result.validation.payload?.tier === 'team';
  let audit: AuditExtensionLike | undefined;
  if (auditEnabled) {
    const auditCfg = cfg.team?.audit;
    if (!auditCfg?.logFile) {
      process.stderr.write(
        '[ai-optimizer/audit] features.audit is on but team.audit.logFile is not set — audit disabled.\n',
      );
    } else {
      audit = pro.createAuditExtension({
        policy: {
          denyPaths: auditCfg.denyPaths,
          allowPaths: auditCfg.allowPaths,
          perToolDeny: auditCfg.perToolDeny,
        },
        logger: { logFile: auditCfg.logFile, rotateBytes: auditCfg.rotateBytes },
        redact: { disableKinds: auditCfg.redactDisableKinds },
      });
      process.stderr.write(`[ai-optimizer/audit] enabled — log: ${auditCfg.logFile}\n`);
    }
  }

  return {
    packs: result.packs,
    proExtensions: { compactHistory: pro.compactHistory, scheduler, audit },
  };
}

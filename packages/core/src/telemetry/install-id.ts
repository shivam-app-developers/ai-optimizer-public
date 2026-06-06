import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { userConfigFilePath } from '../config.js';

const TELEMETRY_INSTALL_ID_FIELD = 'telemetryInstallId';

export interface InstallIdOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
  /** For tests: deterministic id generator. */
  generate?: () => string;
}

/**
 * Returns the anonymous telemetry install id, creating one on first call.
 * Stored in the user-global config alongside other settings. NOT created
 * unless this function is called — so when telemetry is disabled, the
 * client never invokes this and no id is ever generated.
 */
export function getOrCreateInstallId(opts: InstallIdOptions = {}): string {
  const path = userConfigFilePath(opts.home, opts.env);
  let cfg: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cfg = parsed as Record<string, unknown>;
      }
    } catch {
      cfg = {};
    }
  }
  const existing = cfg[TELEMETRY_INSTALL_ID_FIELD];
  if (typeof existing === 'string' && existing.length > 0) return existing;

  const id = (opts.generate ?? randomUUID)();
  cfg[TELEMETRY_INSTALL_ID_FIELD] = id;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
  return id;
}

export { TELEMETRY_INSTALL_ID_FIELD };

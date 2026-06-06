import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const PROJECT_MCP_FILENAME = '.mcp.json';

export interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [other: string]: unknown;
}

export interface ApplyOutcome {
  path: string;
  action: 'created' | 'updated' | 'unchanged';
  beforeHadServer: boolean;
}

export interface ApplyOptions {
  serverName?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Generic MCP config writer. Reads the JSON file at `configPath`, merges the
 * `ai-optimizer` server entry into the existing `mcpServers` object, and
 * writes back. Preserves all unrelated top-level keys and other server
 * entries. Creates the parent directory if missing (so writes to e.g.
 * `~/.cursor/mcp.json` work even when `.cursor/` doesn't exist yet).
 *
 * License keys: the recommended path is to leave `env` empty and set
 * `AI_OPTIMIZER_LICENSE` in the user's shell, since `.mcp.json` may be
 * committed. Passing `env: { AI_OPTIMIZER_LICENSE: '...' }` will write the
 * key into the config file directly — only do this for user-scope configs
 * outside the repo.
 */
export function applyMcpConfig(configPath: string, opts: ApplyOptions = {}): ApplyOutcome {
  const serverName = opts.serverName ?? 'ai-optimizer';
  const newEntry: McpServerEntry = {
    command: opts.command ?? 'ai-optimizer',
    args: opts.args ?? [],
    env: opts.env ?? {},
  };

  let existing: McpConfig = {};
  let action: ApplyOutcome['action'] = 'created';
  let beforeHadServer = false;
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as McpConfig;
      }
    } catch {
      // Corrupted JSON — leave `existing` empty so we overwrite cleanly.
    }
    action = 'updated';
    beforeHadServer = Boolean(existing.mcpServers?.[serverName]);
  }

  const next: McpConfig = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      [serverName]: newEntry,
    },
  };

  const before = action === 'updated' ? safeStringify(existing) : '';
  const after = safeStringify(next);
  if (action === 'updated' && before === after) {
    return { path: configPath, action: 'unchanged', beforeHadServer };
  }
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, after + '\n', 'utf-8');
  return { path: configPath, action, beforeHadServer };
}

/**
 * Convenience wrapper for the original Claude-Code-only entry point. Resolves
 * to `<rootDir>/.mcp.json` and delegates to applyMcpConfig.
 */
export function applyClaudeCodeProjectConfig(
  rootDir: string,
  opts: ApplyOptions = {},
): ApplyOutcome {
  return applyMcpConfig(join(rootDir, PROJECT_MCP_FILENAME), opts);
}

function safeStringify(o: unknown): string {
  return JSON.stringify(o, null, 2);
}

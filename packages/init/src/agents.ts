import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type AgentId = 'claude-code' | 'cursor';

export interface AgentTarget {
  id: AgentId;
  displayName: string;
  /** Where the MCP config file lives (absolute). */
  configPath: string;
  /** Why this target is in the plan — shown to the user. */
  reason: string;
  /** True iff we found a sign the user actually has this agent installed. */
  detected: boolean;
}

export interface PlanTargetsOptions {
  rootDir: string;
  /** Override $HOME (used by tests). Defaults to os.homedir(). */
  home?: string;
}

/**
 * Returns the list of agent install targets to consider for this project.
 *
 * Always includes Claude Code (project-level `.mcp.json`) — it works for
 * any repo and is the safest default; even if Claude Code isn't installed
 * yet, the file is harmless and will be picked up the moment it is.
 *
 * Includes Cursor (project-level `.cursor/mcp.json`) iff we detect Cursor
 * is installed (via `~/.cursor/` or a project-level `.cursor/` dir).
 *
 * Cline / Continue / Zed are intentionally not autodetected here — their
 * MCP config formats differ enough that we'd rather print a "see docs"
 * line than risk corrupting them.
 */
export function planTargets(opts: PlanTargetsOptions): AgentTarget[] {
  const home = opts.home ?? homedir();
  const targets: AgentTarget[] = [];

  const claudeProjectMcp = join(opts.rootDir, '.mcp.json');
  const claudeUserMarker = join(home, '.claude.json');
  const claudeProjectMarker = join(opts.rootDir, '.claude');
  const claudeDetected =
    existsSync(claudeUserMarker) || existsSync(claudeProjectMarker) || existsSync(claudeProjectMcp);
  targets.push({
    id: 'claude-code',
    displayName: 'Claude Code',
    configPath: claudeProjectMcp,
    reason: claudeDetected
      ? 'Claude Code detected'
      : 'Claude Code (always supported, project .mcp.json is harmless if uninstalled)',
    detected: claudeDetected,
  });

  const cursorProjectMcp = join(opts.rootDir, '.cursor', 'mcp.json');
  const cursorUserMarker = join(home, '.cursor');
  const cursorProjectMarker = join(opts.rootDir, '.cursor');
  const cursorDetected =
    existsSync(cursorUserMarker) || existsSync(cursorProjectMarker) || existsSync(cursorProjectMcp);
  if (cursorDetected) {
    targets.push({
      id: 'cursor',
      displayName: 'Cursor',
      configPath: cursorProjectMcp,
      reason: 'Cursor detected',
      detected: true,
    });
  }

  return targets;
}

/**
 * Other MCP-capable agents we know about but don't autoconfigure. The CLI
 * prints these as a hint at the end so users with Cline / Continue / Zed
 * know we exist for them too.
 */
export const KNOWN_MANUAL_AGENTS: ReadonlyArray<{ name: string; configHint: string }> = [
  {
    name: 'Cline',
    configHint: 'VS Code extension globalStorage — see Cline > MCP servers in the UI',
  },
  {
    name: 'Continue',
    configHint: '~/.continue/config.json (experimental.modelContextProtocolServers)',
  },
  { name: 'Zed', configHint: '~/.config/zed/settings.json (context_servers)' },
];

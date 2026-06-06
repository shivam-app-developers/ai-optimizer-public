/**
 * Wire format for telemetry events. Privacy-first:
 *   - NEVER includes file paths, file contents, prompts, or repo names
 *   - NEVER includes user identifiers — only an anonymous, locally-generated install UUID
 *   - Only sent when features.telemetry === 'on' (default 'opt-in' which sends nothing)
 */

export interface SessionStartEvent {
  type: 'session_start';
  frameworks: string[];
  packs: string[];
  proLoaded: boolean;
  schedulerEnabled: boolean;
  lspEnabled: boolean;
}

export interface ToolCallEvent {
  type: 'tool_call';
  tool: string;
  durationMs: number;
  tokensSaved: number;
  ok: boolean;
  /** Coarse category, NOT the error message. e.g. "regex_invalid", "io_error". */
  errorCategory?: string;
}

interface Common {
  ts: number;
  installId: string;
  version: string;
}

export type TelemetryEvent = (Common & SessionStartEvent) | (Common & ToolCallEvent);

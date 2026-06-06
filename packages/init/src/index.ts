export {
  computePreview,
  formatPreviewLines,
  type PreviewResult,
  type ComputePreviewOptions,
} from './preview.js';
export {
  applyMcpConfig,
  applyClaudeCodeProjectConfig,
  PROJECT_MCP_FILENAME,
  type ApplyOptions,
  type McpServerEntry,
  type McpConfig,
  type ApplyOutcome,
} from './writer.js';
export {
  planTargets,
  KNOWN_MANUAL_AGENTS,
  type AgentId,
  type AgentTarget,
  type PlanTargetsOptions,
} from './agents.js';
export { confirm, type PromptOptions } from './prompt.js';
export { parseArgs, main, type CliOptions } from './cli.js';

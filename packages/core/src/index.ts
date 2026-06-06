export { startServer, type StartOptions } from './server.js';
export {
  loadConfig,
  writeProjectConfig,
  writeUserConfig,
  applyConfigPatch,
  userConfigFilePath,
  tokensToDollars,
  formatDollars,
  formatTokensWithDollars,
  DEFAULT_CONFIG,
  DEFAULT_MODEL_PRICING,
  PROJECT_CONFIG_FILENAME,
  type OptimizerConfig,
  type FeatureFlags,
  type ModelPricing,
  type BudgetCaps,
  type TelemetryMode,
  type LoadConfigOptions,
  type LoadedConfig,
  type ConfigPatch,
} from './config.js';
export { detectProject, type DetectOptions } from './detector.js';
export {
  detectMonorepoLayout,
  scopePackToPrefix,
  type MonorepoLayout,
} from './monorepo.js';
export { loadFreePacks } from './pack-loader.js';
export {
  loadPluginPacks,
  type LoadPluginsResult,
  type PluginLoadError,
} from './plugin-loader.js';
export { Interceptor } from './interceptor.js';
export { SavingsCounter } from './counter.js';
export {
  LspBridge,
  LspClient,
  DEFAULT_LSP_SERVERS,
  type LspBridgeOptions,
  type LspServerConfig,
  type LspDiagnostic,
  type LspSeverity,
  type ErrorContextResult,
  type ErrorContextSlice,
} from './lsp-bridge.js';
export { cleanBashOutput, type BashCleanOptions, type BashCleanResult } from './bash-cleaner.js';
export {
  readSymbol,
  parseSymbolQuery,
  pickMatches,
  extractLeadingImports,
  lspSymbolKindToString,
  type SymbolFinder,
  type SymbolMatch,
  type SymbolKind,
  type SymbolQuery,
  type SymbolReadOptions,
  type SymbolReadResult,
  type SymbolSlice,
} from './symbol.js';
export {
  BudgetTracker,
  defaultBudgetStoragePath,
  type BudgetSnapshot,
  type BudgetTrackerOptions,
} from './budget.js';
export {
  StatusFileWriter,
  defaultStatusFilePath,
  type StatusSnapshot,
  type StatusFileWriterOptions,
} from './status-file.js';
export {
  TelemetryClient,
  DEFAULT_TELEMETRY_ENDPOINT,
  getOrCreateInstallId,
  TELEMETRY_INSTALL_ID_FIELD,
  type TelemetryClientOptions,
  type TelemetryEvent,
  type SessionStartEvent,
  type ToolCallEvent,
  type FetchLike as TelemetryFetchLike,
} from './telemetry/index.js';
export type {
  FrameworkPack,
  ProjectContext,
  ReadFileResult,
  ListFilesResult,
  GrepMatch,
  GrepResult,
  SavingsSnapshot,
} from './types.js';

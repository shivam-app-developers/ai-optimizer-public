import type { IgnoreCheck } from './gitignore.js';

export interface FrameworkPack {
  id: string;
  name: string;
  detect: (rootDir: string) => Promise<boolean>;
  ignoreGlobs: string[];
  generatedFilePatterns?: RegExp[];
  contextHints?: {
    onError?: () => { readLines: number; includeImports: boolean };
  };
}

export interface ProjectContext {
  rootDir: string;
  detectedFrameworks: string[];
  activePacks: FrameworkPack[];
  gitignoreMatcher?: IgnoreCheck;
}

export interface ReadFileResult {
  path: string;
  content: string;
  skipped: boolean;
  reason?: string;
  estimatedTokens: number;
  estimatedTokensSaved: number;
}

export interface ListFilesResult {
  paths: string[];
  totalScanned: number;
  totalFiltered: number;
  estimatedTokensSaved: number;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface GrepResult {
  matches: GrepMatch[];
  filesSearched: number;
  truncated: boolean;
  estimatedTokensSaved: number;
}

export interface SavingsSnapshot {
  tokensSaved: number;
  operations: number;
}

/**
 * Public SDK for authoring community framework packs for ai-optimizer.
 *
 * Usage:
 *
 *   // my-pack.ts
 *   import { definePack } from '@ai-optimizer/sdk';
 *
 *   export default definePack({
 *     id: 'rails-extra',
 *     name: 'Rails (extra ignores)',
 *     detect: async (root) => existsSync(join(root, 'config/application.rb')),
 *     ignoreGlobs: ['public/uploads/**', 'storage/**'],
 *     generatedFilePatterns: [/\.pb\.rb$/],
 *   });
 *
 * Then in `.optimizerrc.json`:
 *
 *   { "plugins": ["./my-pack.js", "ai-optimizer-pack-rust-extra"] }
 *
 * Each entry is either a node specifier (resolved via the project root's
 * node_modules) or a relative path; the module's `default` export must be a
 * `FrameworkPack`.
 */

export type DetectFn = (rootDir: string) => Promise<boolean> | boolean;

/**
 * The shape every pack ships. This is identical to the internal
 * `FrameworkPack` interface so a community pack can drop in unchanged.
 */
export interface FrameworkPack {
  /** Stable id, e.g. `rails-extra`. Used in detected-frameworks list and config flags. */
  id: string;
  /** Human-readable label shown in `optimizer_status`. */
  name: string;
  /** Returns true when this pack should activate for the given project root. */
  detect: DetectFn;
  /** Glob patterns (picomatch dialect) for paths the pack should hide from the agent. */
  ignoreGlobs: string[];
  /** Regexes matched against the relative path of every read; matches are treated as generated. */
  generatedFilePatterns?: RegExp[];
  /** Optional: how the pack wants the agent to behave when it sees an error. */
  contextHints?: {
    onError?: () => { readLines: number; includeImports: boolean };
  };
}

/**
 * Type-checked constructor. Identity at runtime — its job is to surface
 * pack-shape mistakes at compile time and at first-load.
 */
export function definePack<P extends FrameworkPack>(pack: P): P {
  validatePack(pack);
  return pack;
}

export class InvalidPluginPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPluginPackError';
  }
}

export function validatePack(pack: unknown): asserts pack is FrameworkPack {
  if (!pack || typeof pack !== 'object') {
    throw new InvalidPluginPackError('pack must be an object');
  }
  const p = pack as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.trim() === '') {
    throw new InvalidPluginPackError('pack.id must be a non-empty string');
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(p.id as string)) {
    throw new InvalidPluginPackError(
      `pack.id "${p.id as string}" must match /^[a-z0-9][a-z0-9_-]*$/i`,
    );
  }
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    throw new InvalidPluginPackError('pack.name must be a non-empty string');
  }
  if (typeof p.detect !== 'function') {
    throw new InvalidPluginPackError('pack.detect must be a function');
  }
  if (!Array.isArray(p.ignoreGlobs)) {
    throw new InvalidPluginPackError('pack.ignoreGlobs must be an array of strings');
  }
  for (const glob of p.ignoreGlobs as unknown[]) {
    if (typeof glob !== 'string') {
      throw new InvalidPluginPackError('pack.ignoreGlobs entries must be strings');
    }
  }
  if (p.generatedFilePatterns !== undefined) {
    if (!Array.isArray(p.generatedFilePatterns)) {
      throw new InvalidPluginPackError('pack.generatedFilePatterns must be an array of RegExps');
    }
    for (const re of p.generatedFilePatterns as unknown[]) {
      if (!(re instanceof RegExp)) {
        throw new InvalidPluginPackError('pack.generatedFilePatterns entries must be RegExp');
      }
    }
  }
}

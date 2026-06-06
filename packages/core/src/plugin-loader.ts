import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { FrameworkPack } from './types.js';

export interface PluginLoadError {
  spec: string;
  message: string;
}

export interface LoadPluginsResult {
  packs: FrameworkPack[];
  errors: PluginLoadError[];
}

/**
 * Load community-authored framework packs declared via `OptimizerConfig.plugins`.
 *
 * Each `spec` is either:
 *   - a relative path ("./packs/my-pack.js"), resolved against `rootDir`
 *   - an absolute path, used as-is
 *   - a bare module specifier ("ai-optimizer-pack-rust-extra"), resolved
 *     via the project's node_modules (createRequire from rootDir)
 *
 * The module's default export must be a `FrameworkPack`-shaped object.
 * Errors don't throw — they are captured and returned alongside the packs
 * that did load, so a bad plugin can't take down the server boot.
 */
export async function loadPluginPacks(
  specs: string[] | undefined,
  rootDir: string,
): Promise<LoadPluginsResult> {
  const result: LoadPluginsResult = { packs: [], errors: [] };
  if (!specs || specs.length === 0) return result;

  const projectRequire = createRequire(resolve(rootDir, 'package.json'));

  for (const spec of specs) {
    try {
      const url = await resolveSpec(spec, rootDir, projectRequire);
      const mod = (await import(url)) as { default?: unknown };
      const candidate = mod.default ?? mod;
      const pack = validateAsPack(candidate, spec);
      result.packs.push(pack);
    } catch (err) {
      result.errors.push({ spec, message: (err as Error).message });
    }
  }
  return result;
}

async function resolveSpec(
  spec: string,
  rootDir: string,
  projectRequire: NodeJS.Require,
): Promise<string> {
  if (spec.startsWith('./') || spec.startsWith('../')) {
    return pathToFileURL(resolve(rootDir, spec)).toString();
  }
  if (isAbsolute(spec)) {
    return pathToFileURL(spec).toString();
  }
  const resolved = projectRequire.resolve(spec);
  return pathToFileURL(resolved).toString();
}

function validateAsPack(candidate: unknown, spec: string): FrameworkPack {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`plugin "${spec}" did not export a pack object`);
  }
  const p = candidate as Record<string, unknown>;
  const fail = (msg: string): never => {
    throw new Error(`plugin "${spec}" invalid: ${msg}`);
  };
  if (typeof p.id !== 'string' || p.id.trim() === '') fail('id must be a non-empty string');
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(p.id as string)) fail(`id "${p.id as string}" has bad chars`);
  if (typeof p.name !== 'string' || p.name.trim() === '') fail('name must be a non-empty string');
  if (typeof p.detect !== 'function') fail('detect must be a function');
  if (!Array.isArray(p.ignoreGlobs)) fail('ignoreGlobs must be an array');
  for (const g of p.ignoreGlobs as unknown[]) {
    if (typeof g !== 'string') fail('ignoreGlobs entries must be strings');
  }
  if (p.generatedFilePatterns !== undefined) {
    if (!Array.isArray(p.generatedFilePatterns)) fail('generatedFilePatterns must be an array');
    for (const r of p.generatedFilePatterns as unknown[]) {
      if (!(r instanceof RegExp)) fail('generatedFilePatterns entries must be RegExp');
    }
  }
  return candidate as FrameworkPack;
}

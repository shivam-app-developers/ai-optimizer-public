import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FrameworkPack } from '../types.js';

const MARKERS = [
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'pnpm-workspace.yaml',
  'deno.json',
];

export const JavaScriptPack: FrameworkPack = {
  id: 'javascript',
  name: 'JavaScript / TypeScript',
  detect: async (rootDir) => MARKERS.some((m) => existsSync(join(rootDir, m))),
  ignoreGlobs: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.turbo/**',
    '**/.svelte-kit/**',
    '**/.astro/**',
    '**/.vite/**',
    '**/.parcel-cache/**',
    '**/.cache/**',
    '**/.docusaurus/**',
    '**/storybook-static/**',
    '**/coverage/**',
    '**/.nyc_output/**',
    '**/.yarn/cache/**',
    '**/.yarn/install-state.gz',
    '**/.pnpm-store/**',
    '**/.npm/**',
    '**/*.min.js',
    '**/*.min.css',
    '**/*.tsbuildinfo',
    '**/*.map',
  ],
  generatedFilePatterns: [/\.gen\.ts$/, /\.generated\.(?:ts|tsx|js|jsx)$/],
};

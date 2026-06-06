import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FrameworkPack } from '../types.js';

const MARKERS = [
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'setup.cfg',
  'Pipfile',
  'poetry.lock',
  'uv.lock',
];

export const PythonPack: FrameworkPack = {
  id: 'python',
  name: 'Python',
  detect: async (rootDir) => MARKERS.some((m) => existsSync(join(rootDir, m))),
  ignoreGlobs: [
    '**/__pycache__/**',
    '**/*.pyc',
    '**/*.pyo',
    '**/*.pyd',
    '**/.venv/**',
    '**/venv/**',
    '**/env/**',
    '**/.tox/**',
    '**/.nox/**',
    '**/.pytest_cache/**',
    '**/.mypy_cache/**',
    '**/.ruff_cache/**',
    '**/.pyre/**',
    '**/dist/**',
    '**/build/**',
    '**/*.egg-info/**',
    '**/.coverage',
    '**/htmlcov/**',
    '**/.ipynb_checkpoints/**',
  ],
  generatedFilePatterns: [/_pb2\.py$/, /_pb2_grpc\.py$/, /\.generated\.py$/],
};

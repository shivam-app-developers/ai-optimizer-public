# Contributing to ai-optimizer

Thanks for considering a contribution. The fastest way to be useful right now is to help expand framework coverage and tighten the noise rules — every pack added today saves real tokens for every user tomorrow.

## Quick start

```bash
git clone <this repo>
cd ai_optimizer
npm install
npm run build
npm test
```

All workspaces use TypeScript (NodeNext modules) and Vitest. The MCP server entry point is `packages/core/bin/ai-optimizer.js`.

## Adding a framework pack

A "framework pack" is a small TypeScript file that:

1. Detects whether a project uses the framework (presence of a manifest file, lockfile, or directory).
2. Declares ignore globs for noise (`build/`, `dist/`, `vendor/`, etc.).
3. Optionally declares regex patterns for generated files.

Look at [packages/core/src/packs/python.ts](packages/core/src/packs/python.ts) and [packages/core/src/packs/javascript.ts](packages/core/src/packs/javascript.ts) — they're the templates.

A new pack belongs in:

- `packages/core/src/packs/<name>.ts` if the framework is going into the **free tier** (Python, JS/TS today).
- `packages/pro/src/packs/<name>.ts` if it's a **Pro** pack (React, Flutter, Java, Go, Rust, etc.). Pro lives in a separate workspace so the open-core boundary stays clean.

Wire a free pack into `loadFreePacks()` in [packages/core/src/pack-loader.ts](packages/core/src/pack-loader.ts).

### What makes a good pack?

- **Be aggressive on generated files**: `*.g.dart`, `*_pb2.py`, `*.gen.ts`. These are the highest-savings, lowest-risk patterns.
- **Cite the source**: Link the framework's official `.gitignore` template in a code comment if you copied patterns from it.
- **Don't over-ignore**: Skipping `src/` to "save tokens" defeats the point. Only filter what an experienced human would also skip.
- **Add tests**: Verify `detect()` correctly fires (and correctly _doesn't_ fire) by adding cases to [packages/core/src/detector.test.ts](packages/core/src/detector.test.ts).

## Adding bash noise patterns

Add to `DEFAULT_NOISE_PATTERNS` in [packages/core/src/bash-cleaner.ts](packages/core/src/bash-cleaner.ts) and a corresponding test in [packages/core/src/bash-cleaner.test.ts](packages/core/src/bash-cleaner.test.ts). One pattern + one test per PR is fine — small is good.

## Coding conventions

- TypeScript strict mode, `noUncheckedIndexedAccess` on. Every array/map access needs a guard.
- Prefer `node:` prefixed imports (`node:fs`, `node:path`).
- Run `npm run format` before pushing.
- Tests must be deterministic — no real network, no real LSP servers in CI (use the fake-lsp-server fixture).

## Pull request process

1. Fork and branch from `main`.
2. Keep PRs focused — one pack, one bug fix, one feature per PR.
3. Make sure `npm run build` and `npm test` pass at the repo root.
4. Describe what changed and _why_ — a one-line "added Rust pack" with the rationale beats a wall of text.

## Reporting bugs

Use the bug report issue template. Please include the agent (Claude Code, Cursor, etc.), the OS, the framework you were working in, and a minimal repro if possible.

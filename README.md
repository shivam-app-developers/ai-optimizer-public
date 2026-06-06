# AI Token Optimizer

> An MCP server that cuts AI coding-agent token usage by **60–80%** via framework-aware context optimization.

[![CI](https://github.com/shivam-app-developers/ai-optimizer/actions/workflows/ci.yml/badge.svg)](https://github.com/shivam-app-developers/ai-optimizer/actions/workflows/ci.yml)
[![CodeQL](https://github.com/shivam-app-developers/ai-optimizer/actions/workflows/codeql.yml/badge.svg)](https://github.com/shivam-app-developers/ai-optimizer/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/@ai-optimizer/core.svg)](https://www.npmjs.com/package/@ai-optimizer/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

<!-- mcp-name: io.github.shivam-app-developers/ai-optimizer -->

AI coding agents read whole files when they need 15 lines. They load `*.g.dart`,
`R.java`, `node_modules/`, and `dist/` into context — then do it again next turn.
**AI Token Optimizer** is a [Model Context Protocol](https://modelcontextprotocol.io)
server that intercepts those tool calls and strips framework noise *before* it
reaches the model.

Works with anything that speaks MCP: **Claude Code, Cursor, Cline, Continue, Zed,
JetBrains AI, GitHub Copilot agent mode, Antigravity, Windsurf, OpenAI Codex CLI.**

## Quickstart

```bash
npm install -g @ai-optimizer/core
```

Then point your agent at the `ai-optimizer` stdio server. For Claude Code, add to
`~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "ai-optimizer": {
      "command": "ai-optimizer"
    }
  }
}
```

Or scaffold the config and preview your savings automatically:

```bash
npx @ai-optimizer/init
# "we'd skip 47 files, ~14K tokens/session, ~$0.42/session at Sonnet pricing"
```

Full per-agent setup (Cursor, others), LSP install, and verification steps live in
[`packages/core/README.md`](./packages/core/README.md).

## What it does

It registers tools the agent uses **instead of** its built-in file/dir/error reads:

| Tool | What it saves |
| --- | --- |
| `optimized_read_file` | Framework-aware skip + optional line slice |
| `optimized_list_files` | Walks the tree applying ignore globs (+ `.gitignore`) |
| `optimized_grep` | Content search scoped by ignore filters |
| `optimized_diagnostics` | Spawns the right LSP, returns errors + a narrow code window |
| `read_symbol` | LSP `workspace/symbol` slice instead of a full-file read (Pro/LSP) |
| `strip_bash_noise` | Strips ANSI, npm/maven/gradle progress, JVM warnings |
| `optimizer_status` | Detected frameworks, active packs, cumulative tokens saved |

When a project type is detected (e.g. Python via `pyproject.toml`), the matching
pack's ignore rules activate automatically. `.gitignore` is respected on top.

## Tiers

| | Free (MIT core) | Pro ($9/mo) | Team ($29/seat) |
| --- | --- | --- | --- |
| Framework packs | Python, JS/TS | + React, Flutter, Java, Kotlin, Go, Rust, C#, Swift, Ruby, Elixir, PHP, Solidity | all Pro packs |
| History compaction | — | ✓ | ✓ |
| Scheduler (`claude -p` cron) | — | ✓ | + work-stealing across providers |
| Audit log + secret redaction + policy | — | — | ✓ |

See [`PRICING.md`](./PRICING.md). Behavior-changing or data-sharing features
(scheduler, work-stealing, telemetry) are **off by default** and require explicit
opt-in. Display-only features (dollar-value savings) default on.

## Monorepo layout

| Package | Purpose | Published |
| --- | --- | --- |
| [`packages/core`](./packages/core) | MCP server + free packs | npm (MIT) |
| [`packages/init`](./packages/init) | `npx @ai-optimizer/init` config + savings preview | npm |
| [`packages/sdk`](./packages/sdk) | `definePack` plugin SDK | npm |
| [`packages/context-mode-import`](./packages/context-mode-import) | Import `.contextmode` configs | npm |
| `packages/pro` | Pro/Team packs + scheduler + audit | private |
| `apps/landing`, `apps/dashboard`, `apps/vscode-extension`, `apps/license-server` | Site, local dashboard, IDE widget, license issuance | private |
| `tools/pack-bench` | Pack quality benchmark harness | private |

Architecture details: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Development

```bash
npm install            # at repo root (workspaces)
npm run build          # build all packages
npm test               # run all test suites
```

## Security

Local-only by design — license validation is the only network call. Report
vulnerabilities per [`SECURITY.md`](./SECURITY.md).

## License

Core engine is MIT — see [`LICENSE`](./LICENSE). Pro/Team packs are proprietary.

# @ai-optimizer/core

> MCP server that cuts AI coding agent token usage via framework-aware context optimization.

Works with any MCP-compatible AI agent: Claude Code, Cursor, Cline, Continue, Zed, JetBrains AI, GitHub Copilot agent mode, Antigravity, Windsurf, OpenAI Codex CLI.

## What it does

Registers tools the agent uses **instead of** its built-in file/dir/error reads:

- `optimized_read_file(path, startLine?, endLine?)` — framework-aware skip + optional slice.
- `optimized_list_files(directory, pattern?)` — walks the tree applying ignore globs (and `.gitignore` when present).
- `optimized_grep(pattern, directory?, flags?, filePattern?)` — content search scoped by ignore filters; caps at 100 matches; skips files >2 MB.
- `optimized_diagnostics(path, contextLines?)` — spawns the right LSP (pyright / typescript-language-server) and returns errors + a narrow code window around each one. Use this **before** reading a whole file when fixing an error.
- `strip_bash_noise(output)` — strips ANSI codes, npm/maven/gradle progress lines, JVM reflective-access warnings, and collapses carriage-return progress bars from shell output.
- `optimizer_status()` — detected frameworks, active packs, gitignore + LSP status, cumulative tokens saved.

When a project type is detected (e.g. Python via `pyproject.toml`), the matching pack's ignore rules become active automatically. `.gitignore` is respected on top.

## Install

```bash
npm install -g @ai-optimizer/core
```

This installs the `ai-optimizer` command (stdio MCP server).

For the LSP-backed `optimized_diagnostics` tool, install whichever language servers you want active:

```bash
npm install -g pyright typescript-language-server typescript
```

LSP is auto-detected per file extension. If the binary isn't on PATH, the tool simply returns no diagnostics — the rest of the server keeps working. Set `AI_OPTIMIZER_LSP=0` to disable LSP entirely.

## Configure your agent

### Claude Code

Add to `~/.claude/settings.json` (or `.claude/settings.local.json` in your project):

```json
{
  "mcpServers": {
    "ai-optimizer": {
      "command": "ai-optimizer"
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ai-optimizer": {
      "command": "ai-optimizer"
    }
  }
}
```

### Other agents

Anything that speaks MCP and supports `command`-based stdio servers — point it at `ai-optimizer` and you're done.

## Verify it's working

In your agent, ask:

> Use the optimizer_status tool.

You should see something like:

```text
Project root: /path/to/your/project
Detected frameworks: python
Active packs: Python
.gitignore: active
LSP bridge: enabled

Tokens saved this session: 0
Operations: 0
```

Then ask the agent to use `optimized_list_files` on your project. It should skip `__pycache__/`, `.venv/`, `node_modules/`, `dist/`, etc., and report tokens saved.

## Supported frameworks (free tier)

- **Python** — `pyproject.toml`, `requirements.txt`, `setup.py`, `Pipfile`, `poetry.lock`, `uv.lock`
  - Ignores: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `dist/`, `build/`, `*.egg-info/`, `htmlcov/`, `.ipynb_checkpoints/`
  - Generated patterns: `*_pb2.py`, `*_pb2_grpc.py`, `*.generated.py`
- **JavaScript / TypeScript** — `package.json`
  - Ignores: `node_modules/`, `dist/`, `build/`, `out/`, `.next/`, `.nuxt/`, `.turbo/`, `.svelte-kit/`, `.astro/`, `.vite/`, `.parcel-cache/`, `.cache/`, `.docusaurus/`, `storybook-static/`, `coverage/`, `.yarn/cache/`, `.pnpm-store/`, `*.min.js`, `*.min.css`, `*.tsbuildinfo`, `*.map`
  - Generated patterns: `*.gen.{ts,tsx,js,jsx}`, `*.generated.{ts,tsx,js,jsx}`

More frameworks (React, Flutter, Java, Kotlin, Go, Rust, etc.) are part of Pro — see the project root's `PRICING.md`.

## Development

```bash
npm install                                    # at repo root
npm run build --workspace=@ai-optimizer/core
npm test --workspace=@ai-optimizer/core
npm run start --workspace=@ai-optimizer/core
```

Smoke test (raw JSON-RPC over stdio):

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' \
  | node packages/core/bin/ai-optimizer.js
```

## License

MIT — see [LICENSE](./LICENSE).

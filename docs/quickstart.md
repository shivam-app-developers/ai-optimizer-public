# Quickstart

Get ai-optimizer cutting tokens for your AI coding agent in 2 minutes.

## 1. Install

```bash
npm install -g @ai-optimizer/core
```

This installs the `ai-optimizer` command (an MCP stdio server).

Optional &mdash; install language servers if you want the LSP-narrowed `optimized_diagnostics` tool:

```bash
npm install -g pyright typescript-language-server typescript
```

## 2. Add to your agent

### Claude Code

Add to `~/.claude/settings.json` (or `.claude/settings.local.json` in your project):

```json
{
  "mcpServers": {
    "ai-optimizer": { "command": "ai-optimizer" }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ai-optimizer": { "command": "ai-optimizer" }
  }
}
```

### Cline / Continue / Zed / others

Anything that speaks MCP and supports `command`-based stdio servers &mdash; pass `ai-optimizer` and you're done.

## 3. Verify

In your agent, ask:

> Use the optimizer_status tool.

You'll see something like:

```text
Project root: /path/to/your/project
Detected frameworks: python
Active packs: Python
.gitignore: active
LSP bridge: enabled
Pro extensions: none

Tokens saved this session: 0
Operations: 0
```

Detection is automatic from manifest files (`pyproject.toml`, `package.json`, etc.).

## 4. See savings

Open a file or list a directory through the MCP tools:

> List files in src using optimized_list_files.

Then check status again &mdash; the savings counter and operations count will be non-zero.

## 5. Unlock Pro packs (optional)

If you bought Pro on the [landing page](../apps/landing/), you'll receive a license JWT by email. Set it as an environment variable for the MCP server:

```json
{
  "mcpServers": {
    "ai-optimizer": {
      "command": "ai-optimizer",
      "env": { "AI_OPTIMIZER_LICENSE": "eyJhbGciOi..." }
    }
  }
}
```

Then install the Pro package:

```bash
npm install -g @ai-optimizer/pro
```

The next time the MCP server starts, it'll auto-load the React, Flutter, Java, etc. packs and the history compactor tool.

## What it actually does

Five MCP tools (six with a Pro license):

| Tool                                              | What                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `optimized_read_file(path, startLine?, endLine?)` | Reads a file, skipping it if framework or `.gitignore` rules say to                     |
| `optimized_list_files(directory, pattern?)`       | Walks a tree applying ignore globs; reports tokens saved                                |
| `optimized_grep(pattern, …)`                      | Regex search scoped by ignore filters; caps at 100 matches                              |
| `optimized_diagnostics(path, contextLines?)`      | LSP errors + ~10 lines of context around each &mdash; instead of reading the whole file |
| `strip_bash_noise(output)`                        | Strips ANSI, npm/maven/gradle progress, JVM warnings from shell output                  |
| `compact_chat_history(messages, …)`               | **(Pro)** Compresses earlier conversation turns into a structured summary               |
| `optimizer_status()`                              | Detected frameworks, active packs, gitignore + LSP status, cumulative tokens saved      |

## Troubleshooting

### "No tools detected" in my agent

- Restart your agent after editing the MCP config.
- Check the agent's MCP logs for `ai-optimizer` startup errors.
- Run the bin manually to verify it starts: `ai-optimizer --root .`

### `optimized_diagnostics` returns nothing

- Check that the relevant language server is on PATH (`pyright-langserver --version`).
- Set `AI_OPTIMIZER_LSP=0` to disable LSP entirely if it's misbehaving.

### Pro packs not loading

- Run `ai-optimizer` with the license env var set; check stderr for `[ai-optimizer] license invalid: …`
- Confirm `@ai-optimizer/pro` is installed: `npm ls -g @ai-optimizer/pro`
- License keys expire every 30 days &mdash; the license server emails refreshed ones on each subscription renewal.

## Next steps

- [CONTRIBUTING.md](../CONTRIBUTING.md) &mdash; how to add a framework pack
- [PRICING.md](../PRICING.md) &mdash; tiers, fee math, Stripe migration plan
- [ROADMAP.md](../ROADMAP.md) &mdash; what's coming

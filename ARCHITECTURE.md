# Architecture

How the MCP server is built, where it sits in the agent loop, and what each component does.

## 1. Where it sits

```
┌──────────────┐     ┌────────────────────┐     ┌─────────────────┐
│              │     │                    │     │                 │
│   AI Agent   │────▶│  Token Optimizer   │────▶│  Local Tools    │
│ (Claude Code,│     │   (MCP server)     │     │ (FS, LSP, etc.) │
│  Cursor ...) │◀────│                    │◀────│                 │
└──────────────┘     └────────────────────┘     └─────────────────┘
```

Two interception points:

- **Pre-tool-call (request):** Before a tool call leaves for execution, we may narrow its scope
- **Post-tool-call (response):** Before the result returns to the agent, we strip noise

## 2. Folder layout

```
ai-optimizer/
├── packages/
│   ├── core/                       # OSS — MIT license
│   │   ├── src/
│   │   │   ├── server.ts           # MCP server entry
│   │   │   ├── transport.ts        # stdio / SSE transport
│   │   │   ├── interceptor.ts      # pre/post hook engine
│   │   │   ├── detector.ts         # project type detection
│   │   │   ├── pack-loader.ts      # framework pack resolver
│   │   │   ├── lsp-bridge.ts       # talk to language servers
│   │   │   ├── counter.ts          # savings tracker
│   │   │   ├── packs/
│   │   │   │   ├── python.ts       # OSS, free
│   │   │   │   └── javascript.ts   # OSS, free
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   └── pro/                        # Closed source — license-gated
│       ├── src/
│       │   ├── packs/
│       │   │   ├── react.ts
│       │   │   ├── flutter.ts
│       │   │   ├── java.ts
│       │   │   └── ... (12+ more)
│       │   ├── compactor.ts        # history compaction
│       │   ├── audit-log.ts        # Team-tier feature
│       │   ├── redactor.ts         # secret redaction
│       │   ├── dashboard.ts        # savings dashboard
│       │   └── auth.ts             # license-key validation
│       └── package.json
│
├── apps/
│   ├── landing/                    # Marketing site (Next.js)
│   └── dashboard/                  # Web dashboard for Pro/Team
│
├── ai-token-optimizer-idea.md      # Master plan
├── ARCHITECTURE.md                 # This doc
├── ROADMAP.md
├── PRICING.md
└── LAUNCH.md
```

## 3. Component breakdown

### MCP server — `server.ts`, `transport.ts`

- Implements the MCP protocol (JSON-RPC 2.0)
- Registers as a tool middleware to the parent agent
- stdio transport for local agents (Claude Code, Cline)
- HTTP/SSE transport for remote agents (Cursor cloud, Antigravity)

### Interceptor — `interceptor.ts`

- Hooks into `PreToolUse` and `PostToolUse` events
- Routes to the appropriate handler based on tool name (`Read`, `Glob`, `Grep`, `Bash`, etc.)
- Stateful per session for cache and history compaction

### Project detector — `detector.ts`

- Walks up from CWD looking for marker files
- Returns the detected framework: `{ primary: 'flutter', secondary: ['dart', 'android'] }`
- Used to auto-load the right framework packs

### Framework pack loader — `pack-loader.ts`

- Loads pack modules for the detected framework(s)
- Each pack defines: ignore globs, generated-file patterns, LSP hints, version-specific rules
- Free build resolves only Python + JS/TS. Pro build resolves the full set.

### LSP bridge — `lsp-bridge.ts`

- Talks to the IDE's language server (or spawns one) to get:
  - Diagnostics for current file
  - Symbol definitions
  - Call references
- Uses LSP results to narrow `Read` calls to relevant line ranges

### Savings counter — `counter.ts`

- Tracks tokens-saved-per-turn vs tokens-that-would-have-been-sent
- Emits inline notice: `Saved X tokens this turn`
- Stored locally; aggregated in Pro dashboard

### License gate — `auth.ts` (in `packages/pro/`)

- License-key check against Stripe-issued JWT
- Falls back to free mode if invalid/missing
- Pro features no-op silently in free mode (no nag screens, no errors — just absent)

## 4. Framework pack format

Each pack is a TypeScript module exporting a `FrameworkPack`:

```typescript
export const PythonPack: FrameworkPack = {
  id: 'python',
  detect: (root) => exists(`${root}/pyproject.toml`) || exists(`${root}/requirements.txt`),
  ignoreGlobs: [
    '__pycache__/**',
    '*.pyc',
    '.venv/**',
    'venv/**',
    'dist/**',
    'build/**',
    '*.egg-info/**',
  ],
  generatedFiles: [/\.pb2\.py$/, /_pb2_grpc\.py$/],
  contextHints: {
    onError: () => ({ readLines: 15, includeImports: true }),
  },
  versionRules: {
    'django>=5.0': { ignore: ['**/migrations/0001_initial.py'] },
  },
};
```

## 5. Data flow — example: agent reads a Python file with an error

1. Agent calls `Read("/app/views.py")`
2. **Pre-hook:** detector identifies Python → loads `PythonPack` → checks if file is in `ignoreGlobs` (no) → asks `lsp-bridge` for diagnostics on that file → finds error at line 45 → narrows the read to lines 35–55
3. Tool executes the narrowed read
4. **Post-hook:** strips Python `__pycache__` references from output if any → returns
5. **Counter:** records ~3.2K tokens saved vs full-file read

## 6. Tree-sitter integration

- Tree-sitter is used for AST-aware operations: "extract this function," "show class signature only"
- V1 ships without it — basic line-range narrowing covers the 80% case
- V2 adds tree-sitter for "smart class summarizer" features
- Grammars on the path: `tree-sitter-python`, `tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-dart`, `tree-sitter-java`, `tree-sitter-go`

## 7. Performance targets

- **Latency overhead per tool call:** &lt;50ms p95
- **Memory footprint:** &lt;100MB resident
- **Cold start:** &lt;500ms

If TS profiling shows hotspots, candidates for napi-rs Rust extraction:

- Tree-sitter chunking
- Glob-matching for large repos
- File-tree walk for project detection

## 8. Configuration

User config at `~/.optimizer/config.json` and per-project `.optimizerrc`:

```json
{
  "license_key": "...",
  "framework_overrides": ["python", "react"],
  "ignore_globs": ["my_secrets/**"],
  "savings_display": "inline"
}
```

## 9. Security model

- The MCP server runs locally — no network calls except license validation (Pro) and optional opt-in telemetry
- License validation: signed JWT from Stripe, validated offline with embedded public key
- 7-day grace period if Stripe is unreachable
- Audit log (Team tier): local-only by default, opt-in S3/SIEM export
- Secret redaction (Team tier): regex match + entropy heuristic, applied pre-egress

## 10. Testing strategy

- **Unit:** every framework pack has fixtures showing inputs (tool calls) and expected outputs (filtered/narrowed)
- **Integration:** spawn a real MCP client (Claude Code in headless mode) against the server, verify tool flow
- **Smoke:** CI runs the server against a known-good Python and JS/TS sample repo on every PR
- **Performance:** benchmarks for &lt;50ms p95 overhead in CI; regression alarm if exceeded

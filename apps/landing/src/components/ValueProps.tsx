const items = [
  {
    title: 'Framework-aware',
    body: 'Detects your stack from manifest files (pyproject.toml, package.json, pubspec.yaml, …) and applies the right ignore rules automatically.',
  },
  {
    title: 'MCP-native',
    body: 'One install works across every MCP-speaking agent: Claude Code, Cursor, Cline, Continue, Zed, Antigravity, OpenAI Codex CLI.',
  },
  {
    title: 'Cron + headless',
    body: 'Pro adds a cron-driven scheduler that fires prompts at `claude -p` on your machine — overnight refactors, hourly bug-triage, scheduled reviews. Team adds quota-aware fallback to OpenAI / Gemini when Claude rate-limits.',
  },
  {
    title: 'See your savings',
    body: 'VS Code status-bar widget shows live tokens-saved + dollar value. Local web dashboard charts savings, framework usage, and budget caps. Per-conversation budget caps hard-kill the agent before it overspends.',
  },
  {
    title: 'Open core',
    body: 'MIT engine + Python and JS/TS packs — free forever. Pay only for the long tail of framework packs you actually use.',
  },
];

export default function ValueProps() {
  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5"
        >
          <h3 className="font-semibold text-neutral-100">{item.title}</h3>
          <p className="mt-2 text-sm text-neutral-300">{item.body}</p>
        </div>
      ))}
    </section>
  );
}

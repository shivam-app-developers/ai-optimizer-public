export default function Install() {
  return (
    <section id="install" className="space-y-6">
      <header className="text-center">
        <h2 className="text-3xl font-semibold">Install</h2>
        <p className="mt-2 text-neutral-400">Two commands. One config block.</p>
      </header>

      <div className="grid gap-4">
        <CodeBlock label="1. Install globally">npm install -g @ai-optimizer/core</CodeBlock>
        <CodeBlock label="2. Add to your agent (Claude Code shown)">
          {`{
  "mcpServers": {
    "ai-optimizer": { "command": "ai-optimizer" }
  }
}`}
        </CodeBlock>
        <CodeBlock label="3. Verify">{`# In your agent:
"Use the optimizer_status tool"`}</CodeBlock>
      </div>

      <p className="text-sm text-neutral-400 text-center">
        Cursor, Cline, Continue, Zed, JetBrains AI &mdash; same config, different file. See the{' '}
        <a className="text-emerald-400 hover:underline" href="#docs">
          docs
        </a>
        .
      </p>
    </section>
  );
}

function CodeBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950">
      <div className="border-b border-neutral-800 px-4 py-2 text-xs uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-sm font-mono text-neutral-100">
        <code>{children}</code>
      </pre>
    </div>
  );
}

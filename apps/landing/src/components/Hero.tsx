export default function Hero() {
  return (
    <section className="text-center space-y-6">
      <p className="text-xs uppercase tracking-widest text-emerald-400">MCP server</p>
      <h1 className="text-5xl sm:text-6xl font-semibold leading-tight">
        Cut your coding agent&rsquo;s
        <br />
        token bill, framework-aware.
      </h1>
      <p className="text-lg text-neutral-300 max-w-2xl mx-auto">
        ai-optimizer plugs into Claude Code, Cursor, and any other MCP-speaking agent. It skips
        framework noise (<code className="font-mono text-neutral-100">node_modules</code>,{' '}
        <code className="font-mono text-neutral-100">.venv</code>,{' '}
        <code className="font-mono text-neutral-100">*.g.dart</code>), narrows reads to the lines
        with errors, and strips Bash output noise &mdash; before any of it costs a token.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href="#install"
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        >
          Install in 2 minutes
        </a>
        <a
          href="https://github.com/shivam-app-developers/ai-optimizer"
          className="inline-flex items-center justify-center rounded-md border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-100 hover:bg-neutral-900"
        >
          View on GitHub
        </a>
      </div>
    </section>
  );
}

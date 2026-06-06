const items = [
  {
    q: 'Does this replace my coding agent?',
    a: "No. ai-optimizer is an MCP server that runs alongside your agent — Claude Code, Cursor, etc. — and gives it framework-aware tools to use instead of the built-in file/dir/grep tools.",
  },
  {
    q: 'Why not just rely on .gitignore?',
    a: ".gitignore covers some of it, and ai-optimizer respects it on top of pack rules. But framework noise like *.g.dart, R.java, _pb2.py, .next caches, generated TanStack route trees rarely make it into .gitignore — and the agent reads them anyway.",
  },
  {
    q: 'How are Pro packs different from a fork of the free engine?',
    a: 'The free packs (Python, JS/TS) are MIT and live in the public repo. Pro packs (React, Flutter, Java, …) are closed and load only when a valid license JWT is set in AI_OPTIMIZER_LICENSE. The MIT engine works fine on its own.',
  },
  {
    q: 'What does the license JWT look like?',
    a: "An Ed25519-signed JWT with a 30-day TTL. The license server signs it with a private key; @ai-optimizer/pro verifies offline with the matching embedded public key. Renewals refresh the JWT each subscription cycle.",
  },
  {
    q: 'Can I self-host the Pro tier?',
    a: 'Not yet. Self-host edition is on the V4+ roadmap — request it if you need it now.',
  },
];

export default function Faq() {
  return (
    <section id="faq" className="space-y-6">
      <header className="text-center">
        <h2 className="text-3xl font-semibold">FAQ</h2>
      </header>
      <dl className="space-y-4">
        {items.map((item) => (
          <div
            key={item.q}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5"
          >
            <dt className="font-semibold text-neutral-100">{item.q}</dt>
            <dd className="mt-2 text-sm text-neutral-300">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

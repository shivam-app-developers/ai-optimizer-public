interface Tier {
  name: string;
  price: string;
  blurb: string;
  features: string[];
  cta: string;
  href: string;
  highlight?: boolean;
}

const PRO_URL = process.env.NEXT_PUBLIC_LS_PRO_URL ?? '';
const TEAM_URL = process.env.NEXT_PUBLIC_LS_TEAM_URL ?? '';

const tiers: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    blurb: 'For solo devs working in Python or JS/TS.',
    features: ['Python pack', 'JavaScript / TypeScript pack', 'LSP narrowing', 'Bash noise stripper'],
    cta: 'Install free',
    href: '#install',
  },
  {
    name: 'Pro',
    price: '$9 / mo',
    blurb: 'All Pro framework packs + scheduler + history compactor + IDE widget + dashboard.',
    features: [
      'Everything in Free',
      'Pro packs: React (Next, Vite, Remix, Gatsby), Flutter, Java, Kotlin, Go',
      'Cron-scheduled prompts → headless `claude -p` dispatch',
      'History compactor',
      'Per-conversation + per-day budget caps (hard-kill before overspend)',
      'VS Code status-bar widget (live tokens-saved + budget)',
      'Local web dashboard (savings, framework usage, ROI)',
      'context-mode importer (`npx @ai-optimizer/context-mode-import`)',
      'Email support',
    ],
    cta: 'Subscribe',
    href: PRO_URL || '#contact',
    highlight: true,
  },
  {
    name: 'Team',
    price: '$29 / seat',
    blurb: 'Audit + redaction + policy + work-stealing scheduler. Min 3 seats.',
    features: [
      'Everything in Pro',
      'Append-only NDJSON audit log of every file the agent reads',
      'Secret redactor: OpenAI / Anthropic / GitHub / AWS / Stripe / JWT / PEM / .env',
      'Allow- and deny-list path policy (per-tool overrides)',
      'Quota-aware multi-provider scheduler — Claude exhausts → routes to OpenAI / Gemini',
      'Priority email',
    ],
    cta: 'Subscribe',
    href: TEAM_URL || '#contact',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    blurb: 'SSO, SOC 2, on-prem. Inbound only.',
    features: ['Everything in Team', 'SSO (Okta, Azure AD)', 'SOC 2 Type 2', 'On-prem deployment', 'Dedicated support'],
    cta: 'Contact',
    href: '#contact',
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="space-y-6">
      <header className="text-center">
        <h2 className="text-3xl font-semibold">Pricing</h2>
        <p className="mt-2 text-neutral-400">
          Free covers Python and JS/TS. Pay only when you need more frameworks.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={
              'rounded-lg border p-5 flex flex-col ' +
              (tier.highlight
                ? 'border-emerald-500 bg-emerald-500/5'
                : 'border-neutral-800 bg-neutral-900/40')
            }
          >
            <div className="space-y-1">
              <h3 className="font-semibold text-neutral-100">{tier.name}</h3>
              <p className="text-2xl font-semibold">{tier.price}</p>
              <p className="text-sm text-neutral-400">{tier.blurb}</p>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-neutral-300 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-emerald-400">
                    +
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href={tier.href}
              className={
                'mt-5 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium ' +
                (tier.highlight
                  ? 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400'
                  : 'border border-neutral-700 text-neutral-100 hover:bg-neutral-900')
              }
            >
              {tier.cta}
            </a>
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-500 text-center">
        Payments processed by LemonSqueezy (Merchant of Record). Cancel anytime in the LS portal.
      </p>
    </section>
  );
}

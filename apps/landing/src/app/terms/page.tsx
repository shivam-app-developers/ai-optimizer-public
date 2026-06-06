import type { Metadata } from 'next';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service — ai-optimizer',
  description: 'Terms governing use of ai-optimizer Free, Pro, and Team.',
};

const LAST_UPDATED = '2026-05-06';

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-12 text-neutral-200">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold">Terms of Service</h1>
        <p className="text-sm text-neutral-500">Last updated: {LAST_UPDATED}</p>
        <p className="text-sm text-amber-400">
          DRAFT — under legal review. Treat anything binding here as
          provisional until this banner is removed.
        </p>
      </header>

      <Section title="The agreement">
        <p>
          By installing or using ai-optimizer (the MCP server, packs,
          dashboard, IDE extensions, and any associated services) you
          agree to these terms. If you don&apos;t agree, don&apos;t use
          the software.
        </p>
        <p>
          The software is operated by Shivam App Studio
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;). Reach us at{' '}
          <a className="underline" href="mailto:hello@ai-optimizer.dev">
            hello@ai-optimizer.dev
          </a>
          .
        </p>
      </Section>

      <Section title="Open source vs. paid">
        <p>
          The core engine in <code>packages/core</code> is licensed
          MIT — you can use, fork, modify, and redistribute it within
          those terms. The Pro packs, scheduler, audit bundle, license
          server, and any code under <code>packages/pro</code> are
          proprietary and licensed only to active subscribers under
          these terms.
        </p>
      </Section>

      <Section title="Subscriptions">
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Pro: $9 per user per month.</li>
          <li>Team: $29 per seat per month, minimum 3 seats.</li>
          <li>Free: no charge, no SLA, no support obligation.</li>
        </ul>
        <p>
          Billing, tax collection, and refunds are handled by{' '}
          <a className="underline" href="https://www.lemonsqueezy.com/policies/terms">
            LemonSqueezy
          </a>
          , our Merchant of Record. Their terms apply to the payment
          relationship.
        </p>
        <p>
          Subscriptions auto-renew at the end of each billing period
          unless cancelled. Cancellation stops the next renewal but does
          not refund the current period — you keep your license until
          the period expires.
        </p>
      </Section>

      <Section title="License keys">
        <p>
          Your license key is an Ed25519-signed JWT that expires every 30
          days and is automatically refreshed while your subscription is
          active. The key authorizes use of the Pro/Team features by you
          (Pro) or your team members (Team, up to the seat count).
          Sharing a Pro key beyond yourself, or a Team key beyond the
          seat count you paid for, is a breach of these terms.
        </p>
      </Section>

      <Section title="Refunds">
        <p>
          If you&apos;re unhappy within the first 14 days of your initial
          subscription, email{' '}
          <a className="underline" href="mailto:hello@ai-optimizer.dev">
            hello@ai-optimizer.dev
          </a>{' '}
          and we&apos;ll process a full refund through LemonSqueezy. We
          do not refund partial periods after that, but you can cancel at
          any time.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Re-distribute the Pro/Team source or compiled artifacts.</li>
          <li>Reverse-engineer the license-key issuance flow.</li>
          <li>
            Use the software to scrape, store, or transmit data you
            don&apos;t have the right to access.
          </li>
          <li>
            Run automated load against the license server beyond what is
            necessary for normal operation.
          </li>
        </ul>
      </Section>

      <Section title="Warranty disclaimer">
        <p>
          The software is provided &ldquo;as is&rdquo; without warranty of
          any kind, express or implied, including but not limited to the
          warranties of merchantability, fitness for a particular purpose,
          and non-infringement. We don&apos;t guarantee that any specific
          token-savings number will materialize on your project.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          Our total liability arising out of or in connection with these
          terms or the software is limited to the amount you paid us in
          the 12 months preceding the claim. We are not liable for
          indirect, consequential, incidental, special, or punitive
          damages.
        </p>
      </Section>

      <Section title="Termination">
        <p>
          We can suspend or terminate your subscription if you breach
          these terms or if your payment fails after a reasonable retry
          window. You can terminate at any time by cancelling through
          LemonSqueezy. On termination of a paid plan, the Pro/Team
          features stop validating at the next 30-day refresh.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of India. Disputes are
          subject to the exclusive jurisdiction of the courts of
          Bengaluru, Karnataka. This does not override mandatory consumer
          protection laws of your jurisdiction.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms. Material changes are emailed to
          active subscribers at least 14 days before they take effect;
          continuing to use the software after that constitutes
          acceptance. Non-material edits (typos, clarifications) take
          effect on update.
        </p>
      </Section>

      <Footer />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="space-y-3 text-neutral-300 leading-relaxed">{children}</div>
    </section>
  );
}

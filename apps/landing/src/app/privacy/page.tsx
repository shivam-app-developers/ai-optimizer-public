import type { Metadata } from 'next';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy — ai-optimizer',
  description: 'How ai-optimizer handles your data.',
};

const LAST_UPDATED = '2026-05-06';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-12 text-neutral-200">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-neutral-500">Last updated: {LAST_UPDATED}</p>
        <p className="text-sm text-amber-400">
          DRAFT — under legal review. Treat anything binding here as
          provisional until this banner is removed.
        </p>
      </header>

      <Section title="Who we are">
        <p>
          ai-optimizer is operated by Shivam App Studio (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;). For questions about this policy, write to{' '}
          <Mail address="privacy@ai-optimizer.dev" />.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          The MCP server, init CLI, dashboard, and IDE extensions run on
          your machine and read your project files locally. We do not
          receive a copy of your source code.
        </p>
        <p>
          The following data leaves your machine in normal use:
        </p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>
            <strong>Billing data</strong> — when you subscribe to Pro or
            Team, LemonSqueezy (our Merchant of Record) collects payment
            and tax information per their{' '}
            <a className="underline" href="https://www.lemonsqueezy.com/privacy">
              privacy policy
            </a>
            . They share with us your email, plan, country, and a
            subscription identifier so we can issue your license.
          </li>
          <li>
            <strong>License key emails</strong> — we email your Ed25519
            license key to the address LemonSqueezy provides.
          </li>
          <li>
            <strong>Telemetry</strong> — disabled by default. When you
            opt in, the server posts anonymous events (session_start,
            tool_call) to{' '}
            <code>telemetry.ai-optimizer.dev</code>. Each event carries a
            random install id (created the first time telemetry sends, not
            before), the package version, the framework packs detected,
            and tool durations + token-saved counts. No file paths, file
            contents, or prompts. You can opt out at any time by setting{' '}
            <code>telemetry: &quot;off&quot;</code> in{' '}
            <code>.optimizerrc.json</code>.
          </li>
          <li>
            <strong>License validation</strong> — license keys are
            verified locally against an embedded public key. The server
            does NOT call our license server on every validation; it only
            re-verifies on each 30-day refresh from LemonSqueezy.
          </li>
        </ul>
      </Section>

      <Section title="What we don't collect">
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Your source code, file paths, or file contents.</li>
          <li>Your prompts, agent transcripts, or LLM responses.</li>
          <li>Browsing data outside the dashboard you self-host.</li>
          <li>
            Any third-party API keys (Anthropic, OpenAI, Google, etc.) —
            these never leave your machine.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <p>
          Billing data is used to invoice you and issue licenses.
          Telemetry, when opted in, is aggregated to identify which packs
          and frameworks save the most tokens so we know where to invest
          engineering effort.
        </p>
        <p>We do not sell your data. We do not run advertising.</p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Active subscription data is kept for the life of the
          subscription plus seven years for tax compliance. License-key
          metadata (email + plan + expiry) is kept while your license is
          valid; expired keys are scrubbed within 90 days. Telemetry events
          are aggregated within 30 days and the per-event records are
          deleted.
        </p>
      </Section>

      <Section title="Your rights (GDPR / UK GDPR / CCPA)">
        <p>You can ask us to:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Tell you what we hold about you.</li>
          <li>Correct or delete your data.</li>
          <li>Export your data in a machine-readable format.</li>
          <li>Stop processing your data for telemetry purposes.</li>
        </ul>
        <p>
          Email <Mail address="privacy@ai-optimizer.dev" /> from the
          address associated with your subscription. We respond within 30
          days. For payment data held by LemonSqueezy, contact them
          directly — they are the controller for that data.
        </p>
      </Section>

      <Section title="Sub-processors">
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>LemonSqueezy (US) — billing, tax, MoR.</li>
          <li>Resend (US) — transactional email (license keys).</li>
          <li>Cloudflare (US) — CDN + DNS for ai-optimizer.dev.</li>
          <li>GitHub (US) — code hosting + issue tracker.</li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          See{' '}
          <a className="underline" href="https://github.com/shivam-app-developers/ai-optimizer/blob/main/SECURITY.md">
            SECURITY.md
          </a>{' '}
          for our disclosure process. License signing keys are stored in
          a hardware-backed secret manager and never leave the issuance
          server.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          When this policy changes materially we update the date above and
          notify active subscribers by email at least 14 days before the
          change takes effect.
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

function Mail({ address }: { address: string }) {
  return (
    <a className="underline" href={`mailto:${address}`}>
      {address}
    </a>
  );
}

# Pricing

How tiers are structured, what's free vs paid, and how monetization works without compromising OSS adoption.

## Tier overview

| Tier       | Price                   | Frameworks     | Audit       | Dashboard | Support                   |
| ---------- | ----------------------- | -------------- | ----------- | --------- | ------------------------- |
| Free / OSS | $0                      | Python + JS/TS | —           | —         | Community (GitHub issues) |
| Pro        | $9 / mo                 | All 15+        | —           | Personal  | Email                     |
| Team       | $29 / seat / mo (min 3) | All            | ✓ Audit log | Team      | Priority email            |
| Enterprise | Custom (inbound only)   | All            | ✓ + SOC 2   | + SSO     | Dedicated                 |

## What's open-source (MIT license)

- MCP server engine (`packages/core`)
- Pre/post hook architecture
- Project detector
- Pack loader and the public `FrameworkPack` interface
- Token savings counter
- Two starter framework packs: **Python** and **JavaScript/TypeScript**
- Configuration system (`.optimizerrc`)
- Basic CLI install

**Why OSS:** distribution, trust, contributor magnetism, defense against context-mode forks.

## What's closed-source (Pro / Team only)

### Pro — $9/mo

- 13+ additional framework packs (React, Flutter, Java, Kotlin, Go, Rust, etc.)
- Version-aware rules (Django 5.x vs 4.x, Flutter 3.40 vs 3.38)
- History compactor (smart session compression)
- Personal savings dashboard (web)
- Email support

### Team — $29/seat/mo (min 3 seats)

- Everything in Pro
- **Audit log** — every file path that left the machine, exportable to JSON / SIEM
- **Secret redaction** — `.env`, API keys, tokens stripped before egress
- **Policy enforcement** — file allowlist/denylist, per-team rules
- **Centralized rules** — admin pushes config to all seats
- Team analytics dashboard
- Priority email support

### Enterprise — Custom (inbound only)

- Everything in Team
- SSO (Okta, Azure AD)
- SOC 2 Type 2
- On-prem deployment option
- Custom rule packs
- Dedicated support
- Custom MSA / DPA

## Pricing rationale

- **$9 Pro** is below the "I need to think about it" threshold. Devs paying $20–200/mo for Cursor/Claude Code add this without questioning.
- **$29/seat Team** sits between hobbyist and enterprise. A 5-person dev shop = $145/mo, well within team-tool budget without procurement.
- **No middle tier between Team and Enterprise** — Team scales smoothly to ~50 seats. Above that, custom.
- **No annual discount initially** — preserves cash and avoids long refund tails. Add 20% annual discount in V3 if conversion data supports it.

## How OSS fork-resistance works

1. The OSS engine works — but the framework packs are the value
2. Packs require version-tracking, framework-update churn, and per-framework expertise — high maintenance burden
3. Forks lose updates immediately; pack quality decays in weeks
4. The cheap option for forking devs is to pay $9/mo
5. ~5–10% will fork anyway. That's fine — same model as GitLab CE/EE, MongoDB, Sentry

## Payment integration (LemonSqueezy, V1)

V1 uses **LemonSqueezy** as the Merchant of Record. This avoids needing Indian
company registration / IEC / GST during launch — LS is the legal seller and
remits global sales tax. Migrate to Stripe direct once incorporated to
recover the ~5% MoR fee.

- LemonSqueezy Checkout for self-serve Pro and Team (hosted page)
- LemonSqueezy customer portal for upgrades / cancellations
- License key delivered via LS webhook → email + dashboard
- License key is a signed JWT (Ed25519) validated offline by `packages/pro/src/auth.ts`
- License keys issued for 30 days at a time and refreshed by the license
  server when LemonSqueezy fires a renewal webhook. If a subscription is
  cancelled, the next 30-day key isn't issued, so access revokes within
  ~30 days — no live API check required at runtime.
- The Ed25519 **public** verify key ships embedded in `packages/pro`; the
  **private** signing key lives only on the license-issuance server (so
  even if Pro source leaks, no one can mint license keys).

**Effective fee at each price point** (LS = 5% + $0.50/txn):

| Customer pays | LS takes | We receive    |
| ------------- | -------- | ------------- |
| $9 (Pro)      | $0.95    | $8.05 (~89%)  |
| $29 (1 seat)  | $1.95    | $27.05 (~93%) |
| $87 (3 seats) | $4.85    | $82.15 (~94%) |

## Free → Pro conversion strategy

Visible value moments:

- **Inline savings counter** at every turn (free + Pro both show this) — builds the "this is saving me real money" instinct
- **Framework lock screen** — when a free user opens a non-Python/JS project, show: _"React rules unlocked in Pro. You're spending ~14K extra tokens per session on this project."_
- **Email onboarding** — day 7: _"You've saved 47K tokens this week. At your usage, Pro pays for itself in 2 days."_
- **GitHub star opt-in** — installing the MCP server prompts: _"Star the repo to unlock framework auto-detect for life."_

Conversion math:

- 10K free installs × 2% conversion = 200 Pro = **$1,800 MRR**
- 50K free installs × 3% (network effect kicks in) = 1500 Pro = **$13,500 MRR**

## What's NOT in this product

- Per-token billing (subscription only — predictability)
- Free trial of Pro features (deliberately — driver is upgrade urgency, not extended trial)
- Lifetime deals (kills MRR predictability)
- Affiliate/referral program (defer to V3+)
- Hosted/managed cloud version (defer until self-host adoption matures)

## When to revisit pricing

- **Month 3:** if free → Pro conversion &lt; 1.5%, lower the bar (more frameworks free) or raise Pro value (more closed features)
- **Month 6:** if Team tier adoption &lt; 5 customers, examine whether the audit features are valuable or whether marketing is wrong
- **Month 12:** consider 20% annual discount, regional pricing, possible $19 "Pro Plus" tier with priority everything

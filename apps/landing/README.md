# @ai-optimizer/landing

> Marketing site for ai-optimizer. Single-page Next.js + Tailwind. Deploys
> anywhere Next.js runs (Vercel, Cloudflare Pages, Netlify, self-host).

## Develop

```bash
npm install
npm run dev --workspace=@ai-optimizer/landing
# http://localhost:3000
```

## Configure LemonSqueezy buy buttons

Copy `.env.example` to `.env.local` and replace the placeholder URLs with the
hosted Checkout links from your LS dashboard:

- LS dashboard → Products → (your product) → Variants → three-dot menu → **Share** → copy the Checkout link.
- One link per variant (Pro monthly, Team monthly).

```env
NEXT_PUBLIC_LS_PRO_URL=https://shivam-app-studio.lemonsqueezy.com/checkout/buy/...
NEXT_PUBLIC_LS_TEAM_URL=https://shivam-app-studio.lemonsqueezy.com/checkout/buy/...
```

If unset, the buy buttons fall back to `#contact` so the page still renders.

## Build for production

```bash
npm run build --workspace=@ai-optimizer/landing
npm run start --workspace=@ai-optimizer/landing
```

## What it ships

A single page (`src/app/page.tsx`) composed of:

- `Hero` — headline + install CTA
- `ValueProps` — 3-up grid (framework-aware / MCP-native / open-core)
- `Install` — 3-step copy-pasteable install
- `Pricing` — 4 tiers (Free / Pro / Team / Enterprise) with LS Checkout links
- `Faq` — common questions
- `Footer` — GitHub link

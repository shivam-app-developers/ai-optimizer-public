# Security Policy

## Reporting a vulnerability

If you believe you've found a security vulnerability in ai-optimizer (the
MCP server, init CLI, dashboard, license server, VS Code extension, or any
of the published packages), please **do not open a public GitHub issue**.

Send a report to **security@ai-optimizer.dev** with:

- A short description of the issue and its impact
- Steps to reproduce (proof-of-concept code is welcome)
- The version / commit hash you tested against
- Your name + how you'd like to be credited (or "anonymous")

You will receive an acknowledgement within **3 business days**. If you have
not heard back in that window, please send a follow-up — your message may
have been filtered.

We will work with you on a coordinated disclosure timeline. Critical
issues are typically patched and published within **14 days** of triage,
non-critical within **30 days**.

## Scope

In scope:

- The MCP server in `packages/core` and the Pro extensions in `packages/pro`
- The init CLI (`@ai-optimizer/init`)
- The license server (`apps/license-server`) — issuance, JWT signing, webhook
- The dashboard (`apps/dashboard`) and VS Code extension (`apps/vscode-extension`)
- All packages published under the `@ai-optimizer/` npm scope
- The license-key validation path (Ed25519 JWT verification)
- The redactor / policy / audit log bundle (Team tier)

Out of scope:

- Anything described in `docs/` as future or planned work
- Vulnerabilities in third-party dependencies that have no exploit path
  through ai-optimizer (please report those upstream)
- Self-XSS in the dashboard when the user pastes attacker-controlled
  content into developer tools
- Issues requiring a malicious local user with shell access

## What we'd especially like to hear about

- Anything that lets a Pro license be minted, extended, or refreshed
  without going through the LemonSqueezy webhook + Ed25519 signing path
- Bypasses of the redactor that allow secrets to be written to the audit
  log file or transmitted via telemetry
- Path-traversal / SSRF / prototype-pollution in the MCP tool handlers
  (`optimized_read_file`, `optimized_list_files`, `optimized_grep`,
  `optimized_diagnostics`, `read_symbol`)
- Plugin loader escapes — a malicious plugin pack that crashes boot or
  reads files outside the project root
- Auth issues in the license server (signature stripping, replay, etc.)

## Safe-harbor

We will not pursue legal action against good-faith security research that:

- Stays within the scope above
- Does not access, modify, or destroy data belonging to others
- Does not run automated scanners against the production license server
  beyond what is necessary to demonstrate an issue
- Reports the issue privately and gives us reasonable time to remediate

## Public disclosure

After a fix is released we publish a brief advisory on
[GitHub Security Advisories](https://github.com/shivam-app-developers/ai-optimizer/security/advisories)
crediting the reporter (unless they requested otherwise).

## PGP

If you'd like to encrypt your report, our PGP key is available at
`https://ai-optimizer.dev/.well-known/security.pgp` (key fingerprint
published alongside the file). Encryption is optional; plain email is
also fine.

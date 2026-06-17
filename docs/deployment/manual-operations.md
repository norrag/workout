# Manual operations runbook

A standing list of operations that **cannot be performed from a Claude Code
session** (web / CI / remote sandbox) and must be done by a human in a
dashboard, CLI with privileged credentials, or local machine. When a task
depends on one of these, Claude will implement everything it can and then point
here with the specific values to enter.

Keep this file current: when a new manual step is discovered, add it.

---

## Why these can't be automated here

The session's MCP tool surface is **read + targeted-write**, not full account
administration:

- **Supabase MCP** can run SQL, apply migrations, read advisors/logs, and read
  project metadata — but it **cannot toggle Auth feature flags** (OAuth server,
  providers), change **Auth URL configuration**, or rotate keys.
- **Vercel MCP** can deploy and read projects/deployments/logs — but it has
  **no tool to set environment variables, configure Git integration, domains,
  or project settings.**
- **GitHub MCP** is scoped to repo contents/PRs/issues/actions — not org or
  repo *settings*/secrets.

So anything that is a **dashboard toggle, an environment variable, a secret, a
domain, or an Auth-config change** is a human step.

---

## Catalogue of human-only steps

### Supabase (dashboard: https://supabase.com/dashboard/project/juqvbiymmdcggctdqoiq)

| Operation | Where | Notes |
|---|---|---|
| Enable/disable **OAuth 2.1 Server** | Authentication → OAuth Server | Beta feature. Required for the MCP connector token handshake. See [mcp-connector-setup.md](mcp-connector-setup.md). |
| Set **Authorization Path** (e.g. `/oauth/consent`) | Authentication → OAuth Server | Combined with Site URL to form the consent URL. |
| Enable **dynamic client registration** | Authentication → OAuth Server | Lets MCP clients self-register (no manual client creds). |
| Set **Site URL** / **Redirect URLs** | Authentication → URL Configuration | Must include the deployed app origin (and `http://localhost:3000` for local). |
| **JWT signing keys** (asymmetric ES256) | Authentication → Signing Keys | Already enabled (ES256 JWKS is live). Required for OAuth/JWKS validation. |
| Rotate **service-role / anon keys** | Project Settings → API | Never exposed to Claude; update Vercel + local `.env` after rotation. |

### Vercel (dashboard: project `workout`, team `garron-duprees-projects`)

| Operation | Where | Notes |
|---|---|---|
| Set/edit **Environment Variables** | Project → Settings → Environment Variables | See the env table in [mcp-connector-setup.md](mcp-connector-setup.md). Set for Production **and** Preview. |
| **Git integration** (prod = `main`, preview = PRs) | Project → Settings → Git | Already connected. |
| **Custom domain** | Project → Settings → Domains | Affects the connector endpoint URL + Supabase Site URL. |

### Local machine (for `supabase start` / e2e / RLS tests)

| Operation | Notes |
|---|---|
| Run the local Supabase stack | `supabase start`; needed for `npm run test:rls` and Playwright e2e (the sandbox has no local stack). |
| Apply OAuth config locally | Add `[auth.oauth_server]` to `supabase/config.toml` (see connector setup doc). |

---

## How Claude flags these

In PRs and PROGRESS entries, remaining human steps are listed under a
**"Remaining / external"** heading with exact values. Cross-check this file if a
deploy or feature "doesn't work" despite green CI — it's usually an unset env
var or an un-toggled dashboard flag.

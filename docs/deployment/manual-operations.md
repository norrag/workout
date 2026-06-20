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
| Enable **leaked-password protection** | Authentication → Policies (Password security) | Phase 7 security pass: checks new passwords against HaveIBeenPwned. The last open Supabase security-advisor WARN that needs a dashboard toggle (the function-grant findings were fixed in migrations `20260620000001/0002`). |

### Vercel (dashboard: project `workout`, team `garron-duprees-projects`)

| Operation | Where | Notes |
|---|---|---|
| Set/edit **Environment Variables** | Project → Settings → Environment Variables | See the env table in [mcp-connector-setup.md](mcp-connector-setup.md). Set for Production **and** Preview. |
| **Git integration** (prod = `main`, preview = PRs) | Project → Settings → Git | Already connected. |
| **Custom domain** | Project → Settings → Domains | Affects the connector endpoint URL + Supabase Site URL. Phase 7 launch step. |
| Set **`SENTRY_DSN`** (observability) | Project → Settings → Environment Variables | Phase 7 observability: required before the Sentry wiring reports. Optional `MCP_RATE_LIMIT` overrides the 120 req/min connector default. |
| Run **Lighthouse PWA** + **a11y** audit | A real device / CI, not the sandbox | Phase 7 performance + accessibility pass (target PWA ≥ 90, logging-flow a11y). |

### Local machine (for `supabase start` / e2e / RLS tests)

| Operation | Notes |
|---|---|
| Run the local Supabase stack | `supabase start`; needed for `npm run test:rls` and Playwright e2e (the sandbox has no local stack). |
| Apply OAuth config locally | Add `[auth.oauth_server]` to `supabase/config.toml` (see connector setup doc). |

### Migration reconciliation — clean-DB apply is broken (security audit 2026-06-20)

The `rls-tests` CI job (and any fresh `supabase db reset`) **fails to apply the
migrations**, which means the RLS regression guardrail for hard rule #1 does not
run. Two causes, both needing a human because the safe fix edits **applied**
migrations (hard rule #2) and/or depends on the **hosted** function body that a
Claude session can't read. See [../14-security-audit.md](../14-security-audit.md)
findings 3 & 4.

| Problem | Where | Fix (human) |
|---|---|---|
| `is_admin()` defined before `public.profiles` → `relation "public.profiles" does not exist` aborts the first migration | `supabase/migrations/20260611000001_initial_schema.sql` | Move the `is_admin()` `create` to **after** `create table public.profiles` (or wrap so its body isn't validated early). End-state is identical; the hosted DB already has it, so hosted is unaffected. |
| `rls_auto_enable()` is `revoke`d but never `CREATE`d in any migration (lives only in the hosted DB — out-of-band, rule-#2 violation) | `supabase/migrations/20260620000001_*`, `20260620000002_*` | Capture the hosted function in a committed migration **before** `0620` with `SECURITY DEFINER … SET search_path = ''`, **or** drop the dangling `revoke` lines if the function is abandoned. Reconcile hosted ↔ version control. |

Until reconciled, `npm run test:rls` cannot pass in CI or locally.

### ~~Apply `20260620000006_exercise_param_overrides` to hosted (doc 14 phase 3)~~ — DONE 2026-06-20

The phase-3 migration that creates `public.exercise_param_overrides` is now
**applied to the hosted DB** (migration version `20260620230102`). Verified live:
table present with RLS enabled, all six columns `not null`, owner-only `ALL` policy
`user_id = auth.uid()` (both `using`/`with check`), the `unique (user_id,
exercise_id)` constraint, and the `user_exercise_idx` lookup index. The app's
override reads (`getExerciseParamOverrides` / `getExerciseIncrementOverride`,
called on the workout/generation/exercise paths) resolve against it; no action
remains.

---

## How Claude flags these

In PRs and PROGRESS entries, remaining human steps are listed under a
**"Remaining / external"** heading with exact values. Cross-check this file if a
deploy or feature "doesn't work" despite green CI — it's usually an unset env
var or an un-toggled dashboard flag.

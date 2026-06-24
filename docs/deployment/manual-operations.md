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

### Apply `20260620000006_exercise_param_overrides` to hosted (doc 14 phase 3)

The phase-3 migration that creates `public.exercise_param_overrides` was **not
applied to the hosted DB from the Claude session that wrote it** (the remote
`apply_migration` was blocked as an unauthorized production action). The app's
override reads (`getExerciseParamOverrides` / `getExerciseIncrementOverride`,
called on the workout/generation/exercise paths) query this table, so they will
**error until the table exists on hosted**.

| Operation | Notes |
|---|---|
| Apply the override-table migration to hosted | Run `supabase/migrations/20260620000006_exercise_param_overrides.sql` against the hosted project (CLI `supabase db push`, dashboard SQL editor, or MCP `apply_migration`). Additive (new table + owner-only RLS + index + `set_updated_at` trigger); no existing data touched. |

### Apply + activate engine_params **v11** (standalone-prescription fixes)

`20260624000002_engine_params_v11_standalone_fixes.sql` ships v11 **inactive** —
it changes the live prescription calculator and grading (S1 anchor seed, S3 e1RM
cutoff + low-confidence down-weighting, S5 rep-consistent hold + require-both
dampener; see `docs/reviews/2026-06-23-standalone-prescription-investigation.md`).
Per the investigation's gating rule, **do not auto-activate**: review a replay
diff first. The migration itself is safe to apply (it only inserts an inactive
row; v10 stays active).

| Operation | Notes |
|---|---|
| Apply the v11 migration to hosted | Inserts engine_params v11 with `is_active = false`. Additive; v10 remains the active row, so nothing changes for users yet. |
| **Replay before activating** | Run admin MCP `replay_decisions` / `simulate_prescriptions` for **v11** on Madeline (`0af27789-…`) + a couple of other users; confirm week-1 seeds land in the 6–15 window, e1RM anchors are tamed (no ~555 leg-curl), and gated holds read as honest `weight × reps @ RIR` triples (doc 13 §6). |
| **Activate v11** | After the diff looks right: `update public.engine_params set is_active = false where is_active = true; update public.engine_params set is_active = true where version = 11;` (single-active invariant). Open prescriptions then refresh lazily through the read-path freshness reconcile — no data rewrite, logged history untouched (hard rule #5). Roll back by re-activating v10. |

### Activate engine_params **v12** (rep-window round 2)

`20260624000004_engine_params_v12_rep_window_round2.sql` ships v12 **inactive** —
two more rep-window changes to the live calculator: `climb_on_performed_reps` (the
rep-climb advances on performed reps, not the prescription) and
`bound_to_target_window` (prefer the loadable step that lands in 8–12 instead of
running reps to 13–15). Same discipline as v11.

| Operation | Notes |
|---|---|
| Apply v12 migration to hosted | Inserts engine_params v12 `is_active = false`. v11 stays active; nothing changes for users yet. (Already applied via MCP on 2026-06-24.) |
| **Replay before activating** | `replay_decisions` for v12 on Garron + a couple of users; confirm a prescribed-but-missed top rep no longer bumps the load, and rows like the High Row land `55×10` instead of `50×14` while true coarse-step buffers (e.g. a 5 lb machine step that would undershoot) still run to 13–15. |
| **Activate v12** | After the diff: `update public.engine_params set is_active = false where is_active = true; update public.engine_params set is_active = true where version = 12;`. Open prescriptions refresh lazily on next view; roll back by re-activating v11. |

> The `workout_exercises.params_version` stamp (migration `20260624000003`) is **not**
> gated — it's a legibility fix and applies with the deploy. After v12 activates, a
> planned row's `params_version` advances to 12 on its next reconcile (one-time
> catch-up), so "accurate as of Vx" stays truthful without a new decision row.

---

## How Claude flags these

In PRs and PROGRESS entries, remaining human steps are listed under a
**"Remaining / external"** heading with exact values. Cross-check this file if a
deploy or feature "doesn't work" despite green CI — it's usually an unset env
var or an un-toggled dashboard flag.

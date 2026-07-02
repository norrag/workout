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
| Set **`SENTRY_DSN`** (observability) | Project → Settings → Environment Variables | Phase 7 observability (R20, wired 2026-07-02): the app-side wiring is live — every reported error already lands in Vercel function logs as a structured `[report:*]` line; setting the DSN additionally ships each one to Sentry (no SDK — direct envelope delivery). Malformed/unset DSN safely degrades to console-only. Optional `MCP_RATE_LIMIT` overrides the 120 req/min connector default. |
| Run **Lighthouse PWA** + **a11y** audit | A real device / CI, not the sandbox | Phase 7 performance + accessibility pass (target PWA ≥ 90, logging-flow a11y). |

### Local machine (for `supabase start` / e2e / RLS tests)

| Operation | Notes |
|---|---|
| Run the local Supabase stack | `supabase start`; needed for `npm run test:rls` and Playwright e2e (the sandbox has no local stack). |
| Apply OAuth config locally | Add `[auth.oauth_server]` to `supabase/config.toml` (see connector setup doc). |

### ~~Migration reconciliation — clean-DB apply is broken~~ (RESOLVED 2026-07-01, R2)

No longer a manual step — the premise ("a Claude session can't read the hosted
function body") stopped holding once the Supabase MCP could run read-only SQL.
Fixed in-repo: `is_admin()` reordered after `public.profiles` in the initial
migration (end-state identical; deviation recorded in `docs/PROGRESS.md`), the
hosted `rls_auto_enable()` + `ensure_rls` event trigger captured verbatim as
`20260619000002_rls_auto_enable.sql`, and the seed-order dependency fixed by
`20260611000002_seed_muscle_groups.sql`. The full chain + seed is verified to
apply to a clean database. Remaining human step: **make the CI checks
required** (next section).

### Make the CI jobs required status checks (GitHub repo settings)

CI is only a guardrail if red blocks the merge — PRs #92/#93 merged over a
permanently-red `rls-tests`. GitHub MCP is scoped to repo *contents*, not
settings, so a human must toggle branch protection:

| Operation | Where | Notes |
|---|---|---|
| Require `checks` + `rls-tests` to pass before merging into `main` | Repo → Settings → Branches → add branch protection rule for `main` (or Settings → Rules → Rulesets) → "Require status checks to pass" → select **`checks`** and **`rls-tests`** | Do this only after the R2 PR is merged and both jobs are green on `main`, otherwise every PR is instantly blocked. |

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

### Apply + activate engine_params **v14** (retire the prior-peak meso seed — T-I5)

`20260625000001_engine_params_v14_retire_prior_peak_seed.sql` ships v14 **inactive**.
It sets `retire_prior_peak_seed = true`: the legacy `priorPeak × meso_seed_backoff_pct`
seed (which fabricated week 1 from a never-performed per-column-max set and carried
its rep count verbatim) is **skipped**. New seed precedence = confident anchor → the
user's plan `initial_*` → **unseeded** (null weight, the user is prompted to enter a
starting weight). Otherwise byte-identical to v12. Same gating discipline as v11/v12.

> A throwaway **v13** "deload tuning" row exists in the hosted DB only (no migration,
> owner-flagged as a test). It is unrelated; v14 is the next real version. Leave v13
> alone or delete it — `on conflict do nothing` means the v14 migration ignores it.

| Operation | Notes |
|---|---|
| Apply the v14 migration to hosted | Inserts engine_params v14 with `is_active = false`. Additive; v12 remains active, so nothing changes for users yet. (Not yet applied — feature branch.) |
| **Replay before activating** | Run admin MCP `replay_decisions` for **v14** on users with standalone back-to-back mesos (e.g. Madeline `0af27789-…`) + a couple of others. Confirm: seeds with a confident anchor are unchanged (anchor path); seeds that previously fell to the prior-peak branch now either use the user's plan `initial_*` or come back **unseeded** (null weight) — and that an unseeded slot reads sensibly in the UI (prompt to enter a starting weight), not as a crash or a 0. |
| **Activate v14** | After the diff looks right: `update public.engine_params set is_active = false where is_active = true; update public.engine_params set is_active = true where version = 14;` (single-active invariant). Open prescriptions refresh lazily through the read-path freshness reconcile — no data rewrite, logged history untouched (hard rule #5). Roll back by re-activating v12. |

> **UI follow-up (not in this slice):** activation makes "unseeded" (null weight) a
> live state for cold-start exercises with no confident anchor and no plan seed.
> Verify the planner/day view renders a null prescribed weight as a "needs a starting
> weight" prompt rather than blank/0 before activating for real users. This is the
> manual-seed deferral the owner asked for; the engine now produces it, the surface
> should invite it.

### Apply + activate engine_params **v15** (anchor-based deload)

`20260625000003_engine_params_v15_anchor_deload.sql` ships v15 **inactive**, paired
with `20260625000002_widen_target_rir_for_deload.sql` (widens the `target_rir` CHECK
on `microcycles` / `workout_exercises` from `0–5` to `0–8`). v15 sets
`deload_anchor_rir = true` and `deload.target_rir = 6`: the deload now selects its
load from the strength anchor to land window-centered reps (≈10) at the deload RIR —
the same rep-window model a working week uses — so the prescription is internally
consistent and the live predictor agrees, replacing the legacy `load_pct`-of-peak
heuristic (which carried the peak reps and stated a fixed RIR the load contradicted).
Otherwise byte-identical to v14. Same gating discipline as v11/v12/v14.

| Operation | Notes |
|---|---|
| Apply both migrations to hosted | First `20260625000002` (widen CHECK — must precede any 6-RIR write), then `20260625000003` (insert engine_params v15, `is_active = false`). Additive; the active row is unchanged, so nothing changes for users yet. (Not yet applied — feature branch.) |
| **Replay before activating** | Run admin MCP `replay_decisions` / `simulate_prescriptions` for **v15** on a user with a logged deload (e.g. Garron's "June '25 - Bulk" W5 deload) + a couple of others. Confirm the deload load comes off the anchor (lighter than the working-week load, reduced sets), the prescribed reps land ~8–12, and the prescribed `weight × reps @ 6 RIR` triple is self-consistent — `impliedRirAtReps == 6` — so the day-view logging field shows the same reps as the prescription (no ~32 explosion). |
| **Activate v15** | After the diff looks right: `update public.engine_params set is_active = false where is_active = true; update public.engine_params set is_active = true where version = 15;` (single-active invariant). Open prescriptions refresh lazily through the read-path freshness reconcile — no data rewrite, logged history untouched (hard rule #5). Roll back by re-activating the prior version. |

> **No UI follow-up needed on activation (handled in this slice).** The deload RIR
> now propagates automatically: `reconcilePrescriptions` live-resolves each *unlogged*
> week's `target_rir` from the active params' ramp on every read (`liveWeekRirUpdates`),
> so on the first day-view load after activation an existing meso's still-planned
> deload week is refreshed 4→6 and its prescription recomputes at the anchor-based
> 6-RIR form. Started/logged weeks are never touched (hard rule #5). The
> ungenerated-deload-week RIR previews in `cycles/meso/[mesoId]/page.tsx` and
> `.../planned/[week]/[day]/page.tsx` now source the deload RIR from the active
> engine_params too, so they preview 6 the moment v15 is active.

---

## How Claude flags these

In PRs and PROGRESS entries, remaining human steps are listed under a
**"Remaining / external"** heading with exact values. Cross-check this file if a
deploy or feature "doesn't work" despite green CI — it's usually an unset env
var or an un-toggled dashboard flag.

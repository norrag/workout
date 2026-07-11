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
| Set **`MCP_JWT_AUDIENCE`** (connector audience binding) | Project → Settings → Environment Variables | R25 (security audit doc 14 §audience): the audience check is **opt-in** — until this var is set, ANY user JWT the Supabase project issues (for any purpose) is a valid `/api/mcp` bearer, not just tokens minted for the connector. Steps: (1) complete one connector OAuth handshake, (2) decode the issued access token's `aud` claim, (3) set `MCP_JWT_AUDIENCE` to that value (Production **and** Preview), (4) redeploy + re-run the connector test in [mcp-connector-setup.md](mcp-connector-setup.md). If the `aud` turns out to be the generic `authenticated`, binding adds nothing — note that finding here and close the item. |
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

> **Drift fully closed (2026-07-02, T-R2):** the last out-of-band hosted
> migration (`20260620115322_perf_rls_initplan_and_fk_indexes` — initplan
> policy wraps + 23 FK indexes) is now transcribed verbatim into the repo
> chain; clean-DB end state is hash-identical to hosted on all public
> policies and indexes. No hosted action was needed (its version row already
> exists there).

### Make the CI jobs required status checks (GitHub repo settings)

CI is only a guardrail if red blocks the merge — PRs #92/#93 merged over a
permanently-red `rls-tests`. GitHub MCP is scoped to repo *contents*, not
settings, so a human must toggle branch protection:

| Operation | Where | Notes |
|---|---|---|
| Require `checks` + `rls-tests` to pass before merging into `main` | Repo → Settings → Branches → add branch protection rule for `main` (or Settings → Rules → Rulesets) → "Require status checks to pass" → select **`checks`** and **`rls-tests`** | Do this only after the R2 PR is merged and both jobs are green on `main`, otherwise every PR is instantly blocked. |

### Restore GitHub Actions runners (billing / spending limit)

First seen 2026-07-10 ~20:58 UTC (runs #431–#433): **every job in every run
fails within ~5 seconds with no logs and `runner_id: 0`** — no runner is ever
assigned, so nothing (not even checkout) executes. That signature is an
account-level Actions condition, not a code failure. This is a **private**
repo, so all three CI jobs bill against the account's included Actions minutes;
the usual cause is the monthly included-minutes quota being exhausted (or a $0
spending limit blocking overage).

| Operation | Where | Notes |
|---|---|---|
| Check Actions usage / raise the spending limit | Personal Settings → Billing and plans → Plans and usage → Actions; spending limit under Billing → Spending limits → Actions | If included minutes are exhausted, either raise the Actions spending limit or wait for the monthly reset. Also check https://www.githubstatus.com in case it's a platform incident. |
| Re-run the dead runs once restored | Each run page → "Re-run all jobs" (or push any commit) | Runs that failed with the no-runner signature never executed — re-running is safe and is the only way to get a real verdict on those commits. |

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

### ~~Apply + activate engine_params **v19** (R24 hold-week reprice-down)~~ (DONE 2026-07-05)

> Completed from a Claude session 2026-07-05: both `20260705000001` (v19
> insert, hash verified) and `20260705000002` (`rir_schedule`) applied to
> hosted via the Supabase MCP; `replay_decisions` for v19 over the v18-sourced
> decisions came back **0 changed / 0 errors** (all 26 v18 decisions are
> week-1 seeds — the v19 gates live in the advance path, which the goldens
> pin); activated via the admin MCP `activate_engine_params` (the hook-bearing
> path — e1RM restamp correctly reported "e1rm block unchanged"). v18 remains
> the rollback target. Original steps kept below for the record.


`20260705000001_engine_params_v19_hold_week.sql` ships v19 **inactive** — two
`.optional()` gates over v18: `climb_requires_rir_step` (the Option-A +1 rep
climb advances only on a week the target RIR actually stepped; the
top-of-window reset stays unconditional) and `hold_week_anchor_deadband` (a
pure hold absorbs an anchor-decay shortfall under one loadable step; a
full-step fall passes through). Fixes the mid-meso "−5 lb, +1 rep" lateral
move on ramp-hold weeks and the week-N+1 hold pricing under week N's — most
visible on cut/maintain blocks.

| Step | What / why |
|---|---|
| Apply the v19 migration to hosted | Inserts engine_params v19 with `is_active = false`. Additive; the active row is unchanged, so nothing changes for users yet. |
| **Replay before activating** | Run admin MCP `replay_decisions` / `simulate_prescriptions` for **v19**. Expect diffs ONLY on ramp-hold weeks (e.g. the default 3→2→2→1 ramp's week 2→3): held `weight × reps` where the legacy path emitted a lighter load at +1 rep. Stepped weeks, top-outs, deloads, and seeds must be byte-identical. |
| **Activate v19** | After the diff looks right: `update public.engine_params set is_active = false where is_active = true; update public.engine_params set is_active = true where version = 19;` (single-active invariant). Open prescriptions refresh lazily through the read-path freshness reconcile — no data rewrite, logged history untouched (hard rule #5). Roll back by re-activating v18. |

### Activate engine_params **v20** (prescribed progression — doc 16 Phase R)

`20260709000001_engine_params_v20_prescribed_progression.sql` ships v20
**inactive**. It adds one `.optional()` `progression` block over v19 —
**earned-step overload** (`mode: "earned_step"`): the engine leads the
prescribed demand by one earned quantum off the *measured* anchor
(`A* = A + δ`), earned by full previous-session compliance in e1RM space,
metered by the governors (cadence / macro-rate pacer / miss throttle /
peak-week skip), capped on the realized ask, and always disclosed by a
status-coded `progression` trace step. The measured e1RM pipeline is untouched
(T-I5) — performing the led prescription is what raises the measurement. This
is the **owner-gated activation** for the whole doc-16 build-out (Phases 1–4
already merged, PRs #158–#161). Full mechanism: `docs/16-prescribed-progression.md`.

> **Applied to hosted 2026-07-09** via the Supabase MCP (`apply_migration`),
> hash-verified (`cb451a02…c90287`, matches `params-provenance.test.ts`); v19
> remains the active row, so nothing changed for users. The migration is in the
> repo chain. Only the **activation** below is outstanding.

| Step | What / why |
|---|---|
| **① Research pass on `goal_rate_factor.hypertrophy`** (activation gate, doc 16 §10) | **DONE 2026-07-09** — `docs/reviews/2026-07-09-goal-rate-factor-research.md`. Finding: **keep 0.75** (moderate-load 1RM conversion runs ~0.56–0.73 of heavy-load; 0.75 is the conservative-for-a-governor top of that band; collapsing to 1.0 is contradicted by Schoenfeld 2016/2017, Lasevicius 2018, Campos 2002). No params edit needed — v20 already carries 0.75. |
| **② Replay diff** | **DONE 2026-07-09** — `replay_decisions` candidate v20 over the caller's recorded decisions. **v19→v20: 15 source decisions, 11 changed, 0 errors** (all diffs on advance/seed working weeks — earned-step reprices up one quantum, e.g. Hack Squat 110→112.5, Bench 125→130, or a +1 rep climb on micro-loadable lifts; a few lattice snaps carry reps to window-bottom). Broader 100-decision replay (v10–v19 sources): 80 unchanged / 20 changed / 0 errors — the 80 unchanged are seeds/deloads/gate-failures (byte-identical, as designed). **This diff is what the owner reviews before activating.** Re-run `simulate_prescriptions` / `replay_decisions` for v20 to reproduce. |
| **③ Owner reviews the diff** | The changed rows are all *earned* steps under compliant history — confirm the magnitude and cadence read right (≈ one quantum per exercise per microcycle; hypertrophy paced to 75% of the strength band). |
| **④ Activate v20** | `update public.engine_params set is_active = false where is_active = true; update public.engine_params set is_active = true where version = 20;` (single-active invariant). **Prefer the admin MCP `activate_engine_params`** (the hook-bearing path — reports the e1RM-restamp status; here it will report "e1rm block unchanged" since v20 doesn't touch the e1RM block). Open prescriptions refresh lazily through the read-path freshness reconcile — no data rewrite, logged history untouched (hard rule #5). Roll back by re-activating v19. |
| **⑤ Monitor** | After activation, watch `get_engine_decisions` (rule `progression`, filter by status: `stepped` / `vanished` / `paced` / `not_earned`) and the `get_progression_history` audit aggregate (doc 16 §8.3): earn/miss/skip mix, `vanished` share (→ increment-sizing signal, doc 10 §8), governor firings. This field data also unblocks the envelope loop + the `goal_rate_factor` revisit. |

> **Recommended alongside (doc 16 §10 Phase R):** doc 10 §8 finer per-class
> increments, **or** document the existing per-exercise increment override
> (`set_exercise_increment` MCP / exercise page) as the isolation-lift path for
> the `vanished`-heavy coarse lifts the monitor surfaces.

> **Blocks nothing user-facing when off; unblocks the deferred work when on.**
> The `rate_source: "plan"` flip and the envelope loop (doc 16 §11) both need
> v20 **active** + a few mesos of field data. See
> `docs/reviews/2026-07-09-n21-strength-rate-priming.md` for the N21 → plan-rate
> → envelope sequencing.

### Activate engine_params **v21** (macro-target correction — doc 17 Phase R2)

`20260710000002_engine_params_v21_macro_target.sql` ships v21 **inactive**. It
adds three `.optional()` params inside `macro_target` over v20 — the doc 17 §2
target-engine correction (N21): `strength_sex_factor` {1.0, 1.0} +
`age_taper_floor_strength` 0.7 (the strength band personalizes by sex/age like
the hypertrophy path already does) and `bf_proxy_pct` (hypertrophy continuity —
the FFMI proximity model runs on a BMI-band bf% proxy instead of flipping to
the training-age decay when only bf% is missing). The §2.3 cut-band
proportional rescale and the `MacroPlan.strengthRatePctMonth` exposure are
parameterless code that ships with the same PR. Sequenced **after R1 (v20
activation)** in doc 17 §8, but independent of it mechanically.

> **Applied to hosted 2026-07-11** (doc-17 Phase-4 session) via the Supabase
> MCP (`apply_migration`): `20260710000001` and `20260710000002`. Found MISSING
> during the Phase-4 session — main's merged Phase-1 code already writes
> `plan_inputs`/`birthdate`, so hosted macro create/goals-edit and birthdate
> saves were failing until this apply. v21 content verified structurally
> against the hosted (hash-verified) v20 row + the documented three-param
> delta: `v21 = v20 + {strength_sex_factor, age_taper_floor_strength,
> bf_proxy_pct}` ⇒ true; `is_active = false`, active row still v20. The
> Phase-4 migration `20260711000001` (bodyweight_log + v_macro_summary span
> columns) was applied the same way (advisor-clean after an initplan
> `alter policy` that is also reflected in the repo file). Only the steps
> below remain.

| Step | What / why |
|---|---|
| ~~Apply the Phase-1 migrations to hosted~~ | **DONE 2026-07-11** (see note above). |
| **Replay diff** | `replay_decisions` / `simulate_prescriptions` candidate v21. Targets are display/pacer layer — **the diff on prescriptions is expected ≈ empty; assert that** (v20's `rate_source` is `"band"` and reads the raw bucket table, so even the pacer is untouched until the v22 `"plan"` flip). |
| **Owner reviews + activates v21** | Prefer the admin MCP `activate_engine_params` (will report "e1rm block unchanged"). What changes on activation: macro create/edit targets + recommended durations personalize (strength taper for 40+, hypertrophy continuity, non-collapsing long-cut bands). Roll back by re-activating the prior row. |
| **Re-enable the target cards** | After activation: a small code PR transcribing figs 2.2/2.3 per hard rule 8 (PR #140 made the hide a pure view change). |
| **Owner re-saves the profile birthdate** | The profile page now carries BIRTHDATE (fig 4.5 amendment, 09-changelog 2026-07-10); the legacy static `age` int stays the fallback until re-saved. One-time, no backfill (single-user deployment). |

### Flip `rate_source` to **"plan"** (v22 micro-bump — doc 17 Phase R3)

The doc 17 §3 / Phase 2 code (N37) ships the pacer's `"plan"` branch fully
plumbed but **unflipped**: every params row still carries
`progression.rate_source: "band"`, so behavior is byte-identical until this
step. The flip swaps the pacer's source band from the bucket table
(`macro_target.strength_pct_month[bucket]`) to the profile-personalized
`planMacrocycle` strength band (the recorded `planStrengthRate` derived input);
`band_position` and `goal_rate_factor` compose identically under either source,
and a decision with no plan rate assembled degrades to the band — never
unpaced. Sequenced **after R1 (v20 active) and R2 (v21 active)** in doc 17 §8:
the pacer only runs while the progression block is active, and the plan rate is
only worth flipping to once v21's personalization is live.

| Step | What / why |
|---|---|
| **① Propose v22** | Admin MCP `propose_engine_params`: v21's content with the single change `progression.rate_source: "plan"` (a micro-bump — no other knob moves). |
| **② Replay diff** | `replay_decisions` candidate v22 over recorded decisions. Expected shape: the **paced/stepped mix shifts** on earned working weeks (decisions that recorded a `planStrengthRate` re-judge the trailing rate against the personalized band instead of the bucket band); **no entitlement change** — the earn gate, quantum δ, and anchor arithmetic are untouched, so any diff is a step *deferred or released*, never resized. Decisions recorded before Phase 2 carry no plan rate and must replay byte-identically (band fallback). |
| **③ Owner reviews + activates** | Confirm the shifted mix reads right (a lifter whose personalized band sits below the bucket band gets paced sooner; above, later). Activate via `activate_engine_params`; roll back by re-activating v21. |
| **④ Monitor** | `get_progression_history` (earn/paced mix, `rate_pacer` firings) — the same instruments as the v20 monitor row; this field data also feeds the Phase-6 envelope fit. |

### BodySpec: register the OAuth clients + first-login verification (doc 15 §8, doc 17 Phase 5a)

The Phase-5a build (N34 — connect + import) ships fully coded but inert until
each environment has its own self-registered BodySpec OAuth client (doc 15
§8.1: anonymous OIDC dynamic client registration — no BodySpec contact or
approval involved). Until `BODYSPEC_CLIENT_ID` is set, the More → BodySpec
screen shows `NOT AVAILABLE IN THIS ENVIRONMENT` and nothing else changes.

| Step | What / why |
|---|---|
| **① Register a client per environment** | On a local machine: `npx tsx scripts/register-bodyspec-client.ts http://localhost:3000` (dev) and `npx tsx scripts/register-bodyspec-client.ts https://workout-zeta-murex.vercel.app` (prod — use the custom domain instead if/when one lands). Each registration is independent; the redirect URI is pinned to `<origin>/api/integrations/bodyspec/callback` and must match the environment byte-for-byte. |
| **② Persist the `registration_access_token`** | The script prints it once. Store it in the env secret store (e.g. Vercel env var `BODYSPEC_REGISTRATION_TOKEN`, unused at runtime, or the household password manager) and note the `client_id` + registration date **here**. It is the ONLY credential that can later update or delete that client — lost token = the client can only be abandoned (doc 15 §8.1). |
| **③ Set `BODYSPEC_CLIENT_ID`** | Vercel → Settings → Environment Variables (Production; Preview optional — preview aliases rotate and are not registered redirect URIs) and local `.env.local`. Server-only — deliberately NOT `NEXT_PUBLIC_*`. |
| **④ Local dev only: `NEXT_PUBLIC_APP_URL`** | Must be `http://localhost:3000` locally so the app derives the localhost redirect URI that was registered in ①. |
| **⑤ Apply migration `20260711000002` to hosted** | `bodyspec_connect` — `external_connections` + deny-all `external_connection_secrets` + `body_scans`. Additive (three new tables, RLS from birth); apply via Supabase MCP `apply_migration` or `supabase db push` at/after merge. |
| **⑥ First login = the §8.3 verification** | More → BodySpec DEXA → CONNECT. The callback runs `GET /api/v1/users/me` with the fresh token **before persisting anything**. Success ⇒ the §8.3 `ext_api_token` audience residual is cleared — record that in doc 15 §8.3 and this row is done. Failure shows "rejected the app's access token" (`?error=api_denied`) ⇒ the residual is real: email `dev-support@bodyspec.com` with the concrete question (self-registered PKCE client, `openid profile email offline_access`, API returns 401/403 on `/users/me` — what grants the API audience?), per doc 15 §8.3's fallback. |

> Registration itself is deliberately left to a human even though the sandbox
> could reach the endpoint: the response contains the one-shot
> `registration_access_token`, which must land directly in a secret store —
> not in a session transcript or CI log.

---

## How Claude flags these

In PRs and PROGRESS entries, remaining human steps are listed under a
**"Remaining / external"** heading with exact values. Cross-check this file if a
deploy or feature "doesn't work" despite green CI — it's usually an unset env
var or an un-toggled dashboard flag.

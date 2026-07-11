# Notes-area log

Append a dated entry whenever a session moves work. Newest first.
(Formerly "Triage log" — the area was rebranded to an ongoing notes system on
2026-06-26; see the entry below.)

## 2026-07-11 — Session 71 (cont.): Batch-16 intake — N43, the strength band's calendar-bucket defect

Immediately after the R2/R3 activations the owner reviewed the flip's
consequences and raised a design inconsistency: the strength band buckets by
calendar training years (12.7 y → advanced 0.5–1.5 %/mo) while the
hypertrophy path prices FFMI proximity (owner's developed fraction ≈ 0 →
novice-rate lean-mass projection) — the same calendar-vs-body-comp defect
N21 fixed on the hypertrophy side, now **metering the pacer** since the R3
flip. Filed as **N43** (D, HIGH, WS C, needs-input): research pass →
proximity-derived strength band (v23); interim keep-v22 vs roll-back-v21
decision framed in-row. Verbatim in Batch 16. N36 unaffected (envelope is
source-agnostic). Committed to the open PR #178 branch.

## 2026-07-11 — Session 71: Phase R2 + R3 executed (v21 + v22 active), target cards return

Owner-directed activation session on the doc-17 spine (branch
`claude/macro-goals-r2-r3-envelope-ntaw6h`, **PR #178**). No new intake.

- **R2 (v21):** replay evidence gathered exactly as the runbook demanded
  (0/20 changed on v20 sources; v21 ≡ v20 diff sets on 100 mixed sources) +
  a pure-engine target-band review (owner profile byte-identical; §2.1/§2.2
  corrections verified on sample profiles) → activated via
  `activate_engine_params`. Target cards re-enabled in this PR (figs 2.2/2.3;
  est-strength nouns per doc 17 §2.5; priming model-band half joins). N21's
  archived row gains the activation postscript.
- **R3 (v22):** proposed via `propose_engine_params` (base v21 +
  `rate_source: "plan"`), replay byte-identical (0/20 + no v22-specific diff
  on mixed sources), activated. Key forward-looking fact recorded in the
  runbook: owner's pacer target drops ≈ 1.69 → 0.75 %/mo (self-reported
  intermediate bucket → training-years advanced plan band). N37's archived
  row gains the postscript.
- **Envelope (N36):** no code change — confirmed still field-data-gated
  (v20/v22 progression decisions span < 1 day; the fit needs ≥ 2–3 real
  completed mesos). Explained to the owner in-session (why the fit data
  isn't backfillable: pre-v20 history contains no engine-led asks, so no
  earn/miss/governor outcomes exist to fit thresholds against).
- Human steps remaining: birthdate re-save (non-binding until 40); the
  envelope fit clock runs on training time.

## 2026-07-11 — Session 70: N36 envelope loop — mechanism built, shipped OFF (doc 17 Phase 6)

Owner kicked off doc 17 Phase 6. Reconciliation sweep first: no stale `done`
rows (N34 stays live on its human residual, correctly). Session finding that
reshaped the plan: **v20 is now ACTIVE on hosted** (verified via
`get_engine_params`; `get_progression_history` already records live decisions
— ~20 across 19 exercises, span < 1 day) — so Phase 6's R1 gate is cleared,
but the field data is nowhere near the "few real mesos" the threshold fit
needs. Scope split accordingly, per §7's own language: **build the whole
mechanism now, ship it OFF; the fit + params bump + activation stay
field-data-gated** (new runbook section). Branch
`claude/macrocycle-goals-phase-6-k6kxf1` (**PR #177**).

- Engine: `rules/envelope.ts` pure fold (completed-meso boundary steps,
  `MAX_BOUNDARY_STEP 0.25` binding, dwell, clamp [0,1], bounded lookback as
  the return-from-absence decay; demand-side inputs only; down wins over up;
  raises require real up-pressure — pacer trips or beat share);
  `progression.envelope` `.optional()` params block (PROVISIONAL thresholds,
  absent everywhere ⇒ byte-identical); `EngineInputs.bandPosition` derived
  input; the pacer lerps `inputs.bandPosition ?? params.band_position`
  under either rate source; `seedMeso` threads it through the shared gate.
- Queries: `queries/envelope.ts` leaf assembly (decisions → completed-meso
  outcomes via the §8.3 fold per exercise + `setComplianceMarker` beat
  share → position), wired at the `planStrengthRate` sites (activation
  seed, advance, projection); doc-14 treatment (denylist + recorded +
  replays frozen through `recomputeRow` and `replay_decisions`).
- Tests +27 (suite 1089): loop-off byte-identity, movement/dwell/clamp +
  floor/top-pin goldens, fingerprint invariance, boundary selection, replay
  determinism, source-agnostic pacer composition. Lint + typecheck clean.
- Docs: PROGRESS entry; runbook "Fit + activate the envelope loop" + the
  v20 section stamped ACTIVATED (verified); this row + N36 updated.

Doc 17 Phases 1–6 are now all built. Next on this spine: owner-side only
(R2 v21 activation, R3 plan flip, the envelope fit once field data exists).

## 2026-07-11 — Session 69: N34 Phase 5c — engine + MCP, and the profile body-fat rework

Doc 17 §6 Phase 5c (the last DEXA build PR), plus an owner note pinned to
the same PR: after a scan's proposal updated the profile, the profile still
rendered the estimate bands with a stale band lit; the band increments
(10/14/18/23/29) read as arbitrary; and there was no between-band entry.
Branch `claude/macrocycle-phase-5c-dexa-4hyegu` (**PR #176**).

- **Engine path (no engine change, by design):** measured bf% rides the
  existing `bodyFatPct` profile input (doc 15 §3.1) — the 5b apply already
  writes the profile, so `planMacrocycle` was consuming measured values the
  moment they were accepted. Pinned with a mapping-equality test
  (dexa-sourced ≡ same-value estimate). Passing measured FFM directly stays
  the noted later refinement.
- **Provenance (migration `20260711000005`):** `profiles.body_fat_source`
  (`'estimate'` | `'dexa'`, null legacy) — the scan APPLY stamps `'dexa'`,
  the picker/custom entry stamps `'estimate'`, clearing nulls it. Covered by
  the existing column-agnostic owner RLS (birthdate-migration shape).
- **Profile control rework (owner note; 09 2026-07-11 Phase-5c entry §§1–2):**
  bands normalized to even 5-pt steps (~10…~30, 35%+), exact-match
  highlight (no more fuzzy ±2.5 lighting), full-width CUSTOM VALUE chip →
  bottom-sheet numeric entry (2–70) rendering as `CUSTOM — 17.5%` when a
  non-band value holds; while provenance is `'dexa'` AND the BodySpec
  connection exists, the picker gives way to a measured panel (value +
  `SCAN <date>` from the newest applied scan, derived on read) with
  OVERRIDE WITH AN ESTIMATE; disconnecting reverts to the picker, the value
  stays until edited.
- **RMR context (doc 15 §3.4; 09 entry §3):** MEASURED RMR section on cut/
  hypertrophy macro Overviews from the newest scan's Cunningham (FFM-based)
  estimate — display-only, prescriptions/targets never read it, Mifflin
  never shown as "measured".
- **MCP (doc 17 5c; 09 entry §4):** `get_body_composition` over
  `v_body_comp_history` (shared-view rule) with deltas + same-scanner
  comparability + LSC within-noise flags computed from the one constant set
  (`queries/body-comp.ts`), newest-scan RMR, and the doc 15 §6 guardrails
  shipped as a `measurement_guardrails` data block; `get_profile` now
  reports `body_fat_source`. Doc 05 tool table updated.
- Suite green (1062), typecheck + lint clean. Docs: 09 Phase-5c entry,
  doc 15 §5 row-3 build note, doc 05 table, this row + PROGRESS.md.
- N34 build-out is complete (5a/5b/5c + field fix); the row stays live for
  the one human residual — the owner's first real connect recording the
  §8.3 outcome in doc 15.

## 2026-07-11 — Session 68: N34 field fix — cookie-free connect round trip (+ prod migration catch-up)

Owner reported two things from first real use: the More tab erroring, and
the first real BodySpec connect dying at Keycloak's "Cookie not found" from
the installed PWA (screenshot; login + consent had succeeded). Branch
`claude/macrocycle-phase-5b-migrations-1jagpf` (**PR #175**); migration
`20260711000004`.

- **Prod catch-up first (the More tab):** the 5a/5b PRs had merged but
  their migrations were never applied to the live project. Diffed
  `supabase/migrations/` against the live ledger — everything through
  `20260711000001_bodyweight_log` was applied; applied `20260711000002`
  (connect tables) + `20260711000003` (enrich + view) via MCP in order,
  verified tables/view/policies/deny-all, advisors clean. More tab fixed.
- **Root cause of the connect failure (structural, not a fluke):** from a
  home-screen web app the OAuth round trip spans two browsing contexts —
  iOS runs the provider login (and the redirect back) in an in-app browser
  sheet with its own ephemeral cookie jar. The 5a flow carried PKCE
  verifier + state in httpOnly cookies and required the Supabase session at
  the callback: none of the three exist in the sheet. Recorded as doc 15
  §8.5.
- **Fix:** server-side `oauth_transactions` (deny-all; state PK = 256-bit
  single-use credential, 10-min TTL, user id bound at /connect while the
  app context still has the session). The callback consumes it by `state`
  alone — zero cookies — and persists via service-role call sites scoped to
  the transaction's user. Response adapts: initiating user's session
  present → the original redirect + flash; otherwise a house-style
  return-to-app interstitial (09 2026-07-11 entry; shared flash copy in
  `more/bodyspec/flash.ts`) — never a sign-in bounce.
- **Middleware catch (from driving the production build):** the blanket
  signed-out→/sign-in redirect intercepted the session-less callback before
  the handler ran — `/api/integrations/bodyspec` added to the middleware
  public paths (both routes manage their own auth). Verified live: bare
  callback → 400 interstitial, provider-error → interstitial, signed-out
  connect → `/sign-in?redirect=/more/bodyspec`.
- **Tests:** RLS deny-all + single-use-consumption block; suite green
  (1057), typecheck + lint clean. Migration applied + posture verified on
  the live project via MCP.

Doc updates riding along: doc 03 (`oauth_transactions`), doc 15 §8.5,
09-changelog (interstitial), PROGRESS, this log + N34 row.

## 2026-07-11 — Session 67: N34 5b built — doc 17 Phase 5b (BodySpec enrich + view)

Owner kicked off Phase 5b ("implement phase 5b"). Second of the three DEXA
PRs (**#174**, branch `claude/macrocycle-goals-phase-5b-7o486o`);
migration `20260711000003` (`v_body_comp_history` + the `body_scans`
proposal-resolution stamps).

- **Reconciliation sweep first:** no stale `done` rows — N34 correctly
  live (`in-progress — 5a shipped (PR #173)`, merged); nothing to archive.
- **Hard-rule-8 gate:** 09-changelog entry (2026-07-11, Phase-5b section)
  for the four house-style surfaces — proposal card, scan-detail
  `VS PREVIOUS SCAN`, macro-page `BODY COMPOSITION`, retrospective
  composition/mass rows. No mockup figure exists for any; re-verified.
- **The guardrails ship as data, one definition:** `v_body_comp_history`
  (security_invoker; deltas vs previous scan + `same_scanner_as_prev` —
  null on the first scan, false when either model is unknown) and the LSC
  constants (`queries/body-comp.ts`: lean/fat ~2 lb, bf% ±1 pt, quarterly
  60 d). Every consumer inherits doc 15 §6: sub-LSC deltas say `WITHIN
  MEASUREMENT RANGE`, cross-scanner pairs are flagged and never graded.
- **Consented proposal (doc 15 §2.3):** newest unresolved scan only; APPLY
  writes profile bodyweight/bf% + appends `bodyweight_log source:'dexa'`
  (the Phase-4 series' third writer); KEEP CURRENT resolves permanently.
  Pure rule refuses resolved/stale/no-op scans; the action re-runs it
  server-side. Resolution stamps are the only new mutable state.
- **Retrospective + MCP, one fold:** `macroRetrospective` gains the
  informational `composition` block, and the mass verdict gains its DEXA
  fallback (bracketing same-machine scan weights when the bodyweight
  series doesn't bracket; series first when both do).
  `get_macrocycle_summary` returns it snake_cased (parity test).
- **Tests:** +19 unit (suite 1057), +2 RLS blocks (view semantics against
  real Postgres; resolve guard never restamps), e2e extended. The
  pre-existing 5a e2e test fails in this sandbox on unmodified main too
  (Chromium build mismatch; CI has matching browsers) — verified by
  stash-run before shipping.

Doc updates riding along: doc 03 (`body_scans` stamps +
`v_body_comp_history`), doc 15 §5 (Phase-2 row build note), PROGRESS,
this log + N34 row (`in-progress — 5b shipped`).

## 2026-07-11 — Session 66: N34 5a built — doc 17 Phase 5a (BodySpec connect + import)

Owner kicked off Phase 5 ("implement phase 5"). First of the three DEXA PRs
(**#173**, branch `claude/macrocycle-goals-phase-5-2xfwkf`); migration
`20260711000002` (`external_connections` + deny-all
`external_connection_secrets` + `body_scans`).

- **Reconciliation sweep first:** N41 (PR #172) merged → row archived
  ("Swept 2026-07-11 — macro goals Phase 4").
- **Hard-rule-8 gate:** 09-changelog entry (2026-07-11, Phase-5a section)
  for the More settings row, the `/more/bodyspec` integration screen, and
  the scan detail ledger — all house-style, no mockup figure exists.
  Re-verified the live `openapi.json` (still v0.14.3) before writing the
  zod schemas.
- **Connect (doc 15 §8):** PKCE S256 + `offline_access` against the
  Keycloak realm; per-environment self-registered clients
  (`scripts/register-bodyspec-client.ts` — human-run so the one-shot
  `registration_access_token` lands in a secret store, not a transcript;
  runbook section in `manual-operations.md`). The callback runs the §8.3
  first-login verification (`GET /users/me`) BEFORE persisting anything;
  `api_denied` fails the connect with its own copy + runbook pointer.
- **Secrets posture (hard rule 4):** token material in a deny-all table
  (RLS, no policies, client grants revoked) reached only via service-role
  call sites in `queries/external-connections.ts`, always user-scoped;
  refresh rotation there too; dead grant ⇒ row `error` ⇒ RECONNECT.
- **Import:** serial identity-from-token fetchers, full-history backfill,
  zod at the boundary (lenient on unmapped fields), kg→lb / cm→in in
  `convert.ts` only, verbatim `raw` per section, pure `mapScanToImport`
  fold, idempotent upserts on `(user_id, provider, provider_result_id)`;
  results without a composition section skip as non-DEXA.
- **Deliberately NOT in 5a:** deltas/trends/verdicts (5b —
  `v_body_comp_history` + LSC guardrails), `source:'dexa'` bodyweight
  points + profile proposal (5b), engine/MCP (5c). Scans persist through a
  disconnect unless the user opts into the purge (doc 15 §2.3).
- **Tests:** +12 unit (suite 1039: conversion + map goldens off provider
  examples, RFC 7636 vector, schema leniency), +5 RLS blocks (secrets
  deny-all even to the owner; disconnect cascade), e2e integration-screen
  spec. Unit/typecheck/lint/build green locally.

Doc updates riding along: doc 03 (three tables), doc 15 §8.3 (build-status
note — verification outcome pending the owner's first real login),
PROGRESS, this log + N34 row (`in-progress — 5a shipped`).

## 2026-07-11 — Session 65: N41 built — doc 17 Phase 4 (bodyweight series + create-flow priming)

Owner kicked off Phase 4 ("implement phase 4"). One PR (**#172**, branch
`claude/macrocycle-goals-phase-4-flvrc9`); migration `20260711000001`
(`bodyweight_log` + the `v_macro_summary` logged-span columns).

- **Hard-rule-8 gate first:** 09-changelog entry (2026-07-11, Phase-4
  section) for the quick-entry row + sheet (More page settings grammar), the
  "as of" freshness suffix (one vocabulary — the profile editor's `UPDATED`
  reworded to `AS OF`), and the fig-2.3 `LAST BLOCK MEASURED` ledger line.
  Rule-8 pass re-verified: no mockup figure covers any of them.
- **Series (§5):** `bodyweight_log` — owner-only RLS, `source
  ('manual'|'profile'|'dexa')`, unique `(user_id, measured_on, source)`;
  writers append on every profile-bodyweight edit (editor field, day-view BW
  chip via T-I2, onboarding) and from the new quick entry (manual,
  backdatable, same-day replace; **never** writes the profile scalar).
  Reads resolve a day to the latest-entered point across sources.
- **Mass verdict:** `bodyDeltaForSpan` (±14-day bracketing of the
  `v_macro_summary` logged span, distinct-day endpoints) feeds the Phase-3
  `bodyData` seam in `getMacroOverview` — the completed Overview and
  `get_macrocycle_summary` flip from "not measured" to a graded Δbw off one
  fold. Never proxy-graded (principle 6).
- **Priming (§4-carry):** `getPriorBlockMeasuredRate` — the last trained
  completed block's est-strength headline normalized to %/mo
  (`measuredRatePctMonth`, ≥28-day logged-span floor), display-only on the
  create card; never an input to `planMacrocycle` (principle 4). The model-
  band half of the copy waits for Phase R2 (target cards still hidden per
  the N21 ruling). Create-only.
- **Tests:** +12 unit (suite 1027), +4 RLS blocks, e2e quick-entry flow +
  a priming-negative in the closeout spec. Unit/typecheck/lint green
  locally; RLS + e2e ride the CI local stack as usual.

**Hosted repair + deploy:** found the hosted DB **behind merged code** — the
Phase-1 migrations (`20260710000001/2`) were never applied (macro create/
goals-edit and birthdate saves were failing in prod since PR #169 deployed).
Applied both + this phase's `20260711000001` via the Supabase MCP; v21
verified structurally (= hosted v20 + the documented three-param delta),
INACTIVE, active row still v20; bodyweight_log advisor-clean (initplan-wrapped
policy, reflected in the repo file). Runbook R2 row checked off
(`manual-operations.md`); v21 activation itself stays owner-gated.

N41 → done pending merge; N34 Phase 5b's verdict rows now have both the
retrospective seam AND real bodyweight substrate to slot beside.
Reconciliation sweep: **N40 archived** (PR #171 merged; row → `archive.md`,
live index trimmed).

## 2026-07-11 — Session 64: N40 built — doc 17 Phase 3 (macrocycle closeout + retrospective)

Owner kicked off Phase 3 ("implement phase 3"). One PR (**#171**, branch
`claude/macrocycle-goals-phase-3-qvav73`); **no migration** — `completed` was
already in the macro status vocabulary (no code path wrote it), and the
retrospective is derive-on-read per doc 17 principle 5.

- **Hard-rule-8 gate first:** 09-changelog entry (2026-07-11) for the three
  net-new surfaces — the header-⋮ "End macrocycle" + confirm sheet (the
  End-mesocycle dialog's weight, one level up), the completed-Overview
  retrospective card (ledger rows + verdict tags above the unchanged 2×2
  tiles), and the timeline's `NOT BUILT` placeholder treatment. Rule-8 pass
  re-verified: no mockup figure exists for any of them (fig 2.2 shows only
  the live "to date" block); house-style from established primitives.
- **Close transitions (§4.1):** new leaf `queries/macro-close.ts` —
  `macroClosesNaturally` (every real block terminal; `unplanned` placeholders
  aren't open work; all-placeholder macros never self-close) +
  `maybeCompleteMacroAfterMeso`, cascaded from BOTH meso-terminal sites (the
  final-week advance in `queries/progression.ts` and `endMesocycle`);
  `endMacrocycle` (logging.ts, beside its family) drives every open block
  terminal in position order — logged work ⇒ the `endMesocycle` path
  (`completed`, open sets skipped), never started + placeholders ⇒
  `abandoned` — then completes the macro. Irrevocable; logged history never
  touched (hard rule 5).
- **Freeze (§4.1):** `goalsEditRefusal` — a terminal macro refuses goals
  edits (rename/notes stay allowed); `attachMesoToMacro` +
  `manageMacroSlots` refuse placement/slot changes on a terminal macro (the
  spec's "already blocked by position guards" turned out not to exist — added
  them); the timeline's `+ PLAN` affordance and the End row disappear once
  frozen. The edit action surfaces the refusal as a form error.
- **Retrospective (§4.2):** pure `macroRetrospective` fold
  (`queries/macro-retrospective.ts`) — strength verdict = the PR #157
  est-strength rollup vs the **stored contract** (`target_*`, never the live
  recompute), fixed vocabulary (`within band` / `above band` / `below band` /
  `insufficient data` — the latter on a null headline, <
  `strength.min_sessions` qualifying lifts, or a bandless contract);
  informational (never lb-graded) on mass-goal macros; mass row **"not
  measured"** until N41/N34 body data brackets the span (the `bodyData` seam
  is in place, loss-direction grading included); demand aggregate =
  per-exercise `aggregateProgressionEvents` combined by
  `combineDemandSummaries` (earn/paced/held mix, pacer-vs-gate pressure,
  vanished share; null while the mode is inactive); adherence/volume tiles
  restated; block-outcome mix (`DONE · ABANDONED · NOT BUILT`). Assembled in
  `getMacroOverview` once `status = 'completed'`, so the Overview page and
  `get_macrocycle_summary` (new `retrospective` block + `status` field,
  `formatMacroRetrospective`) read **one fold** — parity-tested.
- **Tests** +24 (suite 1015 green): natural-close matrix incl. the mixed
  placeholder fixture, `planEndMacrocycle` matrix, freeze refusals, verdict
  goldens per band position + insufficient-data rules + never-proxy-graded
  mass + the Phase-4/5 bodyData seam, demand-combiner sums, MCP parity
  (values pass through unchanged; the summary block IS the fold). New e2e
  (`macrocycle-closeout.spec.ts`): end-macro flow → COMPLETE badge +
  retrospective renders (INSUFFICIENT DATA + 3 ABANDONED) + affordances gone.

**N40 → done (PR #171).** N41 (Phase 4, bodyweight series) unblocks on merge —
its mass-verdict rows slot into the retrospective's `bodyData` seam; N34 5b
likewise. Reconciliation sweep: **N37 archived** (PR #170 merged; row →
`archive.md`, live index trimmed).

## 2026-07-10 — Session 63: N37 built — doc 17 Phase 2 (`rate_source: "plan"` pacer branch)

Owner kicked off Phase 2 ("implement phase 2"). One PR (**#170**, branch
`claude/macrocycle-goals-phase-2-gncftk`); **no migration, no behavior
change** — every params row keeps `rate_source: "band"`, the flip is the v22
micro-bump at doc 17 Phase R3.

- **Engine:** `EngineInputs.planStrengthRate` (`{low, high} | null`,
  `.nullish()` no default — pre-existing stored inputs parse byte-identically);
  `pacerTargetRate` branches on `rate_source === "plan"` with a non-null plan
  rate (`lerp(planStrengthRate, band_position) × goal_rate_factor[goal]`),
  degrading to the bucket band otherwise — never unpaced, position + factor
  source-agnostic (N36 composes unchanged); `seedMeso` gains the matching opt
  so the seed-route earn shares the pacer.
- **Assembly:** new leaf `queries/plan-rate.ts` — `derivePlanStrengthRate`
  evaluates pure `planMacrocycle` on the live profile and reads the
  goal-independent `strengthRatePctMonth` (the Phase-1 carrier); self-gates
  null while the mode is inactive; never throws. Wired at the
  `progressionHistory` sites: meso-activation seed (`SeedCtx`), week advance
  (`WeekContext`), the projection, and standalone mesos via
  `engineGoal(null)` → hypertrophy. `profileToMacroProfile` moved into the
  leaf (macro → stats → generation would cycle); `macro.ts` re-exports.
- **Doc-14 treatment:** `planStrengthRate` added to `DERIVED_INPUT_KEYS`
  (fingerprint-excluded — bodyweight/bf%/age edits don't churn open rows),
  recorded in decision inputs, replayed **frozen** by the freshness recompute
  (advance + seed) and `replay_decisions` (a candidate flipping `rate_source`
  diffs honestly against recorded rates).
- **Docs:** PROGRESS entry; `manual-operations.md` gained the Phase R3
  runbook (propose v22 `rate_source: "plan"` → replay diff: paced/stepped mix
  shifts, no entitlement change → activate → monitor).
- **Tests** +16 (suite 991 green): plan-vs-band arithmetic, band_position
  composition, goal denomination (hypertrophy paces on the strength band ×
  0.75, never lb/mo), null-plan band fallback byte-identity, inert under
  "band"/absent block, fingerprint denylist + write/check parity, frozen
  replay (recompute + admin), assembly self-gate/standalone/never-throws.

**N37 → done (PR #170).** Phase R3 (the flip) unblocks once R1 (v20) + R2
(v21) are activated. Reconciliation sweep: **N21 archived** (PR #169 merged;
row → `archive.md`, live index trimmed).

## 2026-07-10 — Session 62: N21 built — doc 17 Phase 1 (v21 target correction + contract snapshot + birthdate)

Owner kicked off the doc-17 build ("implement phase 1"). One PR (**#169**, branch
`claude/macrocycle-goals-phase-1-9vs7z4`), everything gated per §2.6:

- **Engine (`macro.ts`):** strength band × `strength_sex_factor` {1,1} × age
  taper w/ strength floor 0.7 (target + `recommendDuration`); hypertrophy
  proximity model runs on a BMI-band bf% proxy when only bf% is missing
  (`bf_proxy_pct`; decay reserved for no-height/bw); cut cap now rescales the
  low endpoint proportionally (parameterless); `MacroPlan.strengthRatePctMonth`
  exposed for every goal (unrounded — the N37 pacer carrier). All three params
  `.optional()`; DEFAULT hash untouched (guarded).
- **Contract:** `macrocycles.plan_inputs` snapshot (resolved MacroProfile +
  params version) stamped at create + goals edits; `updateMacrocycle` gained
  the `isGoalsEdit` gate — rename/notes saves no longer re-price the contract
  (principle 3). `profiles.birthdate` replaces the static age as the age
  source (`profileAge`, int fallback); onboarding/profile UI swapped (fig 4.5,
  09-changelog 2026-07-10); MCP `get_profile` + More card read derived age.
- **Migrations:** `20260710000001` (plan_inputs + birthdate),
  `20260710000002` (v21 INACTIVE, hash `7017e257…b4316`).
- **Docs:** doc 10 §5 amended (incl. restating the strength target as
  measured by the §6 est-strength rollup); `manual-operations.md` gained the
  Phase R2 runbook (v21 replay diff ≈ empty expected → activate → re-enable
  target cards → owner re-saves birthdate). PROGRESS.md entry.
- **Tests** +23 (suite 975 green): §2.6 matrix (personalization goldens incl.
  the pinned legacy 60F=18M defect, continuity, cut rescale, carrier
  denomination, provenance hashes, birthdate derivation, `isGoalsEdit`).

**N21 → done (PR #169).** N37 (Phase 2) unblocks on merge; N40/N41/N34 remain
ready per doc 17 §9. Reconciliation sweep: nothing to archive (session-61
rows all current; #168 merged and already reflected).

## 2026-07-10 — Session 61: doc 17 — the macro-goals build spec; owner ratifications folded in; N42 swept

Owner ratified the architecture record (PR #166) with three updates and asked
for the complete phased implementation plan "similarly to how we just did
with the progression model." Shipped **`docs/17-macrocycle-goals.md`**
(authoritative build spec; where it conflicts with the architecture record,
17 wins; doc 16 untouched). PR #168. What changed against the record:

- **Closeout semantics (owner decision):** natural close when every
  positioned meso is terminal, or explicit **"End macrocycle"** irrevocably
  ending open work — the `endWorkout`/`endMesocycle` family one level up
  (logged → `endMesocycle`, never-started → `abandoned`); the record's
  end-date nudge is dropped (users may overrun the plan). Completed macros
  freeze.
- **PR #157 (est-strength rework, merged today) folded in:** the key-lifts
  fold is retired, so the N40 retrospective grades the **`strengthTrend`
  rollup** (headline + per-muscle) vs the contract band, and the create-flow
  priming line uses the same metric; the record's `key_lifts.n` drift note is
  moot. Doc 10 §5's "% on key lifts" target wording gets restated in the
  Phase-1 PR.
- **DEXA unblock (doc 15 §8, PR #167) + owner adoption:** N34 moves to
  ready — doc 17 Phase 5 (5a connect+import / 5b enrich+verdicts /
  5c engine+MCP), parallelizable from day one.
- **One carrier amendment:** the N37 plan rate rides a new goal-independent
  `MacroPlan.strengthRatePctMonth` (a mass-goal macro paces the strength
  dimension — `perMonthRate` is lb/mo there, the wrong field). Derived input
  named `planStrengthRate`.

Phase map (§9, one PR each): 1 = v21 target correction (+ contract
`plan_inputs`, `birthdate`) → 2 = plan-rate pacer branch → 3 = closeout +
retrospective → 4 = bodyweight series + priming → 5a–c = DEXA →
6 = envelope loop (field-data-gated) → R1–R4 = owner activations (v20 first,
v21 + card re-enable, `"plan"` flip via v22, monitor).

Notes-area maintenance in the same PR: merge-artifact **duplicate N21 and
N34 rows removed** (kept the newer of each); N21/N34/N36/N37/N40/N41 rows
point at their doc-17 phases (N34/N40/N41 → **ready**, types D→F); **N42
swept to `archive.md`** (done + PR #157 merged — the resume-protocol
reconciliation sweep); doc 17 added to the root `CLAUDE.md` doc list.

## 2026-07-10 — Session 60: PR #157 refresh — merged main ×2, N36→N40→N42 renumber, CI fixes

Owner asked to freshen the open est-strength PR (#157) against main and advise
for merge. Merged `origin/main` (post #161/#162/#167) into the branch:

- **All code auto-merged clean** (`engine/index.ts`, `engine/params.ts`,
  `queries/logging.ts`, doc 10) — conflicts were docs-only (this area +
  `PROGRESS.md`).
- **ID collision found and fixed:** the PR session filed the est-strength item
  as **N36**, but Session 58 (Phase R, merged first) filed the doc-16 deferred
  spine as **N36–N39**, and the second refresh merge hit the same collision
  again: PR #166 (N21 macrocycle-goals architecture, merged 2026-07-10) filed
  **N40/N41** (macro close + retrospective, bodyweight series). The
  est-strength item is renumbered **N42** (next free ID); main's N36 (envelope
  loop) and N40/N41 (architecture doc) stand. Code/spec never referenced the
  ID, so the renumbers are docs-only. Same story for the session number: the PR session
  was a parallel "Session 53" — left dated in place below, marked as a parallel
  branch.
- Full suite + typecheck re-run green on the merged tree.
- **Found + fixed the standing CI e2e failure (red since PR #160 — every run
  from #412 on, incl. main).** Reproduced locally against the local stack and
  pulled the Playwright trace: the Phase-3 progression e2e logged set 1 with
  `reps: 118` — the day-view weight-blur handler re-derives the reps input
  asynchronously, and at robot speed the test's `fill("8")` landed after that
  re-render with the selection collapsed, APPENDING to the predicted "11";
  the server correctly rejects reps > 100 (zod), the set never logs, the
  `uncheck set 1` assertion times out. Test-only fix in
  `tests/e2e/prescribed-progression.spec.ts`: blur the weight edit and wait
  for the re-derive to settle, then a fill-and-verify retry (`toPass`) for
  both sets. The app behaved correctly throughout (validation + rollback
  toast); no product code touched. PRs #160–#167 were merged over this red
  e2e — worth keeping an eye on "merged with failing CI" as a process slip.
- Migration `20260708000001` (e1rm_confidence) applied to the hosted project
  via the Supabase MCP pre-merge (additive; deployed main code ignores the
  column). Backfill verified: 10,918 stamped sets banded (all `low` — correct,
  `rir_reported` has no write surface yet), 1 null-e1RM row null.
- **GitHub Actions runners died account-wide at ~20:58 UTC** — runs #431–#433
  (incl. the run that would have exercised the e2e fix, and main's #166 merge)
  all failed in ~5s with `runner_id: 0` and no logs: no runner assigned,
  nothing executed. Human-only fix (billing/spending limit) — runbook section
  added to `docs/deployment/manual-operations.md` → "Restore GitHub Actions
  runners". The e2e fix is verified locally through the real stack; CI can't
  confirm it until runners return.

## 2026-07-10 — Session 59 (parallel): N21 macrocycle-goals architecture record (owner's four questions answered)

Owner asked for the end-to-end architecture of the macrocycle goal layer
around N21: (1) how do we get targets right, (2) how do we use them,
(3) how do we measure results and close the loop, (4) what persists across
macro boundaries. Answered in
**`docs/reviews/2026-07-10-macrocycle-goals-architecture.md`** (design record,
not a build — doc 16's authority untouched). PR #166. Highlights:

- **Frame:** confirmed the owner's cadence+pacing levers / envelope-tunes-
  within-bounds understanding; sharpened it — the engine-facing product of the
  whole macro layer is exactly one number (the expected monthly strength rate)
  plus two per-goal lookups (`goal_rate_factor`, `rep_window`); the loop closes
  at four nested timescales (entitlement / pacing / position / contract), the
  fourth of which had no design until now.
- **Q1 (set):** N21 defect recap + the input-quality ladder (self-reported →
  derived → measured → observed record); **contract-vs-estimate snapshot
  semantics named as designed behavior** (stored `target_*` = the contract,
  overwritten only by an explicit goal edit; live recompute = the estimate;
  retrospectives grade against the contract) + persist the `MacroProfile`
  inputs beside the target columns at create/edit (N21 slice). Hygiene finds:
  `profiles.age` is a static int (→ birthdate), `key_lifts` display uses
  top-3 vs the param's n=5 (`stats.ts:67-78`).
- **Q2 (use):** the two levers and the three non-levers (quantum size,
  entitlement, measured anchor); **N37 shape fixed** — plan rate stays a band
  lerped by `band_position`, arrives as a doc-14 derived input
  (fingerprint-excluded, replay-recorded), degrades toward `"band"` never
  unpaced.
- **Q3 (measure):** the per-goal measurement asymmetry (strength fully
  in-app; mass goals honestly ungradable until body data exists); **N36
  residence fixed** — per-user derived `band_position` fold over trailing
  decisions at seed time, params value as default, per-user grain, no new
  table; **macro close + retrospective designed** (nothing happens at macro
  end today — `status` never leaves `active`); filed as **N40**.
- **Q4 (carry):** the permanent record is the persistence layer — derive,
  don't duplicate (decisions + logged history already carry entitlement,
  pacing, position across every boundary). Persist only two things for
  measurement: the enriched contract snapshot and a **bodyweight time series**
  (filed as **N41**); observed-rate priming of the next macro's create flow is
  derive-on-read, display-only (never silently blended).

Backlog updates in the same PR: N21 row gains the architecture-doc pointer
(build scope unchanged, still next target); N36/N37 rows carry their decided
shapes; **N40** (macro close + retrospective, needs-input) and **N41**
(bodyweight series, needs-input) added to workstream C. Owner decision list in
the doc's §6 (7 decisions, each with a recommendation).

## 2026-07-10 — Session 59: N34 readiness probe — BodySpec build unblocked (doc 15 §8)

Owner asked whether the BodySpec integration is buildable now, and clarified
the deployment is **private single-user testing** — which reframed doc 15's
"Phase 0: email BodySpec" gate. A live probe of the auth server answered the
two questions that actually blocked the build:

- **OAuth client (§7-1): resolved.** The Keycloak realm exposes anonymous
  OIDC dynamic client registration — a live POST returned a working public
  PKCE client with arbitrary redirect URIs, no approval. The app self-registers
  its client at Phase-1 build time. (Probe left one inert throwaway client on
  their server, documented in §8.1.)
- **Refresh tokens (§7-2): resolved at realm level.** `offline_access` +
  `refresh_token` grant supported and granted to the probe client.
- **Residual risk (one):** a possible undocumented audience/scope check
  (`ext_api_token`) on the API itself — verifiable only via a real login;
  it's the first 5-minute check of Phase 1, fallback = the old Phase-0 email.

Doc 15 amended in place: §1.1/§5/§7 pointers + new **§8 addendum**
("build is unblocked for a private deployment"). N34 row updated —
Phase 0 is no longer an owner action; remaining owner input is the
adopt-&-phase decision (doc 15 §5). No code. Shipped as **PR #167**
(`claude/bodyspec-dexa-api-readiness-q5a25w`).

## 2026-07-09 — Session 58: N35 Phase R — activation prep + deferred spine filed + N21 primed

Phase R is a **runbook, not code** (doc 16 §10) — shipped as **PR #162**
(`claude/phase-r-implementation-gkmzol`). No engine change, no app change; the
branch carries docs + the applied-inactive v20 migration. Work done this
session:

**(1) Research pass — the activation gate.** `goal_rate_factor.hypertrophy`
resolved: **keep 0.75** (do NOT collapse to 1.0). New evidence doc
`docs/reviews/2026-07-09-goal-rate-factor-research.md` (doc-10 house style,
evidence labels): moderate-load (8–12) 1RM conversion runs ~0.56–0.73 of
heavy-load (3–5) in the one head-to-head that isolates rep zone
(Schoenfeld 2016 squat 0.56 / bench 0.73), consistent with the load-continuum
meta (Schoenfeld 2017) + volume-matched trials (Lasevicius 2018, Campos 2002).
0.75 is the conservative-for-a-*governor* top of that band — the pacer only
delays, so erring high lets earned performance through. v20 already carries
0.75, so **no params edit** — the finding validates the shipped value.

**(2) v20 applied INACTIVE + replay diff.** Migration
`20260709000001_engine_params_v20_prescribed_progression.sql` applied to hosted
via the Supabase MCP, hash-verified `cb451a02…c90287` (matches
`params-provenance.test.ts`); v19 remains active, nothing changes for users.
`replay_decisions` candidate v20: **v19→v20 = 15 source / 11 changed / 0 errors**
(all diffs are earned steps on compliant advance/seed working weeks — reprice up
one quantum, e.g. Hack Squat 110→112.5, or a +1 rep climb; lattice snaps to
window-bottom); broader 100-decision replay = 80 unchanged / 20 changed / 0
errors (unchanged = seeds/deloads/gate-failures, byte-identical as designed).
This is the diff the owner reviews before activating.

**(3) Runbook.** `docs/deployment/manual-operations.md` gained the "Activate
engine_params v20" section (5 steps: research ✓ / replay ✓ / owner review /
activate via admin MCP `activate_engine_params` / monitor via
`get_engine_decisions` + `get_progression_history`), plus the increment
recommendation and the plan-rate/envelope unblock note.

**(4) Deferred spine filed — N36–N39.** The doc 16 §11 deferred items are now
first-class high-priority backlog rows (workstream **P**, new), each pointing
back to doc 16 §11: **N36** envelope loop (blocked on v20-active + field data +
N21), **N37** `rate_source:"plan"` pacer branch (blocked on N21), **N38**
required honest-RIR confirmation + capture affordance, **N39** per-exercise
progression-off override. README workstream roster + doc 16 §11 updated with
the IDs.

**(5) N21 primed as NEXT TARGET.** New scoping doc
`docs/reviews/2026-07-09-n21-strength-rate-priming.md`: re-verified the audit
(strength target is bucket-only — age/sex applied only to hypertrophy; model
flip on profile completeness; cut-range collapse), researched the missing
modifiers (**strength `sexFactor ≈ 1.0`, NOT the hypertrophy 0.7** — relative
1RM gains are sex-equal, Roberts 2020 / Refalo 2025; apply `ageMultiplier` with
a possibly higher strength floor, Peterson 2010 neural-gain preservation),
proposed a v21 shape that exposes the personalized `perMonthRate` the
`rate_source:"plan"` flip reads, and laid out the
Phase-R → N21 → plan-rate → envelope sequence. N21 elevated MED→HIGH (it blocks
N37 + N36).

N35 row → Phase R prepped; stays live until v20 is activated (owner) and the
deferred rows are picked up. Next target: **N21**.

## 2026-07-09 — Session 57: N35 build Phase 4 — audit aggregate (doc 16 §8.3/§10)

Fourth (final code) build slice of doc 16 shipped as **PR #161**
(`claude/prescribed-progression-phase-4-d9pzs5`). Read-side only — no schema
change, no migration, no engine change; while v20 stays INACTIVE no decision
carries a progression step, so the new surface honestly reads empty.

Landed: admin MCP tool `get_progression_history` (role-gated Slice-4 roster;
caller's own decisions only, hard rule 5) — per exercise: earn/miss/skip
status mix, governor firings (`paced` by governor), gate failures
(`not_earned` by first failing predicate), the `vanished` share of asks
(§8.3's increment-sizing signal → the doc 10 §8 finer-increments decision),
earned-then-met/missed/unanswered ask pairing (the miss throttle's pairing,
surfaced) + `open_ask`, trailing prescribed vs measured gain (%/30d, pacer's
7-day span floor, deloads excluded), and a bounded chronological event
series. Pure fold in `queries/progression-history.ts`
(`toProgressionAuditEvent` + `aggregateProgressionEvents`, re-exported via
`queries/progression.ts`); fetch + labels in
`queries/engine-admin.ts::getProgressionHistory` (trace-rule JSONB
containment, 2000-row window with truncation note); doc 05 admin table row.
`v_progression_events` deliberately NOT built — §10 gates the view on a stats
screen wanting it and none does; deferral recorded in PROGRESS.md. Tests +9
(suite 941).

N35 row → Phase 4 shipped; doc-16 build-out complete. Remaining: Phase R
(owner-gated activation incl. the hypertrophy-factor research pass — runbook,
not code).

## 2026-07-09 — Session 56: N35 build Phase 3 — day-view coupling + three-state markers (doc 16 §10)

Third build slice of doc 16 shipped as **PR #160**
(`claude/prescribed-progression-phase-3-4etoto`). No engine-output change and
no migration — with the v20 block (still INACTIVE) absent, no decision ever
records a target anchor, so every fallback path is byte-identical to today.

Landed: the day read (`queries/logging.ts`) carries `prescription_anchor` per
exercise — the target `A* = A + δ` from the `stepped` progression step of the
LATEST `engine_decisions` row (every reprice records a fresh decision, so a
superseded step can't leak a stale lead; read ungated so the coupling stays
honest in the deactivation window). `SetRow`'s live predictor prices off
`prescription_anchor ?? e1rm_anchor` (§5.2) — a weight edit re-derives reps
faithful to the prescribed target including the earned lead; the measured
anchor stays the basis everywhere else. Markers go three-state (§5.3):
`loggedSetMarker` now delegates to the engine's `setComplianceMarker` — the
earn gate's comparison made visible, structurally unable to diverge — with
the band params-fed (`progression.compliance_band` absorbed `MARKER_BAND`).
Glyphs ▲/■/▼ small ink, house-style (rule-8 pass re-verified: no mockup
figure exists for the set-row marker; 09-changelog 2026-07-09 entry is the
authoritative treatment). WS-J bundle guard extended to pin
`rules/progression.ts` + `rules/feedback.ts` zod-free in the client chunk.
Tests +13 (suite 932): three-state day-rules, the marker ⇄ earn-gate
agreement fixture (8 scenarios), extended guard; new e2e
(`prescribed-progression.spec.ts`) drives a fabricated stepped decision
through the real UI — earned prescription renders, weight edit re-derives
off the recorded target, met/under markers reflect the shared comparison.

N35 row → Phase 3 shipped. Next per 16 §10: Phase 4 (optional audit
aggregate, post field data), Phase R (owner-gated activation).

## 2026-07-09 — Session 55: N35 build Phase 2 — seed route / meso-over-meso carry (doc 16 §10)

Second build slice of doc 16 shipped as **PR #159**
(`claude/prescribed-progression-phase-2-uzc3ff`). No migration — v20
(INACTIVE) already carries the block; with it absent every seed output,
recorded input, fingerprint, and trace stays byte-identical (pinned).

Landed: `seedMeso` doc-16 §3.7 wrapper — the caller supplies the prior meso's
final working session (`earn` opt + `progressionHistory` +
`daysSincePreviousSession`) and the seed evaluates it through the SAME
`assessProgression` gate + governors as the advance chain, re-prices the
anchor-parameterized `seedCore` off `A* = A + δ`, and shares the extracted
`applyRealizedAsk` §3.3 rule verbatim (vanished retains the earn;
`max_pct_per_step`; `stepped` announces the target). New derived
`EngineInputs.seedEarn` (doc 14 §3 denylisted, recorded for replay).
Earned-at-close derivation in the new leaf `queries/seed-progression.ts`
(most recent completed WORKING session per exercise — deloads excluded, so
the earn crosses the deload boundary; `max_gap_days` decides honesty).
Caller plumbing per the §10 site list: `startMeso` earns; plan-edit adds +
slot swaps never (no compliance context; slot path forwards `isDeload`);
`recomputeSeed` + admin `replay_decisions` replay the recorded earn frozen
with the anchor refreshed. `progressionHistory` assembly moved to the leaf
`queries/progression-history.ts` (generation ↔ progression cycle), re-exported
from `progression.ts`. Tests +23 (suite 919): seed↔advance parity (same δ,
same A* — by construction via the shared gate), meso-over-meso golden (the
memo's acceptance case: fixed point absent, meso 2 opens above meso 1
active), deload-boundary carry + staleness cutoff, gate/governor cases on the
seed, bodyweight rep-cap vanish, doc-14 fingerprint parity, replay
determinism.

N35 row → Phase 2 shipped. Next per 16 §10: Phase 3 (day-view coupling +
three-state markers, hard-rule-8 mockup pass), Phase 4 (optional audit
aggregate), Phase R (owner-gated activation).

## 2026-07-09 — Session 54: N35 build Phase 1 — engine core + advance chain (doc 16 §10)

First build slice of doc 16 shipped as **PR #158**
(`claude/prescribed-progression-phase-1-vgi63a`). Ships INACTIVE — engine_params **v20**
(`20260709000001`) carries the `progression` block; with it absent every
output, fingerprint, and trace is byte-identical (pinned by the treadmill
golden, which also reproduces the doc-16 §7 worked example verbatim:
145×8@3 → earned 150×9@2 targeting e1RM 203.0 → measured 205.0).

Landed: `src/lib/engine/rules/progression.ts` (earn gate with e1RM-space
per-set compliance via the shared three-state comparison, governors —
cadence / macro-rate pacer / miss throttle / peak-week — and the quantum δ);
`prescribe()` threading (`A*` as an anchor-input substitution, deadband
carve-out on earned pricing, realized-ask rule after rounding with
retry-not-stack `vanished` + `max_pct_per_step` + the `bodyweight_only`
substitution nudge, always-on status-coded `progression` trace step, grading
pinned to the measured anchor); `progressionHistory` +
`daysSincePreviousSession` derived inputs (doc 14 §3 denylist, recorded for
replay) with assembly in `queries/progression.ts` (90-day lookback,
normalized %/30d pacer rate, miss/re-arm derivation) wired into `generateDay`
and `projectNextPrescription`; `get_engine_decisions` rule/status filter
(§8.3); doc 10 §4 + doc 13 §9.2 pointers to doc 16; the stale
"standalone → gain" comment corrected (follow-up 2 §5). Full §10 Phase-1
test matrix green (+49 tests; suite 896).

N35 row → **in-progress, Phase 1 shipped**. Next per 16 §10: Phase 2 (seed
route), Phase 3 (day-view coupling + markers), Phase 4 (optional audit
aggregate), Phase R (owner-gated activation).

## 2026-07-09 — Session 53 (cont.): Batch 15 — N35 follow-up #3 + design finalized (doc 16)

Owner's third follow-up (Batch 15 verbatim in the appendix) answered in
[`docs/reviews/2026-07-09-prescribed-progression-followup-3.md`](../reviews/2026-07-09-prescribed-progression-followup-3.md),
and the design **finalized** as
[`docs/16-prescribed-progression.md`](../16-prescribed-progression.md) —
the authoritative build spec consolidating the memo + review + follow-ups
1–3 (doc 16 wins over the whole thread; root `CLAUDE.md` docs list updated).

Substance: (1) **Vanished earns — the owner's accumulation assumption is
corrected** (the "worth discussing before implementation" branch): "earn
retained" = the single-quantum entitlement is *retried* (re-armed at
`A + δ` off the measured anchor), never *stacked* (`A + kδ` never exists) —
stacking is the compounding-unconfirmed-credit failure the no-compounding
rule forbids, and it would eventually demand a multi-quantum leap on
exactly the lift least able to absorb it. Coarse-increment lifts don't
need it: `step: "min"` picks the rep axis, each performed quantum banks in
the measured anchor (the anchor IS the accumulator), and the top-of-window
reset — which this design finally makes reachable — converts the banked
rep gains into the load step. True dead-ends (window cap + oversized plate
jump; `bodyweight_only` ceiling) get equipment/product answers (increment
override, doc 10 §8, substitution nudge), not credit. (2) Prefill
flow-through confirmed automatic. (3) **Owner rulings adopted:** the live
day-view predictor prices off the prescription-basis target anchor (A*
when stepped — flips review §7.1's deferral; `logging.ts:335` /
`DayView.tsx:1339` today read the measured anchor), and the earn gate
moves to **e1RM-space per-set compliance** — not the literal weight×reps
pair, which broke under athlete-owned weight edits — sharing the P19
`loggedSetMarker` comparison (grinder guard intrinsic: reported-low-RIR
scores under). (4) Markers go **three-state (over/met/under)**;
`MARKER_BAND` moves into params as `compliance_band` so marker, gate, and
grading read one tunable; "met" glyph is mockup-governed (09 entry at
build). N35 → **ready (build)**: phases in doc 16 §10 (engine core → seed
→ day-view/markers → audit aggregate → owner-gated activation with the
hypertrophy-factor research pass); implementation in new sessions.

## 2026-07-09 — Session 53 (cont.): Batch 14 — N35 follow-up #2 (auditability, band_position, envelope, standalone)

Owner responded again (same PR #156 thread); captured verbatim as **Batch
14** and answered in
[`docs/reviews/2026-07-09-prescribed-progression-followup-2.md`](../reviews/2026-07-09-prescribed-progression-followup-2.md)
(amends follow-up 1 where they conflict).

Substance: (1) **Auditability** — the substrate already exists
(`engine_decisions` inputs/output + structured trace + explain/replay/
simulate MCP tools); amendment: the progression trace becomes **always-on
and status-coded** (stepped / vanished / paced / not_earned, with a
structured payload naming the governor or failing predicate) — follow-up 1's
"no trace when the ask vanishes" refined to "never *claim*, always
*record*". Line drawn: record at decision grain (Phase 1), aggregate
read-side only (`get_engine_decisions` filter now; admin
`get_progression_history` once field data exists), feed back into
prescriptions only as a doc-14 derived input (= the envelope, Phase 3). The
history does NOT duplicate `v_exercise_history`: it's demand-side +
relational (earn/miss/skip stream, governor firings, prescribed-vs-measured
gap) — none of it exists elsewhere. (2) **Pacing decoupling confirmed**: the
pacer reads the `strength_pct_month` *band table* (a param), none of
`planMacrocycle`'s heuristic projections; the quantum is mechanical
(increment/rep), never band-derived; `rate_source: "plan"` is the one
explicit opt-in coupling. (3) **`band_position` (0–1, default 0.5)**
replaces the band_mid/band_top enum — continuous, tunable, and deliberately
the same knob the owner's **envelope loop** (adopted as the Phase-3 shape)
will drive: performance moves position *within* the macro envelope, at meso
boundaries, hysteretic, from demand-side outcomes — bounded by construction,
replay-exact (position recorded in decision inputs). (4) **Standalone
mesos**: nothing extra needed — goal resolves via `engineGoal(null)` →
hypertrophy, the band keys off the profile bucket, history is per
user × exercise across meso/macro boundaries; post-N21 "plan" works too
(pure function). Flagged the stale "standalone → gain" comment
(`progression.ts:1129`) for cleanup in the build PR. N35 stays needs-input;
updated decision list in follow-up 2 §6.

## 2026-07-08 — Session 53: Batch 13 — N35 follow-up answered, design amended (macro-rate pacing)

Owner responded to the N35 review with four threads; captured verbatim as
**Batch 13** in the appendix and answered in
[`docs/reviews/2026-07-08-prescribed-progression-followup.md`](../reviews/2026-07-08-prescribed-progression-followup.md)
(which amends the 2026-07-07 review — follow-up wins on conflict).

Substance: (1) convergence confirmed; "when" restated as earned + once per
microcycle at most + rate-paced. (2) The "progressing twice" concern:
half-dissolved (the ramp rep is reserve drawdown — zero capacity ask;
capacity ask is exactly one quantum/week), half-adopted (ungoverned
per-microcycle stepping ≈ 10–15%/mo is too aggressive — resolved by the
owner's own macro-rate idea). (3) **Design amendment:** the §6.6 rate
ceiling is promoted to a **macro-rate pacer** (macro sets the expected
strength rate, meso paces earned quanta to it; hard boundary: budget never
quota — the rate meters the ask, only performance mints it) and the
per-goal booleans become **per-goal rate factors** (strength 1.0,
hypertrophy 0.75 [HEURISTIC — research pass before v20], cut/maintain 0);
ships in Phase 1 (backward-compatible generalization of the ceiling);
`rate_source: "plan"` is the post-N21 personalization flip (N21 row
cross-linked). (4) Misc answered: the `moderate` confidence ceiling under
compliant hypertrophy is intentional (estimate-accuracy honesty, doc 10 §9
— only gates needed fixing, already done); "reported RIR" is
`logged_sets.rir_reported` — a real optional column honored everywhere on
read but with **no write surface today** (DayView logs null always), so
review §10 Q6 is now explicitly a two-part decision (engine rule + capture
affordance + narrow doc-11 premise amendment). Updated owner-decision list
in the follow-up's §6; N35 stays needs-input.

Reconciliation sweep ran clean (no merged-but-live rows; N1 in-progress,
N21/N34/N35 open).

## 2026-07-08 — Session 53 (parallel branch): est-strength rework — recent-vs-baseline rolling trend (N42, filed as N36)

Owner flagged that aggregated macrocycle "est. strength" dropped the moment a
new meso started, and suspected (a) the in-progress block factoring in and
(b) volatility from a pure first→last two-point delta. Investigation confirmed
both, compounding: the RIR ramp makes a fresh block open light, so its opener
became the `last` endpoint and cratered every continuing lift. Also found the
Overview tile (top-3 key-lift mean) and the Performance tab (muscle rollup)
were *different* aggregations that could disagree (the archived N16 fix only
partially closed this).

Reworked the whole metric bottom-up (owner-approved design), shipped as **N42** (filed as N36 in-session; renumbered at merge — see Session 60):
- **engine/strength.ts** (pure, golden-tested): `strengthTrend` = best of the
  most-recent window vs best of the earliest, symmetric non-overlapping windows
  (`engine_params.strength`, `.optional()` so no params-hash churn — replay
  safe; falls back to `DEFAULT_STRENGTH`). `volumeWeightedMean` helper.
- **queries/stats.ts + macro.ts**: `foldProgressScores` uses it; muscle rollup
  unchanged (role-weighted, PH37); headline = **volume-weighted mean of the
  muscle changes** (fractional-set weights), shared by the Overview tile and
  Performance tab so they're identical by construction (finishes N16). Dropped
  `keyLiftStrengthPct`.
- **Confidence stored** (`logged_sets.e1rm_confidence`, migration
  `20260708000001` + backfill; stamped at log/amend, restamped on e1rm-block
  change) — auditability (owner: "log it").
- **Clarity** (owner: info buttons over terse one-liners): glossary rewrites
  (e1rm now states RIR/effective-reps plainly; new `est_strength`,
  `e1rm_confidence` cards), InfoDots on the macro tile + strength sections, and
  **RIR denoted next to e1RM in the history flip view**.
- Session value stays the **session average** e1RM (N2 kept, per owner).
- Verified on live data: Bench Press −7.3%→−3.8% (single opener corrected),
  Machine Chest Supported Row −32%→−31.7% (genuine decline honestly preserved).

Spec updated: `docs/10-metrics-spec.md` §1 (confidence persisted), §6 (est.
strength redefined), §8 (`strength` param block). Relates to / supersedes the
archived N16; extends N9's muscle rollup. Ships as PR on
`claude/macrocycle-strength-estimates-wdbefl`.


## 2026-07-07 — Session 52: Batch 12 intake — prescribed e1RM progression review (N35)

Owner handed over a memo ("Updates to the Prescription Engine", uploaded
.docx): the engine captures e1RM progress but never *prescribes* it — exact
compliance never advances the anchor. The memo drafts a double-progression
fix, withdraws it as flawed, and asks on what basis the e1RM should advance.

Intake: verbatim text captured as **Batch 12** in the appendix; one new item
**N35** (D→F, HIGH, needs-input). Reconciliation sweep ran clean (nothing
merged-but-live; live index is N1 in-progress, N21/N34/N35 open).

Analysis delivered as
[`docs/reviews/2026-07-07-prescribed-progression-review.md`](../reviews/2026-07-07-prescribed-progression-review.md):
the memo's diagnosis is **confirmed exact** — prescription and measurement
invert the same `e1rmFactor` curve, the Option-A climb is RIR-neutral by
design (R24a), and the seed reprices the unchanged anchor; verified by running
the real engine (three consecutive byte-identical mesos, anchor pinned at
198.2). Recommended design: never bump the *measured* e1RM (T-I5); prescribe
from a target anchor `A* = anchor + one earned quantum` — explicit all-sets
compliance gate (incl. workload + staleness), `min(weight, rep)` quantum with
a realized-ask rule, no compounding of unconfirmed leads, governed by
per-microcycle cadence + a doc-10 §5 rate ceiling + a miss throttle — as a
param-gated `progression` block (v20), phased advance-chain → seed-route →
deeper macro coupling (after N21). The design was hardened by a hostile
review (fixed: an inert `high` confidence floor for hypertrophy, the
checkbox-logging runaway asymmetry, per-session vs per-week rate arithmetic,
gate predicate gaps, a deadband corner, the `bodyweight_only` rep-cap dead
end). Six open questions for the owner in the review's §10.

## 2026-07-05 — Session 51 (cont.): CI fix + hosted deploy + in-session sweep (PR #153)

PR #152 merged with the rls-tests job red — root-caused to a PRE-EXISTING
#151 regression: `unstable_cache` (reference cache, WS-J #7) throws its E469
`incrementalCache missing` invariant when the vitest integration suite runs
the query layer outside the Next runtime; the first throw cascaded through
write-pipeline.test.ts. Fixed on PR #153 (accessors fall back to the same
uncached loader on exactly that invariant; rls-tests green on the PR) — noted
as a #7 amendment on the N1 row.

Hosted deploy done in-session per the owner's go-ahead: migrations
`20260705000001` (v19, hash verified) + `20260705000002` (`rir_schedule`)
applied via the Supabase MCP; `replay_decisions` for v19 over v18-sourced
decisions returned **0 changed / 0 errors** (all 26 are week-1 seeds — the
v19 gates live in the advance path, pinned by the goldens); v19 **activated**
via the admin MCP `activate_engine_params` (hook ran; e1RM restamp no-op,
e1rm block unchanged). v18 is the rollback target.

Both PRs merged in-session → reconciliation sweep ran in-session: **R24, R25,
N18, N29 archived** ("Swept 2026-07-05 (later 2)"). Live index is now: N1
(WS-J Phase-3 remainder, as measured), N21 (needs-decision), N34
(needs-input), PH30 (deferred), the answered Q rows, and T-A5 (deferred).

## 2026-07-05 — Session 51: four closures — N29 FilterBar, N18-B per-week RIR, R24 + R25 remainders (PR #152)

Resume-protocol sweep first: no stale `done` rows. The owner asked for the
unblocked R24/R25 remainders + N29 FilterBar + N18-B, with design authority
delegated. All four shipped on PR #152, one commit each:

- **N29 → done.** Shared `FilterBar` primitive (the fig 3.1 two-axis chip
  grammar generalized); exercises refactored onto it, templates tab + picker
  swap their selects for chips via one `TemplateFilterPanel` (duplicated
  search-form block collapsed; `TemplateFilters.tsx` retired), planner
  picker's equipment row adopts it. 09 entry.
- **N18 → done.** Part B: `mesocycles.rir_schedule` (migration
  `20260705000002`), `rirRamp(schedule?)`, week-1 seed reads the ramp not
  `rir_start`, `mesoStaleSignature` gains the column (the only freshness
  change — the fingerprint already carried `week.targetRir`, exactly as
  doc 14's worked example predicted; dated amendment added), shared
  `RirScheduleEditor` behind both sheets' ADVANCED disclosure, MCP
  create/update/read support. Copy/duplicate carry it.
- **R24 → done.** Hold-week reprice-down investigated: two mechanisms —
  (a) the Option-A climb's unconditional `prevReps + 1` breaks the doc 13
  §9.2 constant-effective-reps invariant on ramp-hold weeks (the default
  ramp holds at wk 2→3, so this was routine, not rare); (b) anchor decay
  prices an identical hold lower in wk N+1. Fixed as engine_params **v19**
  (INACTIVE; `climb_requires_rir_step` + `hold_week_anchor_deadband` —
  deadband absorbs sub-step decay only, a full-step fall is real signal).
  Previously-unpinned ramp-hold case now golden under both param sets.
  Runbook v19 step added; activation is an owner action after a replay diff.
- **R25 → done.** Error contract converged at the composition-root wrapper
  (`{ok:false}` refusals now also `isError`); `place_mesocycle` and
  `list_engine_params` retired into `manage_macrocycle_slots`/
  `get_engine_params`; preview vs muscle-balance kept split deliberately
  (plan-pre-start vs trained-weeks — muscle_balance is empty for a draft)
  with cross-referencing descriptions; docs/05 drift fixed (stale
  regenerate tool row, summary-tool names, resource list) + new
  Failure-contract section.

Green: typecheck, lint, 847 tests (+27), production build. Archive sweep for
these rows falls to the next session after PR #152 merges.

## 2026-07-05 — Session 50: WS-J Phase 2 closed — #7 reference cache built, #5 dropped (PR #151)

Resume-protocol sweep first: no stale `done` rows (48/49 swept in-session;
N29/N34 correctly live). Picked the highest-priority open item — **N1**'s
remaining Phase-2 pair — and closed the phase:

- **#7 shipped.** New `queries/reference.ts`: `muscle_groups` (12 rows, 8+
  call sites incl. every day-view open) and the stock exercise library +
  links (330 + 352 rows; `/exercises`, planner, add-exercise sheet) now serve
  from the shared Next Data Cache (`unstable_cache`, 1 h TTL, `ref:*` tags),
  read through the service client scoped to global rows only. `exercises.ts`
  merges live per-user custom rows/links over the cached stock
  (`loadLibrary`/`mergeLibrary`/`filterLibraryExercises`, pure + tested);
  `listMuscleGroups` is now zero-arg (7 call sites updated). Static test
  guards that nothing per-user can enter the shared cache. Live-verified
  352/352 stock links via PostgREST against the hosted project.
- **#5 dropped** with rationale in `J-performance.md`: #7 made only global
  reference data cacheable and no mutation touches it; per-user reads stay
  uncached per doc 14's pull-based freshness; the existing `revalidatePath`
  pair is the correct router-cache bust for the user's own edits.

Phase 2 is now fully dispositioned (#1–#10 all shipped/rejected with reasons).
N1 row narrowed to Phase-3 (streaming/decomposition, as measured). Green:
typecheck, lint, 820 tests (+9), production build.

## 2026-07-05 — Session 49: BodySpec DEXA integration assessment (N34)

Owner requested a full assessment of integrating BodySpec's DEXA-scan API
(scan booked for Tuesday). Intake as **Batch 11 → N34** (F, MED,
needs-input). Deliverable: **`docs/15-bodyspec-dexa-integration.md`** —
API assessment (OpenAPI v0.14.3 fetched live: user-tier OAuth2/PKCE via
Keycloak, pull-only — webhooks are partner-tier; full scan history via
paginated results; composition/bone/percentiles/VAT/RMR sections), proposed
schema (`body_scans` time series + `external_connections` +
`v_body_comp_history`; scan facts treated as *derived* inputs per doc 14,
like bodyweight), engine direction (measured FFM/FFMI into `planMacrocycle`
targets only — never set/week-level autoregulation; ties into N21's model
correction), genuinely-new capabilities (outcome verdicts for macros, cut
lean-retention, percentile positioning, RMR context), LSC/same-scanner
honesty guardrails, 4-phase build sketch. Phase 0 (OAuth client
registration, refresh-token story) is an owner email to
dev-support@bodyspec.com. Adoption would amend doc 01's out-of-scope line.

## 2026-07-05 — Session 48 (cont. 2): PR #148 merged — in-session sweep

PR #148 merged with checks green while the session was live, so the
reconciliation sweep ran in-session: **N25 archived** (`archive.md`, "Swept
2026-07-05 (later)"). **N29 stays live** — the picker half shipped in #148
but the chip-based FilterBar unification remains (row: in-progress). Docs-only
follow-up PR on the branch restarted from merged main (same name). Live index
is now: N1 (WS-J remainder), N18-B (per-week RIR), N21 (needs-decision), N29
(FilterBar), PH30 deferred, R24/R25 remainders.

## 2026-07-05 — Session 48 (cont.): N25 + N29-picker built (PR #148)

Picked the two `ready` items after the sweep; both shipped on PR #148
(N25 row → done; N29 row → in-progress, picker half done):

- **N25** — `src/lib/glossary.ts` (11 terms; copy-contract test enforces
  all-caps labels, no exclamation marks, card-sized bodies, the e1RM/deload
  honesty guardrails) + `components/ui/InfoDot.tsx` (the feedback sheet's
  circled-"i" grammar → anchored square glossary card, AnchoredMenu
  placement, modal a11y + refcounted scroll lock so it stacks over sheets).
  Migrated the two ad-hoc pump/workload explainers (workload no longer
  auto-expands — deliberate, recorded in 09). Wave-1 placements across
  day view, meso header/edit sheets, planner, stats, exercise page.
  09 entry "2026-07-05"; PROGRESS record.
- **N29 (picker)** — from-template picker reuses `TemplateFilters`
  unchanged; days/emphasis/gender threaded into `listTemplates`; the search
  form preserves active filters. FilterBar unification remains open.

Green: typecheck, lint, 811 tests (+5), production build.

## 2026-07-05 — Session 48: reconciliation sweep — archive N33 + T-N33 (PR #147 merged)

Resume-protocol sweep: PR #147 confirmed merged (`b9ba057`) → **N33** and
**T-N33** rows swept to `archive.md` ("Swept 2026-07-05"). Live index is now:
N1 (WS-J remainder: Phase-2 #5/#7 caching pair + Phase-3 as measured), N18-B
(per-week RIR schedule), N21 (target-engine needs-decision), N25 (InfoDot +
glossary, ready), N29 (picker filters ready / FilterBar triaged), PH30
deferred, R24/R25 remainders. Session continues with the ready build slice
(N25 + N29 picker) — see the next entry.

## 2026-07-05 — Session 47 (cont. 3): N33 + T-N33 built (PR #147)

Owner: "Go ahead and build N33 and T-N33." Both shipped on the open PR #147
branch (rows → done; archive sweep falls to the next session after merge):

- **N33** — new `queries/slot-prescription.ts` resolver: swap
  (`replaceWorkoutExercise`) and add (`addWorkoutExercises`) both compute via
  the engine with the kind derived from the data (advance off the §9 lookback
  source — most recent same-day-slot instance with logged working sets within
  2 weeks, set-less N-1 fallback for generation parity — else the doc 14 §6.2
  cold seed); full tuple + rationale + fingerprint + decision written
  (`seed-decisions.ts` generalized to carry kind/source). Reconcile gains the
  S2 exercise-identity replay guard (`dropForeignDecisions`) and the same §9
  lookback in the §7c backfill (`advanceSourceKeys` + set-presence
  preference). Detail sheet gains the S4 out-of-band tripwire (decision
  output numbers compared to the live row; the false "re-verified" line is
  replaced by an explicit "set outside the engine" note on divergence).
  Golden test reproduces the owner's W5·D2 case: swap-back restores
  **215×10@6RIR·2 sets**. Doc 14 §6.2 carries a dated amendment.
- **T-N33** — `queries/e1rm-restamp.ts` wired into the MCP
  `activate_engine_params` tool: when the incoming version's `e1rm` block
  differs from the outgoing one, all `logged_sets.e1rm` stamps recompute
  under the new params (same rule as log time), changed rows rewritten via
  chunked PK upserts (service client, idempotent), counts in the tool
  result. Golden test: 245×15 restamps 384.2 → 367.5. Caveat documented:
  migration-activated versions bypass the hook.

Green: typecheck, lint, 805 tests (+27: slot resolver, lookback selection,
replay guard, audit matcher, restamp planner, advance-kind decisions),
production build. PROGRESS.md entry "2026-07-05 (latest)".

## 2026-07-04 — Session 47 (cont. 2): T-N33 decided (restamp on activation) + anchor-selection Q&A

Owner decided **T-N33: restamp `logged_sets.e1rm` on params activation**
(row → decided/ready; scope note: restamp only when the activation changes
the `e1rm` block, batch per-user, service-role — derived column, not logged
truth, so hard rule #5 is not implicated). Second follow-up question
answered (chat + review doc §8.2): `session_best` scores sets by estimate ×
recency decay (half-life 30 d) and anchors on the winner's session at its
**undecayed** confidence-weighted mean — the 7-day-old 245×15 (367.5 → ≈312
after decay) lost to the fresh 285×7 (≈347), so the 07-01 session anchored
at 331.9. Verbatim in **Batch 10 addendum 2**.

## 2026-07-04 — Session 47 (cont.): Batch 10 addendum — owner follow-up folded into N33

Owner follow-up on the findings (verbatim = **Batch 10 addendum** in the
appendix): (1) advance-first also applies to the **add** path (remove →
re-add = the same lineage break) — folded into N33/S1 as one shared resolver;
(2) "cold seed" defined in review doc §8.1 (no in-meso `previous`; precedence
anchor → plan initial → unseeded — history still flows in via the anchor);
(3) the 384-vs-367.5 anchor question **resolved** (§8.2, verified against the
params registry: the history surface shows log-time per-set stamps under the
pre-v11 averaged formula, the anchor recomputes live under the v11
`brzycki_max_eff_reps=10` cutoff → Epley-only 367.5; W5 anchor 331.9 = mean
of the 285×7/4 session's estimates) — spawned **T-N33** (needs-input: restamp
/ compute-live / label the stale stored e1RMs); (4) missed-week lookback
designed in §9 (N-1 → K=2, same-day-slot, source must have logged working
sets, trace discloses the gap) — key finding: plain skips already advance
today (`generateDay` passes empty actualSets → anchor reprice/hold); only a
swapped-away/removed week breaks the chain, which the lookback + S1 fix.

## 2026-07-04 — Session 47: Batch 10 intake — swap/prescription provenance investigation (N33)

Owner raised an in-chat investigation request with a W5·D2 screenshot: after a
deload-week swap-out/swap-back of Deadlift, the day view filled 245×5, the menu
note said "swapped in at your all-time best 245 × 15", and the detail sheet
showed 245×15·2·6RIR over a V17 DELOAD trace (215×10) with a "re-verified under
V18 — unchanged" line. Verbatim = **backlog appendix Batch 10**, all → **N33**
(B, HIGH, WS-G, `ready`).

Investigated end-to-end (code + the live `engine_decisions` audit trail via
MCP); full findings + solution assessment in
[`docs/reviews/2026-07-04-swap-prescription-provenance.md`](../reviews/2026-07-04-swap-prescription-provenance.md).
Root causes: `replaceWorkoutExercise` writes PR weight/reps **out-of-band**
(no engine call, no decision, no fingerprint restamp — the add path was
brought into doc 14 §6.2, the swap path never was), and the freshness
framework is **blind to exercise identity** (not in the fingerprint; replay
never compares `decision.exercise_id` to the row), so the swap busts neither
the meso stale gate nor the row fingerprint and the reconcile re-certifies
hand-written numbers. The displayed 245×5 is the day view's anchor predictor
(e1RM 331.9 @ 245 lb, 6 RIR) papering over the incoherent row. Proposed fix
(scoped, `ready`): swap computes via the engine (advance off the §7c
counterpart when one exists — makes A→B→A restore the deload numbers — else a
cold seed like `addWorkoutExercises`), decision/row exercise-id mismatch ⇒
backfill in the reconcile, one `writePrescription` chokepoint, sheet mismatch
guard. Related: N5/N13 were the client-side symptoms of the same flow; the
e1RM-skew aside is parked with the open R24 remainder (review doc §7).

## 2026-07-04 — Session 46 (cont. 3): PR #145 merged — in-session sweep

PR #145 (notes sweep + N32 fix) merged with checks green while the session
was live, so the reconciliation sweep ran in-session: **N32 archived**
(`archive.md`, "Swept 2026-07-04 (later 5)"). Docs-only follow-up PR on the
branch restarted from merged main (same name). Live index is now: N1 (WS-J
remainder), N18-B (per-week RIR), N21 (target-engine needs-decision), N25
(InfoDot + glossary), N29 (picker filters + FilterBar), PH30 deferred,
R24/R25 remainders. Owner should re-test the sheet scroll fix on device —
the root-cause diagnosis (N6 pull gesture arming under the scroll lock) was
made from the code paths, not reproduced on hardware.

## 2026-07-04 — Session 46 (cont. 2): Batch 9 intake + N32 fix (PR #145)

Owner field-tested the PR #144 drill-down and handed over one bug + two
changes in-chat (verbatim = **backlog appendix Batch 9**, all → **N32**,
fixed on the open PR #145 branch):

- **Scroll bug root-caused** — not an N15 defect: the scroll lock's
  `position:fixed` zeroes `window.scrollY`, so the N6 `PullToRefresh` armed
  on every drag over any open sheet (pull spacer moved the page behind the
  scrim; a long drag fired `router.refresh()` mid-interaction). Present on
  **all** sheets since N6 shipped (2026-07-03); the drill-down was simply the
  first long sheet tested after it. Fix: `isScrollLocked()` export +
  `PullToRefresh` guard, `overscroll-contain` + touch isolation on
  `BottomSheet`.
- **Drill-down opens on sets/reps** — owner reverted the e1RM-first opening;
  `initialFlipped`/`e1rm_first` removed everywhere (PH32 default holds).
- **Exercise-name link** — the history sheet subtitle's exercise name links
  to `/exercises/{id}` on every entry point (`BottomSheet.subtitle` is now a
  ReactNode).

Green: typecheck, lint, 778 tests, production build. 09 entry "2026-07-04
(session 5)"; PROGRESS updated. N32 rides PR #145 (the docs-sweep PR, now
docs + fix); archive sweep falls to the next session.

## 2026-07-04 — Session 46 (cont.): PR #144 merged — in-session sweep

PR #144 merged with checks green while the session was live, so the
reconciliation sweep ran in-session: **N15, N24, N26, N27, N28 archived**
(`archive.md`, "Swept 2026-07-04 (later 4)"). Docs-only follow-up PR on the
branch restarted from merged main (same name). Live index is now: N1 (WS-J
remainder), N18-B (per-week RIR), N21 (target-engine needs-decision), N25
(InfoDot + glossary), N29 (picker filters + FilterBar), PH30 deferred,
R24/R25 remainders. **WS-C and WS-E are clear** (N21 decision aside).

## 2026-07-04 — Session 46: PR #143 swept; attack-order slots 4+5 built — N24 + N15 + N26 + N27 + N28 (PR #144)

Reconciliation sweep: **N31 archived** (`archive.md`, "Swept 2026-07-04
(later 3)" — PR #143 merged). Branch restarted from merged main. No new notes
handed over → picked the next attack-order slot (N24), folded in the three
small `ready` items (N26/N27/N28), then continued into the follow-on stats
slice (N15):

- **Headers (WS-D):** **N24 done** — sticky `MacroHeader` on the shared
  header grammar (brand row + `MACROCYCLE` label, title + ⋮ `AnchoredMenu`
  with "Edit macrocycle" → the existing `/edit` route, meta line +
  ACTIVE/COMPLETE/ARCHIVED badge, goal-notes line); the bottom EDIT
  MACROCYCLE link removed; route skeleton mirrored (stale N21 target-card
  block dropped). Header unification complete: day view / meso / exercise /
  macro share one idiom. No share button (macros aren't a `ShareObjectType`),
  no archive row (N19 wontfix).
- **Navigation (WS-E):** **N27 done** — the day-view "Mesocycle stats" menu
  row carries `&from=/log/<workoutId>`; the meso page validates it (N4 guard)
  and threads new optional `backHref`/`backLabel` props into `MesoHeader`
  (`‹ WORKOUT` when honored, `‹ CYCLES` default).
- **Day view (WS-E):** **N26 done** — set rows scaled +10% per the scoped
  values (35px cells / 15px values / 23px LOG box / 5px padding); the R18
  full-cell tap targets grow with the cell; grid templates untouched.
- **Cycles list (WS-D):** **N28 done** — pure `orderCyclesTopLevel`
  (`start_date ?? created_at` desc, `created_at` tie-break) applied to macros
  + standalone mesos in `getCyclesOverview`; `orderMesos` untouched; 3 unit
  tests.
- **Stats drill-down (WS-C):** **N15 done** — `getExerciseHistory` gains an
  optional `scopeMesoIds` filter (N30 pagination applies within the scope);
  threaded through the action (zod uuid array ≤100) and the list's pager.
  `HistorySheetTarget` gains `meso_ids`/`scope_label`/`e1rm_first`; macro
  muscle-group **contributor rows** and meso **ALL EXERCISES rows** open the
  sheet scoped to their cycle, **e1RM-first** (tap flips to sets/reps —
  inverse of the PH32 default per the owner). `StrengthProgressSection` became
  a client component; MCP `get_exercise_history` contract unchanged.

Green: typecheck, lint, 778 tests (+3), production build. 09 entry
"2026-07-04 (session 4)"; PROGRESS updated. Archive sweep for this PR's rows
falls to the next session. **WS-C is now fully clear except the N21
needs-decision.**

Next per the attack order: **N29** (from-template picker filters; the unified
FilterBar remains triaged), **N25** (InfoDot + glossary). Open decisions:
N18-B (per-week RIR), N21 (target engine), R24/R25 remainders, WS-J phase
2/3.

## 2026-07-04 — Session 45: PR #142 swept; N31 intake + fix (PR #143)

Reconciliation sweep: **N22, N23, N30 archived** (`archive.md`, "Swept
2026-07-04 (later 2)" — PR #142 merged). Branch restarted from merged main.

Owner handed over one bug note in-chat (verbatim = **backlog appendix Batch
8**): substituting an exercise on the planner board of a *planned* meso
appended the pick instead of replacing, kept the original, showed both
selected on re-open, and (via the group multi-select's `exercise_slots`
growth) left an empty slot after manual cleanup.

**Root cause (one defect, both bullets):** a filled board row opened the same
group-wide multi-select `ExercisePicker` as an open slot (`setPicker({group,
day})` with no notion of the tapped fill). Selection is seeded with the
group's current exercises, so a "replacement" tap *adds* to the set;
`setGroupExercises`/`planGroupExercises` append new picks after the day's
last position and `exercise_slots: max(layout, slots)` grows the group. The
board simply had no replace-in-place path (MCP's `edit_mesocycle
swap_exercise` did; the app didn't).

**N31 fixed (same PR):** `PickerTarget` gains `replaceFill`; a filled-row tap
opens the picker in **replace mode** — single-select (radio), seeded with the
current movement, rows already filling *another* slot of the group disabled
(`ALREADY IN THIS GROUP`), sheet titled "Replace exercise" with a
`REPLACE EXERCISE` submit (disabled until a different pick). The swap keeps
the fill's id/day position/slot/starting sets: staged in editing mode (the
owner's planned-meso path, committed via SAVE CHANGES), and a new
`replaceSlotAction` → `replaceSlotExercise` single-row `exercise_id` update
on live drafts, with a query-layer duplicate guard (+5 unit tests). Open-slot
taps keep the original multi-select unchanged.

Green: typecheck, lint, 775 tests (+5), production build. 09 entry
"2026-07-04 (session 3)"; PROGRESS updated. Archive sweep for N31's row falls
to the next session.

## 2026-07-04 — Session 44: attack-order slot 3 built — N22 + N23 + N30 (PR #142)

Reconciliation sweep: no-op (PR #141's sweep already archived N14/N16/N17/N20;
open PRs are only dependabot + stale #48). No new notes handed over → picked
the next attack-order slot (N22+N23) and pulled the N30 rider in with it (its
scoping said "ride with N15 or N22"; it shares the exercise-page surface):

- **Exercise surfaces (WS-F):** **N22 done** — (a) sticky `ExerciseHeader` on
  the meso-header grammar ([share][⋮] on `AnchoredMenu`; the I13 Load-step
  sheet refactored to a controlled `LoadStepSheet` in the ⋮ menu, disabled
  with a `BODYWEIGHT` tag on bodyweight-only lifts instead of vanishing;
  share moved off the OVERVIEW tab; **new in-app delete** for owned custom
  exercises with the MCP tool's exact guards + a blocker-explaining confirm
  sheet); (b) create-exercise page rebuilt in ledger sections with the load
  step settable at creation (per-equipment `DEFAULT +n lb` chip from
  `engine_params.rounding`); (c) MCP parity — `create_custom_exercise`
  +`notes`/+`weight_increment`, new **`set_exercise_increment`** tool (first
  MCP increment surface; doc 05 table updated). **N23 done** — `+ NEW` on the
  exercises page is now a tray (Blank exercise / OR ADD FROM A CODE with the
  kind-agnostic `RedeemForm`); backend untouched.
- **History depth (WS-C):** **N30 done** — `getExerciseHistory` cursor-paged
  on whole calendar days (`pageSetsByDay` pure helper + 7 unit tests; the
  day grain makes identical-timestamp import artifacts unable to split or
  dupe a session across pages); `ExerciseHistoryList` lazy-loads older pages
  via a `LOAD OLDER` IntersectionObserver row (tap fallback + retry);
  HISTORY tab + `HistorySheet` inherit; MCP first-page contract unchanged.
- **N15 unblocked further:** the scoped drill-down should reuse N30's
  pagination (row updated).
- Design records: 09 entry "2026-07-04 (session 2)" (four no-mockup deltas);
  PROGRESS.md updated. Green: typecheck, lint, 770 tests (+7), production
  build.

Next per the attack order: **N24** (macro header adoption), then **N27 + N26**
(back-link origin + set-row sizing), **N15** (scoped history drill-down),
**N28** (start-date sort), **N29** (picker filters). Archive sweep for this
PR's rows falls to the next session.

## 2026-07-04 — Session 43 (cont.): PR #140 merged — in-session sweep

PR #140 merged with checks green while the session was live, so the
reconciliation sweep ran in-session: **N14, N16, N17, N20 archived**
(`archive.md`, "Swept 2026-07-04 (later)"). Rows kept live for the
remainders: **N18** re-scoped to Part B only (per-week `rir_schedule`),
**N21** now purely the target-engine needs-decision (hide is merged).
Docs-only follow-up PR on the branch restarted from merged main (same name).
Live index is now: N1 (WS-J remainder), N15+N30 (unblocked stats slice),
N22+N23 (next attack-order slot), N24–N29 remainders, PH30 deferred,
R24/R25 remainders.

## 2026-07-04 — Session 43: attack-order slots 1+2 built — N14/N16/N21-hide + N17/N18-A/N20 (PR #140)

Reconciliation sweep: no-op (only dependabot PRs + stale #48 open; no `done`
rows live). No new notes handed over → picked the top of the Session-42 attack
order and shipped the first two slots as one PR (single designated branch):

- **Stats trust (WS-C):** **N14 done** — `dropE1rmOutliers` in the shared fold
  (sessions >3× from the window median dropped; generous by design so real
  beginner runs survive). **N16 done** — bespoke `buildMacroStats` fold
  deleted; the tile now reads pure `keyLiftStrengthPct` over the same
  qualified scores as the Performance tab (MCP inherits via
  `getMacroOverview`). **N21 hide done** — both target cards removed, engine +
  columns + block math kept; the target-engine correction stays open
  (needs-decision). 9 new unit tests incl. the 7-lb endpoint case and the
  deload-tail regression.
- **Planner/create (WS-D):** **N17 done** — START SETS stepper on filled
  board rows (staged + live-draft paths, clamp 1–20). **N18-A done** —
  FinalizeSheet ramp line is a collapsed disclosure → START/END RIR + deload,
  optional override through `finalizeSchema`/`finalizeDraftMeso`; **Part B
  (per-week RIR) still open.** **N20 done** — `RedeemForm` in the new-cycle
  tray (rode here instead of with N23).
- **N15 unblocked** (was sequenced behind N14/N16); rides with N30 next.
- Design records: 09 entry (2026-07-04) for the three no-mockup control
  deltas + the N21 card removals; PROGRESS.md updated. Green: typecheck,
  lint, 763 tests (+9), production build.

Next per the attack order: **N22 + N23** (exercise page overhaul + sharing
trays), then **N24**, **N27 + N26**, with **N15 + N30** as the follow-on
stats slice. Archive sweep for this PR's rows falls to the next session
(a merged PR can't sweep its own rows).

## 2026-07-04 — Session 42 (cont.): Batch-7 addendum — owner clarifications (PR #139)

Owner reviewed the intake findings in-chat (with a /cycles screenshot) and
returned five clarifications; verbatim capture = **backlog appendix Batch 7
addendum**. Deltas applied:

- **N30 (new, F, MED, WS-C, ready)** — the 120-set history cap surfaced by
  N14's scoping is itself unwanted: full history must be reachable via
  lazy-load/pagination (~120 initial page is fine). Scoped: keyset pagination
  on `getExerciseHistory` + a sentinel in `ExerciseHistoryList`/`HistorySheet`.
  Rides with N15 or N22.
- **N22 expanded** — the increment gap is at **creation**: rebuild the
  create-exercise page (general UI overhaul + Load-step settable at creation;
  today it's create-then-edit), and **MCP parity** — `create_custom_exercise`
  lacks increment (and notes); no MCP increment surface exists at all.
- **N23 confirmed as scoped** — the point is the receptacle where users
  expect it (new-exercise tray), even though redeem is already kind-agnostic.
- **N19 → wontfix, archived** ("Drop the archival bit"). The side-finding —
  app meso delete cascades logged history behind an ack checkbox while MCP
  refuses (rule-5 spirit gap) — was not ruled on; noted in the archive row
  for whenever the delete flow is next touched.
- **N28 needs-input → ready (UX→B)** — the screenshot resolved it: completed
  macros render oldest-first because their `created_at` is an import-order
  artifact. Fix = top-level sort by training start date desc (fallback
  created_at); within-macro order confirmed correct, untouched.

Attack-order impact: slot 4 becomes **N24 alone** (macro header, menu =
edit/goals — no archive row); N30 joins the N15 slice (or rides N22).

## 2026-07-04 — Session 42: Batch 7 intake — 16 new items (N14–N29) (PR #139)

Reconciliation sweep: no-op (PR #138 — the I12/N13 sweep — merged; no `done`
rows live; open PRs are only dependabot + stale #48). Owner handed over 19
stream-of-thought notes; ran the intake protocol. Verbatim capture = **backlog
appendix Batch 7**; all items scoped against the code at intake (4 parallel
scoping passes; full file:line detail in `scoping.md` § Batch 7). Notes-only
PR — no code changed. New workstream **M** (in-app help & education) added to
the roster.

**Merges at parse time:** notes 9+11 → **N22** (exercise page overhaul +
header + increment); notes 10+12 → **N23** (exercise sharing entry points);
notes 18+19 → **N29** (filter UI). 19 notes → 16 items.

**Key scoping findings (premise checks worth knowing before building):**
- **N14/N16 (HIGH, stats trust):** both macro-stat complaints are real and
  share a root — single-first/last-session endpoints with no qualification.
  N14: `foldProgressScores` lets one unrepresentative early session (e1RM 7)
  define the denominator, and the 120-set history cap hides that session from
  the history view. N16: the KEY LIFTS tile is a separate bespoke fold that
  includes deloads and means only the 3 most-logged lifts — a cut ending on a
  deload reads -36.3% while the qualified Performance pipeline stays positive.
  One PR can fix both against one definition.
- **N17 (HIGH):** planner set-count editing is UI-only — `initial_sets` is
  already plumbed model→board→save→engine seed; it's just hardcoded to 3 with
  no stepper.
- **N19 (HIGH, data-loss surface):** the app's meso delete cascades logged
  history behind an ack checkbox — violates hard rule #5's spirit (MCP side
  already refuses). Archive-not-delete via `archived_at` + `/more/archive`.
- **N22/N23 (premises contradicted by shipped code):** the increment setting
  already exists (I13 Load-step sheet) — it's just behind a faint `⋯` that
  vanishes on bodyweight-only lifts; exercise sharing already works
  end-to-end incl. **kind-agnostic redeem** (a meso code entered anywhere
  routes correctly — the owner's hoped-for behavior is already built). The
  real gaps: header/discoverability + `RedeemForm` mounting only in the
  templates tray.
- **N28:** top-level cycle lists are **already newest-first** (`created_at`
  desc) — needs-input: which list looked wrong, or is `start_date`-desc the
  ask?
- **N21:** target-engine audit found real smells (age/sex applied only to
  hypertrophy; discontinuous model flip on profile completeness; cut cap
  collapse). Interim hide is small and keeps the timeline's `plan.phases`
  dependencies intact.

**Suggested attack order for the build sessions:**
1. **N14 + N16 + N21-hide** (stats-trust PR — all in `stats.ts`/`macro.ts`
   folds + two view-card removals; HIGH).
2. **N17 + N18-A + N20** (planner/create PR — stepper + advanced RIR
   disclosure + tray redeem; small pieces, one surface family).
3. **N22 + N23** (exercise page overhaul + sharing trays; owner-authorized
   design delta needed → 09 entry at build time).
4. **N19 then N24** (archive-not-delete, then the macro header that hosts the
   macro-side archive row — or one PR if capacity allows).
5. **N27 + N26** (small day-view PR: origin-aware back links + row sizing).
6. **N29-picker** (small wiring) whenever a templates PR is open; the unified
   FilterBar and **N15** (drill-down, after stats are right) as their own
   medium slices; **N25** (InfoDot + glossary) incremental.

Open from before: N1 WS-J remainder (Phase-2 caching / Phase-3 streaming),
R24 reprice-down investigation, R25 tool consolidation, PH30 deferred.

## 2026-07-03 — Session 41 (cont.): PR #137 merged — in-session sweep

PR #137 merged with all checks green while the session was live, so the
reconciliation sweep ran in-session: **I12 + N13 archived** (`archive.md`,
"Swept 2026-07-03 (later 7)"). With I12 closed, the live index is down to
N1 (in-progress, WS-J remainder: Phase-2 #5/#7 caching + Phase-3 streaming),
PH30 (deferred), and the R24/R25 remainders. The four new I12 surfaces have
no mockups — the owner's field feedback is the acceptance check; reopen
anything that doesn't hold up. Docs-only follow-up PR (branch restarted from
the merged main, same name).

## 2026-07-03 — Session 41: N13 fix + I12 completed (owner-authorized design) (PR #137)

Same session, continued after PRs #134/#135 merged. Owner handed over Batch 6
in-chat (appendix): N1 skeletons **confirmed on device**; **I12 design
authorization** ("rework in any way you see fit"); **N13** — reset-to-
prescription broken on an exercise's first set.

- **N13 — done (HIGH, B, WS-G).** Root cause was R13-era, not N5: the reset
  echo (`set_weights` cleared → `plannedWeight` null) arrives through the
  planned-input re-sync channel, whose typed-row guard never releases on an
  unlogged row — and set 1 is necessarily typed-in, since typing is what makes
  the reset option appear. The override-CLEARING transition is now its own
  `prescription-reset` class in `day-rules.ts::adoptServerRowState` (always
  adopt + clear the typed flag); already-null transitions (bodyweight edit
  while typing) keep the R13 protection. Swap path (N5 remount key) verified
  intact. +1 unit test.
- **I12 — done (PR #137 closes it).** The four remaining pieces built to
  Claude's design (09 2026-07-03 session 4 = design of record): **Place into
  macrocycle** sheet on standalone planned mesos (rows state `FILLS M2` /
  `ADDS AS M5` exactly, computed with the same pure `planMacroPlacement` the
  write uses; lands on the macro timeline); **Edit details** sheet (name any
  time, weeks/RIR/deload segmented controls until start — finalize-sheet
  grammar); **BLOCKS** section on the macro edit page (▲▼ on not-yet-started
  rows, never crossing a locked one; ✕ on open slots; dashed + ADD BLOCK;
  applies immediately); **WEEKLY SETS PER MUSCLE** live readout on the
  planner board with MEV/MRV bands, out-of-band emphasized in ink. The R14
  fold relocated to `lib/plan/volume-preview.ts` (client-safe, type-only
  imports — `/plan` holds 121 kB) with `previewVolume` staying server-side;
  MCP re-exports keep its callers/tests intact. Deliberately MCP-only:
  explicit-position placement, phase editing.
- **Verified:** typecheck, lint, 754 tests (+1), production build (meso page
  +1.4 kB for two sheets; `/log` 127 kB unchanged). New surfaces flagged for
  the owner's normal use — no mockup existed, so field feedback is the check.

## 2026-07-03 — Session 40 (cont.): PR #134 merged — in-session sweep

PR #134 merged with all checks green while the session was live (the new e2e
job + integration suite passed on the final commit), so the reconciliation
sweep ran in-session: **R21 archived** (`archive.md`, "Swept 2026-07-03
(later 6)"). I12 (advanced — remainder needs owner design input) and N1
(skeletons shipped, device-check pending) correctly stay live. Live index is
now: I12, N1, PH30 (deferred), R24/R25 remainders. Docs-only follow-up PR
(branch restarted from the merged main, same name).

CI-iteration note for the record: the e2e run surfaced and fixed a real app
bug before merge — `/exercises` 414'd on the local stack (330-id `.in()`
query string in `listExercises`; hosted merely tolerated the oversized URI) —
plus two harness fixes (fixture `weeks` floor, LOG click landing on the
transient saving span). Exactly the class of regression R21 was filed to
catch.

## 2026-07-03 — Session 40: R21 (all 3 bullets) + N1 per-route skeletons + I12 scoping & first slices (PR #134)

Reconciliation sweep: no-op (PRs #132/#133 merged; Session 39's in-session
sweep already archived their rows; no `done` rows live). Worked the recorded
order — **R21** (last full-weight review item), the **N1 Phase-A escalation**,
and **I12** — on branch `claude/r21-i12-progress-o2pp6r`, **PR #134**. Full
record in PROGRESS 2026-07-03 (latest); the I12 UI delta is a dated 09 entry
(2026-07-03 session 3).

- **R21 — done, all 3 bullets.** (a) v18 golden meso (`golden-meso-live.test.ts`):
  anchored lifter simulated over 5 weeks + deload with the anchor recomputed
  from the logged sets each week — pins the seed-from-anchor, the rep climb
  bounded to the window, the anchor-based RIR-6 deload, and a
  bodyweight_loadable effective-load scenario; every number hand-verified
  before pinning. (b) `tests/integration/write-pipeline.test.ts` — the
  activate/seed → log → complete → generate round-trip through the real query
  layer + RPCs, riding the CI rls-tests job (skips nothing; hard-fails without
  a stack, like the RLS suite). (c) Playwright e2e smoke + config + dedicated
  CI e2e job — sign-in → START → log incl. the auto-prompted feedback sheet →
  complete → asserts the engine-generated W2·D1. `test:e2e` is no longer dead.
  No Docker in this sandbox → both stack suites verified via the PR's CI
  (first run caught the fixture's `weeks: 2` vs the 3–8 schema check).
- **N1 — per-route skeleton slice shipped** (row stays in-progress, WS-J).
  Root cause recorded in `J-performance.md`: sibling navs never re-suspend the
  group-level `(app)/loading.tsx` boundary — only routes with their OWN file
  paint on tap, which is exactly the two that behaved. 9 routes got
  layout-mirroring skeletons; `<Link>` prefetch carries the shells. Owner
  device-check pending.
- **I12 — advanced.** Full in-app-vs-MCP gap table now in `scoping.md` § I12
  (helpers all exist; delta is pure UI). Shipped the two slices that fit the
  existing design grammar: ⋮ menu **Duplicate mesocycle** + the **proactive
  START gate** (disabled + reason via the same pure `mesoActivationBlock`).
  Remaining pieces (attach-into-macro picker, header edit after finalize,
  direct slot add/remove/reorder, plan-time volume preview) each lack a mockup
  figure — queued for a design delta / owner input before building.
- **Verified:** typecheck, lint, 753 unit tests (+2), production build. CI
  (rls-tests incl. integration, e2e) is the merge gate for the stack suites.

**Next:** the I12 remainder needs owner design input (4 pieces listed in
`scoping.md`); N1 continues (device-verify the skeletons, then Phase-2 #5/#7
caching or Phase-3 streaming as measured); R24 reprice-down investigation and
R25 tool-surface consolidation stay parked.

## 2026-07-03 — Session 39 (cont.): PR #132 merged — in-session sweep

PR #132 merged with all checks green while the session was still live, so the
reconciliation sweep ran immediately instead of waiting for the next session's
resume protocol: **N12/N9/N10/N6 archived** (`archive.md`, "Swept 2026-07-03
(later 5)"). Live index is now down to N1 (in-progress, WS-J), R21, R24/R25
remainders, and I12. Docs-only follow-up PR (branch restarted from the merged
main, same name).

## 2026-07-03 — Session 39: N12 + N9 + N10 + N6 — WS-J logging slice + Performance-tab reorg + PTR (PR #132)

Reconciliation sweep: PR #131 merged → **N5/N7/N8/N11 archived** (swept to
`archive.md`, "Swept 2026-07-03 (later 4)"; N5+N7 stay flagged there for the
owner's on-device spot-check). Then built the next two slots of the recorded
attack order in one PR, branch `claude/outstanding-issues-review-r56zpv`.
Full record in PROGRESS 2026-07-03 (latest); N9/N10's design delta is a dated
09 entry (2026-07-03 session 2).

- **N12 — done.** Latency: the `logSet` stamp chain (4 serial SELECTs before
  every set write) is one embedded PostgREST read (smoke-tested against live
  REST — 200, embeds resolve); the `in_progress` flip is skipped past
  `planned`; the reconcile gate's completed-work watermark now reads
  closed (completed/skipped) workouts only, so the first set of a session no
  longer busts the gate (its own status flip was the buster) — conservatism
  test extended, +1 case. Signature key set changed ⇒ each meso pays one full
  reconcile on first open post-deploy, then the gate re-engages. Hang: the LOG
  spinner tracks the server action (15s watchdog), acknowledges on
  write-confirm via `ack` state, and the revalidation echo remounts the row;
  timeout = shake + "safe to try again" (R3 upsert). Deferred-with-reasons:
  J-Phase-2 #5 (needs #7's tagging), #6 (columns are ~fully consumed; bytes
  not round trips) — recorded in `J-performance.md`.
- **N9 — done.** `rollupMuscleProgress` keeps its per-exercise attribution as
  `contributors[]` (role-tagged, best first; multi-group appearance = expected
  fractional credit; +unit assertions); new client `MuscleStrengthSection`
  renders group rows with ▸/▾ drill-down on the macro Performance panel; the
  flat ALL-EXERCISES list is gone at macro scope. Meso tab component untouched;
  MCP summaries project explicit fields, so nothing leaks there.
- **N10 — done.** Key-lift grid + across-macro chart deleted from
  `PerformanceView` and `stats.ts` (`buildKeyLifts`, top-set fold, chart query,
  `KeyLift`/`MacroChartBar` types; 2 retired tests). The `contextLine` meso
  position is re-derived from the macro's meso ordering — decoupled from
  `keyLifts[0]` and now present even without a lead lift.
- **N6 — done.** `PullToRefresh` wrapper in `(app)/layout.tsx` (document
  scrolls → one wrapper covers day view + all `/cycles/**`): armed at
  `scrollY === 0` only, resisted pull, threshold release → `router.refresh()`
  in a transition, travelling-gap square indicator;
  `overscroll-behavior-y: contain` kills Android's native PTR double-fire.
- **Verified:** typecheck, lint, 751 tests (+1 gate, −2 retired), production
  build with CI env — `/log` + `/workout` hold at 127 kB. No local stack;
  N12 feel + N6 gesture flagged for the owner's on-device check.

**Next:** R21 (MED — e2e/integration coverage, unblocked once the R2 chain
boots locally) is the last review item at full weight; **I12 in-app planner
UX** remains the open large HIGH; R24's hold-week reprice-down investigation
and R25's tool-surface consolidation stay open (in-progress rows). N1 Phase-A
per-route skeletons (the escalated 1-2s nav gap) is the next WS-J slice.

## 2026-07-03 — Session 38: N5 + N11 + N7 + N8 — the four scoped Batch-5 quick fixes (PR #131)

Reconciliation sweep: no-op (PR #130, the Batch-5 intake, merged — it was
notes-only with no `done` rows to sweep; R24/R25/I12 correctly stay live).
Built the first slot of Session 37's suggested attack order — the four
one-file items in a single PR, branch `claude/notes-n5-n11-n7-n8-jt2yyi`.
Full record in PROGRESS 2026-07-03 (latest); N8's design delta recorded as a
dated 09 entry (figs 2.1/2.2).

- **N5 — done.** Went with the scoped lowest-risk option: the `SetRow` key now
  carries `we.exercise_id`, so a replace remounts the rows and the editable
  set-1 `useState` re-initializes from the new exercise's prescription. The
  re-sync effects are untouched (R13 semantics preserved).
- **N11 — done.** The P19 marker memo extracted to pure
  `day-rules.ts::loggedSetMarker`; unreported RIR now compares at the week's
  target RIR on both sides instead of defaulting the logged side to 0.
  6 new unit tests (deload regression, working-week, over/under, reported-RIR
  directions, null guards). Note: a *reported* RIR still counts — same
  weight/reps at RIR 0 against a target of 3 correctly reads ▼.
- **N7 — done.** `useScrollLock` rewritten to the `position:fixed` +
  `top:-scrollY` pattern with exact restore on release; scrollbar-padding
  compensation and the stacked-overlay ref count kept. Every sheet/menu rides
  the same hook, so the fix is global.
- **N8 — done.** `/cycles` `StatusMark`: planned → PLANNED text badge
  (CURRENT's geometry in ink — the owner's "white" resolves to ink, which
  renders cream-white under the dark ledger inversion); checkbox reserved for
  completed; muting widened to planned + unplanned on macro-grouped AND
  standalone rows. Macro timeline: numbered marks stay, planned rows swap the
  progress bar for the badge, same muting adopted.
- **Verified:** typecheck, lint, 752 tests (+6), production build (`/log`
  127 kB — day-rules imports the zod-free predict core only). No local stack
  in this sandbox; N5 + N7 flagged for the owner's on-device spot-check
  (N7 is installed-iOS-PWA-specific).

**Next per the Session-37 attack order:** **N12** (set-log latency + hanging
spinner, HIGH) as the opening WS-J slice, folding in N1 Phase-2 deferreds
#5/#6; then **N9+N10** (Performance-tab rework, ship together). **N6**
(pull-to-refresh) rides whenever a day-view PR is open. R21 (MED) remains the
last review item at full weight; I12 in-app planner UX still the open large
HIGH.

## 2026-07-03 — Session 37: Batch 5 intake — 8 new items (N5–N12) + N1 escalation (PR #130)

Reconciliation sweep: no-op (PR #129 merged; R24/R25 correctly stay live —
in-progress with open remainders; no `done` rows). Owner handed over 9 field
notes; ran the intake protocol. Verbatim capture = **backlog appendix Batch 5**;
all actionable items scoped against the code at intake (3 parallel scoping
passes; full file:line detail in `scoping.md` § Batch 5). Notes-only PR — no
code changed.

- **N5 (HIGH, B, WS-G, ready)** — replace-exercise leaves the old exercise's
  numbers on set 1 only. **PH38's symptom returned via a different mechanism**:
  the PR #84 `set_weights` clear is intact; the culprit is retained client
  `useState` on the editable first row — its re-sync effect deps
  (`plannedWeight`/`bodyweight`) don't change across a swap, and neither the
  card key (`we.id`, stable through replace) nor the row key includes
  `exercise_id`, so nothing remounts. Sets 2+ are prop-derived (always fresh).
  Trivial-small fix, two options recorded.
- **N6 (MED, F, WS-E, ready)** — pull-to-refresh. Doesn't exist; standalone-PWA
  mode is why native PTR is gone. One shared wrapper in `(app)/layout.tsx`
  (document is the scroll container; no cycles sub-layout) covers day view +
  all `/cycles/**` at once.
- **N7 (MED, UX, WS-E, ready)** — note-sheet scroll drift. Root cause:
  `useScrollLock` never captures/restores `scrollY`; one-file fix covers every
  sheet/menu.
- **N8 (HIGH, UX, WS-D, ready)** — planned-meso badge: white PLANNED text badge
  (CURRENT's style), checkbox only when completed, `+ PLAN` unchanged, mute
  everything not current/completed. Maps to `/cycles` `StatusMark`. The
  macro-timeline question was **answered same-session (appendix Batch 5
  addendum):** numbered marks stay; planned rows swap the right-side progress
  bar for the PLANNED badge; both surfaces adopt the muting scheme.
- **N9 + N10 (HIGH, F, WS-C, ready — ship together)** — Performance-tab
  reorg: macro tab promotes the muscle-group rollup to primary with per-group
  exercise drill-down (rollup already sees the attribution, just discards it);
  meso tab drops the key-lift top-sets grid + across-macro chart (net deletion;
  `keyLifts[0]`→`contextLine` coupling flagged). Amends the PR #104 surfaces —
  record a 09 changelog delta at build time.
- **N11 (MED, B, WS-G, ready)** — deload ▼ at exactly-prescribed performance.
  Root cause: RIR-asymmetric marker comparison (prescribed side uses target RIR
  ≈6 on deloads; logged side `rir_reported: null` → 0). 1-3 line fix; extract
  the memo to `day-rules.ts` for tests.
- **N12 (HIGH, B, WS-J, ready)** — set-log latency + never-resolving spinner.
  Latency: ~6 serial round-trips in `logSet` + the first set of each session
  busting the reconcile gate (its own `in_progress` flip bumps the gate's
  `workouts.updated_at` watermark) + double `revalidatePath`. Hang: the spinner
  is transition-pending on the **revalidation commit**, not the write, with no
  timeout. Build as a WS-J slice with N1 Phase-2 deferreds (#5/#6).
- **N1 escalated** (9th note folded in, not a new row): 1-2s dead nav gaps
  persist (cycles pages worst); owner's bar = immediate switch + skeleton
  everywhere, day view is the only page doing it right. This **disproves the
  Phase-A architecture note** that Link navs already paint the
  `(app)/loading.tsx` fallback — logged in `J-performance.md` as the next
  Phase-A action (verify on device, then per-route skeletons/streaming).
- Housekeeping: pruned `scoping.md`'s stale "not yet researched" list
  (PH29/PH38/PH31/PH32/PH37 all shipped).

**Suggested attack order for the next build sessions:** the three scoped
one-file bugs first — **N5 + N11** (both day-view, trivial) and **N7**
(`useScrollLock`), plus **N8** (small, two badge components) — one PR could
carry all four. Then **N12** as the opening WS-J slice (biggest daily-loop pain,
HIGH), folding in N1's revalidation-narrowing deferreds. Then **N9+N10**
together (Performance-tab rework, medium). **N6** (pull-to-refresh) rides
whenever a day-view PR is open. R21 (MED) remains the last review item at full
weight; I12 in-app planner UX still the open large HIGH.

## 2026-07-03 — Session 36 (cont. 5): PR #127 merged + R25 mechanical fixes (PR #129)

- **PR #127 MERGED** (all checks green). No sweep: R24 stays live
  (in-progress — the reprice-down investigation remains open); its row now
  reads "mechanical fixes merged (PR #127)".
- Note: enabling dependabot (R23) immediately opened **PRs #123–126**
  (3 github-actions majors + 1 grouped npm minors batch) — left for the
  owner to review; they consumed the #123–126 numbers, which is why the R24
  PR landed as #127.
- Continued the LOW tail — **R25, the 3 mechanical bullets** (LOW, WS-K),
  **PR #129**. The tool-surface consolidation (+ full error-contract
  convergence) stays open as a deliberate design pass — row narrowed.
- **R25 (3/4) — done.** (a) `recordMcpWrite` never throws: every caller runs
  it AFTER the mutation commits, so an audit failure inverted a successful
  write into `isError` and a retrying agent duplicated drafts — now
  log-and-return (`reportError("mcp:audit")`); 3 new tests incl. both
  failure shapes. (b) Resource handlers (`profile`, `current-cycle`,
  `coaching-guide`) wrapped in `guardResource`: report + rethrow a clean
  structured message — the raw-Postgrest `[object Object]` path the tool
  wrapper was built to kill is closed on the resource surface too.
  (c) `MCP_JWT_AUDIENCE` enablement runbook step added to
  `manual-operations.md` (until set, any project-issued user JWT is a valid
  `/api/mcp` bearer — decode the connector token's `aud`, set the var,
  redeploy, retest).
- **Next per the attack order:** R21 (MED, testing infra — the last review
  item at full weight); the R24/R25 remainders are parked design/investigation
  items. N1 (WS-J) and I12's in-app planner UX remain the open HIGH-priority
  workstreams.

## 2026-07-03 — Session 36 (cont. 4): PR #122 merged + R24 mechanical fixes (PR #127)

- **PR #122 MERGED** (all checks green). Archival sweep ran: **R23 swept to
  `archive.md`** ("Swept 2026-07-03 (later 3)"); branch restarted from the
  merged main. Sweep rides with this PR.
- Continued the LOW tail — **R24, the 4 mechanical fixes** (LOW, WS-G),
  **PR #127**. The 5th bullet (hold-week reprice-down) stays open per the
  owner's 2026-07-02 ruling ("no fix decided yet") — row narrowed to it.
- **R24 (4/5) — done.** (a) `engineParamsSchema.superRefine`: rep_window
  `min ≤ target_low ≤ target_high ≤ max` per goal + `min_sets ≤
  max_sets_per_exercise` — a bad row can no longer be activated (doc 04);
  verified every hosted row v1–v18 passes (SQL invariant sweep), so replay
  is untouched. (b) `brzycki_max_eff_reps` capped ≤ 10 (the Epley/Brzycki
  crossing) — a higher cutoff made k(effReps) non-monotonic (more reps →
  heavier load); property tests pin monotonicity under both cutoff rules +
  inverse consistency. (c) No-anchor hold skips `roundToStep` — 27.5 lb on a
  5-lb step used to prescribe 30 with "hold 27.5 lb" in the rationale
  (negative control: verified old rounding → 30); regression test holds
  27.5 verbatim. (d) Stale `retire_prior_peak_seed` contract comments fixed
  (params.ts + seedMeso header): the legacy branch is deleted, the flag
  inert. 743 tests (+9), golden meso unchanged.
- **Next per the attack order:** R25 (MCP polish, LOW, WS-K); R21 (MED,
  testing infra). N1 (WS-J) and I12's in-app planner UX remain the open
  HIGH-priority workstreams.

## 2026-07-03 — Session 36 (cont. 3): PR #121 merged + R23 — repo hygiene batch (PR #122)

- **PR #121 MERGED** (all checks green). Archival sweep ran: **R22 swept to
  `archive.md`** ("Swept 2026-07-03 (later 2)"); branch restarted from the
  merged main. Sweep rides with this PR.
- Continued the LOW tail — **R23** (LOW, WS-L), **PR #122**. Full record in
  PROGRESS 2026-07-03 (latest).
- **R23 — done.** Dead code deleted: the 2 unused-but-live `"use server"`
  POST endpoints (`reorderGroupExercisesAction` + its now-orphaned
  `reorderGroupExercises` query, `saveProfileDetails` + schema/FormState);
  dead exports `listMacrocycles`, `setExerciseStatus`, `confidenceRank`
  (+ its private rank map); 6 unused UI components (Card, MenuCard,
  FeedbackScale, NumberStepper — with its stale-closure bug, RirBadge,
  WeekTrack); 7 engine-barrel over-exports trimmed (module exports intact).
  Views: `v_muscle_group_volume` (dead since initial schema, wrong week
  boundary/no fractional counting) **and** `v_meso_week_sets` (superseded by
  the R14 role-grain view; root CLAUDE.md's "pending retirement with R23"
  note resolved) retired via migrations `20260703000002` + `20260703000003`,
  **both applied live**; row types + registry entries removed. Dep nits:
  `@next/bundle-analyzer` aligned to next 15 majors, `tsx` now a real devDep
  (scripts doc `npx tsx`), dead `tests/unit/**` vitest include removed,
  `.github/dependabot.yml` added (weekly, grouped minors/patches).
- **Next per the attack order:** R24 (engine guardrail batch, LOW, WS-G) and
  R25 (MCP polish, LOW, WS-K); R21 (MED, testing infra) behind them. N1
  (WS-J) and I12's in-app planner UX remain the open HIGH-priority
  workstreams.

## 2026-07-03 — Session 36 (cont. 2): PR #120 merged + R22 — env validated at boot (PR #121)

- **PR #120 MERGED** (all checks green — `rls-tests` ran the new single-active
  constraint probe against the migrated chain). Archival sweep ran: **R15
  swept to `archive.md`** ("Swept 2026-07-03 (later)"), live index trimmed;
  branch restarted from the merged main. Sweep rides with this PR.
- Continued into the LOW tail per the attack order — **R22** (LOW, WS-L),
  **PR #121**. Full record in PROGRESS 2026-07-03 (latest).
- **R22 — done.** New `src/lib/env.ts`: zod-validated public Supabase env,
  parsed once, read by all four supabase factories + the MCP auth bridge (one
  definition; trailing-slash normalization included). A missing/typo'd/
  malformed var now throws one loud error naming every offending var instead
  of a generic 500 from inside @supabase/ssr. `next.config.ts` asserts
  presence at build/dev boot, so a Vercel misconfiguration can't ship at all
  (CI placeholders still pass). Service-role key deliberately stays out of the
  schema (hard rule #4 — confined to `service.ts`). 6 unit tests; build
  verified both directions (placeholder env builds; missing env fails loudly).
- **Next per the attack order:** R23–R25 (LOW tail), R21 (MED, bigger testing
  infra). N1 (WS-J) and I12's in-app planner UX remain the open HIGH-priority
  workstreams.

## 2026-07-03 — Session 36 (cont.): PR #119 merged + R15 — one live block per user (PR #120)

- **PR #119 MERGED** (all checks green). Archival sweep ran: **R11 + R12 swept
  to `archive.md`** ("Swept 2026-07-03"), live index trimmed; branch restarted
  from the merged main. Sweep rides with this PR.
- Continued per the attack order — **R15** (MED, WS-D), **PR #120**. Full
  record in PROGRESS 2026-07-03 (latest).
- **R15 — done.** One live block per user, app gate + DB guarantee:
  `startMeso` now blocks while ANY of the user's mesos is active (the old gate
  only checked same-macro siblings, so a standalone/other-macro meso could go
  live next to an in-flight block and `get_current_state`/the Workout tab
  silently followed the newest); new partial unique index
  `mesocycles_one_active_per_user` (migration `20260703000001`, **applied
  live + verified**, no pre-existing violations) makes it race-safe — the
  losing flip surfaces a friendly error (everything seeded pre-flip is
  R3-retry-safe); `activate_mesocycle` tool description now states the
  exclusive-activation contract instead of overstating the old one. Scratch
  PG16 chain green from zero (60 migrations + seed, 26/26 RLS tables, index
  present); 4-step SQL probe (second same-user activation → 23505, other
  users unaffected, completion frees the slot); new RLS-suite test
  ("single active meso (R15)") for CI.
- **Next per the attack order:** the LOW tail (R21–R25). N1 (WS-J) and I12's
  in-app planner UX remain the open HIGH-priority workstreams.

## 2026-07-03 — Session 36: R11 + R12 — reconcile pagination + custom-exercise load-type (PR #119)

Reconciliation sweep: no-op (PR #118 was itself the R9+R10 sweep; no `done`
rows live). Built the next two items in the recorded attack order — **R11 +
R12** (both MED, WS-G) — on branch `claude/review-outstanding-work-l9x34f`,
**PR #119**. Full record in PROGRESS 2026-07-03 (latest).

- **R11 — done.** Reconcile's decision fetch paged (`latestDecisionsByRow`,
  stable `created_at desc, id desc` order, early exit) — the unbounded fetch
  truncated at PostgREST `max-rows`, misclassifying old-decision rows as
  decision-less → re-seeded off the prior-meso peak. Grounded live: hosted has
  641 decisions (max 38/row) and climbing — this would have bitten soon.
  5 new unit tests incl. the beyond-page-1 truncation regression.
- **R12 — done.** `createCustomExercise` derives `load_type` at insert
  (`toEngineLoadType`); create vocabulary (new `src/lib/types/equipment.ts`)
  drops load-ambiguous bare `"bodyweight"` for the three load-typed labels
  (app form + action schema + MCP); MCP `create_custom_exercise` /
  `search_exercises` equipment args now zod enums (hard rule #6);
  `dedupeMuscleRoles` + link-failure cleanup kill the orphan-exercise path.
  **No backfill migration:** verified zero custom / bare-bodyweight rows on
  hosted.
- **Next per the attack order:** R15 (MED, WS-D); then the LOW tail
  (R21–R25). N1 (WS-J) and I12's in-app planner UX remain the open
  HIGH-priority workstreams.

## 2026-07-02 — Session 35 (cont. 4): PR #117 merged + archival sweep

- **PR #117 MERGED** (all checks green). End-of-session archival sweep ran:
  **R9 + R10 swept to `archive.md`** ("Swept 2026-07-02 (late 3)"), live index
  trimmed. Sweep shipped as its own small docs PR (a merged PR can't sweep its
  own rows); branch restarted from the merged main per the follow-up rule.
- **Session 35 total: three build PRs merged** — #115 (T-R2), #116 (R5+R7,
  migration `20260702000006` applied live), #117 (R9+R10) — plus this sweep.
- **Next per the attack order:** R11 + R12 (MED, WS-G); R15 (MED, WS-D);
  then the LOW tail (R21–R25). N1 (WS-J) and I12's in-app planner UX remain
  the open HIGH-priority workstreams.

## 2026-07-02 — Session 35 (cont. 3): PR #116 merged + R9 + R10 — analysis honesty fixes (PR #117)

- **PR #116 MERGED** (all checks green — `rls-tests` ran the 9 new
  completion-lock tests against the migrated chain). Archival sweep ran:
  **R5 + R7 swept to `archive.md`** ("Swept 2026-07-02 (late 2)"), live index
  trimmed; branch restarted from the merged main. Sweep rides with this PR.
- Continued per the attack order — **R9 + R10** (both MED, WS-G), **PR #117**.
- **R9 — done.** `analyzeComparableProgress` short-phase fix: with ≤ window
  points the rolling max equals the phase best and there is no prior baseline,
  so every phase start asserted "improving" — even a strict decline (the MCP
  surface built to kill false trend reads). Now a short phase reads the trend
  within the window (latest vs first, tolerance-banded → declining /
  improving / plateau). New trend cases incl. `[120,110,100]` → declining
  and the two-point drop; the flat day-slot series still reads plateau.
- **R10 — done.** `replay_decisions`' seed branch now passes the stored
  `bodyweight` to `seedMeso` — under the live v16 bodyweight model the replay
  omitted it, so every bodyweight-lift seed replayed as the deferred
  null-weight prescription and diffed spuriously against ANY candidate,
  corrupting the doc-04 tuning loop. Regression test: a bodyweight seed
  replays unchanged under v16 (verified failing without the fix).
- **Next per the attack order:** R11 + R12 (MED, WS-G); R15 (MED, WS-D)
  behind them; then the LOW tail (R21–R25).

## 2026-07-02 — Session 35 (cont. 2): R5 + R7 — completion-lock hardening + SW cache trim (PR #116)

Continued per the attack order on the restarted branch — **R5 + R7** (both MED,
WS-K), **PR #116**. Full record in PROGRESS 2026-07-02 (latest). Migration
`20260702000006` applied live + verified.

- **R5 — done.** Migration `20260702000006_completion_lock_hardening`: the
  completion lock now covers the whole session surface, and child INSERTs
  verify parent ownership (FK checks bypass RLS). Workouts: update only while
  planned/in_progress (no completed→in_progress resurrection, no notes
  rewrites), insert only 'planned' into an owned micro, delete only planned
  rows with no logged sets (hard rule #5 at the DB layer). workout_exercises
  (the engine's `previous` + the volume counts): insert/update/delete gated on
  an open parent, delete also requires an empty slot. logged_sets INSERT gated
  open-parent + slot-belongs-to-workout. workout_feedback: bare FOR ALL →
  full open-parent lock (dampener no longer editable after the engine consumed
  it). exercise_feedback: INSERT + UPDATE WITH CHECK gain the owned-open
  parent EXISTS — the **feedback-slot squat** (unique `workout_exercise_id`
  squatted by a stranger, permanently blocking the victim's feedback) is
  closed. microcycles: no reopening completed weeks, insert into owned meso
  only, delete only history-free weeks. **Authed write-path inventory first**
  (agent sweep of queries/actions/MCP): completion writes land BEFORE the
  status flip, startMeso/regenerate touch only planned+history-free rows, no
  path leaves completed/skipped — nothing legitimate is blocked.
- **R7 — done.** `sw.ts` drops Serwist's `defaultCache` (NetworkFirst-cached
  documents/RSC/`/api/` for ~24h) for static-asset-only caching; anything
  else is NetworkOnly. Offline navigations now get a precached ledger
  `/~offline` interstitial (new route, public path, `additionalPrecacheEntries`)
  instead of silently stale prescriptions — online-only per hard rule #9.
  Auth screens mount `ClearClientCaches`: purge every non-precache
  CacheStorage cache (kills pages cached by previous SW versions on shared
  devices) + drop the `lastWorkoutId` session pointer.
- **Verification:** scratch-PG16 chain green (68 policies); **29 policy
  probes** (12 expected 42501 rejections, all legitimate flows pass — incl.
  the logSet upsert and the pre-flip completion sequence); **9 new RLS suite
  tests** (describe "completion-lock hardening (R5)") for CI; typecheck, lint,
  unit suite, production build green; built `sw.js` inspected (no document
  caching, fallback wired).

## 2026-07-02 — Session 35 (cont.): PR #115 merged + archival sweep

- **PR #115 MERGED** (all checks green — `rls-tests` rebuilt the chain with the
  transcribed file). Archival sweep ran: **T-R2 swept to `archive.md`**
  ("Swept 2026-07-02 (late)"), follow-up table trimmed; branch restarted from
  the merged main. Sweep rides with the next build PR (session-start
  reconciliation pattern).
- Continuing in-session with the next items per the attack order: **R5 + R7**
  (MED, WS-K).

## 2026-07-02 — Session 35: T-R2 — hosted perf migration transcribed into the chain (PR #115)

Reconciliation sweep: no-op (PR #113 was itself the R20 sweep; no `done` rows
live). Built the next item in the recorded attack order — **T-R2** (ready, own
PR) — on branch `claude/review-outstanding-work-xmlmuc`, **PR #115**. Full
record in PROGRESS 2026-07-02 (latest).

- **T-R2 — done.** New `supabase/migrations/20260620115322_perf_rls_initplan_
  and_fk_indexes.sql`: the out-of-band hosted migration transcribed **verbatim**
  (body pulled from hosted `supabase_migrations.schema_migrations.statements`
  as base64, decoded, md5-verified `25446aa1…` — zero hand-transcription) at
  its true chain position. 56 `ALTER POLICY` initplan wraps + 23 FK covering
  indexes. Two time-capsule references documented in the header
  (`shares_grantee_accept`, pre-recursion-fix `profiles_update_own`) — both
  superseded later in the chain exactly as on hosted. **No hosted apply
  needed** (the version row already exists there).
- **Verification (scratch-PG16 harness, R2-style — no Docker in this
  sandbox):** full chain + seed applies from zero (26/26 tables RLS-on, 330
  stock exercises); end-state **hash parity with hosted** on all 56 policy
  rows (qual/with_check/roles/cmd) and all 105 public indexes — same
  aggregate md5 both sides; **negative control** re-ran the chain without the
  file → policy hash diverges and exactly 23 indexes go missing. Typecheck,
  lint, unit suite green (SQL-only change).
- **Next per the attack order:** R5 + R7 (MED, WS-K); R9–R12/R15 behind them.

## 2026-07-02 — Session 34 (cont.): PR #112 merged + archival sweep

- **PR #112 MERGED.** End-of-session archival sweep ran: **R20 swept to
  `archive.md`** ("Swept 2026-07-02 (night)"), live index trimmed. Sweep
  shipped as its own small docs PR (a merged PR can't sweep its own row);
  branch restarted from the merged main per the follow-up rule.
- Reminder for the owner (external, manual-operations): set **`SENTRY_DSN`**
  in Vercel to turn on Sentry delivery — the structured console floor is
  already live in production logs.
- Next per the attack order: **T-R2** (ready, own PR — hosted migration
  transcription); then R5/R7 (MED, WS-K).

## 2026-07-02 — Session 34: R20 — production error observability (PR #112)

Reconciliation sweep: no-op (PR #111 was itself the R3/R4 sweep; no `done`
rows live). Built the next item in the review's attack order — **R20**
(observability, HIGH) — on branch `claude/open-work-review-oym68j`, **PR #112**.
Full record in PROGRESS 2026-07-02 (latest); 07 Phase 7 observability ticked.

- **R20 — done.** New `src/lib/observability/`: `reportError()` funnel —
  structured `[report:<scope>]` console line always (Vercel captures with no
  config), plus **dependency-free Sentry envelope delivery** when `SENTRY_DSN`
  is set (no SDK — deliberate, the client bundle is a live N1 concern; pure
  wire-format builders, 3s timeout, never throws). `instrumentation.ts`
  `onRequestError` catches every unhandled server error; the 5 deliberate
  swallow sites (freshness reconcile, seed decisions, complete/end week
  generation, workout-tab catch-up) + the MCP tool guard now report before
  degrading; new root `global-error.tsx` + `(auth)/error.tsx` boundaries and
  a same-origin-guarded, zod-capped pre-auth `/api/client-error` intake wired
  to all three client boundaries.
- **Verification:** 713 unit tests (+20), typecheck, lint, build; end-to-end
  probe on the built app against a mock ingest (204/403/400 paths + a
  correctly-formed envelope received; ingest-down still 204s).
- **Remaining external:** set `SENTRY_DSN` in Vercel (manual-operations row
  updated — console floor is live regardless).
- **Next per the attack order:** **T-R2** (ready, own PR — hosted migration
  transcription); then R5/R7 (MED, WS-K).

## 2026-07-02 — Session 33 (cont.): PR #110 merged + archival sweep

- **PR #110 MERGED** (all checks green, incl. `rls-tests`). End-of-session
  archival sweep ran: **R3 + R4 swept to `archive.md`** ("Swept 2026-07-02
  (evening)"), live index trimmed. Sweep shipped as its own small docs PR
  (a merged PR can't sweep its own rows); branch restarted from the merged
  main per the follow-up rule.
- Next per the attack order: **R20** (observability, HIGH); **T-R2** still
  ready (own PR); R5/R7 (MED, WS-K) behind them.

## 2026-07-02 — Session 33: R3 + R4 — write integrity (PR #110)

Reconciliation sweep: **PRs #104 + #105 merged** → archived **M8 / I11 / I14 /
P16 / P17 / PH37 / R6 / N4** to `archive.md` ("Swept 2026-07-02 (build 2)").
Then built the next items in the review's attack order — **R3 + R4** (write
integrity, both HIGH) — on branch `claude/open-work-review-x3yv06`, **PR #110**.
Migration `20260702000005` **applied live + verified**; full record in
PROGRESS 2026-07-02 (latest).

- **R4 — done.** `regenerateOpenWorkouts`' two delete branches now exclude
  anything carrying logged sets (pure `withoutLoggedHistory`); `logSet`'s
  in_progress flip error surfaced; `completeWorkout` statuses batched +
  error-checked. The hard-rule-#5 cascade path is closed from both ends.
- **R3 — done.** Atomic DB functions for the three multi-statement flows
  (`save_meso_plan` with an ownership guard, `activate_engine_params`,
  service-only `insert_generated_day` which also ADOPTS poisoned empty days —
  `planCatchUp` now flags them as gaps); `startMeso` made retry-safe instead
  of transactional (seed math stays pure-TS, recorded deviation); unique keys
  on `workouts (microcycle_id, day_number)` + `logged_sets
  (workout_exercise_id, set_number)` with `logSet` upsert semantics — the
  live DB's 11 retry-storm duplicate groups (15 excess rows, double-counted
  volume) deduped in the migration (recorded rule-5 deviation, newest row
  kept). MCP: `create_mesocycle` days path validates dup days/groups +
  exercise existence up front, zod bounds, orphan-draft compensation;
  `edit_mesocycle add_day` rejects same-group-twice days.
- **Verification first:** Docker was available this session — the full
  migration chain + the RLS suite (35 green, +6 new) ran on a from-scratch
  local stack BEFORE the live apply; atomicity/adoption/guard behaviors
  probed on both local and live. Unit suite **693 green (+15)**, typecheck,
  lint, build.
- **Next per the attack order:** R20 (observability, HIGH); T-R2 still ready
  (own PR); R5/R7 (MED, WS-K) behind them.

## 2026-07-02 — Session 32 (cont.): I14 slider unification (PR #105, stacked on #104)

Same session, own PR per the build order (it carries a data migration). Branch
`claude/i14-slider-unification-rh81n2`, **stacked on the PR #104 branch** so the
shared docs files don't conflict; GitHub retargets it to main when #104 merges.
Migration `20260702000004` **applied live + verified**.

- **I14 — done.** All feedback sliders on one 0–10 scale: session sliders drop
  0–4 (UI max + defaults 2→5, zod + engine input bounds widened);
  stored `workout_feedback` rescaled round(x×2.5) (28 rows, exact map
  verified live); **engine_params v18** (thresholds 8/3 — same trip points on
  the rescaled data) **ACTIVATED in the migration** — recorded deviation from
  ship-inactive: the rescale and the thresholds are inseparable. Replay of old
  decisions unaffected (stored inputs + stored params); diffing old decisions
  *against v18* mixes scales — documented caveat. MCP scale legend updated
  (incl. the stale soreness "0–3"). New `session-scale.test.ts` (exhaustive
  0–4→0–10 equivalence + §S5 on the new scale); v18 provenance hash guarded.
  **660 tests (+5)**, typecheck, lint, build green.
- **Next:** R3+R4 (write integrity) per the review's attack order; T-R2 ready.

## 2026-07-02 — Session 32: Batch-4 build 2 — the WS-C consumers + nav/date fixes (PR #104)

Reconciliation sweep: **PR #103 merged** → archived **R14 / P18 / P21 / PH33 /
T-A1 / T-A2** to `archive.md` ("Swept 2026-07-02 (build 1)"). Then built the
Session-31 build order's consumer half on branch
`claude/ws-c-consumers-p16-rework-rh81n2`, **PR #104**. The R6 migration
**applied live** and probe-verified. Full record in PROGRESS 2026-07-02
(latest) + the new dated design-changelog entry (09 2026-07-02 session 6).

- **I11 — done.** Per-exercise est-strength %-change (≥3 non-deload sessions,
  engine e1RM undecayed, deloads excluded) on the meso + macro Performance
  tabs; progress scores now carry `sessions` and generalize to macro scope
  (`getProgressScores`). Live check: 18/24 exercises qualify in one active
  meso — the subbed-in exclusion bites as intended.
- **PH37 — done.** STRENGTH BY MUSCLE GROUP — role-weighted rollup
  (primary 1.0 / secondary 0.5, the R14 counting weights) of I11's qualifying
  scores; meso + macro scopes; both MCP summaries expose it.
- **M8 — done.** Macro page gains OVERVIEW|BALANCE|PERFORMANCE; Balance
  reuses the meso fold over a concatenated week axis (materialized weeks
  only); Performance = I11/PH37. Tab naming reconciled to **BALANCE** on both
  surfaces (owner said "volume" in P16 / "balance" in M8; 09 had retired the
  Volume tab name — recorded in 09 2026-07-02 §1).
- **P16 — done (the large one).** Meso page reworked: day-view-style sticky
  header (calendar dropdown = the old week×day matrix, share sheet, ⋮ menu
  with edit/save-template/delete, whole-grid progress bar) over the same
  three-way toggle; Overview = read-only planner board (`MesoPlanView`);
  `/cycles/meso/[id]/stats` now redirects into the toggle; `AnchoredMenu`/
  `MenuRow` extracted to `components/ui/`; `DeleteMesoButton` folded into the
  header menu and deleted.
- **P17 + N4 — done.** Day view has no back button (option 2); "View
  exercise" carries `?from=/log/<id>` and the exercise page returns to the
  originating day view.
- **R6 — done.** `logged_sets.performed_on` (client-local day) migration
  `20260702000003` applied live (10,821 rows backfilled to their old UTC
  bucket, 0 diverging — reads unchanged until new sets), day view sends
  `localDayIso()` at log time, `v_exercise_history` re-bucketed; the 6
  `shortDate` copies collapsed into `lib/dates.ts`.
- Green: **655 tests (+11)**, typecheck, lint, production build. Docs:
  PROGRESS entry, 09 dated entry (P16/M8/I11/PH37/P17/N4 + rule-8
  deviations + tab naming), backlog rows stamped, scoping synced.
- **Next:** **I14** (slider unification 0–10 + data rescale — own PR, next in
  this session if capacity allows); then R3+R4 (write integrity) per the
  review's attack order; T-R2 still ready.

## 2026-07-02 — Session 31: Batch-4 build 1 — the metric-definition foundation (PR #103)

Reconciliation sweep: no-op (only stale unrelated #48 open; no `done (PR #n)` rows
live). Followed Session 30's suggested build order — the dependency-first foundation
that unblocks the WS-C stats/meso rework — plus the independent quick wins that fit.
Branch `claude/review-prioritize-work-egj0xt`, **PR #103**. Both migrations
**applied live** and probe-verified.

- **R14 — done (PR #103).** Fractional 1.0/0.5 volume counting + the RIR≤4
  hard-set rule (doc 10 §2). New role-grain view `v_meso_week_muscle_sets`
  (facts per meso×week×muscle×role, hard-set rule baked at the doc default:
  rir ≤ 4 or unreported, warm-ups never count) + ONE shared pure fold
  (`engine/volume.ts::fractionalSetCount`, weights from new optional
  `volume.direct/indirect` params keys — v11+ `.optional()` discipline, stored
  rows stay replayable) consumed by: stats matrix/Balance, MCP volume/balance/
  preview tools, the PH34 projection + planner baseline, and the engine's
  weekly-set ceiling input (fractional `muscleGroupWeeklySets`; derived input →
  no fingerprint churn). Live parity check: primary counts = old view exactly
  (43=43); secondaries add the missing compound credit; 0 all-time sets above
  RIR 4 (no retroactive bite). **Recorded deviation:** `counting_max_rir` /
  `warmups_count` are view-baked doc defaults, not live params (SQL can't read
  versioned params; a param the counting SQL can't honor would silently lie).
  Old `v_meso_week_sets` + dead `v_muscle_group_volume` → retire with R23.
- **T-A1 — done (PR #103).** Engine e1RM everywhere:
  `v_exercise_overview`/`v_meso_summary` `best_e1rm` = max stored per-set
  engine e1RM; new `v_exercise_history.best_set_e1rm` (REP-PR comparisons now
  set-grain, closing the avg-vs-best inflation from the 06-26 change); stats
  inline raw Epley + dead `epleyE1rm` deleted — raw Epley survives nowhere.
  Stats undecayed; decay prescription-only. **Half-life confirmed MCP-tunable**
  (`e1rm.recency_halflife_days: 30` in the active v17 row). Answers PH39.
- **T-A2 — done (PR #103).** `getMesoProgressScores` skips deload-microcycle
  sessions; volume + PR stats keep deloads; denoted in MCP notes.
- **Quick wins:** **P18 done** (set-type menu row hidden, model dormant);
  **PH33 done** (admin tools hidden from `tools/list` via a role-filter wrap of
  the SDK handler; call-time denial unchanged); **P21 done — verified no-op**
  (explicit 0 already stored for `soreness_days`).
- Green: **644 tests (+15)**, typecheck, lint, production build (`/log` 126 kB
  unchanged). Docs: PROGRESS entry, root `CLAUDE.md` shared-views line →
  `v_meso_week_muscle_sets`, rows/scoping/A-detail synced.
- **Next per the build order:** the WS-C consumers — **I11 + PH37 + M8** (stats
  screens on the new definitions) and **P16** (meso surface, large); **I14**
  (slider unification, own PR — data migration); **P17+N4**, **R6** remain
  ready. R3+R4 (write integrity) still queued from the review's attack order.

## 2026-07-02 — Session 30: owner decision batch (Batch 4) — 17 needs-input items resolved

Reconciliation sweep: no-op (Session 29 already merged PR #100 and swept R13/R18/R19;
no `done (PR #n)` rows live). This session was **notes-only** — no code changed. Claude
had compiled every open `needs-input` item into a fill-in Word doc last turn; the owner
returned it with a decision per item. Captured the verbatim responses as **backlog
appendix Batch 4** and folded the decisions into every row + detail file. Owner will
merge these notes and start building in a new session.

**Decisions applied (17 items):**
- **Stats cluster (WS-C):**
  - **T-A1** → ready: standardize on the **engine e1RM formula** everywhere (retire
    the last raw-Epley `v_exercise_overview.best_e1rm`). **Stats show the undecayed /
    best-ever value**; **recency decay is reserved for prescriptions only**. Keep the
    30-day half-life (confirm it's MCP-tunable). Answers PH39.
  - **M8** → ready: build the macro **Overview|Balance|Performance** stats screen
    **without a mockup** (rule-8 deviation to record); meso Performance est-strength
    confirmed. Build the meso side *through* **P16**.
  - **I11** → ready (HIGH): est-strength %-change per exercise for **every exercise
    logged ≥3× in the meso** (excludes subbed-in/inconsistent lifts).
  - **PH37** → ready: muscle-group strength-gain rollup at **macro + meso** scopes;
    **all-time dropped** (no natural home).
  - **T-A2** → ready: **exclude deloads from strength-progress scoring**; keep them in
    volume + PR stats; denote where relevant.
  - **R14** → ready: implement **fractional 1.0/0.5** volume counting **and** the
    **RIR≤4 hard-set** rule per doc 10 (no spec amendment). Foundational — **sequence
    before** the stats rework since it moves every Balance/MEV/MRV number.
- **Engine (WS-A/G):**
  - **T-A5** → **deferred**: keep the ±1 model; don't amend doc 10 (graded ramp stays a
    future option). Owner idea: expose training style (±1 vs graded ramp) as a
    **setting / macrocycle-type selection** down the road.
  - **T-A6** → **closed/archived** (owner confirmed WS-I resolved it).
  - **R24** hold-week reprice-down: **logged for future investigation** (owner sees the
    concern — a decayed anchor makes a "hold" drift down; matters most for **cut/maintain**
    macro types); no fix decided. Row annotated, stays triaged.
- **Day-view / nav UX (WS-E):**
  - **P17** → ready: option 2 (no back button in the Workout-tab day view). Spawned
    **N4** (deep-link return-to-origin — back from "view exercise" should land on the day
    view, not the exercises list).
  - **P18** → ready: hide the **set-type menu affordance only**; leave the drop-set model
    dormant.
  - **M10** → **wontfix/archived** ("leave unplanned mesos as they are").
- **Meso surface (WS-C/D):**
  - **P16** → ready (**large**): meso page reworked to an **Overview|Volume|Performance**
    toggle (absorbs the MESO STATS button) + a **read-only planner-board Overview** +
    a day-view-style header (calendar button w/ clickable days → day/plan view, share
    button, ⋮ menu for edit/save-template/delete). Full spec in `scoping.md`. Subsumes
    M8's meso side; naming of the "VOLUME" vs "BALANCE" tab flagged for build.
- **Feature scope (WS-E/F/H):**
  - **I14** → ready (HIGH): **unify all feedback sliders to one 0–10 scale** and
    **rescale existing persisted data** (needs a data migration + engine/golden updates).
  - **PH30** → **deferred**: LLM stays an *explanation layer over* the deterministic
    engine (session-note-aware, verbose rationale, light PT advice via MCP), never a
    replacement. Parked.
  - **PH33** → ready: hide admin tools from `tools/list` for non-admins (visibility only;
    denial already enforced).
  - **P21** → decided (store explicit 0) → **verify** current behavior already does so.
- **Data correctness (WS-K):**
  - **R6** → ready: use the **client-supplied local date** at record time; consolidate the
    6 `shortDate` copies.

**Files touched:** `backlog.md` (index rows, follow-up table, new **N4**, appendix Batch 4),
`archive.md` (swept **M10** wontfix + **T-A6** done), `A-engine-metrics.md` (T-A1/T-A2/T-A5/T-A6
follow-up rows), `scoping.md` (M8/M10/I14/P16/P17/N4/P18/PH33 + the blockers note), `README.md`
(WS-H roster). No code/schema/engine change; no tests run.

**Suggested build order for the next session** (dependencies first): **R14** (fractional
volume — unblocks the stats numbers) → **T-A1 + T-A2** (e1RM standardization + deload
exclusion — the metric definitions) → **I11 / PH37 / M8 / P16** (the stats + meso-surface
rework, which all consume the above) in a coherent WS-C push. Independent quick wins in
parallel: **P17+N4**, **P18**, **PH33**, **R6**, **P21** (verify). **I14** (HIGH) is
self-contained but carries a data migration — its own PR.

## 2026-07-02 — Session 29 (cont.): PR #100 merged + owner revert + archival sweep

- **maximumScale revert (owner ruling).** The R18 pinch-zoom bullet dropped
  `maximumScale:1`; the owner ruled the zoom cap **stays** (installed-PWA
  native feel > the WCAG 1.4.4 concern). Reverted in `c2cc15c`; the ruling is
  recorded on the viewport config, PROGRESS.md, and the R18 row so it isn't
  re-"fixed". PR body updated.
- **PR #100 MERGED** (main `e3e1775`). End-of-session archival sweep ran:
  **R13 / R18 / R19 swept to `archive.md`** ("Swept 2026-07-02"), live index
  trimmed. Branch restarted from the merged main for the sweep (a merged PR
  can't sweep its own rows). R18's zoom-cap sub-bullet carried into the
  archive as wontfix.
- Next per the review's attack order: **R3 + R4** (write integrity), then R20
  (observability). R6/R14 owner decisions still queued.

## 2026-07-02 — Session 29: R13 + R18 + R19 — the UI/UX cluster (workstream E/G day-view surface)

Reconciliation sweep: no-op (session 28's sweep PR #99 already merged; no
`done (PR #n)` rows live). Owner steered this session toward "documented UI
issues and things that impact user experience" — picked the three open
UX-facing items sharing the day-view surface over the attack order's R3+R4
(write integrity, now next up). Branch `claude/notes-review-priorities-zx5f1v`.

- **R13 — done.** The SetRow re-sync effect no longer clobbers in-progress
  typing: split into an own-logged-set effect (always adopts — it's the row's
  own write echoing back) and a planned-input effect (`set_weights`/bodyweight
  changes adopt only while the row has no uncommitted edits). The rule is pure
  + unit-tested (`day-rules.ts::adoptServerRowState`). Closes the client-side
  cousin of N3: an auto-match fan-out or blur-persisted weight revalidating
  0.5–2s later could silently replace typed reps right before LOG.
- **R18 — done.** New shared `useModalA11y` (focus in/restore, Tab trap,
  Escape via a top-most-overlay stack) wired into BottomSheet (~18 sheets),
  CompleteSheet (also gained role="dialog"/aria-modal), and AnchoredMenu
  (menuitem roles + ↑/↓/Home/End). Tap targets to the WCAG 24px floor with
  visuals unchanged: LOG checkbox button fills its 44×32 cell (21px box stays
  the visual), per-set ⋮ → 24×32, planner ▲▼ → 24×24 (rule-8 note in
  PROGRESS: arrows sit ~5px further apart — the only visible delta).
  The `maximumScale:1` bullet was **ruled against mid-PR (owner,
  2026-07-02)**: the cap stays — installed-PWA native feel outranks the
  WCAG 1.4.4 concern; ruling recorded on the viewport config. The full
  doc-07 Phase-7 a11y audit remains its own phase item; this closes the
  scoped defects.
- **R19 — done (all 3 bullets).** New `(app)/not-found.tsx` ledger card inside
  the app shell (10+ `notFound()` sites dead-ended on Next's unstyled default);
  landing there clears the stale session `lastWorkoutId` so the Workout tab
  can't 404 forever after its meso is deleted. CompleteSheet totals now share
  the header's skipped-slot-excluded math via pure `day-rules.ts::daySetTotals`
  (unit-tested); the third bullet (SAVE AS TEMPLATE SubmitButton) had already
  shipped with R17/PR #98.
- Green: **629 tests (+15)**, typecheck, lint, production build (`/log`
  first-load 126 kB, +1 kB = the a11y hook). No engine/schema/query change.
- Next per the attack order: **R3 + R4** (write integrity), then R20
  (observability). R6/R14 owner decisions still queued.

## 2026-07-01 — Session 28: R17 + R16 — field usability, shipped together (PR #98)

Reconciliation sweep: no-op (only the stale unrelated #48 open; no `done (PR #n)`
rows live — session 27's sweep PR #97 already merged). Picked the next items in
the review's attack order: **R17 + R16** (the two destructive-failure modes; the
review says ship together). Branch `claude/notes-review-prioritize-1ore6l`.

- **R17 — done (PR #98).** No sheet write can reach the `(app)` error boundary
  anymore (that unmount was what destroyed typed input): the shared day-view
  `commit` (all ~14 menu ops) catches + toasts, on the argument that a failed
  write with no revalidation leaves the view already-rolled-back; NoteSheet /
  FeedbackSheet save in their own transition and close only on success (typed
  note + sliders survive failure, SAVING… label); CompleteSheet, END WORKOUT /
  END MESOCYCLE, and AddExerciseSheet ADD keep their sheet open on failure;
  logged-set amends go through `runLog` (spinner/shake/retry-on-next-blur).
  Fetch-on-open sheets (History / Replace / AddExercise) get the
  PrescriptionDetailSheet catch + stale-guard + a shared `FetchRetry` RETRY
  state instead of a permanent "Loading…". The meso page finally reads the
  `?error=template` param `saveMesoAsTemplateAction` has always redirected to
  (was silent), and that submit got the Phase-A `SubmitButton` treatment —
  closing one R19 bullet (row annotated; R19 stays triaged with 2 bullets).
  `(app)/error.tsx` no longer claims "Nothing was lost".
- **R16 — done (PR #98).** `doSave` catches: a failed `saveMesoPlanAction`
  keeps the staged `workDays` and the confirm sheet open (one-tap retry)
  instead of remount-and-discard. New `useNavigationGuard`
  (`components/ui/useNavigationGuard.ts`): while `editing && dirty`, in-app
  anchor clicks are intercepted capture-phase (before Next's Link), browser
  back is absorbed via a history sentinel, tab close gets native beforeunload;
  all land in the discard-confirm sheet, which now carries the intercepted
  destination. Pure `shouldGuardNavigation` rule unit-tested (5 tests).
  R3 (the server half — non-atomic `saveMesoPlan`) stays open, next up.
- Green: **614 tests (+5)**, typecheck, lint, production build (`/log`
  first-load unchanged at 125 kB). No engine/schema/query change.
- **PR #98 MERGED** same session (all checks green, incl. `rls-tests`) →
  end-of-session archival sweep ran: R17 + R16 rows swept to `archive.md`
  ("Swept 2026-07-01 (evening)"). Sweep shipped as its own small docs PR (a
  merged PR can't sweep its own row). On-device failure-path spot check
  (e.g. airplane-mode a note save) is the owner's final confirmation.
- Next per the attack order: **R3 + R4** (write integrity), then R20
  (observability). R6/R14 owner decisions still queued.

## 2026-07-01 — Session 27: R2 — clean-DB migrations fixed; guardrail chain revived (PR #96)

Reconciliation sweep: **PR #95 merged** → archived **R1** and **R8** to
`archive.md` ("Swept 2026-07-01 — review top two merged"). Picked the next item
in the review's attack order: **R2** (the guardrail revival everything else
relies on). Branch `claude/notes-review-prioritize-rz0rkh`.

- **R2 — done (PR #96).** The chain now reproduces a working DB from zero;
  verified on a scratch Postgres 16 with a simulated Supabase bootstrap (no
  Docker in the sandbox), one transaction per file + `seed.sql`. Three breaks,
  three fixes (detail in PROGRESS 2026-07-01):
  1. `is_admin()` reordered after `profiles` in the initial migration (LANGUAGE
     sql body validated at create time). Recorded rule-#2 deviation — reorder
     only, end-state identical to hosted (normalized def match verified).
  2. **New `20260611000002_seed_muscle_groups.sql`** — the 12 muscle-group rows
     lived only in seed.sql (runs *after* migrations), but 0615-6 joins them to
     link the stock library (silently 0 links on clean DB) and 0617-2 hard-fails
     seeding templates. This second break was masked by the first — found only
     because the scratch run got past `is_admin`.
  3. **New `20260619000002_rls_auto_enable.sql`** — captured the hosted-only
     function + `ensure_rls` event trigger verbatim (read via MCP
     `pg_get_functiondef`, which voids the runbook's "human-only" rationale);
     guarded/idempotent, grants left to 0620 (end-state ACL = hosted). Both new
     migrations **applied to hosted via MCP as recorded no-ops**.
  4. **Version collision** (caught by the PR's own first CI run, not the
     scratch harness): two files shared prefix `20260616000001` and the CLI
     tracking table PKs on version → renamed `adherence_rule` to
     `20260616000004` (= true hosted order). Harness now simulates the
     tracking table; full chain re-verified post-reorder.
  5. **Missing table grants** (caught by the suite's first-ever execution —
     CI run 2): no migration GRANTs on tables; hosted rode on postgres
     default privileges, the CI local stack has none → "permission denied
     for table macrocycles" pre-RLS. New end-of-chain
     `20260701000003_table_grants.sql` reproduces hosted's posture (ALL on
     tables/sequences to the three roles + default privileges; functions
     untouched so the 0620 revokes stand; RLS default-deny stays the gate).
     Verified on scratch with zero simulated defaults; hosted no-op
     (relacl identical before/after).
  6. **Stale escalation assertion** (CI run 3 — 28/29 tests passed): the
     role-escalation test expected a silent 0-row update (`[]`), but the
     WITH CHECK rejection errors with 42501 (the hosted-verified behavior
     from the 06-22 recursion-fix probe). Assertion fixed + strengthened
     (role verified unchanged after the attempt).
  - **CI GREEN (run 4, commit 4e05683):** `rls-tests` succeeded for the
    first time ever — all 29 RLS tests pass against a from-scratch stack;
    `checks` green too. The hard-rule-#1 guardrail is live. Owner step:
    make both checks required after merge (runbook).
  - **PR #96 MERGED** same session → end-of-session archival sweep ran:
    R2 row swept to `archive.md` ("Swept 2026-07-01 (later) — R2 merged").
    T-R2 stays open in the follow-up table. Sweep shipped as its own small
    docs PR (a merged PR can't sweep its own row).
  - End-state checks: 26/26 tables RLS-on; stock data identical to hosted
    (330 exercises / 352 links / 8 templates); single active params v10;
    `ensure_rls` proven to auto-enable RLS on a new table.
- **T-R2 filed (ready).** Full hosted↔clean-DB diff surfaced the remaining
  drift: out-of-band hosted migration `20260620115322` initplan-wrapped ~54
  policies + added 23 FK indexes the repo chain doesn't reproduce. Perf-only;
  own PR (mechanical but security-sensitive).
- **Runbook updated:** migration-reconciliation section marked RESOLVED; new
  human step added — make `checks`+`rls-tests` **required status checks** on
  `main` *after* this PR merges green (GitHub MCP has no settings surface).
- R21 note updated (integration tests unblock on merge). Next per the attack
  order: **R17+R16** (field usability), then R3+R4 (write integrity).

## 2026-07-01 — Session 26: R1 + R8 — the review's top two, shipped live (PR #95)

Reconciliation sweep: no-op (no `done (PR #n)` rows live; I12 `advanced (PR #92)`
intentionally live, N1 in-progress). Picked the review's suggested attack order:
**R1 + R8** (small diffs, worst consequences). Branch
`claude/notes-review-prioritize-diew7r`.

- **R1 — done (PR #95).** Share redemption is no longer a cross-user copy
  primitive. Migration `20260701000002` drops `shares_grantee_accept` (RLS can't
  scope columns; no client path updates shares — redemption runs on the service
  client, so the policy's only real use was the exploit). **Applied live** and
  probe-verified: a simulated grantee UPDATE (authenticated role + JWT sub)
  touches 0 rows; grantee SELECT + owner control intact. Defense in depth:
  `acceptShareCode` now asserts every copied object is owned by
  `share.owner_id` (stock exercises excepted) — also closes the owner-side
  rewrite surface (`shares_owner_all` allowed re-pointing one's own share at a
  victim uuid; the insert path was already ownership-checked but the update
  path wasn't). New `shares` RLS describe block (grantee read-only; runs once
  R2 revives the job) + 5 mocked-service ownership tests in `sharing.test.ts`.
- **R8 — done (PR #95), v17 ACTIVATED.** Doc 10 §3 step 0 is now enforced:
  new optional `pain_cut_gate` param (v11–v16 `.optional()` discipline — absent
  ⇒ legacy, pre-v17 decisions replay byte-identically); with it present the
  feedback rule runs pain first — pain ≥ `pain_gate` (2) vetoes set additions,
  pain ≥ `pain_cut_gate` (3) forces −1 set + a substitution note, regardless of
  workload/pump. Table-driven `pain-gate.test.ts` (13) + a bounds property
  invariant (no set increase under the gate over 500 randomized inputs) + v17
  hash guard. Migration `20260701000001` (v17 INACTIVE) **applied**, then
  **activated** after replay verification: v16-sourced decisions show zero
  set-count diffs (the only 2 diffs are the pre-existing R10 bodyweight-seed
  replay artifact — R10 stays open); live history has pain ≥ 2 twice, pain 3
  never, so activation changes nothing retroactively and only bites when pain
  recurs. Open prescriptions re-stamp on next view via the freshness reconcile.
- **R2 — advanced (PR #95).** Folded in the stale-assertion half since this PR
  already edits `rls.test.ts`: the recursion-guard test now updates
  `display_name` (not the dropped `units` column) and the engine-params read
  asserts one active row at version ≥ 10 instead of the long-stale `=== 5` pin.
  Remaining (own PR): clean-DB migration ordering, commit `rls_auto_enable()`,
  make the CI jobs required checks.
- Green: **609 tests (+21)**, typecheck, lint. Next per the attack order: finish
  **R2** (revive the migrations/RLS/CI guardrails — also unblocks the new shares
  RLS tests actually running), then R17+R16.

## 2026-07-01 — Session 25: full-surface repo review → items R1–R25 (Batch 3) (PR #94)

Reconciliation sweep: no-op (same state as Session 24 — I12 `advanced (PR #92)`
intentionally live, N1 in-progress). Owner asked for a proactive whole-repo review
("issues and opportunities for significant and impactful improvements…
regardless of how ambitious") with findings folded into this area.

Ran five parallel domain reviews (engine/analysis, data layer/DB/RLS, UI/app
routes, MCP/API/middleware/PWA, cross-cutting tooling), each briefed to exclude
already-tracked ground (WS-J, Phase-A gaps, T-A1, doc-07 open phases). Re-verified
the top claims directly (shares policy SQL + copy path, pain-gate code,
regeneration delete branches). Result: **25 new items (R1–R25)** filed under two
new workstreams **K** (integrity & security hardening) and **L** (delivery
guardrails & observability) plus existing C/D/E/G. Evidence + file:line scoping in
[`docs/reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md)
(serves as the scoping record; no separate `scoping.md` entries).

Headlines, by severity:
- **R1 (HIGH, security):** share redemption = cross-user copy primitive
  (grantee can rewrite `object_id`; service-role copy never checks the owner).
- **R2 (HIGH):** the hard-rule-#1 guardrail is dead — migrations don't apply to a
  clean DB (documented since 06-20, unfixed) + the RLS suite has stale
  assertions; **every CI run since ~06-20 is red** and checks aren't required.
- **R3/R4 (HIGH):** `saveMesoPlan` delete-then-insert can wipe an active plan
  (reachable from the new PR-#92 MCP authoring input gaps); regeneration can
  cascade-delete logged history (hard-rule-#5 breach path).
- **R8 (HIGH, engine safety):** joint-pain 3/3 still *adds* a set — doc 10's one
  hard safety gate unenforced on set additions (verified by execution).
- **R17 (HIGH, UX):** sheet writes fail destructively — typed notes/feedback
  destroyed by the error boundary while the error page claims "Nothing was lost".
- **R20 (HIGH):** zero production error observability; reconcile failures =
  silently stale prescriptions.
- Needs-input: **R6** (canonical local-day rule for UTC date drift) and **R14**
  (implement doc 10's fractional 1.0/0.5 volume counting vs amend the doc —
  changes every Balance/MEV/MRV number; informs I11/PH37/M8).

Suggested attack order: R1+R8 (small diffs, worst consequences) → R2 (revives the
guardrails) → R17+R16 (field usability) → R3+R4 (write integrity) → R20
(observability). Owner decisions queued: R6, R14 (+ the R24 ramp-hold design nit).

## 2026-07-01 — Session 24: WS-J Phase 1 — client bundle & render slice (PR #93)

Reconciliation sweep: no-op (only PR-linked live row is I12 `advanced (PR #92)`,
merged but intentionally live — in-app planner UX remains). Picked the next J slice
per `J-performance.md`: Phase 1 client bundle/render (the planner draft-path rework
stays its own isolated follow-up).

- **`/log` + `/workout`: 142 → 125 kB First Load JS (−17 kB gz).** Chunk
  fingerprinting showed the "engine" delta was mostly **zod itself** (12.7 kB gz,
  present only because `reps.ts`/`e1rm.ts` parse params inside every exported
  function) + the params/schema layer (4.7 kB).
- **`engine/predict.ts`** — zod-free predictor core (type-only imports, keyed on the
  validated `params.e1rm` slice); `e1rm.ts`/`reps.ts` keep byte-identical public
  APIs as parse-then-delegate wrappers (hard rule #6 intact). `predict.test.ts`:
  core ≡ wrapper on two param generations + a static no-runtime-zod import guard.
  Server bonus: `recencyWeightedE1rm` parses once per anchor, not per sample.
- **DayView render path:** future-row predictions + P19 markers `useMemo`ized;
  `ExerciseBlock` → `React.memo` with stable id-taking callbacks (functional
  updates) so one block's menu/typing doesn't re-render the rest; day progress
  counts memoized; `HistorySheet`/`PrescriptionDetailSheet` via `next/dynamic`.
- **Measure-first corrections recorded:** the planned weight-input debounce was
  moot (prediction fires on blur, not per keystroke); `ExerciseBlock` already
  existed — the gap was memo + stable props, not extraction.
- Green: 588 tests (+4), typecheck, lint, production build. N1 stays in-progress
  (remaining: Phase 2 #5/#6/#7 caching; planner draft-path optimistic; Phase 3).

Built the connector's plan-into-a-macro authoring surface (from a needs doc the owner
relayed from the LLM coach). Advances **I12** (was `triaged (needs design pass)`) — the
MCP side now ships; row set to `advanced (PR #92)`
with the remaining in-app planner UX called out. New/extended tools: `edit_mesocycle`
`add_day`/`remove_day` (build a whole day, or a plan from an empty meso, in one call);
`place_mesocycle` + `create_mesocycle`/`duplicate_mesocycle` `macrocycle_id` (author/attach
into a slot); `update_mesocycle` (header edit); `duplicate_mesocycle`; `manage_macrocycle_slots`;
gated `activate_mesocycle` with the **sequential-activation invariant** (planned mesos seed only
after prior blocks complete — wired into `startMeso` so the app respects it too);
`preview_mesocycle_volume` (non-persisting MEV/MAV/MRV check). No schema change; suite green
(584), typecheck + lint clean. Detail in PROGRESS 2026-07-01 + 05-mcp-connector.md §Write.

## 2026-06-30 — Session 22: WS-J — iOS PWA launch screens (the pre-document gap)

#89 merged + owner-verified ("in general it looks good"); the remaining black is the iOS
**pre-document** launch blank (the OS screen between the icon tap and the WebView loading the
start URL — iOS ignores the manifest `background_color` and shows black unless an
`apple-touch-startup-image` matches the device exactly). Owner is installed to the iOS home
screen and wants it gone.

- **24 launch images** (`public/splash/apple-splash-<pw>-<ph>-<theme>.png`) — solid brand
  background (cream `#f4f0e6` / dark `#14110c`) matching the in-document `Splash`, generated with
  `sharp` for 12 portrait iPhone classes (SE → 16 Pro Max) × light/dark. Reproducible via
  `scripts/gen-ios-splash.mjs`.
- **`<link rel="apple-touch-startup-image">` per class** emitted from the root layout head,
  driven by `src/lib/pwa/ios-launch-screens.ts` (exact `device-width/height/-webkit-device-pixel-
  ratio/orientation/prefers-color-scheme` media queries). Verified 48 well-formed tags render.
- Result: home-screen launch now shows the brand background (not black) → in-document logotype
  splash → content. Solid bg keeps the OS-screen → document-splash transition seamless (no
  icon/text pop; sidesteps the cream-tiled-icon blending differently per theme).
- Green: typecheck, lint, production build. On-device cold launch is the final check (the gap is
  iOS-OS-level, not reproducible headlessly).

## 2026-06-30 — Session 21: WS-J — cold-start splash (no more black screen)

Owner: cold load is 3–5s of **black screen** ("is it hung?"); fine with the load time, just
doesn't want to stare at black. Root cause: `(app)/layout.tsx` does `await auth.getUser()` (a
network call) before rendering anything, and there's no Suspense boundary above it, so nothing
paints for the whole TTFB (black on a dark-themed device). The manifest bg is already cream;
the user's device is in dark mode (theme-color `#14110C`).

- **Branded cold-start splash** (`components/ui/Splash.tsx`) streamed as the **root** Suspense
  fallback (`app/layout.tsx` wraps `{children}`). Paints from the first byte — app background +
  "workout" logotype + a quiet activity cue — so a cold/hard load shows the app starting, then
  swaps to the per-route skeleton when the shell streams in, then content. Theme-aware
  (`bg-bg-base`/`text-ink`). Soft tab navigations are unaffected (they use per-route loading.tsx).
- Doesn't change load time (owner's stated preference) — removes the black void during it.
- Note: covers the document/data load. The iOS PWA **pre-document** launch blank (needs
  `apple-touch-startup-image`s) is a separate, larger follow-up if still bothersome.
- Green: typecheck, lint, production build. Streaming verified structurally (the placeholder-auth
  path fast-redirects, so the splash window only exercises with a real authenticated session —
  on-device cold launch is the final check).

## 2026-06-30 — Session 20: WS-J — advisor cleanup (security + cheap perf migrations)

#87 merged + owner-verified. Acknowledgment north star is largely met (#85 + the toggle
conversions cover the daily-loop surfaces; only the lower-frequency PlannerBoard *draft* path
remains a residual). Picked the remaining audit migrations — led by a real **security ERROR**.

- **Migration `20260630000002_advisor_cleanup.sql` (applied + verified live).**
  - **#2 (security ERROR):** `v_exercise_overview` was SECURITY DEFINER → bypassed RLS. Confirmed
    every usage filters `.eq(user_id, …)` and the view is per-user; flipped to `security_invoker`.
    Verified live: simulating an authenticated user, the view returns exactly their own 111 rows,
    **0 foreign** — same app data, now RLS-enforced; the linter ERROR is cleared.
  - **#9:** FK index `exercise_param_overrides(exercise_id)` (was a seq scan on the reconcile path).
  - **#10:** wrapped the owner RLS policy `auth.uid()` → `(select auth.uid())` (init-plan, per-query).
- **Left intentionally:** `current_profile_role`/`is_admin` SECURITY DEFINER function WARNs (the
  anti-recursion RLS helpers — they return only the caller's own role/admin status, not a leak),
  the leaked-password dashboard toggle (already in `manual-operations.md`), and the unused-index /
  `shares` multi-policy INFO/WARN noise.
- Docs only on the code side (no TS change; view columns unchanged → no type regen). Suite/types
  unaffected.

## 2026-06-30 — Session 19: WS-J — return-to-tab snappiness + nav label fix

Owner feedback after #86 merged: (a) the page-switch label still ghosts ("double layer"),
(b) the Workout tab takes ~1s and reloads everything + resets to the current day every tap;
wants it to "just switch back to where I was" (day/week/scroll retained). Investigated the
reload architecture (agent): `/workout` recomputes the current day via `getCurrentState` on
every open and renders DayView inline; day chips are full `/log/[id]` navigations (unmount +
scroll loss); the ~1s is serial Supabase round-trips, not bundle/render; the client Router
Cache (`staleTimes`) was unset (dynamic=0 ⇒ refetch every return). Owner chose a **~2 min**
("balanced") cache window.

- **Nav label glitch — fixed.** Removed the label loading animation entirely (the
  `animate-pulse` + active/pending marker handoff ghosts on mobile). `BottomNav` now
  acknowledges a tap by optimistically moving the ■ marker to the tapped tab (no animation),
  cleared on commit. Load indication lives in the destination skeleton, per owner preference.
- **Return-to-tab is instant + state-retained.** `experimental.staleTimes { dynamic: 120,
  static: 300 }` (`next.config.ts`): returning to a previously-viewed `/workout` or `/log/[id]`
  within 2 min is served from the client Router Cache — no server round-trip, scroll restored.
- **Workout tab no longer resets to current day.** `DayView` stamps a session-scoped
  `lastWorkoutId` (active meso only); `BottomNav`'s Workout tab links to that `/log/[id]` so
  it returns to the day/week you left. The tab also now matches `/log/*` as the Workout section.
- **Staleness guard.** `setIncrementOverrideAction` already revalidated `/workout`; added
  `/log/[workoutId]` so an override edit is never stale on return to a cached day. Only rare
  out-of-band admin param tunes can be briefly stale (self-heal within the window) — the
  owner-accepted tradeoff.
- Green: 563 tests, typecheck, lint, production build (staleTimes active).

## 2026-06-30 — Session 18: WS-J Phase 2 slice — server load-time

Owner picked the server load-time path; #85 merged, branch restarted from main. Built the
ranked server wins from the audit (design via the audit agent).

- **#1 reconcile gate (the big win).** Every prescription-showing surface ran the full
  ~8-10-round-trip reconcile on open even when fresh. Added `mesocycles.last_reconcile_sig`
  (migration `20260630000001`, **applied to live**) + a cheap meso-level staleness signature
  (`loadMesoStaleInputs` ~2 round-trips + pure `mesoStaleSignature`) hashing every meso-global
  fingerprint input (params version, RIR ramp, macro goal, profile experience, override/
  exercise/completed-work watermarks). Gate at the top of `reconcilePrescriptions` skips both
  gap-heal + freshness on a match; stamps the start-signature on success. **Conservatism is
  the safety property** — `reconcile-gate.test.ts` asserts each input flip busts the hash.
  Validated the loader against live schema/data.
- **#8 double params read.** `ensureFreshPrescriptions`/`reconcilePrescriptions` take an
  optional pre-resolved `{version,params}`; Workout + Log pages resolve once and pass in.
- **#4 anchor round-trips.** `anchors.ts`: 3 serial reads → 1 `Promise.all` (completed
  workouts + target_rir + bw load-type), result byte-identical.
- **#3 anchor date floor — REJECTED.** Live check: a 120-day floor would delete the anchor
  for ~56% of (user,exercise) pairs (recency weighting is relative; old exercises still give
  a valid anchor). Reverted; left a comment. Measurement caught what the design missed.
- Green: 563 tests (+3 conservatism), typecheck, lint, production build. Migration applied
  live (additive nullable column; first open of each existing meso runs one full reconcile,
  then the gate engages — self-healing, no manual step).

## 2026-06-30 — Session 17: WS-J Phase A slice 1 — interaction acknowledgment

Ran the measure + audit phase (3 parallel agents + ANALYZE build), then shipped the
first acknowledgment slice (the owner's primary north-star track). Branch
`claude/notes-review-assessment-t14bcu`.

- **Phase 0 measured:** bundle is lean (104 kB shared; only /workout + /log heavy at
  142 kB ≈ +38 kB engine). Bundle code-split is a *secondary*, single-route win.
  Server audit (Supabase advisors): the "feels slow" cause is the **per-open
  reconcile** running full work even when fresh (#1); plus anchor-query global limit,
  duplicated params read, a `SECURITY DEFINER` view, an FK index. Interaction audit:
  app is broadly well-acknowledged (logging loop exemplary); gaps = same-route
  `?param=` tab toggles (dead), planner draft path, discarded `isPending` on SAVE/END.
- **Shipped (Phase A slice 1):** `SegmentedTabs` (instant client-state toggle, no
  refetch) for the two dead tab toggles (exercise OVERVIEW|HISTORY, meso-stats
  BALANCE|PERFORMANCE); `ending`/`pending` flags wired to END WORKOUT/MESO and
  PlannerBoard SAVE CHANGES (self-closing sheet); `SubmitButton` (`useFormStatus`) on
  five plain-form submits (save-as-template, discard-draft, delete-meso, blank-template,
  sign-out).
- **Deferred (tracked in J-performance.md):** planner draft-path optimistic (#1, HIGH
  but risky — own PR); TemplateFilters stale-list (#6, low); press-state sweep.
- Green: 560 tests, typecheck, lint, production build.

## 2026-06-30 — Session 16: WS-J performance kickoff + post-merge sweep

PR #84 merged. **Reconciliation sweep:** archived PH38/PH29/PH36/PH34 (the bug sweep) to
`archive.md` under "Swept 2026-06-30 (later) — bug sweep (PR #84)"; trimmed the live index.
Restarted the designated branch from the merged `main` for the new workstream.

**Owner reframed the performance goal (north star).** "Snappy" is defined as: *every* user
interaction on *every* surface is **visually acknowledged immediately** — the user must never
be left wondering "is it loading, or did I mis-tap?" Responsiveness (acknowledge the action,
even with a placeholder/spinner) matters more than instantaneous data; real load times still
get addressed via efficient code + strategic caching. Updated the N1 row (HIGH, in-progress)
and `J-performance.md` to make interaction-acknowledgment the primary lens, alongside the
existing measure-first bundle/render + query/caching plan. Work starts with Phase 0 measurement
(bundle analyzer, slow-query baseline) + an interaction-acknowledgment audit of every surface.

## 2026-06-30 — Session 15: bug sweep (PH29, PH38, PH36) + PH34 decision framed

Owner asked to attack all the open bug items, perf to follow. Ran four parallel
code investigations (PH29/PH38/PH36/PH34). Branch `claude/notes-review-assessment-t14bcu`,
**PR #84**. Reconciliation sweep: nothing new to archive (#82/#83 merged last session; only
unrelated #48 open).

- **PH38 — done (PR #84).** Root cause in `replaceWorkoutExercise`
  (`queries/logging.ts`): the swap updated only `exercise_id`/`prescribed_*` and left
  the outgoing exercise's per-set `set_weights` overrides on the slot, so the first set
  showed the old planned weight (reps predicted off it) until "reset to prescription"
  (which clears exactly `set_weights` — matching the reported workaround). Fix: clear
  `set_weights` on swap. New query-layer test `__tests__/replace-exercise.test.ts`
  (cleared payload + no-history + logged-sets guard). No engine change. *Noted but not
  taken:* the swap also seeds raw `v_exercise_prs` best rather than `seedMeso`, and the
  freshness fingerprint is blind to exercise identity (same-equipment swaps escape the
  reconcile) — latent, deferred; the `set_weights` clear closes the reported symptom.
- **PH29 — done (PR #84)** for the glitch. The "double layer label" = two `■` markers in
  the bottom nav during a transition (`usePathname` lags the commit → old tab still
  `active` while tapped tab `pending`, both draw ■). Fix in `BottomNav.tsx`: lift a single
  `anyPending` signal so the source tab yields its marker to the tapped tab; exactly one ■
  ever shows. The *instant-switch/slowness* half is server-compute-bound (Workout tab RSC)
  → folded into N1/WS-J; route-level `loading.tsx` + prefetch already exist.
- **PH36 — done (PR #84).** Confirmed the owner's expectation: the engine/model half was
  already fixed by **engine_params v16** (active) — bodyweight_only progresses on reps at
  fixed bodyweight and the increment override is inert (weight never rounded through the
  step). Remaining gap was UI: the Exercise page surfaced the "Load step" control for
  bodyweight_only lifts where it does nothing. Fix: hide `ExerciseSettingsMenu` for
  `bodyweight_only` (loadable/assisted keep it).
- **PH34 — done (PR #84).** Owner ruled **autoregulated projection**. Confirmed the
  engine's set-count model is single-step (carry `previous.sets` forward + a ±1 feedback
  nudge `index.ts:378` + deload scaling), with **no forward MEV→MAV→MRV ramp** (T-A5
  unbuilt) — so an unmaterialized week (no feedback) faithfully projects to the last
  materialized week's count carried forward, deload-scaled. Built pure `projectWeekSets`
  + shared `loadPlannerBaseline`/`loadMesoSetProjection` (`queries/volume-projection.ts`),
  rewired `buildVolumeMatrix` (stats) and `get_muscle_group_volume` (MCP, new `projected`
  status) off the old baseline-vs-`null` split so both read one definition. **No SQL
  migration** — the projection is pure TS from data the views already expose. Tests:
  `volume-projection.test.ts` (6, carry-forward/deload/floor/baseline-seed/post-deload),
  updated `stats.test.ts` + `read-tools.test.ts`. **Caveat relayed to owner:** the
  projection is flat across accumulation weeks (honest, not a climbing ramp); a climbing
  projection needs the unbuilt set ramp (T-A5).
- Green: `npm run test` **560** (+8), typecheck, lint.

## 2026-06-30 — Session 14: reconcile merged PRs + harden the PR-sync process

Owner flagged that the live index was full of `done (PR pending)` rows whose PRs had
actually merged — the post-merge sweep had never been run — and asked to (a) reconcile
the notes against real PR/commit state and (b) fix the operating manual so status moves
in lockstep with PRs going forward. Branch `claude/review-notes-section-khtf4p`.

- **Reconciliation.** Checked the live index against the merged-PR list (only the
  unrelated **#48** is still open). Every `done (PR pending)` item maps to a merged PR —
  nothing was actually stuck. **Swept 12 rows + WS-I (T-I1–T-I5) to `archive.md`** under a
  new "Swept 2026-06-30 — reconcile merged build PRs" section, with PR links + resolutions:
  PH35/PH42/P20/PH26/P19/PH27/PH28 (**#62**), PH31/PH32 (**#65**, backfill **#66**), O1
  (**#72/#73**), PH40/PH41 (**#78**), PR26 + T-I2/T-I4/T-I5 (**#72/#80/#81/#82**).
- **Backlog.** Live index trimmed to genuinely-open items; follow-up table drops the merged
  WS-I tasks (note + archive link left in place); T-A4 annotated as realized via #82. Replaced
  the "done (PR pending)" note with the new status convention.
- **Process fix (the real ask).** `docs/notes/CLAUDE.md`: new **"Keeping the index in sync
  with PRs"** section (rule 1: the *building* PR sets `done (PR #161)` with the real number +
  logs it; rule 2: a merged PR can't sweep its own row; rule 3: a **reconciliation sweep** runs
  at every session start). Wired the sweep into the **resume protocol** as step 3. Root
  `CLAUDE.md`: added the "any PR that resolves a backlog item updates its row in the same PR"
  rule to the `docs/notes/` bullet so non-notes sessions follow it too.
- No code/schema/engine changes; docs only.

## 2026-06-26 — Session 13: T-I4 — retire the legacy increment model (WS-I complete)

With v16 active the legacy path is dead in production, so this deletes it (own PR,
branch `claude/t-i4-retire-legacy`). No version bump / no row migration — legacy param
fields stay in the schema (deprecated) to keep historical rows replayable; only the code
is removed.

- `prescribe()` legacy `else` → no-anchor **hold** (anchor-only; no +increment / no
  −regression%). `seedMeso()` prior-peak branch deleted (precedence: anchor → initial →
  unseeded). `incrementFor` removed; `effective-params` drops the dead `increment` set;
  exercise page default = rounding step. Legacy params marked DEPRECATED in `params.ts`.
- Re-pointed the engine test harness off the legacy default (`prescribe.test.ts`,
  `golden-meso`, `rep-window`, `standalone-prescription`, `regeneration`, `admin-tools`,
  `equipment`, `effective-params`). Suite green (549), typecheck + lint + build clean.
- **WS-I / PR26 complete**: T-I1–T-I5 all done. T-I4 → done (PR pending).

## 2026-06-26 — Session 12: Group 2 — audit, loadable data migration, v16 ACTIVATED

- **Pre-activation audit** (read-only, all users): every bodyweight_loadable exercise was
  logged as **total** (entered ≈/≥ bodyweight); assisted entries are valid assist amounts
  (no migration); bodyweight_only ≈ bodyweight (safe). Only 2 users have bodyweight history.
- **Loadable data migration** (one-time live cleanup, NOT a repo migration): 73 working
  sets rewritten to `weight = round(added/5)×5`, `bodyweight = entered − added` —
  effective load preserved exactly. Slant Board uses bw_ref 150 (owner's note). assisted/
  only/external untouched.
- **Replay (post-migration)** confirmed sane v16 output; Back Raise anchor 379→220 (double-
  count fixed). **Activated engine_params v16** (v15 retired) — bodyweight model is LIVE.
- **T-I4 (legacy deletion) deferred to its own PR** — the legacy path is the engine
  test-harness default (7 files, ~38 assertions) and feeds historical replay/provenance;
  bundling a full re-point into the UI PR right after a live activation is too risky.
  Dead under v16; deletion ships as a focused, fully-tested follow-up. Recorded in PR #81.

## 2026-06-26 — Session 11: Group 2 — replay dry run, migrations applied, bodyweight UI

- **Migrations applied to live** (002 columns + backfill, 003 v16 INACTIVE), recorded
  in the tracking table. Backfill: load_type set on all 330 library exercises (26 only /
  13 loadable / 5 assisted / 286 external); all 10,763 logged sets got bodyweight from
  profile. Active stays v15; v16 replayable.
- **Replay dry run (v15→v16)** on user 0af27789 (BW 125, richest bodyweight history).
  Finding: **bodyweight_only reproduces v15 numbers** (e.g. Pushup 125×11 — safe to
  activate) because users log ~bodyweight already; **loadable/assisted diverge** because
  users logged *total*, not *added* (Back Raise anchor 215→379 ⇒ "145 lb added", nonsense).
  ⇒ loadable/assisted need the UI + a per-exercise data migration before activation.
- **Bodyweight day-view UI built** (owner rulings): inline-editable `BW` chip (writes
  straight to profile via `updateBodyweightAction`), read-only weight cell for
  bodyweight_only, effective-load in the live predictor + P19 marker, and the history
  tap-flip shows EFF LOAD (session avg) for bodyweight lifts. Branch
  `claude/bodyweight-ui`. Rule-8 deviation (no mockup) recorded in PROGRESS.
- **Remaining for T-I4:** migration-audit (total→added per exercise) → activate v16 →
  delete legacy.

## 2026-06-26 — Session 10: Group 2 / T-I2 built — bodyweight load-type model (gated v16)

Owner picked Group 2, scoped to **just the bodyweight model**, and ruled: **build
assisted now** (it's the inverse of loadable). Built T-I2 as a gated, INACTIVE slice on
branch `claude/group2-bodyweight-model`.

- **Load-type model + effective load** (`engine/load.ts`): `LoadType` (external /
  bodyweight_only / bodyweight_loadable / bodyweight_assisted), `effectiveLoad`/
  `enteredForEffective`, `toEngineLoadType`/`coerceLoadType`. Engine handler
  `rules/bodyweight.ts` (reps-at-fixed-bodyweight for only; rep-window in effective space
  with entered-value rounding for loadable/assisted; defer when no anchor+no seed). Routed
  from `prescribe()`/`seedMeso()` behind `bodyweight_model`; external path byte-identical.
- **Inputs/fingerprint:** `exercise.loadType` is a config input (in the fingerprint);
  top-level `bodyweight` is derived (excluded, like the anchor). Wired through all
  EngineInputs builders; anchor query prices on effective load under the flag.
- **Schema:** `exercises.load_type` + `logged_sets.bodyweight` (migrations `…002`),
  captured at log time; **engine_params v16 INACTIVE** (`…003`). Hash guarded.
- **Deferred to activation:** DayView UI (#5 + rule-8 no-mockup), effective-load e1RM
  write, then **T-I4** legacy deletion. T-I2 → done (PR pending). Suite green (557).
## 2026-06-26 — Session 9b: Group 1 merged, migration applied, archival sweep

PR #78 **merged**. Applied the view migration `20260626000001_v_exercise_history_avg_e1rm`
to the live project (`apply_migration`) and verified against real data: all **4,411**
history rows now equal the session average, **1,271** of them differ from the old session
max — change confirmed live and correct. **Archival sweep** (post-merge, per the purge
policy): moved **N2**, **N3**, **T-A7**, **T-A8** out of the live index into `archive.md`
(new "Group 1 merged (PR #78)" section). **T-A1** stays live (only partially advanced —
`v_exercise_overview.best_e1rm` still raw-Epley + the per-screen / PH39 call open).

## 2026-06-26 — Session 9: Group 1 built — active-workout isolation + session-average e1RM

Owner reviewed the proposed next work-groups and selected **Group 1** (engine
correctness), ruling: unify the e1RM systems by **averaging the stored engine per-set
e1RM**. Built both items; branch `claude/next-work-groups-88mqme`.

- **N3 / T-A7 / T-A8 — done (PR pending).** `getExerciseE1rmAnchors` (`anchors.ts`) now
  filters candidate sets to those whose parent `workouts.status='completed'`, so the
  in-progress workout never feeds the anchor (the recency-best-first-set repricing the
  owner described). Single-point fix ⇒ live predictor, seed, progression, regeneration
  all inherit it. History/stats keep posting in-progress sets live (owner: fine); only
  the prescription/prediction input excludes them. `status='completed'` is set at the same
  step feedback is captured (`completeWorkout`), so it's a faithful "canonical with
  feedback" gate. T-A7/T-A8 moved done.
- **N2 / T-A1 (history half) — done (PR pending).** Session e1RM was the session *max* on
  raw Epley; now the **session average of `logged_sets.e1rm`** (engine RIR-aware formula).
  Two surfaces: `history.ts sessionBestE1rm → sessionAvgE1rm` (Exercise history / PH32
  flip), and `v_exercise_history.e1rm` (migration `20260626000001`, drop+recreate for the
  double→numeric type change). `v_exercise_prs` already recomputes on the engine formula
  (06-24), so PR badges stay coherent. Trend consumers read per-session values, no best-set
  assumption — they now read averages; `comparability.ts` (separate analysis system,
  already engine-formula) left as-is. **T-A1 advanced** (only `v_exercise_overview.best_e1rm`
  still raw-Epley; the "what each screen shows" + PH39 decay question stay open).
- **Tests:** `sessionAvgE1rm` unit tests (average vs old max, null-skip, 1-dp rounding,
  bodyweight⇒null). Full suite green (540), typecheck + lint clean. Engine itself unchanged.
- **Recorded for Group 2 (owner rulings, not built):** store bodyweight on the set at log
  time, uneditable after complete (#4); no seed-weight prompt — blank weight/reps + an
  informative prescription-reasoning line inviting a manual start (#5). Folded into
  `I-engine-v9.md` sequencing (T-I2).

## 2026-06-26 — Session 8: intake batch 2 (perf + engine corrections), notes-only

Owner handed over a perf review request plus two notes; explicitly **not** ready
to execute — capture/assess only. Ran the intake protocol; logged as appendix
**Batch 2**. Three new items (new `N*` batch-prefix per the ID convention):

- **N1 — Performance & efficiency (new workstream J).** Reviewed the app structure
  against the owner's perf questions. Finding: the backend already does the heavy
  lifting (SQL-view aggregation, server-side engine + freshness reconcile,
  batched/indexed queries); the real wins are client bundle/render + a few
  query-scope/caching fixes, **not** relocating compute to edge/DB (engine stays
  pure TS, hard rule #3). Phased measure-first plan in
  [`J-performance.md`](./J-performance.md); added WS **J** to the README.
  Cross-linked PH29 (page-switch slowness overlaps the streaming work).
- **N2 — History e1RM averaging (B, WS-B).** Owner: history e1RM "appears to take
  max"; should **average** across all working sets in the session. Not yet
  investigated against `v_exercise_*` / `ExerciseHistoryList`. Flagged as likely
  sharing a fix with N3 (the engine anchor already averages session e1RM).
- **N3 — Active workout must not feed live prescriptions (owner DECISION).**
  Prescriptions/predictions read **previous completed workouts only**; the current
  workout becomes canonical only when marked complete **with feedback**. Live
  posting of current sets to history is fine. This **resolves the open needs-input
  on T-A7 (PH40) and T-A8 (PH41)** — both moved to decided/build-pending. Root
  cause the owner described: the first logged set of a current exercise, if it's
  the recency-weighted best, makes the session-average anchor (one set logged)
  snap all remaining sets to that weight. Build deferred per owner.

No code changed; no tests run (notes-only). This branch
(`claude/app-performance-review-twermm`, PR #77) was originally cut against the
pre-rebrand `docs/triage/` tree; merged `main` (the rebrand, PR #76) and re-applied
all three items into the new `docs/notes/` structure with `N*` IDs.

## 2026-06-26 — Session 7: rebrand triage → ongoing notes area

Owner asked to turn the one-time "triage" area into a **functional, ongoing**
place to drop notes that Claude assesses, relates, groups, prioritizes, tracks,
and prunes — with Claude owning the structure and the owner interfacing through
chat rather than the files. No backlog items were worked this session; this was a
structural reorg.

- **Renamed `docs/triage/` → `docs/notes/`** (`git mv`, history preserved).
- **New `CLAUDE.md`** — the operating manual for the area: the intake protocol
  (capture verbatim → parse → **assess against known items** for dupes /
  relationships / dependencies / grouping / priority → classify → scope →
  log), the full lifecycle incl. a new `archived` terminal state, the
  consolidation & purge policy, the file map, and the resume protocol. This is
  the standing instruction set the owner asked for.
- **Reframed `README.md`** to a thin orientation + the workstream roster
  (pointer to `CLAUDE.md` for process). **Reframed `backlog.md`** from a finite
  "imported 2026-06-22" doc to the **live index**; its verbatim appendix is now
  the **append-only** record, organized into dated **intake batches** (Batch 1 =
  the original Notes doc) so future drops append cleanly.
- **New `archive.md` + first purge sweep.** Moved genuinely-terminal rows out of
  the live index: merged/confirmed (**M9**, **I13**), superseded (**I15** → PH42),
  resolved-and-removed-in-v2 (**S4**, **S5**, **PR22–PR25**), and the resolved
  follow-up **T-A3**. Kept all "done (PR pending)" items live (not yet merged) per
  the purge policy. Raw text for the moved items stays in the backlog appendix.
- **Fixed cross-references** to the renamed folder in `docs/PROGRESS.md` and
  `docs/reviews/2026-06-23-standalone-prescription-investigation.md`, and added a
  pointer to the notes area from the root `CLAUDE.md` docs list so it's
  integrated into the overall doc system.
- No code, schema, or engine changes. Detail files (`A-engine-metrics.md`,
  `I-engine-v9.md`, `scoping.md`) carried over unchanged.

## 2026-06-25 — Session 6: WS-I kickoff — T-I1 decided + T-I5 built (gated)

Owner reviewed Workstream I in light of the current engine state (corrected the
stale "active = v9" framing: live active is now **v12**, after v10 imperial, v11
standalone fixes, v12 rep-window round 2; the S1 anchor seed and S3/S5 fixes are
already live but **layered in front of** the still-present prior-peak branch, so all
of WS-I was still unbuilt). Confirmed v13 is a throwaway test row (disregard).

- **T-I1 — bodyweight model DECIDED (owner).** Recorded in `I-engine-v9.md`
  ("Decision: bodyweight model"). Three load types: **bodyweight-only** (profile
  bodyweight as a read-only prefilled load, cue the user, progress on reps only);
  **bodyweight-loadable** (effective load = bodyweight + added; bodyweight used in
  the calc but not shown; narrow + under-tested); **bodyweight-assisted** (negative
  weight = bodyweight − assist; same engine math; UI for entry/display deferred +
  documented if the library has no assisted exercises yet). Implies a first-class
  **load-type** column and **user bodyweight as an engine input**. Unblocks T-I2.
- **T-I5 — prior-peak seed retirement BUILT (gated, inactive).** New
  `retire_prior_peak_seed` `.optional()` param; `seedMeso` skips the
  `priorPeak × meso_seed_backoff_pct` branch when set, so seed precedence becomes
  **confident anchor → user `initial_*` → unseeded (null weight, prompt the user)**.
  Shipped as **engine_params v14, INACTIVE** (`20260625000001`), byte-identical to
  v12 plus the flag — pre-v14 rows parse unchanged (hash/replay/fingerprint
  untouched, guarded). `meso_seed_backoff_pct` is **left in the schema** (removing it
  would flip historical rows non-replayable); its removal + row migration stays in
  **T-I4**. Activation is the manual post-replay step (manual-operations.md). Tests:
  seed on/off matrix in `standalone-prescription.test.ts` + v14 hash guard in
  `params-provenance.test.ts`. Suite green (522), typecheck + lint clean.
- **Flagged for activation:** "unseeded" (null weight) becomes a more common live
  state — verify the planner/day view renders it as a "enter a starting weight"
  prompt (not blank/0) before activating. Engine produces the deferral; the surface
  should invite the manual seed.
- **Auditability follow-on (owner ask, → O1).** Two parts. (1) Confirmed the
  invariant "every open decision gets re-stamped to the new version on a bump, even
  when output is unchanged" already holds: `workout_exercises.params_version` advances
  on every reconcile confirmation (changed/unchanged/self-healed), and the day-view
  page runs the reconcile on every load — so it's current by view time. Lazy (on
  view) is sufficient; no eager sweep built (owner agreed). (2) **Built** the
  prescription audit reveal: the exercise `…` dropdown in the day view now has a
  "Prescription detail" row → a sheet showing decision **kind**, **verified as of
  Vx** (row stamp) vs **computed under Vy** (latest decision), and the rationale +
  trace — so a no-op version bump is visibly confirmed ("re-verified under Vx,
  unchanged since Vy"). `queries/audit.ts` + action + `PrescriptionDetailSheet`.
  Rule #8 deviation (no mockup) recorded in PROGRESS; admin-gating is an easy
  follow-up if version/kind shouldn't be user-facing.

## 2026-06-25 — Owner ruling: retire the prior-peak seed; no fabricated prescriptions

While reviewing a `replay_decisions(v12)` diff, the owner saw the "Calf Machine
seed 175×20 → 180×20" line and challenged it. Investigation (run against live
data + the branch engine) showed the diff was **not** a v12 effect: it's an old
v10 *seed* whose stored inputs carry `strengthAnchor: null` (recorded before S1),
so replay correctly fell through to the legacy `priorPeak × back-off` branch,
which carries `priorPeak.reps = 20` verbatim. The 175→180 move was the **20 lb
per-exercise increment override** (set 2026-06-24) folded into rounding by replay —
a config artifact, not engine behavior. S1's anchor seed is wired in
`generation.ts` but **hasn't run in prod** (zero seed decisions at v11).

**Decision recorded (binding):** the `priorPeak × back-off` seed and the no-anchor
*fabrication* fallback are **fundamentally broken and retired at the next
opportunity** (`T-I5`). Principle: a prescription is not produced at any cost — use
real data when available; when there isn't enough, **defer to a manual user seed**
(the user enters their own starting point), never fabricate. Seed precedence =
**confident anchor → user `initial_*` → unseeded/prompt.** This also decides `T-A4`/
`T-I3` (anchor-only; **no** hidden big-miss back-off; retire `regression_pct`).

- Recorded in [`I-engine-v9.md`](./I-engine-v9.md) (decision + principle + seed
  precedence; new `T-I5`; updated the "what would be lost" table and T-I2/T-I3),
  [`A-engine-metrics.md`](./A-engine-metrics.md) (PR25 + T-A4/T-A6 notes),
  [`backlog.md`](./backlog.md) (T-I5 + verbatim ruling + T-A4/T-I3 status), and the
  [standalone-prescription investigation](../reviews/2026-06-23-standalone-prescription-investigation.md)
  (S1 amendment: the fallback is retired, not kept).
- **No code changed this session** — documentation/decision only. T-I5 is `ready`
  and sequences ahead of / with the WS-I legacy-path deletion (T-I4).

## 2026-06-23 — Session 5: Workstream B — e1RM audit & exposure (PH31 + PH32)

Owner picked the next slice = **Workstream B** and made the two scoping calls:
store the **RIR-aware engine e1RM** per set (not raw Epley), and ship **PH31 + PH32
together**. Existing stats screens/views were left on their current raw-Epley
numbers — this slice only *adds* the engine value (keeps us out of the broader
T-A1 reconciliation).

- **PH31 — store + expose per-set e1RM.**
  - Migration `20260623130000_logged_set_e1rm.sql`: nullable `logged_sets.e1rm`,
    column comment, **backfill** of all historical working sets via the same
    formula (rir_offset read from the active engine_params row). RLS unchanged
    (policies are column-agnostic, owner-scoped).
  - Write path: `logSetAction`/`amendSetAction` compute the value with the
    engine's `estimateE1rm` (effective reps = reps + rir·offset) from active
    params and store it; amend recomputes. `logSet` input + `amendSet` patch
    gained `e1rm`; `LoggedSetRow` + the insert `Defaulted` set updated.
  - MCP: `get_exercise_history` now returns a per-session `e1rm` (session best),
    with an honesty caveat in the dataQuality note (estimate/trend, null on
    bodyweight, distinct from the view's raw-Epley e1RM).
- **PH32 — tap-to-flip history view.** `ExerciseHistoryList` gained a list-wide
  `flipped` state: tap any row to flip every row between `weight × reps` and the
  session-best `e1RM`, with a quick `metric-fade` (reduced-motion → instant);
  default on load is sets/reps. The session-note reveal moved onto its own note
  icon button so the row tap is unambiguously the flip. Bodyweight/null → "—".
- **Pure helper + tests:** extracted `sessionBestE1rm` (max over non-null,
  null-if-none) and unit-tested it; updated the three `HistoryEntry` fixtures and
  added an `e1rm` assertion to the MCP formatter test. Engine `estimateE1rm`
  already covers the bodyweight=0→null and Epley-fallback cases the backfill
  relies on. Green: typecheck, lint, **489 tests** (+3).
- **Deploy note:** the migration must be applied to the live DB **with** the code
  deploy — inserts write `e1rm`, so deploying code ahead of the column would break
  set logging. Not applied to live in this session (feature branch only).

## 2026-06-22 — Session 4: real PH35 cause (RLS recursion) + slices 1 & 2 in one PR

Owner asked to ship slice 1 + slice 2 + PH35 together, and flagged that PH35 was
**still crashing** (the toast caught it but the setting still wouldn't save), the
pencil was still too small, and the P19 under-marker should sit on the bottom
corner.

- **PH35 — found the actual root cause by inspecting the live DB.** The error
  boundary + toggle guards (session 3) only *caught* the failure. Reproduced the
  real error against production: **`42P17 infinite recursion detected in policy`**
  on `profiles` — `profiles_update_own`'s WITH CHECK queries `profiles` inside a
  `profiles` policy, so *every* regular-user profile UPDATE fails (auto-match,
  units, profile edits, onboarding). Latent since the initial schema; surfaced
  after Postgres began enforcing recursion detection. Fix
  (`20260622220627_fix_profiles_update_recursion.sql`): read the role via a
  SECURITY DEFINER helper that bypasses RLS, preserving the anti-escalation guard.
  **Applied to the live project** and verified (normal update OK, escalation
  BLOCKED 42501). Added an RLS test for a benign owner update.
- **Slice 2 polish:** P19 under-marker now sits on the bottom corner (over stays
  top); P19/PH27/PH28 otherwise as session 3.
- **Slice 1 shipped:** PH42 (legible +20% SVG pencil, absorbs I15), P20 (client
  `ExercisesBrowser` live-filter), PH26 (`/more/account` sub-page).
- Green: typecheck, lint, 486 unit tests.

## 2026-06-22 — Session 3: identify the clean slices; ship PH35 (real fix) + slice 2

- **Identified the independent (no open-question / no-larger-dependency) items.**
  Slice 1 (build-now, clean): **PH42**, **P20**, **PH26**. Slice 2 (one small
  decision away, now answered by owner): **P19**, **PH28**, **PH27**. Owner
  corrections folded in: **PR #61 is merged but PH35 still crashes**; **I13**
  confirmed merged (close); **I15** is the same icon as PH42 (illegible, not
  missing) → folds into PH42; **M8** meso est-strength is present but the owner
  wants its *meaning* clarified and has a broader meso/macro stats redesign in
  mind → back to needs-input.
- **Shipped PH35 + slice 2 in one PR** (branch `claude/nifty-darwin-xiwnxe`),
  typecheck + lint green, **486 tests** passing (+5 new `units` tests):
  - **PH35** — found the real cause: there was **no error boundary** in the
    `(app)` segment, so any rejected server action inside an optimistic toggle's
    transition rendered Next's raw "application error". Added
    `src/app/(app)/error.tsx` and made `AutoMatchToggle` / `UnitsToggle` revert +
    toast on failure (and ignore no-op clicks). PR #61's data-path guard stays.
  - **P19** — `▲`/`▼` over/under marker on logged sets in `SetRow`, compared by
    **e1RM** (per owner), ±1.5% on-target band, no marker without a prescription.
  - **PH27** — `NewTemplateButton` tray (blank template → planner, or add from a
    share code); redeem form moved off the page into the tray.
  - **PH28** — new `src/lib/units.ts` (consolidates `formatHeight` + cm↔ft/in);
    unit-aware height in `ProfileEditor` and onboarding; **onboarding reordered**
    so units is chosen first (deviation from 08 §4 recorded in PROGRESS.md).
- **Next:** slice 1 (PH42, P20, PH26) is still queued and fully clean.

## 2026-06-22 — Session 2: reconcile Notes v2, scope the v9 cleanup, ship two bug fixes

- **Reconciled the backlog with Notes v2.** Owner pruned items session 1 resolved
  and added two. Removed as resolved: S4, S5, I13, I15, PR22–PR25 (kept with
  `resolved (removed in v2)`). Added **S8** (engine add/remove sets/reps — answered
  by existing S7/S4 research) and **PR26** (retire the legacy increment path → v9).
- **Corrected a session-1 error:** the active engine is **already v9**
  (`weight_selection: rep_window`, `min_confidence: low`), not v8. This makes the
  T-A3 "silent confidence fallback" essentially moot in production — the legacy
  path is reached via **no anchor** (bodyweight-only + cold start), not confidence.
- **Scoped PR26** into [`I-engine-v9.md`](./I-engine-v9.md) via a code investigation:
  the legacy path is the de-facto bodyweight/cold-start path; bodyweight needs a
  real data-model change (no `is_bodyweight` flag today; `weight=0` makes the
  rep-window math null; both bodyweight equipment buckets collapse to one). Spawned
  T-I1–T-I4.
- **Shipped two bug fixes** (the queued first slice), with `typecheck` + `lint`
  green and all **481 tests passing**:
  - **M9** — `CreateMacroForm` custom-duration field now holds a string and clamps
    on blur, so it can be emptied and retyped.
  - **PH35** — `setPlannedSetWeight` uses `.maybeSingle()` + no-ops on a missing
    row; `persistPlannedWeight` routes through `runLog` (try/catch + toast) instead
    of the unguarded `commit`, so an auto-match write failure can't trip the
    app-error page. (Exact on-device trigger unconfirmed; this removes the crash
    surface + the most likely cause — flagged for device verify.)

### Next session — suggested starting point
- The big open cluster is **needs-input decisions** (T-A1/2/4/6/7/8, T-I1/3, plus
  M10/P16/P17/P18/PH28/PH30/PH33). Walking these with the owner unblocks the most
  work. The v9 cleanup (WS I) is the largest engine effort and starts with T-I1.

## 2026-06-22 — Session 1: set up the triage system, parse + first-pass triage

- Imported the Notes doc (2026-06-22) and parsed **42 distinct items** across 6
  source sections into [`backlog.md`](./backlog.md), preserving verbatim text.
- Established the sub-process, status/type legends, and 8 workstreams in
  [`README.md`](./README.md).
- Ran codebase research to scope the **UI/feature** cluster; findings recorded
  per item in [`scoping.md`](./scoping.md). Key outcomes:
  - **I13** (per-user weight increment) — already shipped 2026-06-21; needs only
    a verification pass, not new work.
  - **M8** "est-strength under meso Performance tab" — **already present**; the
    real ask is the *macro* 3-way toggle, which has no mockup yet (design
    decision needed, hard rule #8).
  - **I15** (note icon left of history) — that icon **already exists**; overlaps
    with **PH42** (the *edit* pencil glyph `✎` is the unclear one).
  - **M9** (custom-duration backspace) and **PH35** (match-weights crash) have
    confirmed root causes and are small, ready-to-build fixes.
  - Several items (**M10**, **P16**, **P17**, **P18**, **PH28**) carry open
    design questions flagged for the owner before implementation.
- Ran codebase research on the **engine/metrics** cluster (A) — see
  [`A-engine-metrics.md`](./A-engine-metrics.md).

### Next session — suggested starting point
- Review `scoping.md` + `A-engine-metrics.md` answers and confirm the open
  design questions (collected under workstream **H**).
- Then knock out the two clean bug fixes (**M9**, **PH35**) as a first
  vertical slice.

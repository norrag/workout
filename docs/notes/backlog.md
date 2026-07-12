# Backlog — live index

The **live index** of every open/active field-note item. The single source of
truth for item *state* — update the **status** column whenever an item moves and
record the *why* in [`log.md`](./log.md). Terminal items (done-and-merged,
wontfix, superseded) are swept out to [`archive.md`](./archive.md); their raw
text stays in this file's [appendix](#appendix-verbatim-source), which is the
**append-only** permanent record of everything the owner has ever noted.

How this area works — intake protocol, lifecycle, consolidation/purge rules — is
in [`CLAUDE.md`](./CLAUDE.md). Type: `Q` question · `B` bug · `F` feature ·
`UX` polish · `D` needs-decision. Status legend + workstreams: [`README.md`](./README.md).

> **Origin.** This started as a one-time triage of the "Notes" doc (imported
> 2026-06-22, reconciled with Notes v2 the same day) and has since become the
> ongoing intake area. Items resolved-and-removed at the v2 reconciliation
> (**S4**, **S5**, **PR22–PR25**) and shipped-and-merged items (**M9**, **I13**,
> **I15**) now live in [`archive.md`](./archive.md). Follow-ups they spawned
> (`T-A*`) are tracked in the [follow-up table](#open-follow-up-tasks) below.

> **Status convention for built items.** When a PR addresses an item, the **same
> PR** sets the row to `done (PR #N)` with the real PR number (never a bare "PR
> pending") and logs it. After that PR **merges**, the row is swept to
> `archive.md`. A merged PR can't sweep its own row (the merge happens after), so
> the **resume protocol's reconciliation sweep** (see [`CLAUDE.md`](./CLAUDE.md#resume-protocol-every-session-start-here))
> catches any `done`/`PR #N` row whose PR is now merged and archives it before new
> work starts. Don't archive a `done` item on the status word alone — confirm the
> PR is merged first.

## Index

| ID | Title | Type | Pri | WS | Status |
|----|-------|------|-----|----|--------|
| S1 | How is estimated strength (e1RM) calculated? | Q | — | A | answered |
| S2 | How is strength increase calculated? (e.g. Est. Strength Key Lifts) | Q | — | A | answered |
| S3 | How are deload weeks handled in stats? | Q | — | A | answered → T-A2 |
| S6 | Does adding a set manually transfer to future plans? | Q | — | A | answered |
| S7 | How is the number of sets planned? | Q | — | A | answered → T-A5 |
| S8 | When/why/how does the engine add or remove sets/reps? | Q | — | A | answered (see S7 + S4) |
| PH30 | Expanded weekly prescription explanation — LLM narrative layer | D | — | H | **deferred (2026-07-02):** not now. Refined vision: LLM does **not** replace the engine — it's an explanation layer over it (uses session notes, explains the engine's decision verbosely, light PT-style advice via MCP tools). Parked |
| PH39 | How fast does e1RM recency decay? (Pulldown e1RM 110.1 but did 115×11 on May 22) | Q | — | A | answered → T-A1 |
| N1 | Performance & efficiency pass. **Owner's north star (2026-06-30):** "snappy" = *every* user interaction on *every* surface is visually acknowledged immediately, so the user never wonders "did my tap register?" — responsiveness over instantaneous data. Plus strategic caching + efficient loading for real load times. Measure first (bundle analyzer, slow-query baseline) + an **interaction-acknowledgment audit** of every surface, then client bundle/render wins + query-scope/caching. Backend already does the heavy lifting — do **not** relocate the engine to edge/DB. Absorbs PH29's instant-switch remainder. **Escalated (2026-07-03, Batch 5):** owner reports 1-2s dead gaps on page taps persist, esp. cycles page + subpages — users double-tap in doubt; wants IMMEDIATE switch + skeleton on every nav (day view is the only page doing it right). Disproves the Phase-A assumption that route navs already paint the `(app)/loading.tsx` fallback — re-verify on device, then per-route skeletons/streaming (Phase 3 pulled forward). **Per-route skeletons shipped (PR #134):** 9 routes (`/cycles` + macro/meso/planner/planned-day, exercises list+detail, templates, more) each got a layout-mirroring `loading.tsx` — the group-level fallback never repaints for sibling navs, which is why only day view (own file) acknowledged taps. **Owner confirmed on device 2026-07-03 (Batch 6): "all nav skeletons look good".** **Phase 2 closed (PR #151):** #7 reference cache shipped (`queries/reference.ts` — muscle_groups + stock exercise library in the shared Data Cache, per-user overlays live); #5 revalidateTag assessed & dropped (nothing to bust — reference data has no in-app writers, per-user reads stay uncached per doc 14). #7 amended (PR #153): the cached accessors fall back to live reads outside the Next runtime — `unstable_cache`'s E469 invariant had broken the rls-tests CI job since #151. Remaining WS-J scope: Phase-3 streaming/`DayView`-`PlannerBoard` decomposition, only as measurement demands | F | HIGH | J | **in-progress** — plan in [`J-performance.md`](./J-performance.md) |
| N34 | BodySpec DEXA integration (optional, per-user OAuth connect → scan import → profile enrichment → macro outcome verdicts). Assessment done: [`docs/15-bodyspec-dexa-integration.md`](../15-bodyspec-dexa-integration.md) — API viable (user-tier OAuth2/PKCE, pull-only), schema = `body_scans` time series + `external_connections` + `v_body_comp_history`, engine touch = measured FFMI into `planMacrocycle` only (never set-level), LSC honesty guardrails. Relates to N21 (macro-target correction should assume scan data may exist). Amends doc 01 out-of-scope if adopted. ~~Phase 0 is human-only~~ **Phase 0 resolved (2026-07-10, doc 15 §8):** owner confirmed private single-user deployment; live probe found the Keycloak realm allows **anonymous dynamic client registration** and grants `offline_access` — no BodySpec contact/approval needed; client self-registers at Phase-1 build time (one residual 5-min verification at first login: doc 15 §8.3). **Adopted (owner, 2026-07-10): "the dexa integration build is ready … can be phased in."** Build spec: [doc 17 §6 / Phase 5](../17-macrocycle-goals.md) — three PRs (5a connect+import, 5b enrich+view+retrospective verdict rows, 5c engine+MCP), parallelizable from day one; 5b's verdict rows want the N40 retrospective first. **5a shipped (PR #173):** migration `20260711000002` (`external_connections` + deny-all `external_connection_secrets` + `body_scans`, RLS + tests), PKCE OAuth w/ `offline_access` (connect/callback routes; the callback runs the §8.3 `GET /users/me` verification BEFORE persisting — `api_denied` fails the connect loudly), self-registration script + `manual-operations.md` runbook (`BODYSPEC_CLIENT_ID` per env; the screen is inert until set), zod-validated serial import w/ kg→lb at the boundary + verbatim `raw`, pull-based sync (inline backfill on connect, SYNC NOW after), More row + `/more/bodyspec` + scan detail ledger (09 2026-07-11 Phase-5a entry — no deltas/verdicts until 5b's LSC guardrails) **5b shipped (PR #174):** migration `20260711000003` (`v_body_comp_history` — deltas vs prev scan + `same_scanner_as_prev`; `body_scans.profile_applied_at`/`_dismissed_at`), consented profile-update proposal (newest unresolved scan; APPLY → profile bodyweight/bf% + `bodyweight_log source:'dexa'`; KEEP CURRENT resolves permanently), scan-detail VS PREVIOUS SCAN + macro-page BODY COMPOSITION (LSC guardrails as data: sub-LSC ⇒ WITHIN MEASUREMENT RANGE, cross-scanner ⇒ flagged never graded), retrospective `composition` block + the mass verdict's same-machine DEXA fallback, MCP parity (09 2026-07-11 Phase-5b entry) **Field fix (PR #175):** first real connect from the installed PWA died at the final hop — the round trip spans two browsing contexts (iOS in-app sheet w/ its own cookie jar), so the 5a cookie-carried PKCE/state + session-required callback could never complete there. Root cause + design recorded as doc 15 §8.5; migration `20260711000004` (`oauth_transactions`, deny-all, single-use state, 10-min TTL), cookie-free callback (service-role persistence scoped to the transaction's user), return-to-app interstitial (09 2026-07-11 entry). Hosted migrations `20260711000002`–`04` applied + verified via MCP the same day (the More tab errored on the missing 5a/5b tables) **5c shipped (PR #176):** measured bf% rides the existing `bodyFatPct` profile path (doc 15 §3.1 — no engine change; the 5b apply already writes the profile) + `profiles.body_fat_source` provenance (migration `20260711000005`; APPLY stamps `'dexa'`, picker/custom stamp `'estimate'`), profile body-fat control rework per the owner's 2026-07-11 note (bands normalized to 5-pt steps, CUSTOM VALUE entry, and a measured-DEXA panel replacing the bands while connected — OVERRIDE WITH AN ESTIMATE / disconnect reverts to the picker), Cunningham-only MEASURED RMR context on cut/hypertrophy macro Overviews (doc 15 §3.4, display-only), MCP `get_body_composition` over `v_body_comp_history` w/ the §6 guardrails shipped as data (09 2026-07-11 Phase-5c entry; doc 05 tool table) | F | MED | C | **build complete — 5a (PR #173), 5b (PR #174), field fix (PR #175), 5c (PR #176)**; open residual: owner re-runs the connect and the §8.3 first-login outcome gets recorded in doc 15 |
| N35 | **Prescribed e1RM progression** (owner memo "Updates to the Prescription Engine", Batch 12) — the engine never *demands* progress: exact compliance is a verified fixed point (prescription and measurement invert the same curve; the Option-A climb is RIR-neutral; the seed reprices the unchanged anchor), so meso N+1 = meso N forever unless the athlete volunteers over-performance. Analysis + recommended design shipped (survived a hostile design review): [`docs/reviews/2026-07-07-prescribed-progression-review.md`](../reviews/2026-07-07-prescribed-progression-review.md) — never bump the *measured* e1RM (T-I5); prescribe from a target anchor `A* = anchor + one earned quantum` (explicit all-sets compliance gate incl. workload + staleness, `min(weight, rep)` quantum with a realized-ask rule, never compounds unconfirmed, governed by per-microcycle cadence + a doc-10 §5 rate ceiling + a miss throttle — governors ship in Phase 1), param-gated `progression` block (v20), phases: advance chain → seed route → deeper macro coupling (after N21). Relates: archived S4/PR22 (this is their prescriptive half), T-I5 ruling, R24 (cut/maintain default-off), N21. **Owner follow-up answered + design amended (PR #156):** [`docs/reviews/2026-07-08-prescribed-progression-followup.md`](../reviews/2026-07-08-prescribed-progression-followup.md) — the rate ceiling is promoted to a **macro-rate pacer** (macro layer sets the expected strength rate from profile+goal, meso layer paces earned quanta to it; budget-never-quota — the rate meters the ask, only performance mints it; ships in Phase 1), per-goal booleans become **per-goal rate factors** (cut/maintain 0 subsumes the opt-out; hypertrophy 0.75 [HEURISTIC — research pass before v20]); `rate_source: "plan"` (personalized per-user rate) is the post-N21 flip. Also answered: the double-progression concern (one capacity quantum/week, not two — the ramp rep is reserve drawdown; the pacer bounds the rate), the `moderate` confidence ceiling under compliant hypertrophy (intentional — measurement honesty, doc 10 §9), and "reported RIR" (`logged_sets.rir_reported` — real optional column honored everywhere on read, **no write surface exists today**; §10 Q6 requires building one + a narrow doc-11 premise amendment) **Follow-up 2 answered (PR #156):** [`docs/reviews/2026-07-09-prescribed-progression-followup-2.md`](../reviews/2026-07-09-prescribed-progression-followup-2.md) — auditability (progression trace becomes **always-on + status-coded**; events at decision grain, aggregated read-side, fed back only as a doc-14 derived input), pacing decoupling confirmed, `band_position` replaces the band_mid/band_top enum, the owner's **envelope loop adopted as Phase 3**, standalone mesos need nothing extra. **Follow-up 3 answered + DESIGN FINALIZED (PR #156):** [`docs/reviews/2026-07-09-prescribed-progression-followup-3.md`](../reviews/2026-07-09-prescribed-progression-followup-3.md) — vanished-earn semantics locked as **retry-not-stack** (owner's accumulation assumption corrected: the measured anchor is the accumulator; coarse lifts realize via the rep axis + the top-of-window ratchet this design finally makes reachable); live day-view coupling prices off the **prescription-basis target anchor** (flips review §7.1's deferral); the earn gate moves to **e1RM-space per-set compliance** sharing the P19 marker comparison (grinder guard intrinsic); markers go **three-state (over/met/under)** with the band moved into params. Authoritative build spec: [`docs/16-prescribed-progression.md`](../16-prescribed-progression.md) (mechanism, v20 params block, doc-14 treatment, test matrix, phased plan: engine core → seed route → day-view coupling/markers → audit aggregate → owner-gated activation incl. the hypertrophy-factor research pass). Deferred, recorded in 16 §11: envelope loop, `rate_source: "plan"` (blocked on N21), required honest-RIR confirmation + capture affordance, per-exercise progression-off override | D→F | HIGH | — | **in-progress** — **Phase 1 (engine core + advance chain) shipped (PR #158)**: `rules/progression.ts` (e1RM-space earn gate, governors, quantum δ), `A*` threading with the realized-ask rule + always-on status-coded trace, engine_params **v20** (`20260709000001`, INACTIVE), `progressionHistory`/staleness derived-input assembly + advance-path plumbing, `get_engine_decisions` rule/status filter, doc 10 §4 + doc 13 §9.2 pointers; §10 Phase-1 test matrix green (the treadmill golden pins the doc-16 §7 worked example verbatim). **Phase 2 (seed route / meso-over-meso carry) shipped (PR #159)**: `seedMeso` §3.7 wrapper sharing the advance chain's gate + governors + realized-ask verbatim (new derived `seedEarn` input, doc 14 denylisted, recorded for replay), earned-at-close derivation (`queries/seed-progression.ts` — the most recent completed WORKING session, deloads excluded), caller plumbing at the §10 site list (meso activation earns; swaps/plan-edit adds never; freshness recompute + admin replay reproduce the recorded earn frozen); §10 Phase-2 tests green (seed↔advance parity, deload-boundary carry + staleness cutoff, meso-over-meso golden, doc-14 fingerprint parity). **Phase 3 (day-view coupling + three-state markers) shipped (PR #160)**: the day read carries the prescription-basis anchor (`LoggedExercise.prescription_anchor` — `A*` from the `stepped` step of the latest decision per row, read ungated so the coupling stays honest through deactivation), `SetRow`'s live predictor prices off `prescription_anchor ?? e1rm_anchor` (§5.2, measured-anchor fallback = today's behavior), `loggedSetMarker` goes three-state by DELEGATING to the engine's `setComplianceMarker` with the params-fed band (`compliance_band` absorbed `MARKER_BAND` — marker, gate, grading structurally one comparison), ▲/■/▼ house-style glyphs per the 09-changelog 2026-07-09 entry (rule-8 pass: no mockup figure exists for the set-row marker), WS-J bundle guard extended over `rules/progression.ts`+`rules/feedback.ts`; §10 Phase-3 tests green (three-state day-rules, marker ⇄ earn-gate agreement fixture, e2e: earned prescription renders / weight edit re-derives off the target / met+under markers). **Phase 4 (audit aggregate) shipped (PR #161)**: admin MCP `get_progression_history` (doc 16 §8.3 — per-exercise earn/miss/skip mix, governor firings, gate-failure reasons, `vanished` share for increment sizing, earned-then-met/missed ask pairing, trailing prescribed vs measured %/30d gain, bounded event series; caller's own decisions, active-params e1RM pricing), pure fold in `queries/progression-history.ts` + fetch in `engine-admin.ts`, read-side only — no migration; `v_progression_events` deliberately unbuilt (no stats screen wants it, per §10); tests +9 (suite 941). Doc-16 build-out complete. **Phase R (owner-gated activation) prepared (PR #162)**: (1) research pass on `goal_rate_factor.hypertrophy` DONE — **kept 0.75** ([`docs/reviews/2026-07-09-goal-rate-factor-research.md`](../reviews/2026-07-09-goal-rate-factor-research.md); moderate-load 1RM conversion ~0.56–0.73 of heavy-load, evidence-labelled, 1.0 rejected); (2) v20 migration APPLIED to hosted INACTIVE (hash-verified `cb451a02…`, v19 stays active — no user change); (3) replay diff DONE (v19→v20: 11/15 changed / 0 errors, all earned steps on compliant advance/seed weeks); (4)+(5) owner review → activate → monitor remain human steps in [`docs/deployment/manual-operations.md`](../deployment/manual-operations.md) → "Activate engine_params v20". The doc-16 §11 deferred spine is now filed as **N36–N39** (below) pointing back to doc 16; N21 primed as the next target. **Status: Phase R prepped — activation is owner-gated (manual-operations runbook).** Remaining N35 code is exhausted; the item stays live only until v20 is activated + the deferred rows are picked up |
| N36 | **Envelope loop** (doc 16 §4 Phase-3-of-design, §11) — demand-side outcomes (earn rate, miss ratio, throttle trips, `beat`s) move `progression.band_position` within [0,1] at meso boundaries, bounded with hysteresis, position recorded in decision inputs. Macro goals are never modified by performance — the loop only slides *where within the bounded rate band* the athlete is paced (owner's Batch-14 framing). **Needs:** v20 active + a few mesos of field data via `get_progression_history` (doc 16 §8.3, shipped PR #161) to fit the update rule, AND the N21-corrected band to move within. Sequencing in [`docs/reviews/2026-07-09-n21-strength-rate-priming.md`](../reviews/2026-07-09-n21-strength-rate-priming.md) §5. **Residence decided (2026-07-10, architecture doc §3.3):** `band_position` becomes a **per-user derived input** — a pure, bounded fold over the trailing `engine_decisions` stream computed at seed time (params value = default/starting position), fingerprint-excluded + recorded in decision inputs like `progressionHistory`; grain = per user (not per exercise); bounded-lookback forgetting doubles as the return-from-absence decay. No new table unless field data forces a materialization. **Build spec: [doc 17 §7 / Phase 6](../17-macrocycle-goals.md)** (update-rule shape: meso boundaries only, steps bounded at ±0.25, dwell ≥ 1 meso, clamp [0,1], demand-side outcomes only; `progression.envelope` block ships inactive after the rule is fit). ~~Blocked on: v20 activation (doc 17 Phase R1) + field data + N21~~ **R1 cleared:** v20 verified ACTIVE on hosted via MCP 2026-07-11; the N21-corrected band merged with Phase 1. **Mechanism built (PR #177):** `EngineInputs.bandPosition` per-user derived input (doc-14 §3: `DERIVED_INPUT_KEYS` denylisted, recorded in decision `inputs`, replays frozen through `recomputeRow` + admin `replay_decisions`), pure fold `engine/rules/envelope.ts` (completed-meso boundaries only, `MAX_BOUNDARY_STEP 0.25` binding over any tuned step, dwell, clamp, bounded lookback = the return-from-absence decay; down-pressure wins over up; a raise requires real up-pressure — the pacer bound or an `over`/beat share — so it is never invisible), `progression.envelope` `.optional()` schema block w/ PROVISIONAL thresholds, assembly `queries/envelope.ts` at the `planStrengthRate` site list (activation seed / advance / projection; swaps+backfills omit it, same as the plan rate), pacer reads `inputs.bandPosition ?? params.band_position` (source-agnostic w/ N37's `"plan"`). **Deliberately NO params migration** — doc 17 §7 ships the bump only after the rule is fit; every applied row lacks the block ⇒ byte-identical (+27 tests pin it). ~~Remaining: field-data fit → params bump~~ **Self-gating reframe (owner note 2026-07-12, Batch 18; PR #184):** the fit-before-activate gate conflated two different things — global threshold *calibration* (refinable any time from monitoring) and per-user *data availability* (must be automatic). Replaced per the amended doc 17 §7: new `min_history_mesos` tunable (default 2) in `progression.envelope` — short of that many qualifying (≥ `min_decisions`) completed mesos in the lookback window, the fold short-circuits to the **tunable** `progression.band_position` default (the owner's asked-for knob; it was already the default/starting/loop-off value, so off → short-circuited → modulating is continuous), kicks in automatically per user as history accrues, and degrades back as it ages out. Runbook rewritten ("Activate the envelope loop": propose defaults bump → replay diff → owner activates → monitor/REFIT thresholds from field data — no wait). Both owner concerns closed: no remember-in-three-months step, and multi-user data variance is controlled per user. Remaining: run the activation runbook (owner-gated) | F | HIGH | P | **self-gating built (PR #184)** — ready to activate via runbook; thresholds refit from field data after activation |
| N38 | **Periodic required honest-RIR confirmation** (doc 16 §8.4, §11) — the trust-model backstop: checkbox-logging compounds under earned-step (each fake compliant session re-arms). Two-part: an engine rule that periodically requires an honest-RIR-confirmed session to keep earning + a **per-set RIR capture affordance** (`logged_sets.rir_reported` is honored on read but has no write surface — N35 follow-up §10 Q6) + a narrow doc-11 premise amendment. Revisit with field data. The always-on trace + reported-RIR-aware compliance gate (Phase 1) already bound the abuse; this is the periodic hard check | F | HIGH | P | deferred (doc 16 §11) — revisit with field data |
| N39 | **Per-exercise "progression off" override** (doc 16 §11) — let a user disable earned-step progression for one exercise; slots into the existing `ExerciseParamOverride` merge (doc 14 §6.1, same path as the per-exercise increment). Small, self-contained; build on demand | F | MED | P | deferred (doc 16 §11) — build on demand |
| N43 | **Strength-rate band still buckets by calendar training years — the same defect N21 fixed for hypertrophy** (owner, 2026-07-11, reviewing the R3 flip; Batch 16). `planMacrocycle`'s `strengthRateBand` reads `strength_pct_month[bucketFor(profile)]` where `trainingYears` leads (owner: 12.7 y → **advanced** 0.5–1.5 %/mo) while the hypertrophy path prices **proximity to potential** (owner's normalized FFMI ≈ 16.7 is *below* the 18.5 untrained baseline → developed fraction 0 → 1.6–2.4 lb/mo lean — the very "trained since 2013 but never grew" case the FFMI model exists for). Internally inconsistent: a mass-coupled sketch (ΔFFM ≈ 1.3–1.9 %/mo × allometric ⅔–1 exponent) puts expected strength ≈ 0.8–1.9 %/mo, straddling *above* the advanced band — the model simultaneously projects novice-rate muscle gain and ceiling-rate strength gain. Consequence sharpened by R3: since the `"plan"` flip (v22) the **pacer meters demand off this band** (owner's target ≈ 0.75 %/mo vs 1.69 under the old bucket read), so the miscalibration now defers earned steps, not just mislabels a display. **Fix direction (research pass first, like the `goal_rate_factor` pass):** derive the strength band from the same developed-fraction — lerp beginner→advanced `strength_pct_month` endpoints on FFMI proximity (bf-proxy fallback per §2.2), keep the §2.1 sex factor + age taper on top, profile-only so principles 1/4 hold; calendar bucket stays the no-body-comp fallback. Ships as v23 + doc 10 §5 amendment + doc 17 §2 amendment. **Research pass DONE (2026-07-11, PR #179):** [`docs/reviews/2026-07-11-strength-rate-model-research.md`](../reviews/2026-07-11-strength-rate-model-research.md) — the two-component hypothesis (neural∼training-age + hypertrophic∼FFMI-proximity) is EVIDENCED and should combine **ADDITIVELY** (Balshaw 2017 decomposition: neural 30.6% / volume 18.7% / pre-strength 10.6%). Corrected magnitude: coupling to **FFM** (not body mass) gives allometric `k ≈ 1.0` (band 0.8–1.3), not the ⅔ sketch — so Garron's model-derived rate is **~1.4–2.3 %/mo = the intermediate band**, and the calendar-**advanced** bucket genuinely **understates** (owner's instinct confirmed, more strongly). Recommended form: `neural(trainingAge) + k × hypertrophyRate_FFM`, neural = `N0·exp(−t/τ)+N_floor` (N0 3–5, τ 4–8 mo, N_floor 0.1–0.4, floor>0 per Pearcey 2021), + trust-FFM-over-calendar guardrail (un-bank skill when realized FFM is low), + sex-neutral & age-taper unchanged. **Pacing pressure-test DONE:** [`docs/reviews/2026-07-11-pacing-fundamentals-review.md`](../reviews/2026-07-11-pacing-fundamentals-review.md) — sim on the real engine confirms the pacer is a rate-limiter on the *lead* (correctly-calibrated band tracks a 3.87 %/mo true gainer at 3.33; miscalibrated-tight starves to 1.40); the measured anchor is the primary honesty mechanism (honest lifter → 0 overshoot); RIR-mortgaging is real but bounded + self-correcting, worst on 8-wk mesos (4.8% transient overshoot, exposed at RIR 0, anchor reels it back); the envelope loop slides *position within* a band and **cannot** fix a whole-band miscalibration → **N43 must land before N36 is fit**. **Interim decision RESOLVED (owner, 2026-07-11): rolled back to v21** (`activate_engine_params` 21) — v21's self-report intermediate band (ceiling 2.25 %/mo) contains the ~1.5–2.3 model rate; v22's advanced plan band (ceiling 1.13) cannot reach it. Remaining: build v23 (the additive two-component band). Relates: N21 (this is its unfinished half), N37/R3 (what exposed it), doc 16 §6 (pacer), N36 (blocked-by → build N43 first), N52 + N54 (the DEXA-copy amendment and the target-card re-enable both ride v23) | D→F | HIGH | C | **done (PR #182)** — v23 built: additive two-component `strength_model` in `strengthRateBand` (`macro.ts`), migration `20260712000001` inactive, doc 10 §5 + doc 17 §2.7 amendments, goldens pin the research §4 corners (Garron 1.4–2.3 %/mo intermediate; novice 4.3–7.3; advanced ≈0.1–0.5; body-comp-missing ⇒ bucket band). Activation is Phase R (replay diff + owner review); N52/N54 copy+card re-enable now unblocked (ride the v23 activation) |
| N44 | Prescription detail: show the prescribed/target e1RM, not just the anchor (owner, Batch 17). **Shipped** as the sheet's `EST. STRENGTH (e1RM)` block: PRESCRIBED IMPLIES (implied e1RM via `estimateE1rm` off the sheet's own fields, effective load for bodyweight) + TARGET ANCHOR A\* (`prescription_anchor`, stepped rows) + N45's MEASURED ANCHOR row. `explain_prescription` needed no change — the decision `inputs`/trace it already returns carry the anchor + A\*, and now the N45 source too | F | MED | P | **done (PR #181)** — 09-changelog 2026-07-12 entry |
| N45 | Prescription detail: show the coordinate the anchor was derived from (owner, Batch 17). **Shipped:** `recencyWeightedE1rm` returns `source` (winning set weight/reps/ageDays/sessionKey; `mean` reports its highest-value sample) → widened on the `inputs.strengthAnchor` schema as `.nullish()` (stored decision inputs parse byte-identically; anchor already on the doc-14 §3 denylist ⇒ fingerprint-neutral, pinned in `fingerprint.test.ts`) → `anchors.ts` enriches `performedAt` → `LoggedExercise.e1rm_anchor_source` → MEASURED ANCHOR row with the `115 × 11 ON JUN 28` coordinate; newly recorded decisions + `explain_prescription` carry it for free. W·D coordinate deliberately skipped (needs a workouts→microcycles join; set+date is exactly how the owner phrased the PH39 complaint) — revisit only if asked | F | MED | P | **done (PR #181)** — engine provenance tests + golden updated |
| N46 | No ability to edit custom templates (owner, Batch 17). Confirmed: no update path in UI, queries, or MCP — templates are create/view/share/start-meso/delete-only, and delete is MCP-only (no button on the detail page). Build: prefill the planner board from `getTemplateDetail` (shape is already planner-ready) → new `updateTemplate` mirroring `saveMesoAsTemplate`; EDIT + DELETE affordances on owned detail pages; MCP `update_template` parity | F | MED | D | **ready** — scoped in [`scoping.md`](./scoping.md#n46--edit-custom-templates--f--medium) |
| N47 | Tab bar detaches from the bottom on scroll and goes dead; relaunch cures it (owner, Batch 17, HIGH). Screenshots reproduce it on /cycles and the planner immediately after a BottomSheet + keyboard session: the fixed bar stays bound to the stale keyboard-shrunken visual viewport, content flows below it, and hit-testing is dead. Root cause is the shared `useScrollLock` toggling `body{position:fixed}` while the keyboard resizes the iOS standalone viewport. **Fix built:** the shared lock no longer changes body positioning; it ref-counts `html/body` overflow plus a non-passive background touch guard, explicitly permits sheet scroll regions, preserves desktop scrollbar compensation, restores the exact x/y coordinate, and follows only keyboard-dismissal `visualViewport.resize` events until quiet. Unit coverage pins no `position/top/width` mutation, nested locks, touch blocking, keyboard settle, and exact restoration. Canon `BottomNav` markup/CSS is unchanged | B | HIGH | G | **in-progress** — `codex/n47-tabbar-detach`; 1,116 tests, typecheck, lint, and production build green; installed-iOS verification pending ([`scoping.md`](./scoping.md#n47--tab-bar-detaches-from-the-bottom--goes-dead-ios-standalone--b--high--medium)) |
| N48 | Filters in the replace-exercise sheet (owner, Batch 17). **Shipped:** EQUIP `FilterBar` axis on `ReplaceSheet` (candidates already carried `equipment_type`), and `AddExerciseSheet`'s pre-N29 hand-rolled chips folded onto `FilterBar` (GROUP + EQUIP) in the same pass — FilterBar is now the app's only filter idiom | UX | MED | E | **done (PR #181)** — 09-changelog 2026-07-12 entry |
| N49 | Replace exercise commits on a bare tap; needs a confirm button (owner, Batch 17). **Shipped:** rows are single-select and the swap commits via a disabled-until-picked `REPLACE EXERCISE` button, mirroring the planner `ExercisePicker` pattern — no picker tap-commits anywhere now | UX | MED | E | **done (PR #181)** — shipped with N48 |
| N50 | Past workouts: weight/rep boxes editable but edits silently don't save — lock them (owner, Batch 17). **Shipped:** `staticCells` now includes `readOnly` — completed/skipped sessions render logged rows as static text (logged values + the over/met/under marker preserved); `save()` hard-guards on `readOnly` as belt-and-suspenders | B | MED | G | **done (PR #181)** — 09-changelog 2026-07-12 entry |
| N51 | New-meso seed prescribes reps below the target window — 6 when the window is 8–12 (owner, Batch 17). **Shipped:** both seed branches (`seedCore` §S1 + prescribe's cold-start/swap-in) route the rounded load through `boundRepsToWindow` (signature narrowed to `targetRir`/`equipmentType` so seed contexts share the exact working-path bound), gated on `bound_to_target_window` so pre-v12 params replay byte-identically. New `seed-window.test.ts` (worked case anchor 100/machine: old 75×7 → new 70×10; in-window sweep; gating pinned). **Residual (accepted):** code-only fix ⇒ already-stored seed rows keep pre-fix numbers until any fingerprint input changes (doc 14 has no engine-code dimension) — forward-looking by design | B | HIGH | G | **done (PR #181)** — engine tests per hard rule 3 |
| N52 | Is "DEXA scans never change prescriptions" really true? (owner, Batch 17 — owner notes the indirect bf%→FFMI→strength-band→pacing chain is intended and valuable). **Answered: the copy is correct today** — the chain is broken at two links (strength band still calendar-bucketed = the N43 defect; pacer reads the plan rate only under `rate_source:"plan"`, rolled back to v21 `"band"`), and the doc-14 fingerprint never retro-stales on bf% (forward-looking only, even when live). Once N43's v23 band + the plan rate source are both active, the owner's chain exists → amend the four copy sites (bodyspec page, `get_body_composition`, doc 15 §3.3, doc 17 principle 1) to "indirect, forward-looking via macro pacing" | Q | — | C | **answered** — analysis in [`scoping.md`](./scoping.md#n52--dexa-never-changes-prescriptions-copy-vs-the-indirect-chain--q--answered); copy amendment rides N43/v23 |
| N53 | No launch splash any more — long black screens; "invest the time to get this right" (owner, Batch 17, HIGH). Splash code unchanged since PR #119 — not a regression. Two stacked causes: (1) black-not-cream — every launch surface is theme-aware and flips to near-black `#14110C` under OS dark mode (splash renders but reads as a black screen), though dark mode is out of scope per doc 08; (2) long — the pre-document window the in-app splash can't cover: middleware blocks on `auth.getUser()` before HTML streams, then two more serialized `getUser()` calls, with the SW shell deliberately NetworkOnly. **Owner correction (addendum 2): this is a REGRESSION, not a legibility question** — the dark splash used to display with the logotype, plenty of times, perfectly legible; now it never displays. The color-option framing was withdrawn. Code audit: the whole launch chain (startup PNGs → `Splash` → content, designed as one continuous branded load per `ios-launch-screens.ts`) is **unchanged since PR #119** — root layout, splash, middleware, SW all untouched since — so the regression is environmental/timing, not an edit. Leading hypotheses: (H1) iOS stopped applying the `apple-touch-startup-image` on the owner's device (iOS update / PWA re-add / media-query mismatch) → the whole pre-document window falls back to iOS-default black; (H2) the in-document `Splash` window covers only the brief `(app)/layout` auth await, so with H1 the launch reads black → content with no visible splash; (H3, weaker) response buffering suppressing the fallback paint. Investigate on device (does the startup image apply at all? exact device CSS dims vs the 13-class list; instrument pre-document vs in-document time), then fix: restore the pre-document branded surface + collapse the serialized auth round-trips. Relates N1 (WS-J) and N47 (its frequent force-relaunch workaround makes every launch visible) | B | HIGH | J | **triaged** — regression hypotheses + device-verification plan in [`scoping.md`](./scoping.md#n53--no-launch-splash-long-black-screens--bux--high--medium) |
| N54 | Disable the macro goal-target estimates again for now (owner, Batch 17 — decision in the note itself). **Shipped:** PR #178's src hunks reverse-applied (overview REALISTIC TARGET card; create-flow YOUR TARGET + rate + rationale + MODEL BAND priming row — LAST BLOCK MEASURED kept, it's measured) + the goals-edit YOUR TARGET card (pre-#178) hidden for consistency. Pure view change — `planMacrocycle` + persisted targets untouched; **re-enable when N43's v23 makes the band trustworthy** (cross-linked in N43's row) | F | MED | C | **done (PR #181)** — 09-changelog 2026-07-12 entry supersedes the Phase-R2 card halves |
| N55 | Create-meso sheet: "WEEKS — INCLUDING DELOAD" label contradicts the unchecked "Final week is a deload" option (owner, Batch-17 addendum, annotated screenshot). **Shipped:** the label mirrors `MesoHeader.tsx`'s conditional on `ramp.deload` | UX | LOW | D | **done (PR #181)** |

> **N36–N39** are the doc-16 §11 deferred spine, filed 2026-07-09 during Phase R
> so nothing is lost after the N35 build-out. Each points back to
> [`docs/16-prescribed-progression.md`](../16-prescribed-progression.md) §11 and
> is workstream **P** (prescribed progression). Rough order: N21 → N37 →
> (field data) → N36; N38/N39 independent.

> **R1–R25** come from the 2026-07-01 full-surface repo review (Batch 3 in the
> appendix). Evidence, file:line scoping, and a suggested attack order live in
> [`docs/reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md)
> — that doc is the scoping record for these IDs (no separate `scoping.md`
> entries). Workstreams **K** (integrity & security hardening) and **L**
> (delivery guardrails & observability) are new; roster in
> [`README.md`](./README.md#workstreams).

## Open follow-up tasks

Tasks surfaced by the answered engine/metrics questions (workstream A) and the
engine cleanup (workstream I). Details and rationale in
[`A-engine-metrics.md`](./A-engine-metrics.md#spawned-follow-up-tasks-add-to-backlogmd)
and [`I-engine-v9.md`](./I-engine-v9.md). Resolved follow-ups (e.g. **T-A3**) are
in [`archive.md`](./archive.md).

| ID | From | Title | Type | Status |
|----|------|-------|------|--------|
| T-A4 | S5 | Decide whether a hard big-miss back-off belongs in rep_window mode | D | **decided (2026-06-25): anchor-only, no back-off; retire `regression_pct`** (realized via WS-I / T-I4, merged PR #82) |
| T-A5 | S7 | Graded MEV→MAV→MRV ramp + MRV-stop auto-deload | D→F | **deferred (2026-07-02):** keep the ±1 model for now (do **not** amend doc 10 — the graded ramp stays as a documented future option). Owner idea to revisit down the road: expose **training style** (this ±1 "German-style" ramp/deload vs. the graded MEV→MAV→MRV ramp) as a **setting or macrocycle-type selection**. Big overhaul; kept in orbit. |

> **WS-I (T-I1–T-I5) complete & merged** — swept to [`archive.md`](./archive.md#swept-2026-06-30--reconcile-merged-build-prs) 2026-06-30. Bodyweight load-type model live (engine_params v16), legacy increment/regression + prior-peak seed retired. PRs #72 / #80 / #81 / #82.

---

## Appendix: verbatim source

The **append-only permanent record** of the owner's raw notes, exactly as
written, so the original phrasing is never lost — independent of how items were
later split, reworded, or archived. Each intake batch gets its own dated heading;
add the next batch below the last, never edit a prior one.

### Batch 1 — "Notes" doc (imported 2026-06-22, reconciled v2 same day)

#### Stats, metrics, calculations
- **S1** — How is estimated strength calculated?
- **S2** — How is strength increase calculated?
- **S3** — How are deload weeks handled in stats?
- **S4** — Progression algorithm tuning: when to add sets, reps, or weight? "It seems like it's preferring to add weight each week. Is that true, and if so does the science back that? If not, what does the research support? e.g.: Keep the same load until every working set reaches 12 repetitions at the prescribed reps in reserve. Increase the load by the smallest available increment. Accept that repetitions may return to eight or nine. Build back toward 12."
- **S5** — How does the progression algorithm handle misses, and what's the definition of misses? What does it do in response?
- **S6** — Does adding a set manually transfer to future workout plans?
- **S7** — How are number of sets planned?
- **S8** — When/why/how does the engine add or remove sets/reps? *(added v2)*

> _v2 removed S4 ("Progression algorithm tuning: when to add sets, reps, or weight? It seems like it's preferring to add weight each week… [double-progression description]") and S5 ("How does the progression algorithm handle misses…") as resolved — answers retained in `A-engine-metrics.md`._

#### Macrocycles
- **M8** — "I'm thinking there should be a bit of stats unification between meso stats and macro stats. Stats that should be in both: Meso stats should get estimated strength under performance. Macro stats should get the same balance and performance tabs, probably via a three way page toggle; overview, balance, performance."
- **M9** — "Choosing a custom duration in macrocycles will not allow an empty cell even momentarily. This prohibits the user from backspacing the value to enter a new one. This needs to be handled."
- **M10** — "Only show unplanned mesocycles under the macrocycle overview page. This leaves the cycles page cleaner, and the user can click on the macrocycle to see and begin planning unplanned mesos."

#### More important
- **I11** — "Meso stats needs a rework. Include strength increases for all exercises? Q: how is it calculated"
- **I12** — "Need to address mesocycle management under a macrocycle"
- **I13** — "Expose a per-exercise, per-user weight increment. It needs to be per-user as not to mess with other users who may have different increments on the same exercise/machine." (NOTE: a per-user/per-exercise `weight_increment` override shipped 2026-06-21 per PROGRESS.md — verify this fully satisfies the note before closing.)
- **I14** — "Increase the complete workout feedback sliders resolution to the same resolution scale as the exercise feedback. This will unify the feedback scales."
- **I15** — "Put an exercise note icon to the left of the exercise history icon in the workout day view, for users to quickly log an exercise note."

#### Less important
- **P16** — "The buttons on the mesocycle overview page are monotonous and ugly. I am thinking a page toggle between overview and stats."
- **P17** — "When the user drops down the weeks/days from the workout page and selects a new day, it displays the page back button in the top left corner, but I don't like this in this condition and it clutters it up. The user can just select the current day again to go back. Remove this."
- **P18** — "The set type option from the set menu can be removed."
- **P19** — "Logged workout sets should get a small icon indicating if the logged set was above or below the prescription"
- **P20** — "Exercises search list should live filter as you type"
- **P21** — "Should muscle soreness be recorded when the user states they were sore for 0 days?"

#### Progression model
- **PR26** *(added v2)* — "From what I understand the legacy increment path that it's keeping as a fall back. This legacy model probably shouldn't be present at all, however we need to understand where and how it's still used if at all to ensure it's done correctly. I think the only remaining use case might be how bodyweight only and bodyweight loadable exercises are handled. We should consider these and any other use cases and probably roll them into the v9 model so that everything is handled cleanly."
- **Owner ruling (2026-06-25)** *(→ T-I5)* — "We don't ever want to use the old, defunct load_first, prior peak back off seed ever again for any reason. This is discussed in the triage docs… That logic is broken fundamentally, and it should be retired at the next possible opportunity. The goal with prescriptions is not always to provide one at any cost — it's to use the data when available to effectively train the user as best as possible. If something truly does not have enough data to provide a starting place, the user should just seed themselves and enter a starting place themselves manually rather than make up data or produce bad numbers."

> _v2 removed PR22–PR25 (RIR-ramp seeding, baselining, mid-cycle swap-in, no-history) as resolved — answers retained in `A-engine-metrics.md`. Kept below for the record:_

- **PR22** — "how does it seed the starting weight? does it catch progression that might exceed the rir prescription, and if so what does it do with it? … on occasion most of us will hit a 0 rir week … and realize we've got more in the tank. [leg press 190×3×8 @1RIR, next week @0RIR hit 12 then 20 reps] … Will it catch that and landmark that high water mark as my new 0 rir going forward, and keep the user appropriately honest going forward? This would be the goal, but accomplishing it may be nuanced."
- **PR23** — "How is the baseline weight and reps set? I.e. does it go off last recorded only, best historical, some combination of both? Does macrocycle goal, recency, averages, or anything else play a part in determining the baseline which the ramp is based on?"
- **PR24** — "What does it do if I add or sub in an exercise mid-cycle which has exercise history, but no history in the current meso?"
- **PR25** — "What does it do if no history is present?"

#### Phone Notes
- **PH26** — PRIORITY LOW — "Clean up settings page: move match weight, export, delete acct to a dedicated page"
- **PH27** — PRIORITY LOW — "Move template share code to the new template button. New button shows tray similar to the create new mesocycle, but shows blank template or enter code."
- **PH28** — PRIORITY HIGH — "Weight input in profile is entered in cm and the converted to ft. should follow units"
- **PH29** — PRIORITY HIGH — "Sometimes switching pages is a little slow and when doing so the page label shows a weird double layer stage. … displaying some sort of label loading animation, but it is displaying the regular label too … Should responsive switch pages instantly, even if the page itself shows a short loading gif or blank container/placeholders"
- **PH30** — NEEDS THOUGHT — "I'd like to see an even more expanded explanation of my exercise prescription each week — OpenAI API for brief analysis?"
- **PH31** — PRIORITY HIGH — "For audit-ability, I would like for the calculated e1rm from each set be stored with that set, and exposed to the appropriate public mcp tools."
- **PH32** — PRIORITY HIGH — "I would like the ability to see each set's calculated e1rm from the app if desired, but not in too prominent a way. … view the exercise history, tap any one of the sets and reps and it would flip from sets and reps view to e1rm view for all sets … nice quick fade in and out animation. Tap again to flip back. Default on history load is always sets and reps."
- **PH33** — PRIORITY LOW — "Can the admin mcp tools be scoped as private, so they're not visible to non-admin users?"
- **PH34** — NEEDS THOUGHT — "Meso-stats weekly planned sets needs a review. 'Planned' seems to be off from actual when the meso is partly or even mostly complete. Should be real complete sets per muscle group + remaining planned sets, averaged. 'Planned' definition should reflect prescribed future sets … I think this is, in part, due to future sets not really being 'planned' until the previous weeks same day is complete. So what is really considered the 'plan' and how is it set or determined?"
- **PH35** — PRIORITY HIGH — "BUG: application error on auto match weights"
- **PH36** — PRIORITY MEDIUM — "Check on model and weight increment settings for body weight only exercises"
- **PH37** — NEEDS THOUGHT — "Aggregate strength gains per muscle group over period of time; macro, meso, (all time?)"
- **PH38** — PRIORITY HIGH — "First sets / reps not right if you switch exercise — after I changed and then reset to prescription it was right"
- **PH39** — NEEDS THOUGHT — "How quick does the e1rm recency decay? Pulldown e1rm at 110.1 but I did 115 for 11 May 22nd"
- **PH40** — NEEDS THOUGHT — "It looks like sets are repricing as you go in the set. I guess if your current set is your best set, then it's averaging your remaining sets as you go… so it's recalculating after every set is calculated apparently. Is that good or should it only look at previous sets"
- **PH41** — NEEDS THOUGHT — "History also includes current workout — had in my head that basically a current workout doesn't get entered anywhere until it's complete"
- **PH42** — PRIORITY MEDIUM — "Note pencil icon is hard to see what it is"

### Batch 2 — performance + engine-correctness (2026-06-26)

#### Performance & efficiency
- **N1** — directional (owner not ready to execute): "I'm not ecstatic about the speed/performance of the app as is. What improvements to speed and efficiency could be made based on the app structure so far." Asked specifically about (a) front-end vs backend/DB split of heavy lifting, (b) whether to move more to DB/edge functions and make the front end a thinner UI client, (c) load-time reductions, (d) server-load / compute / data-transfer cost reductions, (e) other structural/refactor observations. Directional answer + phased plan captured in [`J-performance.md`](./J-performance.md). Headline: the backend already does the heavy lifting (SQL-view aggregation, server-side engine + freshness reconcile, batched/indexed queries) — the real wins are on the **client bundle/render path** plus a few **query-scope/caching** fixes; relocating compute to Supabase Edge Functions is **not** the win, and the engine must stay pure TS (root `CLAUDE.md` hard rule #3).

#### Engine / prescription corrections
- **N2** — "E1rm in history should average the stat over all session sets — appears to take max"
- **N3** — "Decision: an active workout should definitely not play into live prescriptions. Right now, if the first set of a current exercise ends up being your recency-weighted best set, then all subsequent sets immediately anchor on it. Since, at that moment, only one set is logged, then that set is the average of all sets in your best session, therefore all remaining sets get updated to the same weight. Prescriptions and predictions should only look at previous workouts, not the current one. The current workout becomes canonical once it's marked as complete, with feedback. It's fine if the current sets post to history live as they're done, but prescriptions should be limited to previous workouts"

### Batch 3 — full-surface repo review (2026-07-01, Claude-initiated at the owner's request)

Unlike prior batches, these items did not arrive as owner field notes — the owner
asked for a proactive review. Verbatim request:

> "Please analyze and review this repo for issues and opportunities for
> significant and impactful improvements to performance, useability, UI/UX,
> streamlining, fixes or any other element you may identify, regardless of how
> ambitious the tasks may be. Review the open notes section for existing efforts
> as well. Identify areas for significant improvements, and incorporate these
> findings into the notes section appropriately."

The findings themselves (items **R1–R25**) are Claude's, produced by five
parallel domain reviews (engine/analysis, data layer/DB/RLS, UI/app routes,
MCP/API/PWA, cross-cutting tooling) with the top claims re-verified against the
code. Full evidence + scoping:
[`docs/reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md).
Already-tracked ground (WS-J perf, T-A1, Phase-A gaps, doc-07 open phases) was
excluded rather than re-filed.

### Batch 4 — owner decisions on the open needs-input items (2026-07-02)

Claude compiled every open `needs-input` item into a fill-in Word doc; the owner
returned it with a decision per item. Verbatim responses below (one block per
item, in the doc's order). These resolve the decisions folded into the rows above
and the follow-up table; the Session-30 `log.md` entry summarizes the deltas.

- **T-A1 (e1RM systems).** "(a) Yes, makes sense to standardize the number
  everywhere. Agreed. (b) No, the stats screen should show the undecayed number.
  It's the prescription that should get see the decay, so that it accounts for
  changing strength over time. Stats are not indended to do that. (c) Let's keep
  30 days for now. I believe that is tunable in via MCP (it should be, if not).
  If I need to update this for stability later I can do it there."
- **M8 (stats unification).** "Yes, that's what I'm asking for on all relevant
  exercises, see I11 response. Go ahead and design it without a mock up."
- **I11 (meso strength for all exercises).** "Yes, I want est. strength % change
  for 'all' exercises – see below. Define these by exercises which were logged at
  least 3 time in the mesocycle. This will eliminate the inclusion of exercises
  which were only subbed in or not done consistently."
- **PH37 (aggregate per muscle group).** "Hm. We can probably drop the all-time
  stat, mostly because we don't have a natural home for this. It doesn't really
  make sense inside of a macrocycle overview and we don't really have another
  place for it."
- **T-A2 (deloads in stats).** "Definitely exclude deloads from strength progress
  metrics. It's fine to count deloads towards total volume, though they'll
  contribute little. It's fine to count deloads in PRs. Should never happen
  realistically, but that's fine. Denoting deloads where relevant is fine."
- **R14 (fractional volume).** "Yes, implement fractional counting per spec.
  [amend spec?] No. [RIR≤4 hard-set rule?] Yes."
- **T-A5 (graded ramp).** "Let's que this and keep it in orbit, but defer it for
  now. It's a big overhaul with lots to think about, and much to get right, but I
  think it could be a powerful option as an alternative to this more german-style
  training ramp and deload. I am thinking down the road that this could be a
  setting, or macrocycle type selection of some sort to choose the style of
  training you want."
- **T-A6 (new-meso seed).** "Yes, I believe this is addressed and T-A6 can be
  closed."
- **R24 (hold-week reprice-down).** "I see your point. Since the recency anchor
  has moved slightly, it's also decayed slightly and therefore a 'hold' on week
  N+1 is inherently less than the same anchor in week N. This should probably be
  investigated and addressed. It may be rare in a typical cycle, but in some macro
  types, such as a cut or maintain cycle, which is intended to preserve strength
  rather than progress it, this could possibly be a concern – or maybe not, I'm
  not entirely sure. I don't quite have an answer yet without more consideration
  and investigation. But we should log that concern for future work."
- **P17 (day-view back button).** "Well, my desire is that it does not appear on
  the workout page at all really, since the day navigator is not really changing
  'page' practically speaking – Its always in the workout day 'page', and you're
  selecting the day you view, at least in practical effect – that leads me to #2.
  But an additional improvement to an issue I had not logged yet would be solved
  with #3 – to return back to where you were if you deep link through somewhere
  else. e.g. if you click through the day view page to 'view exercise', the 'back'
  button takes you back to the exercises page, not back to the workout day view
  page that you came from. I would prefer it to go back to where you came from,
  like #3." *(→ P17 = option 2; spawned N4 for the option-3 deep-link behavior.)*
- **P18 (set-type menu).** "Well, I was saying to drop that because I don't think
  we ever worked out the UI for drop sets and how they work. I may come back to
  adding them, but it's more of a plus feature that I haven't worked out yet, not
  something we need right now. So, I guess just drop the menu item. I wasn't even
  aware we had a model for it."
- **P16 (meso page rework).** "I think we should unify this similarly in layout to
  what's described for the macrocycle page, with an overview, volume, performance
  toggle. This will effectively pull out the existing meso stats button into the
  toggles, eliminating that button. What remains in the overview portion of the
  meso page could use a rework also. I would prefer to rework the overview page to
  more of a 'plan' view which shows the exercise planner, and move all of the rest
  of the buttons and functions (the calendar view, save template, share, edit,
  delete) to the title header, which is styled in a similar fashion to the header
  of the workout page for consistency and unification. — The calendar view would
  get its own button in the header (similar to the notes/history button on day
  view) which would drop down the calendar view. The days will be clickable and
  take you to the corresponding day view if its an active cycle, or to the
  corresponding plan view if it's planned. — The share function will also get its
  own header button, along with calendar. — the rest of the functions will go into
  a three dot menu drop down like in day views. — The overview page primary content
  would be basically like the meso planner board, but in non-edit mode where you
  can just view the plan and days. You can select edit from the header menu which
  will take you to the planner board to edit."
- **M10 (unplanned-only macro list).** "Eh, drop that. Leave unplanned mesos there
  as they are. Drop this idea." *(→ wontfix.)*
- **I14 (slider resolution).** "Unify it absolutely. Rescale the data appropriately
  to match the new scale."
- **PH30 (LLM explanation).** "Yeah, I'm not ready for this now. We'll leave it for
  future investigation. The idea is not to replace the deterministic engine at all
  – that would still drive it. The LLM layer would just serve as a different, more
  dynamic explaination of the deterministic engine. It could, for instance,
  incorporate session notes, and explain why the engine did what it did more
  verbosely. There is also additional area for it to provide more
  personal-trainer-esque advice, utilizing some of the MCP tools to give a short
  rationale, or focused exercise advice."
- **PH33 (admin-tool visibility).** "Yeah, it's not a security thing, but I don't
  want other clients really to see them and ask why they cant use them too. I'd
  rather they be visible to admin only."
- **P21 (soreness at 0 days).** "Yeah, record it is fine. I was just thinking that
  if saying that I was sore for zero days, how can I really grade my soreness if I
  am simultaneously saying I never got sore? Whatever though, its fine as is."
- **R6 (local-day rule).** "Um, I think B is perfectly fine in my opinion. It
  should be stored at whatever date it was when the client recorded the session."

### Batch 5 — field notes (2026-07-03)

- **N5** — HIGH — "When an exercise is replaced in the day view, it retains the
  original weight and reps from the previous exercise (the exercise in the same
  slot prior to the swap) for only the first set of the new exercise. Subsequent
  sets of the replaced exercise show the correct prescriptions, but the first set
  does not. If the user modifies the numbers on the first incorrect set (so as to
  get the 'reset to prescription' option in the menu), then resetting to
  prescription values correctly resets the first set to prescription values."
- **N6** — MED — "Some, if not all, pages should have a pull up to refresh
  ability to refresh the current page. This should be available at least on the
  workout day view and cycles pages/subpages."
- **N7** — MED — "When a note is added to an exercise in the day view, there is a
  slightly annoying detail of behavior: When opening the note tray and clicking
  the text field, it opens the device's keyboard, which pushes the entire app
  page up by necessity. However when the keyboard and notes slider is eventually
  dismissed, the page scroll position does not end up in the same position it was
  when the user entered the notes. The end result is that after entering a note,
  the user finds themselves in a scroll position on the page that is lower than
  the place the started, and they must scroll back up to get to the original
  position."
- **N8** — HIGH — "Planned mesocycle badge should say 'planned', rather than have
  a checkbox. The checkbox should only appear once completed. The current meso
  has the orange 'CURRENT' badge. Planned should have a white badge similar the
  current badge, and the unplanned mesos should keep their current '+ plan'
  badge. Only completed or current sets should show in full white, future mesos
  (planned and unplanned) should remain muted."
- **N9** — HIGH — "Macro cycle performance page should be revised and reorganized
  a bit. Don't love the individual exercises here. Muscle group stats makes more
  sense viewing across the entire macros, while individual exercises are a bit
  much since they span long periods so there can be many. A better organization
  would be to display the muscle group strength gain as the primary statistic,
  and allow the muscle groups to be clickable to drop down or display the subset
  of exercise which rolled up to the muscle group statistic for more detail."
- **N10** — HIGH — "The meso performance page can drop the key exercise top sets
  by week section, and 'across macro' for the single exercise, since its a meso
  view not macro view."
- **N11** — MED — "Deload sets show the underperformed arrow even when performing
  the prescribed weight and reps. These indicators should be displaying when the
  user over or underperforms their prescriptions."
- **N12** — HIGH — "In general logging sets can take a long time to submit,
  typically at least several seconds. On occasion it will get hung up and the
  spinner spins for an extended time and seemingly never completes, until I
  switch pages and return to the day view page at which point it indicates
  completed. This ruins the user experience and should never happen."
- **N1 addendum** — MED — "Page loads and switches are still painfully slow at
  times. Despite my efforts to get responsive changes, they have not been
  successful. All too often I click/tap on a page or sub page, and for 1-2
  seconds there is no indication the click was successful. By about 2 seconds, I
  become unsure that I clicked the page correctly and begin tapping it again.
  When any page is clicked in the app, ideal behavior would be that that page
  would IMMEDIATELY switch and show an empty screen with animated placeholders
  until the data loads. The workout day view page is the only page that does this
  correctly when loading. Other pages should do this too; particularly the cycles
  page and sub pages, but also pretty much every page." *(→ folded into N1 — this
  is the WS-J north star restated with new evidence: the cycles pages' dead
  1-2s gap disproves the Phase-A assumption that route navigations already paint
  the `(app)/loading.tsx` skeleton. Logged as a Phase-A escalation, not a new
  item.)*

### Batch 6 — in-chat (2026-07-03, after PR #134/#135 merged)

- **N1 confirmation** — "Ok. all N2 nav skeletons look good to me." *(read as
  the N1 per-route nav skeletons — confirmed on device.)*
- **I12 authorization** — "Regarding I12, I will take your design direction on
  these. You're a good designer and capable of following good design
  principles to incorporate these. You're authorized to rework in any way you
  see fit to produce a well-designed and intuitive end result for the user."
- **N13** — "One additional item: recent changes broke the ability of exercise
  reset to prescription functionality on the first set of the exercise. This
  happened around when I had you address the issue of the first set issues
  surrounding an exercise swap. This needs to be gotten right, as it's been a
  lingering issue with prescriptions being correct on the first sets of
  exercises both after swaps and resets."

#### Batch 5 addendum — owner decision on N8 (2026-07-03, in-chat)

> "On N8, the macro overview timeline is mostly fine, but swap the progress bar
> and on future mesos for the planned back and adopt the same muting scheme"

*(Read as: on the macro overview timeline, keep the numbered-mark vocabulary,
but for future/planned mesos swap the right-side progress bar for the white
PLANNED badge, and adopt the same muting scheme as `/cycles` — only
current/completed in full ink.)*

### Batch 7 — field notes (2026-07-04)

Owner: "Here is a new batch of notes for you to process, organize, and add to
notes. You'll need to assess and organize these a bit as they're sort of stream
of thought. Lets get them processed and added, and then we will begin
implementation work in new sessions." *(IDs in brackets show where each note
landed.)*

- "There are at least some issues with the macro stat roll ups for muscle
  groups. E.g the July 2024-Dec 2025 bulk the hack squat roll up under the
  quads muscle group is obviously wrong. It states a starting e1RM of 7 but
  that exists no where in the exercise history." *[→ N14]*
- "Drill even further down in macro muscle groups all the way down to exercise
  history view for the macro/meso. Default to the history component of e1RM
  view and click to sets and reps" *[→ N15]*
- "Similarly to above, the est Strength on key lifts metric seems at times to
  be at odds with other metrics. For instance in Cut · Dec 2025 – May 2026, the
  est strength on key lifts says -36.3%, but in the performance tab of the same
  meso almost every muscle group and exercise is positive with few small
  exceptions." *[→ N16]*
- "No way to edit # of sets in the planner" *[→ N17]*
- "Certain elements — like RIR ramp — are only editable via edit details after
  creating the meso. Could put these in these create meso panel. I don't want
  to over complicate this with options for users, so this should be an option
  to edit without being in the users face, and should default to the standard
  without much badgering to alter it. So, in a sense this is a bit of a deep
  option that we don't need to make overly obvious, but if a user wants to edit
  the ramp, they should have the ability to do so. And we might as well allow
  the RIR for each week to be set independently, rather than just choosing a
  ramp, for more flexibility." *[→ N18]*
- "Create a route to archive macros/mesos and put them in a deeper area in
  profile perhaps, where you can view or unarchive them. Never allow full
  deletion. Data always is kept." *[→ N19]*
- "Enter share code should appear in the new cycle tray also, not just the new
  template tray" *[→ N20]*
- "Need to get to the bottom of the 'realistic' macro targets, and how these
  are calculated. Are they right? We should probably hide these from the
  macrocycle view and create macrocycle view if or until we can work them out.
  They aren't an particularly integral part of the cycle anyways, its just
  informational." *[→ N21]*
- "New exercise page UI sucks, needs an overhaul and the increment setting"
  *[→ N22]*
- "Create new exercise says you can share them through the exercise page — you
  can't." *[→ N23]*
- "Exercise page should get the header component with share button and menu for
  settings ect." *[→ N22]*
- "If individual exercises are shareable through the exercise view, then there
  should also be a corresponding enter share code option when creating a new
  exercise. This probably means a new exercise tray with the new exercise or
  enter code option, like other create new routes. We need to consider and
  properly handle what happens if someone enters a meso share code into an
  exercise field and vise-versa. Hopefully either one just automatically takes
  you to the right place already." *[→ N23]*
- "Macrocycle views should also get the reusable header component, menu options
  for edit, etc. This will unify the headers of most major components of the
  app, I believe" *[→ N24]*
- "Build out info/help screens throughout the app in relevant places. There are
  a lot of technical terms throughout the app that are not obvious to normal
  users, so people need to have an intuitive route to clarity without it
  cluttering up too much" *[→ N25]*
- "Increase size of day view set rows by about 10%. They're just slightly too
  small" *[→ N26]*
- "The back link when clicking Mesocycle stats through day view goes back to
  cycles not working out day view. You should always back link where you came
  from" *[→ N27]*
- "Re-sort all macrocycles and mesocycles to be newest at the top" *[→ N28]*
- "When you start a new mesocycle and choose 'From a template', there are no
  template filters there, but there should be." *[→ N29]*
- "In general I would prefer a bit of a sleeker filtering UI for exercises and
  templates. They feel disjointed and clunky." *[→ N29]*

### Batch 8 — in-chat bug note (2026-07-04, after PR #142 merged)

- "I am in a planned meso and wanted substitute an exercise on the planner
  board for a different one. When I did so, it instead *added* the selected
  exercise to the end of the set and retained the original exercise also
  rather than replacing it in the same slot. Furthermore, when I click again
  on the original exercise, the picker displays the replacement exercise as
  having been already selected. Thus, it is not properly substituting an
  exercise in the planner." *[→ N31]*
- "When the new exercise was added to the end of the day planner, it added a
  *new* slot for the exercise (i.e. it added an additional exercise for
  chest). It *was* possible to manually delete the original exercise, and
  then manually move the position of the new exercise inserted at the end
  back up to the position of the original, but in so doing it left a blank
  slot for the muscle group at the end, since an additional exercise was
  added. This then necessitated editing the day and removing the newly added
  and now empty slot. This is not the intended behavior for changing an
  exercise in a meso slot. Please address." *[→ N31 — same root: the filled
  row opened the group multi-select, whose layout appends new picks and grows
  `exercise_slots`; the leftover empty slot is the workaround's residue, not a
  separate defect]*

#### Batch 7 addendum — owner clarifications on the intake findings (2026-07-04, in-chat, with a /cycles screenshot)

- "'history view caps at 120 sets' — I did not realize this, and this isn't the
  behavior I want. Full history should be available to the user. Pagination or
  lazy-loading, etc should be employed as to keep calls minimal and only load
  what the user actually needs to see, but they need to be able to access full
  history if desired. 120 sets is plenty to see in an initial load, but
  scrolling further into the history should fetch and load the full history via
  additional lazy load calls, or pagination, or however it is you want to
  handle it technically." *[→ N30, new]*
- "Per-exercise increments: Yes, these already exist in exercise page - where
  they do not exist is in the *create new* exercise page. I.e. you can't set
  these when you *create* the exercise. You have to create it, and *then* go
  and edit it in order to access these fields. This should be addressed in a
  rebuild of the create new exercise page, so that these are available at
  creation, along with a general overhaul of the UI for better design and
  function. Additionally the exercise page updates to the header component will
  also better surface the settings and share capabilities. Addt'l note: that
  all attributes should be available to the MCP when creating an exercise too,
  if they're not already." *[→ folded into N22]*
- "Exercise sharing: If this already works, great. The gap is that when a user
  is sent a share code for an exercise, the intuitive location the user will
  navigate to is *create new exercise*, where they would expect to enter the
  code, not create new mesocycle where the 'enter code' input exists now. Even
  if they both accomplish the same thing, we need to have a receptacle for this
  information in the location the users expect to find it." *[→ confirms N23
  as scoped]*
- "Drop the archival bit. Its really not important." *[→ N19 wontfix]*
- "N28 input: Currently the most recent/active macrocycle appears on top.
  Completed macrocycles appear below it, sorted with the oldest ones at the
  top, and the newest at the bottom. This results in the order, top to bottom,
  being: Current > Oldest > next oldest > ... — Mesocycles *within* a
  macrocycle are currently sorted correctly and should not be changed.
  Essentially, the top level of macrocycles (or standalone mesocycles) should
  be sorted newest to oldest from top to bottom, and mesocycles within a macro
  should be sorted oldest to newest, top to bottom." *[→ N28 ready: the query
  is `created_at` desc, but the completed macros' created_at is an
  import-order artifact — sort by training start date instead]*

### Batch 9 — in-chat bug notes after N15 testing (2026-07-04, after PR #144 merged)

- "After testing, there are a couple bugs and changes we need to address on the
  macrocycle > performance > muscle group > exercise history drill down:
  — The history page pop-up is not made active or focused, or something to
  that effect; the panel is not scrollable, and instead the backmost meso page
  is still scrollable. Sets/e1RM flip, but scrolls don't work.
  — On second thought lets keep the standard history behavior of displaying
  sets and reps as default, and flip to e1RM via click.
  — Link through to the standard exercise page via a click on the exercise
  name at the top of the History panel, so users can access the exercise page
  from there if desired." *[→ N32 — the scroll defect root-caused to the N6
  PullToRefresh × scroll-lock interaction (bug present on every sheet since
  N6, first noticed on the first long sheet tested after it); the two change
  requests folded into the same item]*

### Batch 10 — in-chat investigation request (2026-07-04, with W5·D2 screenshot)

- "There is an issue I need you to look into surrounding prescriptions and
  potentially seed paths. … In W4D2 I hit 245lb for 15 and 15, e1RM of 384lb.
  The next session it prescribed 285lb, i believe for 9, but I only hit 7 and
  4 reps. So, the 15 reps I hit apparently skewed a bit high in e1RM, for
  reference, but thats a different issue. Later on, I was testing some of our
  exercise swap implementations, and i went in to W5D2 and swapped the
  deadlift for a different exercise to test, and the reswapped it back to
  deadlift again. This caused the deadlift to be reinserted through the seed
  path, i believe, which is perhaps another separate, technically correct but
  undesirable issue, which I am looking into/for solutions on. But then this
  leads us to what the real issue I am raising is, shown in the screenshot.
  The sets are filled with 245 for 5 and 5 reps. The prescription from the
  menu itself reads 'Swapped in at your all-time best 245 x 15; this week's
  sets seed next week', while the prescription detail shows … PRESCRIPTION:
  245 lb × 15 reps · 2 sets · 6 RIR … Deload off strength anchor (e1RM 331.9
  lb): 215 lb for 10 reps at 6 RIR, 2 sets … TRACE: DELOAD — deload off
  strength anchor (e1RM 331.9 lb): 215 lb for 10 reps at 6 RIR, 2 sets. I am
  having trouble making sense of what's actually happening here, but it does
  not all appear to reconcile cleanly. At the end of the day, the sets and
  reps are filled with something vaguely sensible, but I'm not sure how it got
  there, as it doesn't seem to map to the prescriptions well. The path to get
  here is a bit unusual, but nonetheless its an issue. Please investigate,
  report your findings, and assess the underlying solutions to these issues,
  and how we can go about generalizing this system and engine to better apply
  across all situations." *[→ N33 — one item: the swap-back reseed complaint
  and the audit incoherence share the root cause (swap bypasses the engine +
  the framework is blind to exercise identity); the e1RM-skew aside is noted
  in the review doc §7 against the open R24 remainder]*

#### Batch 10 addendum — owner follow-up on the N33 findings (2026-07-04, in-chat)

- "the add exercise should also check if the incoming exercise has a completed
  same-exercise counterpart in week N-1 and compute the advance if true. This
  would catch the nearly-identical scenario of an exercise being removed and
  then re-added to a meso, in the same way a swap-then-swap-back occurred, and
  recompute the advance rather than seed it." *[→ folded into N33 (S1 applies
  to both entry points via one shared resolver)]*
- "what exactly are you calling 'cold seed'? You say addWorkoutExercise does
  this." *[→ answered in review doc §8.1]*
- "you've said that the 285x9 over-prescription was based on a 367.5lb anchor,
  but the exercise history lists the e1RM from the 245x15 week which the
  prescription was based on as 384. Why was anchor e1RM lower than the set it
  was based on?" *[→ resolved in review doc §8.2 — log-time stamp under
  pre-v11 averaged formula vs live anchor under the v11 Brzycki cutoff;
  spawned T-N33 for the stale stored stamps]*
- "there is one move common scenario that I would like to think through which
  is similar in nature to the exercise swap scenario above, and may relate
  also to your advance-first solution: sometimes it can be common to have to
  swap (or skip) an exercise in a week of a meso, often due to the machine or
  equipment being in use at the gym. Often times the user may skip the
  exercise, or substitute to another exercise for only one week and return to
  the original exercise in the next session. In these cases also it would be
  useful to compute the advance for the following week even though it was
  missed for a week. In my mind this would essentially extend the N-1 exercise
  check to N-2 also, so that a skipped week will still catch an advance
  compute. Think this through and flesh out the possibility and whether or not
  there are any problems which make this approach an issue." *[→ folded into
  N33 — design + issue analysis in review doc §9: K=2 lookback, same-day-slot,
  source must carry logged working sets, trace discloses the gap. Finding:
  plain skips (row present, no sets) already advance today; it's the
  swapped-away/removed week that breaks the chain]*

#### Batch 10 addendum 2 — T-N33 decision + anchor-selection question (2026-07-04, in-chat)

- "T-N33: restamp on params activation" *[→ T-N33 decided → ready]*
- "you said 'And the W5 anchor 331.9 is exactly the mean of the 285×7 and
  285×4 estimates — the session_best method picking your most recent
  session'. Why was the W4D4 set chose as the anchor for this over the W3D4
  set? W3D4 had a higher e1rm, so wouldn't that have been made the session
  best? If not, why?" *[→ answered in chat + review doc §8.2 note: session
  selection scores each set by value × recency decay (half-life 30 d); the
  W4·D2 245×15 set (367.5 live, the likely referent — W3·D4's 259.9×8 is
  325.9, lower either way) scored ≈312 after 7 days of decay vs ≈347 for the
  fresh 285×7, so the 07-01 session won; the anchor value is the chosen
  session's UNDECAYED confidence-weighted mean, 331.9]*

### Batch 11 — BodySpec DEXA integration request (2026-07-05, session task)

- "On Tuesday I will be getting a DEXA scan through the company BodySpec.
  BodySpec allows access to to scan data via API. See API docs for details:
  https://app.bodyspec.com/docs — What I am interested in is creating an
  optional integration inside of this app to connect a BodySpec account and
  access the users DEXA scan information via API. When connected the
  application will give access to scan data, and use the data to
  expand/update/turbo-charge user profile information, and/or supplement
  training data/progress with the information. What I want you to do:
  1. Assess the API, data import/access capabilities, and what data is
  available. 2. Assess how the available data can/should be structured to be
  utilized to its greatest potential 3. Assess how this data could be best
  used to inform training, progression models and engines 4. What genuine new
  insight or capabilities could this data provide, and how can it actually be
  used to improve training and/or insight to training progress. Present your
  findings and assessments in a well-structured document pushed to the repo
  for reference." *[→ N34; assessment delivered as
  `docs/15-bodyspec-dexa-integration.md`]*

### Batch 12 — owner memo: "Updates to the Prescription Engine" (2026-07-07, uploaded .docx)

> The core pillar of the application is the prescription engine. In its current
> form, the app adequately captures user progress in terms of e1RM by use of
> session best identification techniques and prescriptions, but it does not
> prescribe progression of the e1RM by design. When (or if) a user out-performs
> an exercise's prescriptions, the model adequately will identify that the user
> has progressed and prescribe their progress forward either through the advance
> computation, or through the seed route. However, if the user strictly follows
> prescriptions indefinitely, the model itself would never proactively prescribe
> a genuine progression (increase) of the exercise's e1RM. Progression, it would
> seem, must come from the athlete over-performing the prescription at some
> point, and thereby raising the anchor by their own performance. This takes a
> particularly honest and driven athlete to truly push themselves to the target
> RIR in spite of the prescription, not because of it.
>
> [Editors note: I wrote the below plan before flagging it as flawed. The
> intention below was to solve the above problem with the app using a double
> progression model in a clean and generalized format. However, as explained
> further below, it seems to me that the solution described may be flawed in a
> number of ways. Primarily, it would seem that unless additional reps/effective
> reps are prescribed continually (potentially across meso boundaries), then the
> user would never actually hit the target 12 reps and trigger the progression
> and complete the double progression method. Prescribing the additional reps
> itself would be an increase to the e1RM, so effectively the e1RM must increase
> for the user to even reach the top of the rep range, therefore is it not
> reaching the top of the rep range which triggers an increase to the e1RM – The
> e1RM must be consistently increased, and reaching the top of the rep range
> simple triggers the weight increment (not e1RM) to ratchet the weight to the
> next level clear headroom to continue progression within the rep range.
> Therefore, the open question still remains unresolved by the changes proposed
> below: How, and on what basis, do we trigger an increase to the e1RM of the
> user such that they are prescribed progress cleanly throughout their
> macrocycles and mesocycles? Below is my original notes and plans for context.
> Please provide your thoughts and analysis on how we can architect the desired
> functionality and outcome]
>
> Updates to the engines advance prescription chain, and the seed prescription
> are necessary to establish a method of true prescribed progression to the
> user's e1RM:
>
> - [Editors note: Defective – inheriting same weight x reps disregards RIR. If
>   the user does not reach the top of the rep range inside the mesocycle,
>   keeping the "same reps" and RIR will result in the same ramp, same reps, and
>   same end results meso-over-meso: the user will never reach the top of the
>   rep range.]
> - Seed prescriptions:
>   - Do not automatically reprice e1RM to the low end of the rep range when
>     seeding a prescription. Instead, the seed route would identify the anchor
>     by its existing mechanisms, and inherit the same average weight x reps as
>     the anchor session, unless:
>   - The anchor session rep average is outside the target rep window.
>     - If the session rep average is below the target rep window → retain the
>       anchor and reprice to the low end of the rep range per existing logic.
>     - If the session rep average is above the target rep window → compute a
>       progression to the anchor e1RM by incrementing the anchor up by one
>       minimum increment, and then repricing the new anchor to the low end of
>       the rep range. See more below on progression prescription details.
> - Advance prescription chain:
>   - Retain the same anchor mechanisms as existing and progress reps
>     incrementally until the user performs all prescribed sets and reps at the
>     top of the rep window without reporting pain. When the user satisfies
>     these conditions, the advance prescription progresses the anchor weight up
>     by one minimum increment, and reprices the new anchor back to the bottom
>     of the target rep window.
>
> The fundamentally new element introduced with these changes is the model
> actually increasing the e1RM of an exercise when the above conditions are met,
> which introduces a route to genuine progression prescribed by the model
> instead of relying on the user to proactively progress themselves. To make the
> progression triggerable by the described definitions, the prescriptions must
> functionally enable the user to actually reach the trigger point (the top of
> the rep window), which necessitates the ability for the seed mechanisms to
> retain the previous reps. Without this key functionality, prescriptions would
> consistently push the user back to the low end of the rep range at the same
> e1RM without tripping the progression trigger. The changes to the advance
> engine enable progression of the e1RM when the trigger is met during a
> mesocycle, and the mirrored updates to the seed mechanism inherent the same
> effect when the trigger is met at the end of a mesocycle, when there is no
> advance to compute.

*[→ N35; analysis delivered as `docs/reviews/2026-07-07-prescribed-progression-review.md`]*

### Batch 13 — N35 follow-up: owner responses to the progression review (2026-07-08, session task)

> The follow up questions and comments below are in response to
> docs/reviews/2026-07-07-prescribed-progression-review.md. Please review this
> file, and address the below comments and questions in the most appropriate
> format in the repo.
>
> Follow-up Questions
>
> High-level questions, concerns, and observations:
>
> Your solution more accurately clarifies what gets incremented (the
> prescription target, never the measurement), but this is essentially what I
> meant. I wasn't intending to suggest fabricating a recorded e1RM; rather, I
> meant updating the prescription target such that it results in an increase
> in future measured e1RM. In that sense, your solution does not fundamentally
> differ from mine, although it achieves the same outcome much more elegantly
> and with greater precision. We increment the prescription based on real
> measured e1RM to produce an increase in future performed e1RM. The remaining
> question from my original memo was simply when we should apply that
> increment. The proposed answer appears to be: once per microcycle.
>
> If we increment the prescribed effort once per exercise, per microcycle
> (week), but each week already adds an additional prescribed rep via the RIR
> step, doesn't that mean the athlete is effectively progressing twice—once
> through the additional prescribed rep and again through the prescription
> increment (whether that ultimately manifests as another rep or a load
> increase)? It's true that the RIR ramp increases performed reps rather than
> effective reps, and because e1RM is based on effective reps, it is not
> technically advancing e1RM, whereas your proposed solution does. However,
> the combined effect is that the athlete is asked to both reduce RIR and
> increase the prescription simultaneously, resulting in either two additional
> reps each week (one from the RIR reduction and one from the e1RM
> progression) or an additional rep plus additional load. My concern is that
> this may simply be too aggressive.
>
> Strength rates, and macrocycle goals:
>
> You aptly pointed out in §6.2 that estimated strength gain per macrocycle
> provides a useful rate limiter. I think this is a key insight because it
> aligns with the original purpose of macrocycles: using the athlete's
> characteristics and stated goals to personalize progression. However, I
> think this concept can be taken a step further.
>
> Rather than using projected strength gain solely as a rate limiter, we could
> use it to actively determine the rate of prescription progression. The
> macrocycle engine was originally envisioned as an aggregation layer that
> collects information such as age, sex, training experience, body composition
> (and potentially future DEXA scan integration) to estimate an athlete's
> realistic rate of adaptation and generate an appropriate progression
> trajectory. A 60-year-old female beginner should not be expected to progress
> at the same rate as an 18-year-old male beginner or a 32-year-old advanced
> lifter.
>
> The intent was for the macrocycle layer to aggregate and store these
> characteristics, then feed progression targets down to the mesocycle layer.
> We drifted away from that concept, but it still seems both valuable and
> achievable without overcomplicating the prescription engine.
>
> My thought is that the macrocycle should define an expected strength rate of
> change, while the mesocycle should translate that into prescription
> adjustments. Rather than blindly progressing every exercise each microcycle
> regardless of the subject or goal, the progression ask could be calibrated
> to remain consistent with the athlete's projected rate of improvement.
>
> Think this through and push back where appropriate. I'd like to flesh out
> how something like this might work in practice.
>
> If this approach makes sense, it may also imply that a strength
> rate-of-change metric exists for every macrocycle type, even when strength
> is not the primary stated goal. A strength macrocycle explicitly targets
> strength gains over time, whereas hypertrophy, cut, and maintenance
> macrocycles do not. However, it seems plausible (subject to confirming the
> research) that both strength and hypertrophy phases might prescribe similar
> expected rates of strength improvement, even though hypertrophy prioritizes
> muscle gain rather than strength itself. In that case, the primary
> distinction between strength and hypertrophy programming may be rep ranges
> rather than progression rate.
>
> Likewise, cut and maintenance macrocycles may both target essentially flat
> strength progression, differing primarily in the user's stated objective and
> perhaps future outcome measurements (for example, DEXA scans or similar body
> composition metrics).
>
> Miscellaneous:
>
> You mentioned that anchor.confidence can never reach a high value through a
> compliant hypertrophy cycle. Is that intentional, or is it something that
> should be addressed?
>
> An optional "reported RIR" is mentioned several times. What exactly is this?
> I'm not aware of any mechanism by which a user directly reports RIR. Is this
> a derived value?

*[→ N35 follow-up; answered + design amended in
`docs/reviews/2026-07-08-prescribed-progression-followup.md` (macro-rate
pacer, per-goal rate factors, double-progression analysis, confidence +
reported-RIR answers)]*

### Batch 14 — N35 follow-up #2: auditability, pacing mechanics, envelope, standalone mesos (2026-07-09, session task)

> I like all of this, but we should keep prescription auditability in mind.
> With these proposals, we are introducing another layer of data that informs
> the prescription engine. While I think this is the right direction, it also
> adds another abstraction that could make prescriptions more difficult to
> audit and reason about. We should make sure we explicitly account for this
> through prescription details and MCP tooling.
>
> This may warrant exposing progression-specific information. We may want to
> aggregate some form of prescription progression history or audit trail. At
> a minimum, I think we should record earned (and perhaps unearned)
> progression events so we can validate that the cadence and progression
> parameters are behaving as intended. At the other end of the spectrum, an
> earned progression history could become a useful aggregate feedback signal.
> Could it help close the loop within either the macrocycle or mesocycle
> engine? Would it provide information beyond the existing exercise history,
> or would it simply duplicate it? My intuition is that there is probably
> additional value here, but I'm not yet sure where the line should be drawn.
>
> On the topic of progression pacing, macro-rate pacing makes sense to me,
> but I am still trying to understand a few aspects of the implementation.
>
> First, is the pacing mechanism mechanically coupled to the strength gain
> calculations performed elsewhere in the application, or are they
> intentionally independent? I hope they are not directly coupled, because
> the strength calculations are, by necessity, somewhat heuristic and
> arguably one of the weaker predictive elements of the current system. My
> understanding is that the pacing layer is instead a relatively thin
> consumer of whatever progression rate the macrocycle layer has already
> established and an earned progression quantum is considered to be a
> relatively static percentage of the macrocycle progression budget, not
> heuristically measured.
>
> If that understanding is correct, then it sounds like all of the
> personalization variables ultimately collapse into a single macrocycle
> strength-rate band. The `goal_rate_factor` then consumes that band (scaled
> from 0.0–1.0) and targets a progression rate somewhere within it.
>
> That raises a few questions. Where within the band does it target by
> default—the lower bound, midpoint, upper bound, or somewhere else? Is that
> itself a tunable parameter?
>
> One idea that comes to mind is feeding progression history mentioned above
> back into this selection process. Rather than allowing performance to
> freely modify macrocycle goals, performance and progression history could
> simply influence where within the bounded rate band the athlete is paced.
> In other words, the macrocycle establishes the allowable progression
> envelope, while accumulated performance determines whether prescriptions
> track toward the lower, middle, or upper portion of that envelope. This
> would introduce a meaningful feedback loop while keeping behavior bounded,
> predictable, and auditable.
>
> Food for thought. My primary goal here is simply to fully understand the
> architecture before implementation—measure twice, cut once.
>
> Finally, how are standalone mesocycles intended to behave under this model?
> They already default to the hypertrophy model, which seems perfectly
> reasonable. Beyond that default, is there anything else required to support
> them?

*[→ N35 follow-up 2; answered + design amended in
`docs/reviews/2026-07-09-prescribed-progression-followup-2.md` (always-on
status-coded progression trace, read-side aggregation line, continuous
`band_position`, envelope loop adopted as Phase 3, standalone mesos need
nothing extra)]*

### Batch 15 — N35 follow-up #3: vanished earns, live coupling, markers, finalize (2026-07-09, session task)

> Vanished progression signal: if a progression is "earned but unrealizable
> at this increment; earn retained," when is that progression ultimately
> realized? My assumption is that "earn retained" means the earned
> progression value is accumulated such that the next earned progression adds
> to it. If an exercise has relatively coarse load increments, it may take
> multiple earned progression events before the accumulated value is
> sufficient to realize a prescription increase. I assume that is the
> intended behavior. If so, no further clarification is needed. If not, I
> think this is worth discussing before implementation.
>
> This may be stating the obvious, but I think it is worth calling out
> explicitly: the prescription and progression models discussed here should
> automatically flow through to the athlete's prefilled weight and rep values
> in the workout day exercise rows.
>
> I mention this because there is an important distinction between the
> persistent prescription and the live exercise row state. The prescription
> defines the targeted effort (e1RM, RIR) along with the weight and rep
> combination intended to achieve it, while the live exercise row remains
> user-controlled and dynamic. The athlete ultimately owns the selected
> weight.
>
> If the athlete chooses to modify the prescribed weight, the suggested rep
> target should automatically adjust to remain as faithful as possible to the
> prescribed e1RM target and progression, if applicable, within the practical
> limits imposed by available weight and rep increments. In other words, the
> live weight and rep fields should remain coupled to the underlying
> prescription even when the athlete changes the weight variable.
>
> This is essentially how the current prescription system behaves today
> (minus progression), with the live calculations mirroring the prescription
> calculations to preserve the intended e1RM target. We should retain that
> behavior. Ideally, the prescription engine and the live calculation engine
> continue to share the same underlying logic so they cannot diverge and
> always agree with one another.
>
> Likewise, the progression model should evaluate earned and unearned
> progression relative to the prescribed outcome rather than whether the
> athlete performed the exact prescribed weight and rep combination. If an
> athlete manually increases or decreases the working weight, the suggested
> reps should still represent the prescribed target, and progression should
> be evaluated against whether that target was achieved.
>
> This also presents an opportunity to better unify the ▲ / ▼ performance
> indicators with the prescription model. Rather than simply indicating over-
> or under-performance, they should accurately reflect performance relative
> to the prescription target, effectively communicating whether progression
> was earned. We should also consider introducing a "met prescription" state
> so the UI distinguishes between over-performing, meeting, and
> under-performing expectations without unnecessarily complicating the
> display.
>
> With these comments, I believe we have addressed the major architectural
> questions. I think we are ready to finalize the design and produce a
> comprehensive implementation plan that incorporates the original memo along
> with these follow-up discussions. Once completed and merged we will begin
> the implementation in new sessions.

*[→ N35 follow-up 3; answered in
`docs/reviews/2026-07-09-prescribed-progression-followup-3.md` — the
accumulation assumption is CORRECTED (retry-not-stack; the measured anchor
is the accumulator), live coupling + e1RM-space earn + three-state markers
adopted as rulings — and the design FINALIZED as
`docs/16-prescribed-progression.md` (authoritative build spec + phased
implementation plan)]*

### Batch 16 — R3 flip review: strength band vs hypertrophy-model consistency (2026-07-11, in-session)

> Hang on a minute here. Your comments on the R3 plan flip are significant.
> Why does the new plan bucket users by training years?
>
> Basing progress on training years or self-reported level creates the same
> problem that caused the hypertrophy target to be dramatically misaligned
> with realistic potential. The body-fat % > FFMI or BMI-band proxy produced
> a significantly more accurate projection.
>
> While hypertrophy is not perfectly aligned with raw strength, as noted in
> our research on the strength-versus-hypertrophy factor, the two are
> correlated. It seems inconsistent to claim that a user could gain
> 9.1–13.7 lb of lean mass—roughly 1.5–2.25 lb per month—while gaining only
> 0.5–1.5% strength per month over the same period.
>
> That relationship should be supported by research, and the projected
> strength gain should have defensible continuity with the expected
> hypertrophy gain within the prescription cadence for the same cycle. That
> applies to a hypertrophy cycle and, naturally, should remain internally
> consistent within strength cycles as well.

*[→ N43. Raised immediately after the R2/R3 activations (PR #178 session);
the envelope-loop half of the same message was a process question answered
in chat (the loop is OFF until the field-data fit — no backlog item).]*

### Batch 17 — field notes (2026-07-11)

Owner: "Here is another batch of notes and issues to add to notes. Please do a
precursor look into each of these issues to understand a little bit about the
underlying issue when adding them to the notes."

- "I would like to be able to see the prescribed calculated e1RM in the
  prescription detail, not just the anchor" *[→ N44]*
- "When a prescription anchor is listed in prescription detail, it would be
  nice to know the coordinate from which that anchor was derived as well"
  *[→ N45]*
- "no ability to edit custom templates" *[→ N46]*
- "HIGH - Sometimes there is a bug which causes the page switcher bar to not
  stay at the bottom of the screen. Sometimes when you scroll down on a page,
  the bar will scroll up to about mid screen. The bar is also non-functional
  when this bug exists. A full close and reopen rids it. See screenshot."
  *[→ N47; the referenced screenshot was not attached to the batch]*
- "need filters in the replace exercise modal" *[→ N48]*
- "Replace exercise needs a confirm/add button, not just a tap. Too easy to
  mistake click" *[→ N49]*
- "Past workouts allow you to edit weight / rep boxes, though they do not
  save. UI should lock them from edit." *[→ N50]*
- "Prescriptions in new meso seed with reps as low as 6 reps and I'm not sure
  why, when an increment down would land in the 8-12 window." *[→ N51]*
- "DEXA scans currently say that they don't/never impact prescriptions. Is
  that really true? Technically it may be indirect, but an updated, more
  accurate body fat and lean mass % will affect FFMI, which is affects macro
  strength bands, which affect pacing, which ultimately affects
  prescriptions. This is intended (and valuable) behavior. Just a thought."
  *[→ N52]*
- "HIGH, I am no longer ever seeing the loading splash page on the app. Just
  long black screens to load. I really hate seeing the black screen and we
  need to invest the time needed to get this right." *[→ N53]*
- "I don't think I like the goal target estimates in macro cycle views. I
  want to disable them again for now." *[→ N54]*

#### Batch 17 addendum — screenshots (2026-07-11, in-chat)

> "There's a couple screen shots of the menu issue if that helps. plus one
> more UI copy discrepancy regarding deload week selection."

Three screenshots, preserved in [`assets/`](./assets/):

- [`2026-07-11-n47-tabbar-detached-cycles.png`](./assets/2026-07-11-n47-tabbar-detached-cycles.png)
  — /cycles macro overview: the tab bar sits mid-screen with page content
  (MACROCYCLE STATS tiles) flowing *below* it. *[→ N47 evidence]*
- [`2026-07-11-n47-tabbar-detached-planner.png`](./assets/2026-07-11-n47-tabbar-detached-planner.png)
  — planner board (meso draft): same detach, bar mid-screen above the
  SAVE AS TEMPLATE / CREATE MESOCYCLE buttons. Captured 15:32 — the **same
  minute** as the create-meso sheet screenshot below, i.e. the detach
  coincided with BottomSheet + keyboard use. Both captures also show the app
  in **dark appearance**. *[→ N47 evidence; dark mode → N53 confirmation]*
- [`2026-07-11-n55-create-meso-deload-copy.jpeg`](./assets/2026-07-11-n55-create-meso-deload-copy.jpeg)
  — create-meso sheet, owner-annotated: "WEEKS — INCLUDING DELOAD" circled,
  ≠, "Final week is a deload" checkbox circled **unchecked**. *[→ N55]*

#### Batch 17 addendum 2 — owner correction on the N53 assessment (2026-07-11, in-chat)

> "I disagree with your assessment on the splash screen. I saw the splash
> screen working in a dark them when we implemented it plenty of times, and
> it was perfectly legible. The screen is black. The splash that I saw before
> is no longer displaying."

*[→ N53 re-framed: not a legibility/theme question — a REGRESSION. The
dark splash used to display and was legible; it no longer displays at all.
The needs-input color options were withdrawn; the item went back to
triaged with regression hypotheses.]*

### Batch 18 — N36 envelope-loop enablement design (2026-07-12, in-chat)

> "Doc notes  N36 envelope loop, I don't really understand why we shouldn't
> design the loop such that it defaults to the current portion of the band
> when not enough historical data is available to enable the loop, and have
> the loop kick in automatically when the data is available. The reasons for
> this are two-fold:
>
> 1. I won't necessarily remember to come back and enable it in three months,
> which is a hassle.
> 2. I am not the only user -- Some users may have the data available, others
> may not. So, for this reason alone, the loop has to control for data
> availability and effectively short circuit the loop until enough quality
> data is available to act on.
>
> Please address this so that we can enable the loop safely and transparently.
> If possible, it makes sense that the default (short-circuited) band position
> should be a tunable parameter until the loop kicks in to modulate it."

*[→ N36 self-gating reframe: doc 17 §7 amended, `min_history_mesos`
data-sufficiency gate built, runbook rewritten. No new item — folded into
N36.]*

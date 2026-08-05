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
| PH39 | How fast does e1RM recency decay? (Pulldown e1RM 110.1 but did 115×11 on May 22) | Q | — | A | answered → T-A1 |
| N1 | Performance & efficiency pass. **Owner's north star (2026-06-30):** "snappy" = *every* user interaction on *every* surface is visually acknowledged immediately, so the user never wonders "did my tap register?" — responsiveness over instantaneous data. Plus strategic caching + efficient loading for real load times. Measure first (bundle analyzer, slow-query baseline) + an **interaction-acknowledgment audit** of every surface, then client bundle/render wins + query-scope/caching. Backend already does the heavy lifting — do **not** relocate the engine to edge/DB. Absorbs PH29's instant-switch remainder. **Escalated (2026-07-03, Batch 5):** owner reports 1-2s dead gaps on page taps persist, esp. cycles page + subpages — users double-tap in doubt; wants IMMEDIATE switch + skeleton on every nav (day view is the only page doing it right). Disproves the Phase-A assumption that route navs already paint the `(app)/loading.tsx` fallback — re-verify on device, then per-route skeletons/streaming (Phase 3 pulled forward). **Per-route skeletons shipped (PR #134):** 9 routes (`/cycles` + macro/meso/planner/planned-day, exercises list+detail, templates, more) each got a layout-mirroring `loading.tsx` — the group-level fallback never repaints for sibling navs, which is why only day view (own file) acknowledged taps. **Owner confirmed on device 2026-07-03 (Batch 6): "all nav skeletons look good".** **Phase 2 closed (PR #151):** #7 reference cache shipped (`queries/reference.ts` — muscle_groups + stock exercise library in the shared Data Cache, per-user overlays live); #5 revalidateTag assessed & dropped (nothing to bust — reference data has no in-app writers, per-user reads stay uncached per doc 14). #7 amended (PR #153): the cached accessors fall back to live reads outside the Next runtime — `unstable_cache`'s E469 invariant had broken the rls-tests CI job since #151. Remaining WS-J scope: Phase-3 streaming/`DayView`-`PlannerBoard` decomposition, only as measurement demands | F | HIGH | J | **in-progress** — plan in [`J-performance.md`](./J-performance.md) |
| N34 | BodySpec DEXA integration (optional, per-user OAuth connect → scan import → profile enrichment → macro outcome verdicts). Assessment done: [`docs/15-bodyspec-dexa-integration.md`](../15-bodyspec-dexa-integration.md) — API viable (user-tier OAuth2/PKCE, pull-only), schema = `body_scans` time series + `external_connections` + `v_body_comp_history`, engine touch = measured FFMI into `planMacrocycle` only (never set-level), LSC honesty guardrails. Relates to N21 (macro-target correction should assume scan data may exist). Amends doc 01 out-of-scope if adopted. ~~Phase 0 is human-only~~ **Phase 0 resolved (2026-07-10, doc 15 §8):** owner confirmed private single-user deployment; live probe found the Keycloak realm allows **anonymous dynamic client registration** and grants `offline_access` — no BodySpec contact/approval needed; client self-registers at Phase-1 build time (one residual 5-min verification at first login: doc 15 §8.3). **Adopted (owner, 2026-07-10): "the dexa integration build is ready … can be phased in."** Build spec: [doc 17 §6 / Phase 5](../17-macrocycle-goals.md) — three PRs (5a connect+import, 5b enrich+view+retrospective verdict rows, 5c engine+MCP), parallelizable from day one; 5b's verdict rows want the N40 retrospective first. **5a shipped (PR #173):** migration `20260711000002` (`external_connections` + deny-all `external_connection_secrets` + `body_scans`, RLS + tests), PKCE OAuth w/ `offline_access` (connect/callback routes; the callback runs the §8.3 `GET /users/me` verification BEFORE persisting — `api_denied` fails the connect loudly), self-registration script + `manual-operations.md` runbook (`BODYSPEC_CLIENT_ID` per env; the screen is inert until set), zod-validated serial import w/ kg→lb at the boundary + verbatim `raw`, pull-based sync (inline backfill on connect, SYNC NOW after), More row + `/more/bodyspec` + scan detail ledger (09 2026-07-11 Phase-5a entry — no deltas/verdicts until 5b's LSC guardrails) **5b shipped (PR #174):** migration `20260711000003` (`v_body_comp_history` — deltas vs prev scan + `same_scanner_as_prev`; `body_scans.profile_applied_at`/`_dismissed_at`), consented profile-update proposal (newest unresolved scan; APPLY → profile bodyweight/bf% + `bodyweight_log source:'dexa'`; KEEP CURRENT resolves permanently), scan-detail VS PREVIOUS SCAN + macro-page BODY COMPOSITION (LSC guardrails as data: sub-LSC ⇒ WITHIN MEASUREMENT RANGE, cross-scanner ⇒ flagged never graded), retrospective `composition` block + the mass verdict's same-machine DEXA fallback, MCP parity (09 2026-07-11 Phase-5b entry) **Field fix (PR #175):** first real connect from the installed PWA died at the final hop — the round trip spans two browsing contexts (iOS in-app sheet w/ its own cookie jar), so the 5a cookie-carried PKCE/state + session-required callback could never complete there. Root cause + design recorded as doc 15 §8.5; migration `20260711000004` (`oauth_transactions`, deny-all, single-use state, 10-min TTL), cookie-free callback (service-role persistence scoped to the transaction's user), return-to-app interstitial (09 2026-07-11 entry). Hosted migrations `20260711000002`–`04` applied + verified via MCP the same day (the More tab errored on the missing 5a/5b tables) **5c shipped (PR #176):** measured bf% rides the existing `bodyFatPct` profile path (doc 15 §3.1 — no engine change; the 5b apply already writes the profile) + `profiles.body_fat_source` provenance (migration `20260711000005`; APPLY stamps `'dexa'`, picker/custom stamp `'estimate'`), profile body-fat control rework per the owner's 2026-07-11 note (bands normalized to 5-pt steps, CUSTOM VALUE entry, and a measured-DEXA panel replacing the bands while connected — OVERRIDE WITH AN ESTIMATE / disconnect reverts to the picker), Cunningham-only MEASURED RMR context on cut/hypertrophy macro Overviews (doc 15 §3.4, display-only), MCP `get_body_composition` over `v_body_comp_history` w/ the §6 guardrails shipped as data (09 2026-07-11 Phase-5c entry; doc 05 tool table) | F | MED | C | **build complete — 5a (PR #173), 5b (PR #174), field fix (PR #175), 5c (PR #176)**; open residual: owner re-runs the connect and the §8.3 first-login outcome gets recorded in doc 15 |
| N35 | **Prescribed e1RM progression** (owner memo "Updates to the Prescription Engine", Batch 12) — the engine never *demands* progress: exact compliance is a verified fixed point (prescription and measurement invert the same curve; the Option-A climb is RIR-neutral; the seed reprices the unchanged anchor), so meso N+1 = meso N forever unless the athlete volunteers over-performance. Analysis + recommended design shipped (survived a hostile design review): [`docs/reviews/2026-07-07-prescribed-progression-review.md`](../reviews/2026-07-07-prescribed-progression-review.md) — never bump the *measured* e1RM (T-I5); prescribe from a target anchor `A* = anchor + one earned quantum` (explicit all-sets compliance gate incl. workload + staleness, `min(weight, rep)` quantum with a realized-ask rule, never compounds unconfirmed, governed by per-microcycle cadence + a doc-10 §5 rate ceiling + a miss throttle — governors ship in Phase 1), param-gated `progression` block (v20), phases: advance chain → seed route → deeper macro coupling (after N21). Relates: archived S4/PR22 (this is their prescriptive half), T-I5 ruling, R24 (cut/maintain default-off), N21. **Owner follow-up answered + design amended (PR #156):** [`docs/reviews/2026-07-08-prescribed-progression-followup.md`](../reviews/2026-07-08-prescribed-progression-followup.md) — the rate ceiling is promoted to a **macro-rate pacer** (macro layer sets the expected strength rate from profile+goal, meso layer paces earned quanta to it; budget-never-quota — the rate meters the ask, only performance mints it; ships in Phase 1), per-goal booleans become **per-goal rate factors** (cut/maintain 0 subsumes the opt-out; hypertrophy 0.75 [HEURISTIC — research pass before v20]); `rate_source: "plan"` (personalized per-user rate) is the post-N21 flip. Also answered: the double-progression concern (one capacity quantum/week, not two — the ramp rep is reserve drawdown; the pacer bounds the rate), the `moderate` confidence ceiling under compliant hypertrophy (intentional — measurement honesty, doc 10 §9), and "reported RIR" (`logged_sets.rir_reported` — real optional column honored everywhere on read, **no write surface exists today**; §10 Q6 requires building one + a narrow doc-11 premise amendment) **Follow-up 2 answered (PR #156):** [`docs/reviews/2026-07-09-prescribed-progression-followup-2.md`](../reviews/2026-07-09-prescribed-progression-followup-2.md) — auditability (progression trace becomes **always-on + status-coded**; events at decision grain, aggregated read-side, fed back only as a doc-14 derived input), pacing decoupling confirmed, `band_position` replaces the band_mid/band_top enum, the owner's **envelope loop adopted as Phase 3**, standalone mesos need nothing extra. **Follow-up 3 answered + DESIGN FINALIZED (PR #156):** [`docs/reviews/2026-07-09-prescribed-progression-followup-3.md`](../reviews/2026-07-09-prescribed-progression-followup-3.md) — vanished-earn semantics locked as **retry-not-stack** (owner's accumulation assumption corrected: the measured anchor is the accumulator; coarse lifts realize via the rep axis + the top-of-window ratchet this design finally makes reachable); live day-view coupling prices off the **prescription-basis target anchor** (flips review §7.1's deferral); the earn gate moves to **e1RM-space per-set compliance** sharing the P19 marker comparison (grinder guard intrinsic); markers go **three-state (over/met/under)** with the band moved into params. Authoritative build spec: [`docs/16-prescribed-progression.md`](../16-prescribed-progression.md) (mechanism, v20 params block, doc-14 treatment, test matrix, phased plan: engine core → seed route → day-view coupling/markers → audit aggregate → owner-gated activation incl. the hypertrophy-factor research pass). Deferred, recorded in 16 §11: envelope loop, `rate_source: "plan"` (blocked on N21), required honest-RIR confirmation + capture affordance, per-exercise progression-off override | D→F | HIGH | — | **in-progress** — **Phase 1 (engine core + advance chain) shipped (PR #158)**: `rules/progression.ts` (e1RM-space earn gate, governors, quantum δ), `A*` threading with the realized-ask rule + always-on status-coded trace, engine_params **v20** (`20260709000001`, INACTIVE), `progressionHistory`/staleness derived-input assembly + advance-path plumbing, `get_engine_decisions` rule/status filter, doc 10 §4 + doc 13 §9.2 pointers; §10 Phase-1 test matrix green (the treadmill golden pins the doc-16 §7 worked example verbatim). **Phase 2 (seed route / meso-over-meso carry) shipped (PR #159)**: `seedMeso` §3.7 wrapper sharing the advance chain's gate + governors + realized-ask verbatim (new derived `seedEarn` input, doc 14 denylisted, recorded for replay), earned-at-close derivation (`queries/seed-progression.ts` — the most recent completed WORKING session, deloads excluded), caller plumbing at the §10 site list (meso activation earns; swaps/plan-edit adds never; freshness recompute + admin replay reproduce the recorded earn frozen); §10 Phase-2 tests green (seed↔advance parity, deload-boundary carry + staleness cutoff, meso-over-meso golden, doc-14 fingerprint parity). **Phase 3 (day-view coupling + three-state markers) shipped (PR #160)**: the day read carries the prescription-basis anchor (`LoggedExercise.prescription_anchor` — `A*` from the `stepped` step of the latest decision per row, read ungated so the coupling stays honest through deactivation), `SetRow`'s live predictor prices off `prescription_anchor ?? e1rm_anchor` (§5.2, measured-anchor fallback = today's behavior), `loggedSetMarker` goes three-state by DELEGATING to the engine's `setComplianceMarker` with the params-fed band (`compliance_band` absorbed `MARKER_BAND` — marker, gate, grading structurally one comparison), ▲/■/▼ house-style glyphs per the 09-changelog 2026-07-09 entry (rule-8 pass: no mockup figure exists for the set-row marker), WS-J bundle guard extended over `rules/progression.ts`+`rules/feedback.ts`; §10 Phase-3 tests green (three-state day-rules, marker ⇄ earn-gate agreement fixture, e2e: earned prescription renders / weight edit re-derives off the target / met+under markers). **Phase 4 (audit aggregate) shipped (PR #161)**: admin MCP `get_progression_history` (doc 16 §8.3 — per-exercise earn/miss/skip mix, governor firings, gate-failure reasons, `vanished` share for increment sizing, earned-then-met/missed ask pairing, trailing prescribed vs measured %/30d gain, bounded event series; caller's own decisions, active-params e1RM pricing), pure fold in `queries/progression-history.ts` + fetch in `engine-admin.ts`, read-side only — no migration; `v_progression_events` deliberately unbuilt (no stats screen wants it, per §10); tests +9 (suite 941). Doc-16 build-out complete. **Phase R (owner-gated activation) prepared (PR #162)**: (1) research pass on `goal_rate_factor.hypertrophy` DONE — **kept 0.75** ([`docs/reviews/2026-07-09-goal-rate-factor-research.md`](../reviews/2026-07-09-goal-rate-factor-research.md); moderate-load 1RM conversion ~0.56–0.73 of heavy-load, evidence-labelled, 1.0 rejected); (2) v20 migration APPLIED to hosted INACTIVE (hash-verified `cb451a02…`, v19 stays active — no user change); (3) replay diff DONE (v19→v20: 11/15 changed / 0 errors, all earned steps on compliant advance/seed weeks); (4)+(5) owner review → activate → monitor remain human steps in [`docs/deployment/manual-operations.md`](../deployment/manual-operations.md) → "Activate engine_params v20". The doc-16 §11 deferred spine is now filed as **N36–N39** (below) pointing back to doc 16; N21 primed as the next target. **Status: Phase R prepped — activation is owner-gated (manual-operations runbook).** Remaining N35 code is exhausted; the item stays live only until v20 is activated + the deferred rows are picked up |
| N36 | **Envelope loop** (doc 16 §4 Phase-3-of-design, §11) — demand-side outcomes (earn rate, miss ratio, throttle trips, `beat`s) move `progression.band_position` within [0,1] at meso boundaries, bounded with hysteresis, position recorded in decision inputs. Macro goals are never modified by performance — the loop only slides *where within the bounded rate band* the athlete is paced (owner's Batch-14 framing). **Needs:** v20 active + a few mesos of field data via `get_progression_history` (doc 16 §8.3, shipped PR #161) to fit the update rule, AND the N21-corrected band to move within. Sequencing in [`docs/reviews/2026-07-09-n21-strength-rate-priming.md`](../reviews/2026-07-09-n21-strength-rate-priming.md) §5. **Residence decided (2026-07-10, architecture doc §3.3):** `band_position` becomes a **per-user derived input** — a pure, bounded fold over the trailing `engine_decisions` stream computed at seed time (params value = default/starting position), fingerprint-excluded + recorded in decision inputs like `progressionHistory`; grain = per user (not per exercise); bounded-lookback forgetting doubles as the return-from-absence decay. No new table unless field data forces a materialization. **Build spec: [doc 17 §7 / Phase 6](../17-macrocycle-goals.md)** (update-rule shape: meso boundaries only, steps bounded at ±0.25, dwell ≥ 1 meso, clamp [0,1], demand-side outcomes only; `progression.envelope` block ships inactive after the rule is fit). ~~Blocked on: v20 activation (doc 17 Phase R1) + field data + N21~~ **R1 cleared:** v20 verified ACTIVE on hosted via MCP 2026-07-11; the N21-corrected band merged with Phase 1. **Mechanism built (PR #177):** `EngineInputs.bandPosition` per-user derived input (doc-14 §3: `DERIVED_INPUT_KEYS` denylisted, recorded in decision `inputs`, replays frozen through `recomputeRow` + admin `replay_decisions`), pure fold `engine/rules/envelope.ts` (completed-meso boundaries only, `MAX_BOUNDARY_STEP 0.25` binding over any tuned step, dwell, clamp, bounded lookback = the return-from-absence decay; down-pressure wins over up; a raise requires real up-pressure — the pacer bound or an `over`/beat share — so it is never invisible), `progression.envelope` `.optional()` schema block w/ PROVISIONAL thresholds, assembly `queries/envelope.ts` at the `planStrengthRate` site list (activation seed / advance / projection; swaps+backfills omit it, same as the plan rate), pacer reads `inputs.bandPosition ?? params.band_position` (source-agnostic w/ N37's `"plan"`). **Deliberately NO params migration** — doc 17 §7 ships the bump only after the rule is fit; every applied row lacks the block ⇒ byte-identical (+27 tests pin it). ~~Remaining: field-data fit → params bump~~ **Self-gating reframe (owner note 2026-07-12, Batch 18; PR #184):** the fit-before-activate gate conflated two different things — global threshold *calibration* (refinable any time from monitoring) and per-user *data availability* (must be automatic). Replaced per the amended doc 17 §7: new `min_history_mesos` tunable (default 2) in `progression.envelope` — short of that many qualifying (≥ `min_decisions`) completed mesos in the lookback window, the fold short-circuits to the **tunable** `progression.band_position` default (the owner's asked-for knob; it was already the default/starting/loop-off value, so off → short-circuited → modulating is continuous), kicks in automatically per user as history accrues, and degrades back as it ages out. Runbook rewritten ("Activate the envelope loop": propose defaults bump → replay diff → owner activates → monitor/REFIT thresholds from field data — no wait). Both owner concerns closed: no remember-in-three-months step, and multi-user data variance is controlled per user. Remaining: run the activation runbook (owner-gated) | F | HIGH | P | **self-gating built (PR #184)** — ready to activate via runbook; thresholds refit from field data after activation |
| N38 | **Periodic required honest-RIR confirmation** (doc 16 §8.4, §11) — the trust-model backstop: checkbox-logging compounds under earned-step (each fake compliant session re-arms). Two-part: an engine rule that periodically requires an honest-RIR-confirmed session to keep earning + a **per-set RIR capture affordance** (`logged_sets.rir_reported` is honored on read but has no write surface — N35 follow-up §10 Q6) + a narrow doc-11 premise amendment. Revisit with field data. The always-on trace + reported-RIR-aware compliance gate (Phase 1) already bound the abuse; this is the periodic hard check. **Halved 2026-07-31 (owner A1):** the **capture affordance + the doc-11 premise amendment are absorbed into [doc 21 Phase 1](../21-exercise-level-rir.md) §2** — per-set `rir_reported` is written and one resolution `rir_reported ?? target_rir` is shared by the stamp/anchor/marker. What remains here is only the **periodic engine rule** (require a recently honest-RIR-confirmed session to keep earning), which stays deferred pending field data now that capture exists | F | HIGH | P | **reduced** — capture half **done (PR #216)**: per-set `rir_reported` now has a write surface (set-grid RIR column, pre-filled with the prescription) and the doc-11 premise amendment shipped with it; the periodic-check half is still deferred (doc 16 §11), and now has real reported-RIR data to be designed against |
| N39 | **Per-exercise "progression off" override** (doc 16 §11) — let a user disable earned-step progression for one exercise; slots into the existing `ExerciseParamOverride` merge (doc 14 §6.1, same path as the per-exercise increment). Small, self-contained; build on demand | F | MED | P | deferred (doc 16 §11) — build on demand |
| N43 | **Strength-rate band still buckets by calendar training years — the same defect N21 fixed for hypertrophy** (owner, 2026-07-11, reviewing the R3 flip; Batch 16). `planMacrocycle`'s `strengthRateBand` reads `strength_pct_month[bucketFor(profile)]` where `trainingYears` leads (owner: 12.7 y → **advanced** 0.5–1.5 %/mo) while the hypertrophy path prices **proximity to potential** (owner's normalized FFMI ≈ 16.7 is *below* the 18.5 untrained baseline → developed fraction 0 → 1.6–2.4 lb/mo lean — the very "trained since 2013 but never grew" case the FFMI model exists for). Internally inconsistent: a mass-coupled sketch (ΔFFM ≈ 1.3–1.9 %/mo × allometric ⅔–1 exponent) puts expected strength ≈ 0.8–1.9 %/mo, straddling *above* the advanced band — the model simultaneously projects novice-rate muscle gain and ceiling-rate strength gain. Consequence sharpened by R3: since the `"plan"` flip (v22) the **pacer meters demand off this band** (owner's target ≈ 0.75 %/mo vs 1.69 under the old bucket read), so the miscalibration now defers earned steps, not just mislabels a display. **Fix direction (research pass first, like the `goal_rate_factor` pass):** derive the strength band from the same developed-fraction — lerp beginner→advanced `strength_pct_month` endpoints on FFMI proximity (bf-proxy fallback per §2.2), keep the §2.1 sex factor + age taper on top, profile-only so principles 1/4 hold; calendar bucket stays the no-body-comp fallback. Ships as v23 + doc 10 §5 amendment + doc 17 §2 amendment. **Research pass DONE (2026-07-11, PR #179):** [`docs/reviews/2026-07-11-strength-rate-model-research.md`](../reviews/2026-07-11-strength-rate-model-research.md) — the two-component hypothesis (neural∼training-age + hypertrophic∼FFMI-proximity) is EVIDENCED and should combine **ADDITIVELY** (Balshaw 2017 decomposition: neural 30.6% / volume 18.7% / pre-strength 10.6%). Corrected magnitude: coupling to **FFM** (not body mass) gives allometric `k ≈ 1.0` (band 0.8–1.3), not the ⅔ sketch — so Garron's model-derived rate is **~1.4–2.3 %/mo = the intermediate band**, and the calendar-**advanced** bucket genuinely **understates** (owner's instinct confirmed, more strongly). Recommended form: `neural(trainingAge) + k × hypertrophyRate_FFM`, neural = `N0·exp(−t/τ)+N_floor` (N0 3–5, τ 4–8 mo, N_floor 0.1–0.4, floor>0 per Pearcey 2021), + trust-FFM-over-calendar guardrail (un-bank skill when realized FFM is low), + sex-neutral & age-taper unchanged. **Pacing pressure-test DONE:** [`docs/reviews/2026-07-11-pacing-fundamentals-review.md`](../reviews/2026-07-11-pacing-fundamentals-review.md) — sim on the real engine confirms the pacer is a rate-limiter on the *lead* (correctly-calibrated band tracks a 3.87 %/mo true gainer at 3.33; miscalibrated-tight starves to 1.40); the measured anchor is the primary honesty mechanism (honest lifter → 0 overshoot); RIR-mortgaging is real but bounded + self-correcting, worst on 8-wk mesos (4.8% transient overshoot, exposed at RIR 0, anchor reels it back); the envelope loop slides *position within* a band and **cannot** fix a whole-band miscalibration → **N43 must land before N36 is fit**. **Interim decision RESOLVED (owner, 2026-07-11): rolled back to v21** (`activate_engine_params` 21) — v21's self-report intermediate band (ceiling 2.25 %/mo) contains the ~1.5–2.3 model rate; v22's advanced plan band (ceiling 1.13) cannot reach it. Remaining: build v23 (the additive two-component band). Relates: N21 (this is its unfinished half), N37/R3 (what exposed it), doc 16 §6 (pacer), N36 (blocked-by → build N43 first), N52 + N54 (the DEXA-copy amendment and the target-card re-enable both ride v23) | D→F | HIGH | C | **done (PR #182)** — v23 built: additive two-component `strength_model` in `strengthRateBand` (`macro.ts`), migration `20260712000001` inactive, doc 10 §5 + doc 17 §2.7 amendments, goldens pin the research §4 corners (Garron 1.4–2.3 %/mo intermediate; novice 4.3–7.3; advanced ≈0.1–0.5; body-comp-missing ⇒ bucket band). Activation is Phase R (replay diff + owner review); N52/N54 copy+card re-enable now unblocked (ride the v23 activation) |
| N46 | No ability to edit custom templates (owner, Batch 17). Confirmed: no update path in UI, queries, or MCP — templates are create/view/share/start-meso/delete-only, and delete is MCP-only (no button on the detail page). Build: prefill the planner board from `getTemplateDetail` (shape is already planner-ready) → new `updateTemplate` mirroring `saveMesoAsTemplate`; EDIT + DELETE affordances on owned detail pages; MCP `update_template` parity | F | MED | D | **ready** — scoped in [`scoping.md`](./scoping.md#n46--edit-custom-templates--f--medium) |
| N47 | Tab bar detaches from the bottom on scroll and goes dead; relaunch cures it (owner, Batch 17, HIGH; screenshot referenced but not attached). Ancestor-transform theory ruled out (no ancestor of the fixed `BottomNav` ever gets a transform; PullToRefresh animates height and is a sibling). Top hypothesis: `useScrollLock` toggling `body{position:fixed}` on every overlay open/close leaves fixed elements bound to a stale viewport on iOS standalone — matches all three symptoms (rides up mid-screen, taps dead, only relaunch resets). Fix: move the scroll lock off body-position-fixed; verify on device. **Screenshots received (Batch-17 addendum, [`assets/`](./assets/)):** detach reproduced on /cycles AND the planner board; the fixed bar renders as if the viewport bottom were mid-screen (content flows below it), and the planner capture is the same minute as a create-meso BottomSheet + keyboard session — corroborating the scroll-lock (+ keyboard visual-viewport) trigger. **Shipped:** `useScrollLock` reworked off body `position:fixed` entirely — the lock is now body `overflow:hidden` (scroll offset preserved, so fixed elements never re-anchor) + `overscroll-behavior:none` + a document-level non-passive touchmove guard (pure `touchMoveAllowed` walk, unit-tested: allows interactive controls and genuinely scrollable overlay regions, prevents scrim/static-chrome touches so the page can never scroll behind an overlay); N7's exact scroll restore kept as the unlock backstop for keyboard focus-reveal drift; `overscroll-contain` added to the three overlay scroll regions that could chain to the document (CompleteSheet panel + both fullHeight sheet lists); `BottomNav` composited on its own layer (`transform-gpu`) as belt-and-braces. Verified end-to-end (headless touch drive on the real app against the local stack, 24/24 checks: lock at depth holds `scrollY` un-zeroed, scrim drags inert, sheet lists still scroll, exact restore on close, nav re-anchored + taps navigate after the overlay+keyboard-shaped session) — the iOS keyboard/visual-viewport half of the repro can't be emulated headless | B | HIGH | G | **done (PR #186)** — residual: owner re-checks the repro on device |
| N52 | Is "DEXA scans never change prescriptions" really true? (owner, Batch 17 — owner notes the indirect bf%→FFMI→strength-band→pacing chain is intended and valuable). **Answered: the copy is correct today** — the chain is broken at two links (strength band still calendar-bucketed = the N43 defect; pacer reads the plan rate only under `rate_source:"plan"`, rolled back to v21 `"band"`), and the doc-14 fingerprint never retro-stales on bf% (forward-looking only, even when live). Once N43's v23 band + the plan rate source are both active, the owner's chain exists → amend the four copy sites (bodyspec page, `get_body_composition`, doc 15 §3.3, doc 17 principle 1) to "indirect, forward-looking via macro pacing" | Q | — | C | **answered** — analysis in [`scoping.md`](./scoping.md#n52--dexa-never-changes-prescriptions-copy-vs-the-indirect-chain--q--answered); copy amendment rides N43/v23 |
| N56 | **W2·D4 deadlift prescription "does not match what is shown on screen"** (owner, 2026-07-19, Batch 19; screenshot: day view 250×8×3 @ 2 RIR, unlogged). Code-side investigation done — the session had NO live access (workout connector toggled off + non-interactive, so neither the N33-style `engine_decisions` pull nor a clarifying question could run): the screen is the freshness-reconciled stored row (day view runs `ensureFreshPrescriptions` on open); under stable params a recompute cannot drift (recency weights are relative — time alone moves nothing; progression context replays frozen); worked v21 numbers say 250×8@2RIR implies anchor ≈333 and is the correct paced/`not_earned` output for a ~245×8@3 W1 (a plain hold prices 255 only off a 250×8@3 anchor ≈342), with one deadlift quantum ≈1.95% vs the 1.69%/mo paced budget → heavy-lift steps ~monthly by construction. Hypotheses ranked + the discriminating live queries in [`docs/reviews/2026-07-19-deadlift-w2d4-prescription-mismatch.md`](../reviews/2026-07-19-deadlift-w2d4-prescription-mismatch.md). **Found + fixed in the same PR:** the doc-14 §5 parity gap — `explain_prescription` never ran the read-path reconcile, so MCP could quote a number the app would contradict on next open; it now freshens the active meso before reporting (+3 tests). **RESOLVED same session (owner enabled the connector; review doc §8):** live `engine_decisions` + SQL confirmed the stored W2·D4 prescription was **250×9@2** (hold off anchor 341.7, step earned-but-`paced` by the rate pacer; never rewritten — the Jul-19 advance still read `previous` 250×9) while the day view's **unlogged rep cells display the live reps prediction**, which the paced row priced off the *measured* anchor (`prescription_anchor` is `stepped`-only) — W2·D2 (Jul 15, 255×8,7,7) had moved it 341.7→333.1, and `predictRepsAtWeight(333.1, 250, 2) = 8`. Screen 250×8 vs graded ask 250×9 — performing the screen's ask would have scored `under` and forfeited the earn (owner dodged it by self-raising to 255 → `met` → earned → W3·D4 260×9@1 `stepped`). **Fix (same PR): `prescriptionBasisE1rm` (day-rules) — unlogged rows price cells + weight-edit re-derivations off the graded ask (`A*` → the prescription's own implied e1RM → measured only for prescription-less rows); `impliedPrescriptionE1rm` shared with the detail sheet's PRESCRIBED IMPLIES line; display ⇄ markers ⇄ earn gate now one definition (+7 tests pinning the field numbers).** Also shipped: the doc-14 §5 MCP freshness-parity gap (`explain_prescription` reconciles before reporting — real gap, not the cause here). Residuals: owner re-checks the day view on device post-deploy; §7/§8.5 design questions — `paced`/`not_earned` surfacing **shipped via N57's quick-read strip (2026-07-19)**; the coarse-lift step-cadence question (one deadlift quantum ≈2% vs ~1.7%/mo paced budget ⇒ ~monthly steps by construction) stays open for an owner ruling | B | HIGH | P | **done (PR #193)** — residual: owner device check; step-cadence design question open |
| N57 | **Prescription presentation split: quick-read + Engine audit** (owner, Batch 20 — "feels more like a debugging panel than a useful prescription detail"). Built: (1) deterministic quick-read — pure composer [`src/lib/prescription-narrative.ts`](../../src/lib/prescription-narrative.ts) (ask line from the row alone + delta-vs-last-session in reps-to-failure language + a **multi-factor why** per the Batch-20 addendum — feedback-modulation causes [pain-capped load, hot-workload set removal, rough-session dampening, set adds/vetoes] alongside the doc-16 §3.6 progression state incl. `paced`/`not_earned` — closes N56's §8.5 surfacing residual — with the earn-gate echo of a feedback cause deduplicated, capped at three why-lines, + N33-S4 hand-adjusted caveat; 26 unit tests incl. the N56 fixture verbatim), revealed by a target-glyph button next to the note button as a notes-style strip (09 entry 2026-07-19); (2) the detail sheet reorganized into the **Engine audit** (PRESCRIPTION / DECISION / EST. STRENGTH / TRACE ledger, trace steps status-labeled structurally; `readTrace` preserves status/governor/predicate; audit adds `previous` from decision inputs), drill-in via the ⋮ menu's `Engine audit ›` row **only** (Batch-20 addendum: the in-strip link was removed; the strip stays purely the story). The LLM variant (doc 18 / N58) drops into the strip's body lines; the ask line stays deterministic | F | HIGH | G | **done (PR #194)** — residual: owner reviews the strip copy on device |
| N59 | **Stored `logged_sets.e1rm` never restamped past v11** (owner, 2026-07-21, Batch 21) — follow-up to **T-N33** (PR #147). T-N33's `activate_engine_params` hook restamps stored stamps only when the incoming version's `e1rm` block differs from the **outgoing** one; the `e1rm` block changed exactly once (v10→v11, `brzycki_max_eff_reps: 10`, §S3) but v11 shipped inactive and the hook didn't exist yet, so by the time it landed every activation left the block byte-identical (v11→v25) and `e1rmBlockChanged` never returned true again. Pre-v11 stamps (averaged Epley+Brzycki) persisted, inflating e1RM on sets with effective reps > 10 (owner's Deadlift 384.2 vs v11+ 367.5). **Fix = one-time catch-up backfill** (owner: policy is fine going forward, just needs to catch up). Built as idempotent migration `20260721000001` recomputing every stamp under the active v11+ model, reproduced in **double precision** (float64, matching the JS engine's `Math.round` — exact-decimal disagrees with the engine on ~10 half-way ties); **validated against the real TS `estimateE1rm` across all 1153 distinct (weight, effReps) combos in prod: 0 mismatches**. **Applied to hosted prod via MCP 2026-07-21** (rollback snapshot → `ops.e1rm_restamp_backup_20260721`; **4919 rows updated across 3 users**, second pass 0 diffs). Strength-metrics diff: 131/220 user-exercise best-e1RM values corrected downward (avg −15.9 lb; biggest on high-rep/bodyweight lifts — walking lunges, back raises, sit-ups, leg curls — where the averaged formula most inflated). Restamp policy left unchanged (owner). | B | HIGH | P | **done (PR #198)** — prod backfilled + verified 2026-07-21; residual: owner eyeballs a strength surface post-deploy |
| N60 | **Prescription explanation v3 — deterministic facts + triggered coaching** (owner, Batch 22, 2026-07-23; follow-on to N57/N58). Owner reviewed the live v2 output ([`reviews/2026-07-23-llm-coaching-assessment-owner.md`](../reviews/2026-07-23-llm-coaching-assessment-owner.md)) and called for v3: deterministic prescription → deterministic explanation facts → optional, trigger-gated LLM coaching insight. Reconciled build spec written: [`docs/19-prescription-explanation-v3.md`](../19-prescription-explanation-v3.md) — seam inverts (deterministic why ALWAYS renders; stored row becomes an additive COACH line, `prompt_version ≥ 3` only), semantic-facts payload replaces the raw trace (one verdict per axis — `pace_status` supersedes the two-rate trend pair; `effort_status` observed/inferred honesty; notes the only free text), deterministic trigger scoring (pain/note/plateau-gated/completion-pattern/block-intent/unusual-prescription/increment-coarse; empty ⇒ no call), structured output w/ abstention + note classification, note-write regeneration hooks, doc-18 infra (storage/lifecycle/post-check/admin loop) unchanged. Amendments to the owner doc recorded in 19 §2 (LLM `why` dropped; in-call note classification; decision-id keying kept; analyst voice; data-collection phase severed → 19 §10 candidates for future filing). Build = 19 §11, one PR per phase (1: seam + composer hardening; 2: facts+triggers pure; 3: prompt v3 + storage; 4: serve + regen hooks; 5: deferred surfaces). **Phases 1–2 shipped (PR #201):** the seam inverts (`appendCoaching` replaces `substituteExplanation`; composed ask+why always render; stored rows served only at `prompt_version ≥ 3` in the day-view audit + MCP `explain_prescription` — nothing serves today, the safe floor), Layer-2 hardening in `prescription-narrative.ts` (§4.1 paced=held-back framing, §4.2 no "engine" outside the audit, §4.3 `effortStatus` gates the grade line's effort claim, §4.4 ≤3-line suppression tests), and the two pure modules `src/lib/llm/explanation-facts.ts` (§5 one-verdict-per-axis facts; §5.1 gates as code — Bench Press ⇒ `insufficient_data`) + `src/lib/llm/coaching-triggers.ts` (§6.1 gates; empty ⇒ no call). Dry-run wired into `test_llm_explanation` (returns facts+triggers) and `generate_explanations` (`dry_run=true` would-trigger report). §10 spun-off candidates filed as T-N60a–f. **Phase 3 shipped (PR #202):** the LLM re-enters, fenced by facts+triggers — new pure `src/lib/llm/coaching.ts` (prompt v3 `COACHING_PROMPT_VERSION 3`, analyst voice + tone prohibitions + effort-honesty rule + facts-payload few-shots incl. abstention & low-confidence; structured JSON `{coaching_context, note_class, abstain}`; extended post-check — abstention=no row, ≤360, facts number-set, note-only+non-actionable⇒discard), `generateOne` skips the API call when no trigger fires and stores body+triggers+`prompt_version 3` (outcomes carry a `disposition`), migration `20260723000001` adds `triggers text[]` (**applied+verified on hosted prod via MCP 2026-07-23**), admin tools surface disposition breakdown + v3 prompt_version. **Ships in shadow** (generation gated by `LLM_EXPLANATIONS`; serving still needs mode=on + the phase-4 strip flip). Remaining (owner-gated): **owner voice-reads a v3 batch** (admin overwrite loop / `test_llm_explanation`), then phase 4 (strip coach line w/ 09 design decision + MCP `facts` + note-write regen), phase 5 (§8 deferred surfaces) | F | HIGH | H | **in-progress** — phases 1–3 done (PR #201 + #202); phase 3 awaits owner voice-read; phases 4–5 owner-gated, see 19 §11 |
| T-N60a | **Effort-reporting adoption** (doc 19 §10.1, spun off from N60 phase 2) — surface/nudge per-set RIR entry. The schema exists (`logged_sets.rir_reported`, honored on read everywhere) but no UX invites it, so effort is almost always *inferred* not *observed* — the doc-19 §4.3 honesty gate then suppresses effort claims across the deterministic why AND the facts `effort_status`. **Highest-leverage input per the owner review** (the model's biggest blind spot). Needs its own screen/interaction design (hard rule 8) + the doc-11 premise interaction. Relates: N38 (the periodic honest-RIR hard check wants a capture affordance too — same missing write surface) | F | HIGH | H | **superseded → N71 / [doc 21 Phase 1](../21-exercise-level-rir.md) (2026-07-31)** — owner decision A1 makes per-set `rir_reported` capture a build phase with the interaction design and the doc-11 premise amendment in scope (spec §2/§8); the doc-19 §4.3 effort-honesty gate stops being suppressed as a side effect. Archive at next sweep |
| T-N60b | **Structured pain follow-up** (doc 19 §10.2) — a brief, conditional follow-up when joint pain is reported (location, during/after, tolerated alternatives), building on PR #199's per-exercise attribution. Feeds the facts `pain.recurring`/`last_report` and the `pain` trigger with real structure instead of a single rating. Own screen + schema + design | F | MED | H | **ready** — spun off from N60 |
| T-N60c | **Note classification at entry** (doc 19 §10.3) — an optional type tag on notes (setup/pain/technique/equipment/general); free text stays. Would let the trigger layer gate notes deterministically by class (today the model classifies in-call, §6.2 `note_class`) and sharpen the `note`/`pain` triggers. Small-ish; UI + schema | F | LOW | H | **ready** — spun off from N60 |
| T-N60d | **Equipment/setup identity** (doc 19 §10.4) — machine/attachment/angle identity for comparability gating. The facts `trend_status` plateau path (§5.1) and the trend's `comparable` flag currently depend on same-exercise+equipment comparability the app can't fully verify; this makes it real. Feeds N43-era rate work too. Schema + capture design | F | MED | H | **ready** — spun off from N60 |
| T-N60e | **Deviation reasons** (doc 19 §10.5) — an optional reason when performed ≠ prescribed. Feeds the `unusual_prescription` trigger's out-of-band branch and the day-view out-of-band caveat with *why*, not just *that*. Small UI + schema | F | LOW | H | **ready** — spun off from N60 |
| T-N60f | **Workout / weekly / meso review synthesis** (doc 19 §8 deferred + §10.6) — the deferred aggregation surfaces: "several exercises share the same reason, explain it once" (workout level), and end-of-workout / weekly / meso review syntheses. Different surfaces (Workout Complete, meso summary), each needing design work; buildable on the same facts layer shipped in N60 phase 2. Also the on-demand deeper "why?" expansion (§8; the Engine audit serves the power-user version today) | F | MED | H | **ready** — spun off from N60 |
| N66 | **MEASURE — a companion measurement app** (owner, 2026-07-25, Batch 27). Body weight tracking (logging, logbook with rolling averages + change rates, weekly/monthly/yearly reports, smoothing-method and window settings), physical circumferences, DEXA, import/export, and an integrated summary — sharing WORKOUT's DB, design system, and MCP connector, with its own front end, and cross-linking with WORKOUT so each app does what it's best at. **Direction doc landed:** [`docs/20-measure-companion-app.md`](../20-measure-companion-app.md) — division of labour by fact ownership (§1), 6 binding principles (§2, incl. *smoothing is read-time, never stored* and doc 15 §3.3's engine boundary restated), the topology decision (§3: a `(measure)` route group + its own manifest inside this deployable — two home-screen PWAs, one origin, one session cookie, zero `src/lib` refactor; monorepo recorded as the tripwired end state), schema direction (§4: reuse `bodyweight_log`/`body_scans`/`v_body_comp_history`; four `bodyweight_log` amendments + `v_bodyweight_series`; new `measurement_sites`/`_sessions`/`measurements` on the stock-plus-custom `exercises` pattern; import as the sleeper feature), the pure `src/lib/measure/` module emitting %/mo to match the pacer (§5), screens + M-series figure index (§6), the seam (§7), one MCP connector (§8), guardrails (§9), 7 ranked opportunities (§10), out-of-scope (§11), 8 phases with **Phase 0 = mockup pass gating everything** (§12). Builds on N34 (BodySpec), N41 (bodyweight series), N52 (the bf%→pacing chain). **Blocked on the §13 owner decisions** — install model, whether BodySpec relocates, Navy-method bf%, progress photos, where a weight goal lives, import formats, smoothing defaults, MCP write posture  **Review round 1 (owner, 2026-07-31)** settled the topology (shared auth, one deployable, separable later — §3.4 is now a checkable rule list + a costed split), added **principle 7 transparency** (no composites; every number carries method/window/n), and answered the owner's four new asks: fast capture as a first-class requirement (§4 — token-auth `POST /api/measure/weight` + three Shortcuts recipes; the existing `unique (user_id, measured_on, source)` makes capture idempotent and automation loops converge), **Apple Health as the integration bus** (§4.5 — Happy Scale and every smart scale already write Body Mass to Health, so a Health↔MEASURE Shortcut gives bidirectional Happy Scale coexistence and scale support with no vendor API; Dropbox declined as sync — parsing another app's backup format fails principle 7), the **three-source synthesis** (§5 — they triangulate, never average: an instrument table showing weight is a precise instrument on a contaminated quantity / tape an imprecise one on a decent proxy / DEXA a good one too rarely; a three-tier model measured→corroborated→projected with Tier 3 structurally sealed from the seam and the engine; an 8-row corroboration matrix over mass×waist with noise-band 'flat' and DEXA override), and **Happy Scale parity** (§9 — take the trend/rate/projection/milestone mechanics, decline streaks and Dropbox). Seam narrowed to a four-item payload through `src/lib/seam/` (§5.6), incl. upgrading the retrospective's Δbw from raw-point to trend-bracketed endpoints. Phasing re-cut to 10 phases with capture pulled early | F | — | Q | **needs-input** — direction doc PR #210 (merged), revised round 1 in PR #214; 9 open §17 decisions before Phase 0 |
| N67 | **An exercise increment should index off the last weight the lifter ENTERED, not absolute multiples** (owner, 2026-07-31, Batch 28). "If the increment is 10 lb and the user enters 88, the next increment up should be 98, not 90, and the next increment down should be 78, not 80." Confirmed in code: the per-exercise override sets `params.rounding[equipment]` (`resolveEffectiveParams`, doc 14 §6.1) and `roundToStep` snapped every prescribed load to an ABSOLUTE multiple of that step, so a lifter on a machine that actually loads in 88s got dragged back onto a 10s grid they can't put on the bar. Fixed by giving the lattice a PHASE: `roundToStep(w, eq, params, origin)` snaps to `origin ± k × step`, and `latticeOrigin` resolves the origin from the engine's existing DERIVED inputs (last logged working set → the seed route's earn context → `previous` → `weekPeak` → plan `initial`). Gated to overridden exercises via a new optional `rounding_origin` param that `resolveEffectiveParams` sets — no engine_params version bump, no fingerprint churn (the origin rides denylisted inputs), and every non-overridden row is byte-identical. | B→F | HIGH | G | **done (PR #215)** |
| N68 | **Background/offline set-logging queue — stale set-logging hang-ups** (owner, 2026-07-31, Batch 28, HIGH). "The set gets logged and the checkbox fills, but the active set does not move forward… forcing the user to quit and restart the app." Root cause found and it is structural, not flaky: the box acknowledged on the server action's response (N12) but `nextSetNumber` was derived from SERVER rows alone, so a stalled RSC revalidation left the row checked and the next row `future` — logged, un-advanceable, unrecoverable without a relaunch. Built the owner's fix: writes leave the interaction path entirely. Pure model `lib/logging/queue.ts` (FIFO, per-cell coalescing, capped backoff, park-never-drop, storage codec) + runtime `components/logging/SetLogQueueProvider.tsx` (localStorage, one serial processor, online/visibility flush) mounted in the `(app)` layout; the day view folds the queue's overlay into the set-state derivation, so the active set advances off the TAP. Queues log/amend/planned-weight (all idempotent); unlog + delete stay foreground. Completion still gates on server truth (`SAVING THE LAST SETS…`) because completing locks the session. **Reverses hard rule 9 for writes** — recorded in CLAUDE.md, 01 §F3, 02 §A5, 07. **Residual → T-N68a:** offline READS are still out (R7's no-stale-cache decision stands), so a cold start with no connection can't render the day view. | B→F | HIGH | E | **done (PR #215)** |
| N69 | **Sliders should only move when dragged from the orange tab** (owner, 2026-07-31, Batch 28). "Clicking elsewhere on the scale should not move them, as this leads to unintentional slider movement when attempting to scroll." Confirmed: `SnapSlider` put `onPointerDown`/`onPointerMove` + `touch-none` on the whole 44px track, so any touch on the scale both set the value and swallowed the scroll gesture — and the feedback sheets (fig 1.4) are scrolling surfaces. Now only the thumb starts a drag (pointer capture on a transparent 44px wrapper around the 20×28 accent block, `touch-none` on it alone); the track ignores pointers and scrolls the page. Keyboard control unchanged. | B/UX | MED | E | **done (PR #215)** |
| N70 | **Exercise-level RIR — temporary per-exercise effort/load management** (owner, 2026-07-31, Batches 30/30b/30c). Origin: a live lumbar-nerve episode — a coach-agreed rehab plan had nowhere to live. *Direction 1 (coach-authored prescription overrides) **CLOSED** per A8* — [`reviews/2026-07-31-coach-override-prescriptions.md`](../reviews/2026-07-31-coach-override-prescriptions.md), kept as history; its findings went to doc 21 §5/§8 except the substitution cliff → **N72**. *Direction 2 (**LIVE**): per day-slot × exercise target RIR, per week.* Assessment [`reviews/2026-07-31-exercise-level-rir.md`](../reviews/2026-07-31-exercise-level-rir.md) → **owner decided A1–A8 (2026-07-31)** → authoritative build spec **[`docs/21-exercise-level-rir.md`](../21-exercise-level-rir.md)** (6 phases, §10). Settled: **absolute** semantics (set wins, unset yields to the ramp — floor semantics rejected as extra parameters); **repricing needs no special case** (Batch 28d — thread the resolved RIR through the existing rep-window path; it already prices load *from* reps+RIR and re-clamps to the window, so "265 for 1 rep" cannot occur, and it generalises symmetrically to *lowering* RIR for more effort — the earlier forced-centering rule was rejected and is retracted); **prescription RIR unbounded** (DB check widened 0–8 → 0–30) so one lever spans deload → rehab → extra effort, guarded by a new **measuring band** (`max_measuring_rir`, default 8: past it a set is priced normally but is not a measurement — e1rm null, dropped from the anchor and strength views, kept in volume; the anchor freezes rather than drifting on fiction); grain = `meso_exercises` + per-week array (mirroring `mesocycles.rir_schedule` incl. orphan-clearing); a **per-exercise set cap** ships too (MCP-first, minimal UI); earn-gate predicate + miss-throttle parity; `reason` column; RIR ceiling **unbounded** (the earlier "stays 8" is retracted). Two numbers corrected in the owner's favour: the assessment's "−14.6 % at RIR 8" was one policy point, not the lever's range — priced against a genuine 0-RIR ask, RIR 8 delivers **−16 % to −22 %** depending on rep position; and the owner's own worked example (265×9 @ 0 RIR → 8 RIR) prices at **219 lb × 9** against their estimate of ~215, so the intuition matched the engine. Four confirmations open in doc 21 §9 (volume counting; capture ergonomics; the `max_measuring_rir` default; how to display an out-of-band RIR). Relates: **N71** (Phase 1), **N38** (absorbed by Phase 1), **N72** (out of scope), N39 (redundant under an assignment), N18-B, N25 (RIR copy), doc 14 §7, doc 16 §3.4, doc 19 | F | HIGH | P | **done** — spec'd (PR #211); **Phase 1 done (PR #216)** (the RIR premise, N71/N38 — see those rows); **Phases 2 + 2b done (PR #218)** — the plan columns + absolute resolution (`queries/slot-effort.ts`, run after `liveWeekRirUpdates`), repricing as ONE substitution at the pricing entry point with no new branch (§4.2 golden reproduced to the decimal), the `exercise_rir` earn-gate predicate (miss-throttle parity falls out of its placement, asserted not re-coded), doc-14 wiring that is byte-identical when unassigned, plus the measuring band (`max_measuring_rir`, v24 INACTIVE) and a fix to `v_exercise_prs`, the one strength view that still re-computed e1RM off `coalesce(rir_reported, 0)` and so had kept the N71 defect Phase 1 closed everywhere else. **Phase 3 done (PR #219)** — the MCP write surface: `set_exercise_rir` / `set_exercise_sets` on `edit_mesocycle` (four value forms per lever — flat, flat + weeks, explicit schedule, clear — plus `reason`), two pure planning layers so a mixed structural + effort call can never half-apply, week-precise refusal on already-trained weeks (a *named* week is refused, a flat value warns which weeks it can no longer change), §4.1 warnings for an assignment below the week's ramp or reaching the deload week, and present-only read disclosure on `get_mesocycle` + `get_current_state`. It also fixed a defect Phase 2 left live: **`save_meso_plan`'s wholesale replace would have wiped every assignment in the meso on a plain reorder** — `saveMesoPlan` now snapshots and re-keys them by day-slot × exercise. **The lever is now writable over MCP; the app UI is still Phase 6.** **Phase 4 done (PR #221)** — the set lever bites and the rep-position knob ships: `cappedSets` clamps the prescribed sets at the boundary of BOTH prescription routes (one site, outside the doc-16 progression wrapper — sets play no part in the earn gate), as a **ceiling only** and **absolute** (an authored cap of 1 wins over `min_sets`; raising sets stays `set_baseline_sets`' job); `rep_position` (`bottom|center|top` or an explicit rep count, one flat text column, no per-week schedule) replaces the Option-A climb schedule's rep choice for that slot at the three sites that pick one, so "reprice at the top of the window" is a deeper cut at the same RIR — the useful half of the retracted centering rule, still a knob; both levers get their own omitted-when-unassigned fingerprint key (and their own explicit key-drop on recompute); a third MCP op `set_exercise_rep_position` that **refuses** weeks/schedule rather than ignoring them; and `get_current_state` stops describing a cap-only slot as "running at an assigned RIR". **Phase 5 done (PR #223)** — the stats policy: one intent key (`isBackedOffSlot`, mirrored in SQL as `workout_exercises.target_rir > microcycles.target_rir` — the *realized* form of `resolvedRir > weekRir`, which hard rule 5 makes a permanent record of what was actually trained), keyed on plan INTENT rather than measured confidence (which degrades with effective reps and would drop honest high-rep work) and deliberately NOT symmetric (a slot run harder keeps every claim it earns). Backed-off sessions leave the e1RM trend, `best_e1rm`, both PR views and BOTH sides of the meso PR scan; they stay in volume/adherence with a fractionally-weighted `logged_backed_off_sets` disclosure (§9.1) and stay visible in history with their numbers plus a `BACKED OFF` tag. Read-side only — unlike §6.1's band it changes no stamp, so there is no backfill: the band asks *is this a measurement*, §6.2 asks *is it comparable*. A comparability sentence travels with every rollup (both Performance tabs, `get_mesocycle_summary`, `get_macrocycle_summary`, a `compare_mesocycles` warning, per-week volume disclosure), omitted-not-zeroed when nothing is assigned. Also closed the last N71 corner: `analyze_exercise_progress`'s session series still passed `rir_reported` raw into `estimateE1rm`. Flagged for the owner rather than decided: `logged_hard_sets` (doc 10 §2's RIR ≤ 4 stimulus rule) is a different filter, so a back-off reported past RIR 4 leaves the hard-set count — and Phase 1's write surface means the "unreported counts" clause rarely applies now (doc 10 §9). **Phase 6 done (PR #224) — the item CLOSES, all six phases shipped.** The lever reaches the app: one pure display module (`slot-effort-display.ts`) owns the eyebrow suffix, the §9.4 band phrase and the disclosure sentences, so the day view, the planned-day page and the editor sheet cannot drift into three vocabularies (and `hasEffortDisclosure` is where "unassigned reads exactly as before" is *enforced*). **§9.4 settled as the qualitative band, DISPLAY only** — past `max_measuring_rir` the ask reads "each kept well short of failure" and the planner meta reads `LIGHT`, while the Engine audit sheet still prints `171 × 9 @ 21 RIR` and nothing about pricing or the trace changes. **The authored effort level leads the why** (above every engine-authored line), which suppresses the delta's "easier effort target" clause when an assignment rather than the ramp moved the RIR, suppresses the week frame, and *replaces* the deload boilerplate on a deload — a person chose this effort and no layer may imply the program did. **A defect this phase surfaced and fixed:** §4.3's unbounded ask (0–30) against `rir_reported`'s 0–10 meant Phase 1's pre-fill would have printed `21` into a box labelled RIR; it now returns null past the reportable range (still a no-op default, and a real report at 8 still makes the set a measurement). **Two write surfaces, one authoring policy** — `planEffortEdits` + `loadEffortContext` moved into `queries/slot-effort.ts` (re-exported from the MCP tool) and the new `setSlotEffortAction` runs the same planner; the sheet's three scopes OVERLAY the slot's per-week map rather than replacing it, so nudging one week can't drop another, and a §4.1 warning holds the sheet open under `SAVED — NOTE` instead of closing over it. **doc 19:** `effort_assignment` is projected from the RECORDED decision's `exerciseRir`/`exerciseSetCap`/`exerciseRepPosition` (so an explanation describes the assignment that priced *that* decision, not today's plan); only the reason is looked up, and it is dropped when one exercise carries two different reasons in a meso. Deliberately not touched: `PlannerBoard.tsx`, a staged-draft surface for plan STRUCTURE — the week-scoped planned-day page is where a per-week assignment can be shown truthfully |
| N72 | **Bounded exercise substitution + the `LOOKBACK_WEEKS = 2` return cliff** (spun out 2026-07-31 when N70 direction 1 closed; `F`, MED). The one clause exercise-level RIR cannot express: "stop deadlifts for two weeks, do RDLs instead, then come back". Today a **single-session** swap exists (`replaceWorkoutExercise` → `queries/slot-prescription.ts`) and a **plan-wide, all-future-weeks** swap exists (`edit_mesocycle { op: "swap_exercise" }`) — but nothing bounded to a window. Worse, the return is mis-priced past two weeks: `LOOKBACK_WEEKS = 2` (`queries/slot-prescription.ts:70`) means a 3-week substitution brings the original back as a **cold seed off the prior peak** (`v_exercise_prs`) — the worst direction after an injury. Only written record of the failure mode: [`reviews/2026-07-31-coach-override-prescriptions.md`](../reviews/2026-07-31-coach-override-prescriptions.md) §4.4 (closed doc, kept for this). Options framed there: extend the lookback while a substitution is active, or (recommended) require the return to be prescribed rather than inferred. Any MCP surface inherits that doc's §5/§6 constraints (no separate coach principal; reduce-only bounds). Relates: N33 (the lookback's origin), N70 | F | MED | P | **triaged** — deferred until doc 21 lands; revisit if a real substitution runs past 2 weeks |
| N73 | **Set-logging queue ping-pong + discarded RIR edits** (owner, 2026-08-02, Batch 31, HIGH — regressions introduced by N68's queue). Two symptoms, one root cause. (1) *"More often than not"*: a logged set fills, advances to set 2, then **reverses for about a second** — set 1 unlogged and active again — before snapping forward once more. (2) On the last set of an exercise, the set flickered back to unlogged and a **modified RIR was repeatedly discarded**, reset to the prescribed value; it took several attempts to get the edit to stick. Root cause: the queue retired an op's optimistic overlay on **dispatch success** and *then* called `router.refresh()`, so every set had a window — one revalidation round-trip — with the overlay already gone and the server render not yet committed. The row fell back to server state that did not yet contain the set: box un-ticks, active set walks backwards. The RIR loss is the same window with an edit in it — the row went editable mid-flight, and the arriving render remounted it (key carries `logged.id`) or resynced it via `adoptServerRowState("own-logged-set", …)`, which adopted unconditionally *and* cleared the dirty flag, so the next blur had nothing left to re-send. Racing revalidations made it intermittent (a refresh fetched before a later write landed could commit after it settled). Fix = **the echo rule**: a landed write moves to `acked` and keeps its overlay until a rendered server row *contains* it (`reconcile`, fed the day view's rows on every render); amends match on **content**, so a stale pre-amend render is held rather than adopted; `adoptServerRowState` gains a `writeOutstanding` veto; one coalesced debounced `router.refresh()` replaces one-per-op. Relates: N68 (the queue this refines), N12 (the original hang), R13/N13 (the resync rule amended) | B | HIGH | J | **done (PR #220)** |

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
| T-N68a | N68 | Offline READS: a cold start with no connection can't render the day view (R7 keeps RSC/document responses uncached on purpose). Needs a deliberate design — cache the active day's payload with an explicit staleness marker, or accept the limit — before any "log a whole session offline from a cold start" claim. | D | **triaged** — scoped in N68's build; owner call needed on whether stale-read risk is acceptable |
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

### Batch 19 — deadlift prescription mismatch report (2026-07-19, in-session)

> "Please look at my next deadlift session prescription it does not match what
> is shown on screen. Please assess and address."

*(Attached: day-view screenshot — W2·D4, SAT 18 JUL, "JULY '26 - BULK
(CHEST/BACK FOCUS)", TARGET 2 RIR; Deadlift [barbell, 01 — GLUTES] 250 lb × 8
× 3 unlogged; Leg Press [machine, 02 — QUADS] 270 × 8 × 3; Leg Extension below
the fold. → N56.)*

### Batch 20 — prescription presentation rework + LLM explanation spec (2026-07-19, in-session, after #193 merged)

> "Regarding day-view visibility for paced decisions, it ties into what I'd
> like you to work on next:
>
> The prescription details panel—and the way prescriptions are presented in
> general—needs a deep clean and reorganization. We've piled a lot into the
> details, and it's become kind of a mess. Much of that information has been
> necessary for auditability, and I want to retain it for that purpose, though
> it should be better organized and presented. At the same time, we should
> introduce a more helpful, user-friendly view. What we have now feels more
> like a debugging panel than a useful prescription detail.
>
> We should have a clearer, more explanatory prescription presentation. Right
> now, the user-facing side reads as too technical, and it's not always
> obvious what the prescription means. The details panel doesn't help much
> either.
>
> What I'd like is a prescription quick-read and details panel that is much
> more user-friendly, along with a subtle way for me to drill into the
> debugging panel for more technical information. This dovetails with the
> LLM-based prescription explanation idea: generating a brief but more
> informative summary of the user's current prescription.
>
> In fact, I would like you to work on a deterministic rework of the more user
> friendly version of prescription presentation, along with revamping the
> current details panel into a debug panel, that we can deploy now. Consider
> both the composition of the prescription description, as well as *how* it's
> presented to the user (off the top of my head, perhaps it should be easily
> toggleable via a button next to the notes button, which would reveal the
> prescription in a similar style/position as how notes are displayed.)
>
> In addition to this, I want you to actually document out the LLM version of
> the prescription explanation generation. I want you to spec out the details
> and considerations that we need to make in order to make the generations as
> cheap as possible; character count limits, what data should be included so
> that the LLM can produce a good contextual explanation while being budget
> conscious and efficient? Does tooling already exist in the MCP that can be
> reused to deliver it? I think i want to do this via the openAI api using the
> luna model, so spec the implementation plan and how we'd go about it. I want
> an estimate of what it would cost per generation, and what my estimated
> total costs might be given the current volume of prescriptions generated.
>
> I want to build the deterministic version now, and spec the LLM version. If
> we implement the LLM version, we will just drop in the LLM generated version
> instead of the deterministic one." *[→ N57 (deterministic build) + N58 (LLM
> spec → build); PH30 superseded by N58.]*

#### Batch 20 addendum — owner review tweaks on the built PR (2026-07-19, in-chat; supersedes a truncated first send)

> "Both the update and the doc looks good. Could of little tweaks and notes to
> update before I merge this.
>
> * Let's kill the engine audit link via the prescription. Just leave this in
> the menu.
> * This comment relates to both the existing deterministic prescription read,
> and the LLM generation (perhaps v2):
>    * A primary purpose of the prescription explanation is answer both *what*
> and *why* the prescription is what it is. If reps are held from the pacer, or
> backed down from feedback like joint pain or fatigue, or because you simple
> didn't hit the target last week, it should let the user know why, keeping in
> mind there might be more than one contributing factor to the results. It
> seems possible that the LLM version may be better suited to this task, but
> the deterministic one should endeavor to do this also.
>    * For the LLM generation, I do see these generations as being a natural
> place to marry some of the coaching aspects from the MCP with the
> prescriptions. It should, of course, still provide the hard targets and
> information, but there is area for a little bit of coaching there too since
> it can take in some of the additional data like user notes and commentary,
> feedback, and aspects of the progression history like plateaus or other
> relevant trends, to give a little bit of both the explaination of why you're
> being asked to do what you're being asked today, and maybe a little bit of
> focus direction for the user based on what's been going on. Think of a kind
> of a mike mentzer sort of scientific coaching personality to keep you
> informed, focused, and on track. It still needs to be short, of course, but I
> think all of this can be done in a brief but useful little blurb. Go ahead
> and add this to the plan for a v2, after we get the MVP / proof of concept
> under our belts with v1.
>
> Go ahead and add this to PR194 and ill be ready to merge it then"
> *[→ folded into N57 (strip link removed; multi-factor why built) and N58
> (doc 18 §1 what+why requirement + §10 v2 coaching layer).]*

### Batch 21 — stored e1RM never restamped past v11 (2026-07-21, in-session)

> "It looks like the stored e1RM values for sessions have not been restamped
> after we made the corrected param v11 introduced brzycki_max_eff_reps: 10. I
> believe the issue was that we did not implement the restamp policy for param
> versions until much later than v11, and the restamp policy itself only
> restamps if the new param version results in a different e1RM from the
> *previous* param version, not if it differs from the *stored* e1RM. Since we
> were already several versions advanced by the time we implemented this policy,
> there was no change in the previous version, so its not restamped, allowing
> the pre v11 stamps to persist indefinitely.
>
> The current policy will technically work, we just need to back fill update the
> existing e1rms to catch up, then the existing policy will always catch it
> going forward. This needs to be done on the db for all users.
>
> I'm not sure it's feasible to get a proper diff on the change like we do via
> the mcp tooling, but if possible it would like it. It needs to be updated
> regardless, but it would be nice to have some visibility into the effects it
> had on strength metrics"
> *[→ N59: root cause confirmed (T-N33's `e1rmBlockChanged` compares consecutive
> activations, and the `e1rm` block has been byte-identical v11→v25, so the hook
> never re-fired). One-time catch-up backfill built + applied to prod; diff
> captured. Policy left as-is per the owner — it suffices once caught up.]*

### Batch 22 — prescription explanation v3: deterministic + LLM layers (2026-07-23, in-session, document handed over)

> "I have some thought's regarding the next version of prescriptions
> explaination, which should probably incorporate both a deterministic and LLM
> layer to leverage their respective strengths appropriately. This document is
> not perfect, but its in the direction.
>
> Review the document, and write up a thorough assessment and plan for
> implementation of this. Connect the dots on how to thread this together.
> There are nuances i don't entirely agree with in this doc, so you're allowed
> to modify and thread this together better if needed, but i think you will get
> the general idea of where i'm trying to go with v3 here. Write up the doc of
> what you think needs to happen and a simple implementation plan of what needs
> to be done to accomplish it."
> *(Accompanied by the full review document
> "LLM_Coaching_Assessment_Reviewed.md", preserved verbatim in
> [`docs/reviews/2026-07-23-llm-coaching-assessment-owner.md`](../reviews/2026-07-23-llm-coaching-assessment-owner.md).)*
> *[→ N60: reconciled build spec written —
> [`docs/19-prescription-explanation-v3.md`](../19-prescription-explanation-v3.md).]*

### Batch 23 — editable coaching prompt via MCP (2026-07-24, in-session)

> "Could we build tools to edit and update the system prompt for the llm
> decision explanations via mcp? That would be very useful if so."
> *[→ N61: shipped — `coaching_prompts` table + admin MCP tools
> (propose/activate/discard/get), generation resolves the active DB prompt with
> the code constant as the permanent fallback. Doc-18 §10 addendum.]*

### Batch 24 — LLM payload + prompt-loop updates (2026-07-24, in-session)

> "Please address the following updates to the llm prescription explainations
> and related mcp layers:
> • The LLM should receive basic information about the user's macrocycle goal,
> if available, to provide added context and insight to coaching.
> • The payload needs to distinguish the upcoming prescription context from the
> session that produced `previous_work` and the note. Add a `previous_week` or
> `source_session` object containing the prior session's week number, target
> RIR, and deload status, while keeping `week` for the upcoming prescription.
> The note should explicitly reference that source session so the coaching layer
> does not treat a 1 RIR note as if it occurred during the upcoming 0 RIR peak
> week. This removes temporal ambiguity without changing the existing
> prescription fields.
> • MCP tools should allow the ability to preview and test new system prompt
> revisions without having to activate the prompt to live."
> *[→ N62: shipped — doc 19 §12 (source_session + macro goal in the facts
> payload, prompt v5, prompt_version/prompt_body override + preview=true across
> both LLM admin tools).]*

### Batch 25 — deterministic explanation language + full-note formatting (2026-07-24, in-session)

> "I want to rework the deterministic prescription explanation language to be
> better, and more consistent with the character/language/tone/terminology
> represented within the coaching later. Review those rules and let's try to
> present these in a more useful way.
>
> The prescription statement itself is ok.
>
> Consider also the overall formatting of the full prescription not (the
> deterministic prescription statement, the deterministic prescription
> explanation, and the coaching layer if applicable). All need to be nicely fit
> and formatted together so that we have a clear, pleasant and easy presentation
> of all information for the user."
> *[→ N63: shipped — doc 19 §13 (the copy system, the paced-governor and
> ramp-clarifier accuracy fixes, the program-intent line, live effort honesty)
> + doc 09 2026-07-24 entry (the strip's three-layer hierarchy + the COACH
> line).]*

### Batch 26 — mesocycle editing + sharing bugs (2026-07-25, in-session)

> "Hey I found an issue that I need you to sus out and fix. The issue is around
> the editing and sharing of programs.
>
> Firstly, it appears that there are circumstances in which a user can make a
> mesocycle and have the exercise order in the day view be mismatched from the
> exercise order in the cycles view. They should always match. If it's changed
> view the day view or via mcp, both views should agree.
>
> Secondly, when a user creates a mesocycle and then edits it in certain ways
> such as reordering the workout days, or potentially editing or reordering
> exercises within days, and then shares the meso with another user, the second
> user doesn't get the meso with the changes that were made prior to sending. We
> need to make sure that share codes capture the shared mesocycle's state when
> it is shared and that the second user receives it that way."
> *[→ N64 (order, both directions + the copy path) and N65 (share snapshot);
> shipped together in PR #208. Day reordering itself (`meso_days.weekday`) was
> verified already carried by the copy — the losses were the day-view-originated
> exercise edits, which never reached the plan, and the live-read redemption.]*

### Batch 27 — MEASURE companion app (2026-07-25, in-session)

> "I want to plan a new companion app to workout: measure
>
> The app will utilize the same infrastructure, design, db, mcp, etc as workout,
> with a new dedicated front end. The purpose of this app is to host all aspects
> related to body measurements, including body weight tracking, physical body
> measurements (circumferences etc), dexa scan integration, data import/export.
>
> Bodyweight tracking will support logging, log books with rolling
> averages/change rates, summary and statistics, weekly/monthly/yearly reports,
> with a suite of settings supporting data smoothing methods and rolling
> duration periods.
>
> A summary page will integrate all measurement data to provide an intuitive but
> comprehensive picture of body measurements and progress. The app, sharing
> infrastructure, will integrate seamlessly with the workout app to serve as the
> measurement and goal tracking component of the application suite, pulling in
> key components for macro cycle overviews etc, but cross linking to the
> measurements app for clean dedicated workflows, letting each app focus on what
> each does best.
>
> I haven't worked out every aspect of the new app or every detail of the
> architecture yet - that's what I want your help with. Begin mapping out this
> potential, opportunities, best architecture, and how we could leverage this
> idea for the best possible result. Document the direction as we begin to bring
> the concept into focus"
> *[→ N66; direction doc `docs/20-measure-companion-app.md`, new workstream Q.
> Eight owner decisions collected in its §13 — the item is `needs-input` until
> those land, and Phase 0 (mockup pass) gates all build work per hard rule 8.]*

### Batch 29 — MEASURE review round 1 (2026-07-31, in-session)

> "Alright, I've read through the Measure companion document, and overall it
> looks pretty good. I'm fine with using a single authentication system for both
> apps. They don't need to be separate right now, but we should architect them so
> they can be separated later without an unreasonable amount of work.
>
> Here are some thoughts, along with a few areas I don't fully have my head
> wrapped around:
>
> 1. The app needs to make weight logging as quick as possible, since that will
> be the most frequent action. Users should be able to log a weight directly from
> the app. I'd also like to explore faster alternatives, such as an Apple
> Shortcut.
> 2. The ability to push weight data to Apple Health by some means would also be
> highly valuable, even if it requires a manual sync button or shortcut.
> 3. I currently use Happy Scale, so I could export data from there and sync it.
> Happy Scale also supports Dropbox sync, which we may be able to incorporate. It
> would be beneficial for the two apps to work well together.
> 4. The biggest question for me is how to combine all three measurement
> sources—weight, tape measurements, and DEXA scans—to understand progress in the
> most useful way, and how or whether that information should be distilled and
> passed along to the workout app.
>
> These are three related but independent measurement types. How do we bring them
> together in a useful way to assess progress? Do they combine meaningfully at
> all, or are they separate, non-correlatable metrics that should be evaluated
> independently? I'm not sure yet.
> We need a clear picture of how the data will be used, how the different
> measurements relate to one another, how they connect to goals, and how they
> should influence the workout app. One principle I want to follow is that all
> metrics should be transparent. Users should clearly understand what they are
> looking at rather than having to trust opaque calculations or interpretations.
>
> 5. As I've mentioned, I currently use Happy Scale, and I'd like to replicate
> many of the app's most useful features."
> *[→ N66, doc 20 revised 2026-07-31. Topology confirmed (§3.2) with the
> separation-readiness list (§3.4); transparency added as binding principle 7;
> new §4 capture (token API + Shortcuts) and §4.5 Apple Health bus (which also
> resolves items 2 and 3 and removes Dropbox from the critical path); new §5
> three-source synthesis with the tier model + corroboration matrix + the
> four-item seam payload; new §9 Happy Scale parity table. Nine decisions remain
> open in §17.]*

### Batch 28 — increment indexing, logging queue, slider drag (2026-07-31)

> "1. When an exercise increment is set, it should index from the last weight the
> user entered. If the increment is 10 lb and the user enters 88, the next
> increment up should be 98, not 90, and the next increment down should be 78,
> not 80.
>
> 2. I think we need to implement a background set-logging queue process. We're
> having issues with stale set-logging hang-ups. The set gets logged and the
> checkbox fills, but the active set does not move forward. It gets stuck in an
> in-between state where the next set can't be logged, forcing the user to quit
> and restart the app.
>
> My thought is that a background or offline queue, processed separately from the
> user interface, would prevent these hang-ups from being visible to the user.
> Logging could continue in the background without delaying the user or leaving
> them stuck when the proper response is not received or the app cannot connect.
> This would also enable offline logging.
>
> 3. Sliders should only move when dragged from the orange tab. Clicking elsewhere
> on the scale should not move them, as this leads to unintentional slider
> movement when attempting to scroll."
> *[→ N67, N68 (+ T-N68a), N69; all three built in PR #215. N68 reverses hard
> rule 9 for the write path — recorded in CLAUDE.md and docs 01/02/07.]*

### Batch 30 — coach-authored prescription overrides (2026-07-31, session task)

> "Here is a tool idea that needs careful consideration but could provide
> significant value: an MCP path that allows the coach to manually override or
> create prescriptions for individual exercises, training days, or weeks. This
> would include setting exercises, weights, reps, and sets, along with a
> documented reason, note, and any other relevant context.
>
> The use case became clear while I was dealing with pain that may require a
> temporary rehabilitation period. I am currently experiencing lumbar nerve
> symptoms, possibly related to recent hard deadlift work. In discussion with my
> LLM coach through MCP, the recommendation was to modify my workload for the
> next week or so by temporarily stopping deadlifts, reducing the workload of
> related exercises, and substituting safer alternatives. After discussing and
> accepting this plan, it would naturally be useful to allow the coach to make
> these changes so they could be followed precisely, but no such tools are
> available
>
> Any implementation would need to ensure that coach-created or overridden
> prescriptions are clearly identified as such. The prescribed values, reasoning,
> duration, author, and subsequent changes should all be retained for
> auditability. We would also need a clear definition of how these prescriptions
> interact with the underlying progression engine.
>
> Thinking through the current behavior, the engine already handles misses and
> underperformance reasonably well. In this situation, I could ignore the normal
> prescription and perform a lighter weight or lower-rep variation manually. The
> engine would record the difference as a substantial miss, hold progression, and
> potentially reduce the weight anchor based on the apparent underperformance.
> This would move the exercise backward temporarily and require additional time
> to ramp up again, which is generally appropriate following pain or injury.
>
> The missing piece is that I currently have to improvise the temporary weight,
> rep, set, and exercise changes myself. There is no structured way to prescribe
> something specific, such as a 20% reduction in load, a targeted reduction in
> volume, or a temporary substitution for one week. This is an area where current
> LLM capabilities could be useful. The coach could provide measured, organized
> rehabilitation-oriented modifications based on a broader base of knowledge than
> the user may have, rather than leaving the user to adjust the program without
> much direction.
>
> My current thought is that a coach override could:
>
> * Temporarily modify an exercise, day, or week without changing the remainder
> of the cycle.
> * Replace an exercise for a defined period rather than replacing it for every
> recurrence in the cycle.
> * Populate the complete prescription, including exercise, weight, reps, sets,
> and relevant constraints.
> * Record the reason, expected duration, and criteria for returning to the
> normal prescription.
> * Clearly distinguish coach-created prescriptions from prescriptions generated
> by the engine.
> * Preserve a complete audit trail of the original prescription, the override,
> and the actual performance.
>
> The more difficult question is how the engine should interpret the result. One
> option is for coach overrides to remain separate from the engine's
> decision-making. The engine would continue evaluating performance against its
> original prescription, meaning the temporary rehabilitation work would still
> appear internally as missed or reduced performance. When the override ends, the
> engine would therefore retain an appropriately conservative view of the user's
> recent capacity rather than assuming that the coach-prescribed work
> demonstrated normal readiness.
>
> This is preferable to allowing temporary coach prescriptions to overwrite the
> engine's underlying performance history, which would violate a number of core
> app principles. The override would guide what the user should do in the short
> term, while the engine would continue maintaining a cautious progression state
> based on the fact that the normal work was not completed. Coach override via
> mcp would remain the only route to such changed.
>
> Raise any questions or concerns you have in a review doc to the repo before we
> implement."
> *[→ N70; review doc `docs/reviews/2026-07-31-coach-override-prescriptions.md`,
> workstream P. The "engine stays separate" premise is corrected in §2 (five
> couplings carry the work in regardless); eight owner decisions collected in
> §13 — the item is `needs-input` until those land, and a doc-21 spec gates any
> build.]*

### Batch 28b — exercise-level RIR assignment (2026-07-31, session task)

> "Hey, okay—I spent some time thinking about this. The direction we explored
> above is messy and represents a large paradigm shift. However, I thought of an
> alternative that may be far simpler while addressing the same core issue:
> exercise-level RIR assignment.
>
> If coaches—and users, somewhere in the UI without overcomplicating it—had
> access to exercise-level RIR assignments and could modify them within a
> program, they would be able to manage the effort level of each exercise
> independently using the existing RIR framework and metric population.
>
> At least from my initial perspective, this would resolve some of the
> metric-driven issues around strength measurements. Sets would be correctly
> recorded as high RIR, so they would not suggest to the strength metrics that a
> genuine decline in strength had occurred or substantially muddy progress.
> Instead, the system would understand that the sets were intentionally high RIR
> due to rehabilitation, coaching, or programming considerations, which could
> also be documented in the exercise notes.
>
> This would also solve the timeframe issues created by the idea of "taking it
> light for the next few weeks," since RIR could be set directly for each
> exercise and week. It would not automatically carry across mesocycle
> boundaries, but it could easily be programmed into the next mesocycle as well,
> so that seems like a non-issue.
>
> Please create a new document assessing this direction and mark the previous
> review as obsolete for the time being."
> *[→ N70 direction 2 (the override review is PARKED, not deleted — its §2/§4.4
> findings still bind); assessment
> `docs/reviews/2026-07-31-exercise-level-rir.md`. Spawned **N71** — the stats
> stamp ignores prescribed RIR, which blocks this direction's headline benefit.
> Eight owner decisions in the assessment §9.]*

### Batch 28c — owner notes + decisions on the RIR assessment (2026-07-31, session task)

> "Here are my notes on this review are below. Let's log and finalize them, and
> then I will begin the phased implementation once completed in a new session:
>
> 1. I'm not sure whether displaying per-set e1RM was intentional at the time—it
> may have been—but I think it's time to change this so that logged sets write
> `rir_reported`, while the stats surfaces read RIR and report on effective reps.
> This is a more appropriate representation of the athlete's actual strength, at
> least under the assumption that they perform prescriptions honestly.
> I also think we should update the RIR information copy to explain and emphasize
> that users should always report their effort honestly, regardless of the
> prescription. Prescriptions are suggestions: always estimate your effort as
> honestly as possible and perform reps according to your best estimate of your
> actual reps in reserve, even when that differs from the prescription.
> 2. Perhaps we should show `rir_reported` in the exercise history view for
> logged sessions.
> 3. I understand that the coach or athlete modifying the RIR lever does not
> inherently change the load. What I'm proposing is a repricing policy that sets
> the floor reps and reprices the load to meet the new RIR-adjusted effort. This
> is similar to the current mechanics that set ceiling reps and reprice the
> weight upward and reps downward when the user progresses beyond the top of the
> rep-range window.
> This would also address other mechanical issues that could arise if, for
> example, a prescription requested 9 RIR while otherwise asking for 8 reps.
> These would be the same mechanics used for a deload, because a deload is
> effectively what we are performing in this scenario—just at the exercise level.
> This may already be what you intended, but it is worth stating explicitly.
> If there is a database ceiling of 8 for RIR, we should consider whether that
> remains appropriate given this expanded use case. These deload mechanics would
> apply not only to fatigue-management programs, but also to rehabilitation. If 8
> is still an appropriate cap, that's fine. I don't have a strong view, but we
> should think it through.
> 4. Regarding floor versus absolute behavior for deloads, I'm not sure I fully
> understand your descriptions of the two. Absolute seems like the desired
> solution to me. Per-exercise RIR takes control when set; when it is no longer
> specified, the configured RIR ramp reasserts control. This provides specific
> control over the return ramp, which is desirable. The floor semantics sound
> like unnecessary additional parameters to me.
>
> Owner decisions:
>
> A1: Yes. Let's write `rir_reported` per set and implement it as described above.
> A2: Absolute only.
> A3: Yes, per day-slot × exercise.
> A4: Yes, a set-level lever is perfectly fine with me. My only hesitation is
> that I don't want to overcomplicate the UI for users. I want to keep it as
> clear and straightforward as possible, but I'm comfortable with it—especially
> through MCP, which is probably how I'll personally use it most of the time.
> A5: My intuition is to include only true "working sets" in stats. High-RIR or
> low-confidence sets are not really working sets; they're performed for other
> reasons, such as fatigue management or rehabilitation. Excluding them seems
> appropriate to me.
> A6: Yes.
> A7: Sure, yes.
> A8: Close it."
> *[→ N70 decided; build spec `docs/21-exercise-level-rir.md` (6 phases). A1
> widened N71 into full per-set RIR capture and absorbed N38; A8 closed the
> override review and spun out N72. Two corrections recorded in the spec: "floor
> reps" would price the backed-off load *heavier* (fewer effective reps ⇒ higher
> weight), so the policy is the deload's window-**centered** reps (§4.2); and the
> RIR ceiling stays 8 because even RIR 8 is only −14.6 % load. A5 adopted
> narrowed — exclude on prescription *intent* rather than measured confidence
> (which would drop legitimate high-rep work), from strength surfaces but not
> volume; flagged for confirmation in doc 21 §9.1.]*

### Batch 28d — owner pushback on the repricing policy + the RIR ceiling (2026-07-31, session task)

> "Okay, I don't know that I agree with you or your approach regarding 4.2.
>
> First, forcing the logic to always center reps whenever RIR is overridden makes
> assumptions that are too inflexible and not generalized well enough to make
> this a useful tool. For instance, what if a user wanted to specify a *decrease*
> in RIR to request more effort from a particular muscle group that they felt
> could adequately recover and would benefit from the additional stimulus? Under
> this force-fit logic, doing so would always center reps. Tools should endeavor
> to generalize as broadly as possible.
>
> Likewise, I don't really understand what you mean by "flooring reps would make
> the backed-off prescription heavier." If I ask for lower effort through higher
> RIR and reprice the weight so the prescription remains within the rep window, I
> don't understand why the weight would increase or be bounded at -14.6%. I'm not
> saying to pin reps to the bottom of the window. I'm saying to reprice the weight
> so the prescription remains within the window. I don't understand why that would
> not work.
>
> For example, say a deadlift prescription is 265 pounds for 9 reps at 0 RIR, and
> we modify it to request 8 RIR. We would not want to prescribe 265 pounds for 1
> rep because that would fall below the rep window. Instead, we might reprice it
> to something like 215 pounds for 8 reps at 8 RIR, although I have not done the
> math.
>
> Or perhaps that is not light enough for rehabilitation, and we want to reduce
> the load by 50%. In that case, we may need to raise the RIR ceiling
> substantially. That might produce a seemingly ridiculous value, perhaps 20 RIR,
> which is not something an athlete could realistically estimate. In practice,
> though, it would simply represent a large reduction in effort, with the implied
> RIR derived by reversing the same math. I view that as fundamentally the same
> thing.
>
> The benefit of this methodology is that it generalizes from deloads to
> rehabilitation and even to increased effort under the same rule. That is what I
> am trying to achieve. Is that not possible here?"
> *[→ N70; **owner right on both points, doc 21 §4.2 rewritten and §4.3 added.**
> (1) The forced-centering rule is retracted — it was a special case that would
> have reset the rep schedule on a *decrease* in RIR too. (2) The owner's
> repricing proposal **is already the engine's mechanism**: the rep-window path
> prices load *from* reps and RIR and re-clamps reps to the window, so threading
> the resolved RIR through the three existing sites generalises with no branch.
> The "-14.6 %" was a single policy point, not a bound: priced against a real
> 0-RIR ask, RIR 8 gives −16 % to −22 %, and the owner's 265×9 example prices at
> 219 lb × 9 vs their ~215 estimate. (3) The unbounded-RIR generalisation is
> adopted (ceiling 0–30) — the arithmetic is sound; what needed a guard is the
> *second* job A1 gave that number, feeding the e1RM stamp and anchor. Hence the
> new **measuring band** (§6.1, `max_measuring_rir` default 8, gating on the
> assumed-RIR component rather than effective reps so honest high-rep work isn't
> punished): past it a set is priced but never scored. Yes — one rule does span
> deload → rehab → extra effort.]*

### Batch 31 — set-logging queue ping-pong + discarded RIR (2026-08-02, session task)

> "There is a bug fix/refinement needed in the set logging functionality.
>
> We recently introduced a background queue, primarily to alleviate issues with
> hangs while logging sets. These issues could result in either an indefinite
> loading state or a stale state where the set appeared to be logged, but the UI
> controls never advanced to the next active set.
>
> The intention was that moving set logging to a background task would keep the
> UI responsive and allow logs to be resolved in the background or while offline
> so that work could continue. However, this change has introduced new issues and
> is not functioning entirely correctly.
>
> Issues observed:
>
> Frequently, when a set—call it Set 1—is logged, the UI immediately shows Set 1
> as logged and briefly advances to Set 2 as intended. However, the action is
> then briefly reversed: Set 1 appears unlogged again and becomes the active set
> for about a second before it is shown as logged once more and the UI advances
> back to Set 2. This creates a brief ping-pong effect where the UI advances,
> moves back, and then advances again. This does not happen every time, and I am
> not sure why, but it occurs more often than not.
>
> On at least one occasion, when logging the final set of an exercise, the set
> briefly appeared as logged before being reset to unlogged. I had also modified
> the prescribed RIR value, but the updated value was repeatedly discarded and
> reset to the original value. After multiple attempts, the set was saved
> successfully once, but the modified RIR value was still discarded. Eventually,
> after several more attempts, I was able to get the set to save correctly with
> the updated value.
>
> It's imperative that we have a smooth flow for logging sets, as it is the most
> frequently performed action in the app. The structure needs to be architected
> correctly so that sets are logged without friction, not band aided. Set logging
> needs to just work, every time. Function is the imperative, low latency is
> desired. Two second latency is the max, 1 second or less latency is desired, no
> latency is preferred. Architect these solutions robustly."
> *[→ N73, built in PR #220. Both symptoms are ONE root cause, and it is
> structural rather than flaky: the queue retired an op's optimistic overlay when
> the server action RESOLVED, then called `router.refresh()` — leaving a
> revalidation-round-trip window with the overlay gone and the render not yet
> committed, during which the row fell back to server state that did not contain
> the set. Hence the reversal, and hence its intermittency (whether a racing
> refresh committed inside or outside the window). The discarded RIR is the same
> window with an edit in it: the row went editable mid-flight, and the arriving
> render both remounted it and resynced it through a rule that adopted server
> values unconditionally while clearing the row's dirty flag, so the edit was
> neither kept nor re-sent. Fixed by the **echo rule** — an op stays until a
> rendered row CONTAINS its write — which makes the queue's overlay and the
> server render hand off atomically instead of overlapping. Perceived latency is
> unchanged (the tap still advances the row in the same frame); the owner's
> ≤1s target now applies only to how long a row stays uneditable.]*

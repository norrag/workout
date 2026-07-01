# Notes-area log

Append a dated entry whenever a session moves work. Newest first.
(Formerly "Triage log" — the area was rebranded to an ongoing notes system on
2026-06-26; see the entry below.)

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
  with PRs"** section (rule 1: the *building* PR sets `done (PR #<n>)` with the real number +
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

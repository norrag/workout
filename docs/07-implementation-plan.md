# 07 — Implementation Plan

Rewritten for the June 2026 design pivot ([08-design-decisions.md](08-design-decisions.md) is the authoritative design source; mockups in `docs/design/`). Each phase ends in a deployable, demoable state with acceptance criteria. The data model and engine — the riskiest parts — were validated first and largely survive the pivot; the UI phases now build the light-ledger screens directly rather than an interim design.

Scope changes folded into this plan:

- **No offline sync.** The app requires connectivity; the service worker only makes the shell installable and fast. The outbox/IndexedDB work is cut.
- **No admin UI.** Engine inspection, param editing, and replay ship as admin-gated **MCP tools** (Claude is the tuning console). The underlying tables, versioning, and replay functions remain.
- **Navigation canon:** `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`. Insights is not a tab — meso stats hang off meso detail; exercise history lives in the library/picker.
- **Groups-first planning** replaces the exercise-first meso builder.
- **lb is the default unit**; all engine increments expressed per-equipment in the user's unit.

## Phase 0 — Foundation & scaffolding ✅ (re-skin pending)

Done per PROGRESS.md: Next.js + TS + Tailwind scaffold, PWA baseline, CI, Vitest/ESLint/Prettier, primitives. Remaining items absorbed into Phase R and Phase 1b:

- [x] Vercel project connected: preview deploys per PR, prod from `main`
- [x] Remove the Serwist offline-logging assumptions; keep installability + shell precache only (verified: SW was already shell-precache + runtime cache only)

## Phase R — Design-system retheme (new)

**Goal:** the app shell and primitives match the light ledger system before any feature screens are built on them.

- [x] Replace token set in `src/styles/globals.css` per 08 §1: `#F4F0E6` base, `#17140F` ink, `#C14B2A` accent, hairlines/rules, square corners everywhere; PWA theme color → `#F4F0E6`
- [x] Typography: Archivo (self-hosted via `next/font`), 800-weight lowercase titles, tracked all-caps labels, tabular-lining numerals
- [x] Rework primitives: Button, Input, segmented control (filled-ink active state), chips, dashed "planned/empty" variants, snap-to-stop slider, bottom sheet, menu card (offset hard shadow), week-track component
- [x] BottomNav → canon tabs `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`
- [x] Manifest/icons regenerated for the light system
- [~] Visual QA against mockup figures 1.1–4.5: all screens transcribed 1:1 from the mockup HTML (fidelity pass, see PROGRESS 2026-06-12); in-browser pixel pass on a device still pending

**Accept:** shell + primitives render pixel-faithful to the mockups; no rounded corners, no shadows except menu cards, orange only on current/selected.

## Phase 1 — Auth, profiles & data model ✅ (delta pending)

Schema v1, RLS suite, auth, and onboarding shipped. The pivot delta:

- [x] Migration `20260612000001_design_pivot.sql`: profile body data + week start, equipment vocabulary, excluded exercises, pinned exercise notes, macro slots, standalone mesos, 3–8 week mesos, groups-first plan tables (`meso_days`, `meso_day_groups`), workout-exercise group/status, set types + units, feedback redesign (pump/workload 0–10 sliders, per-group scope), `template_day_groups`, `mcp_write_audit`, meso-stats views — with RLS + tests in the same PR
- [x] Update `database.ts` types (done with the migration) and `src/lib/queries/` for the new shapes (exclusions, pinned notes, picker, macro slots, planner tables, generation)
- [x] Onboarding rebuilt as the 08 §4 sequence: name/age/height/bodyweight → experience level → equipment access → units; land on Cycles with the create-macro empty state
- [x] Profile screen (fig 4.5): data rows, experience segmented control, equipment chips, excluded-exercise management
- [x] More tab (fig 4.4): profile card, LB/KG toggle, AI connector row (placeholder until Phase 6), CSV export stub, version line
- [x] Provision hosted Supabase + Vercel; apply migrations + seed (hand-authored types verified against the live schema by integration smoke)

**Accept:** new user onboards through the 4-step sequence and lands on Cycles; exclusions and equipment persist; RLS tests cover every new table.

## Phase 2 — Cycles & groups-first planning

**Goal:** the full structure flow of section 2 of the mockups.

- [x] Cycles tab (fig 2.1): expandable macro blocks with goal arc + slot states (filled / current / `+ PLAN`), standalone-meso section
- [x] Macro creation: name, date range, ordered goal-arc slots (`macro_slots`)
- [~] Plan-a-meso entry (fig 2.3): from-scratch and template paths live; copy / builder shown as dashed "soon" cards (later)
- [x] Planner board (fig 2.4): day tabs auto-sorted by weekday, muscle-group blocks with set counts, dashed unfilled slots, add muscle group, add day
- [x] Day setup sheet (fig 2.5): label, weekday, "week starts on this day", per-group exercise-count steppers, remove day
- [x] Exercise picker (fig 2.6): pre-filtered to the slot's muscle group, search, last-performed + last-session data, FULL HISTORY sheet; exclusions never appear
- [x] Create-mesocycle sheet (fig 2.7): name, macro placement slot, weeks 4–8 incl. deload, RIR-ramp preview
- [~] Meso detail (fig 2.2): RIR ramp matrix with day-completion states, `GO TO W#·D#`, edit-plan entry; `MESO STATS` stubbed until Phase 5
- [x] Microcycle + week-1 workout generation on meso start (engine `seedMeso` / `rirRamp`; ramp widened to 3–8 weeks with tests)

**Accept:** user creates a macro with a goal arc, plans a meso groups-first from scratch, and sees week-1 workouts generated with the planner's structure (groups, slots, start sets).

## Phase 3 — Workout logging

**Goal:** the section-1 daily loop, excellent on a phone in a gym. Online-only.

- [x] Workout tab resting logic (08 §2): latest uncompleted workout shown; resting state shows the last completed meso's full 4.1 volume view with a link to all stats
- [x] Day view (fig 1.1): meso week track, day coordinate, grouped exercise blocks with pinned notes, set rows with logged/next/unstarted states, one-thumb logging
- [x] Exercise menu (fig 1.2): history sheet, new/replace pinned note, replace exercise (group-filtered picker, blocked once sets are logged), move down, add set, skip remaining, remove (blocked once sets are logged)
- [~] Set menu (fig 1.3): drop-set toggle on the live set, skip last set, add set, tap-to-amend logged sets; prescription rationale surfaced in the exercise menu. No deletes of logged sets by design (append-only history)
- [x] Per-exercise feedback prompt (fig 1.4): joint pain (none/low/moderate/high) per exercise + pump and workload snap-sliders (0–10) per muscle group, with explainers
- [x] Workout complete sheet (fig 1.5): summary rows (sets + top set), workout notes saved with the session; autoregulation summary is engine-derived (Phase 4 wiring landed)
- [x] Deload logging = standard day view + `DELOAD` badge (engine-reduced prescriptions arrive with the Phase 4 week-generation job)
- [ ] Playwright e2e: log a full workout including feedback and completion

**Accept:** a full workout can be logged one-thumbed; feedback writes the redesigned rows; completion shows a real engine-derived autoregulation summary.

## Phase 4 — Progression engine alignment & wiring

**Goal:** next week's numbers are computed from the new signals, explainable, and tunable.

- [x] Pure engine core, param schema, rule modules, golden/property tests (built pre-pivot)
- [x] Re-align engine inputs to the redesigned feedback: pump 0–10 and workload 0–10 (replacing strain/fatigue), joint-pain gate per exercise, workload anchored at "just right" = 5 driving set-count adjustment; params v2 (migration `20260613000001`) + updated golden fixtures
- [x] Per-equipment increments in the user's unit (lb default), incl. bands/kettlebell
- [x] Week N → N+1 generation job (on workout completion + first-open-of-new-week catch-up), writing `engine_decisions` with rationale (`src/lib/queries/progression.ts`)
- [x] Autoregulation summary composer (the 1.5 copy: "Hack Squat +5 lb, Cable Pushdown +1 set. Ramp holds…") shown on the complete sheet
- [x] Meso seeding from prior meso peak (`seedMeso` via `v_exercise_prs`); deload prescriptions via the generation job (load/sets pulled back from meso peak, target RIR 4+)
- [x] Progress scoring v1 via the shared views (`getMesoProgressScores` over `v_exercise_history`; surfaced by Phase 5 stats / Phase 6 MCP)

**Accept:** golden-fixture meso produces the expected ramp; every prescription shows a sensible rationale in the set/exercise menus; pain gate provably blocks load increases.

## Phase 5 — Meso stats, library & templates

**Goal:** the section-3/4 screens — one definition of progress everywhere.

- [x] Meso stats (figs 4.1–4.3) behind `MESO STATS` on meso detail: volume table (logged + autoregulated plan per group per week), balance (push/pull/legs cards, per-muscle bars, balance-check callout), performance (top set by week, e1RM across macro, PRs this meso) — all from `v_meso_week_sets`, `v_exercise_history`, `v_exercise_prs`
- [x] Exercises tab (fig 3.1): search, muscle-group filter, last-logged dates; create custom exercise form; exercise detail page (description, equipment, last performed, inline history, notes)
- [x] Exercise history sheet (fig 3.2) shared by library, picker, and exercise menu
- [~] Templates tab (fig 3.3): list, start-from-template → planner board prefilled, save meso as template (`template_day_groups` round-trip); from-scratch template editor (`+ NEW`) and drafts not planned for v1
- [x] Sharing: one-time share codes for custom exercises, templates, mesos; copy-on-accept with provenance + dedupe
- [x] Stock template/seed polish for the groups-first shape (seed + hosted backfill)

**Accept:** stats match raw logged data; a template round-trips through the planner; user A shares a template with a custom exercise and user B starts a meso from it.

## Phase 6 — MCP connector (including admin & tuning)

**Goal:** any MCP client can analyze, plan, and — for admins — tune the engine. This phase absorbs the old Phase 5 admin tooling.

- [ ] `/api/mcp` server (Streamable HTTP) with OAuth bridge to Supabase Auth; connector row + token revocation in More
- [ ] Read tools: profile, current state, cycles, exercise history, muscle-group volume/balance, meso summaries, PRs, explain_prescription, search
- [ ] Write tools (drafts only, audited to `mcp_write_audit`): create_mesocycle (groups-first shape), create_template, create_custom_exercise, update_macrocycle_goals, manage_exclusions, log_note
- [ ] **Admin tools (role-gated by `profiles.role`):** get_engine_params / list versions, propose_engine_params (new inactive version), activate_engine_params (explicit confirm step), get_engine_decisions (filterable inspector), replay_decisions (re-run historical decisions/mesos against a candidate version, return diffs)
- [ ] Replay functions + synthetic scenario fixtures shared with the test suite
- [ ] Resources + server instructions; tool-handler tests against a seeded fixture user; manual verification from Claude

**Accept:** from Claude, a user gets a grounded meso summary and a drafted next meso appearing in-app as planned; an admin changes a progression increment, replays a real meso against it, sees the diff, and activates — all via MCP, no deploy, no admin UI.

## Phase 7 — Production hardening & launch

**Goal:** production quality, end to end.

- [ ] Security pass: RLS audit (Supabase advisors), service-role usage audit, MCP rate limiting, headers
- [ ] Performance pass: bundle, query plans on hot paths, Lighthouse PWA ≥ 90 (installability + fast shell; offline support not required beyond a clean "no connection" state)
- [ ] Error handling/observability: structured logging, Sentry (or equivalent), Supabase log review
- [ ] Accessibility audit on the logging flow (≥44px targets, one-thumb reach, slider keyboard support)
- [ ] Data lifecycle: account deletion + CSV export (the More-tab row)
- [ ] Final design QA against 08 + mockups; empty/edge states (no active meso, all-complete resting state)
- [ ] Production deploy, custom domain, smoke checklist

**Accept:** real users can be onboarded; the daily loop, engine, and MCP connector all work in production with monitoring in place.

---

## Working agreements

- **Vertical slices:** every PR keeps `main` deployable; features land behind their phase.
- **Migrations are append-only** and reviewed; schema changes always update generated types and RLS tests in the same PR.
- **Engine changes require fixtures:** no rule change merges without a golden/unit test demonstrating it.
- **Design discipline:** any new screen is checked against 08 (orange budget, square corners, dashed-planned, copy voice) before merge.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Engine quality is subjective and hard to get right | params in DB + MCP replay tools make tuning cheap and conversational; rationale strings expose bad logic early |
| No admin UI makes tuning opaque to non-MCP users | tuning is an internal activity; `mcp_write_audit` + versioned params keep it reviewable; a UI can be added later once the system is understood |
| Online-only logging fails in dead-zone gyms | clean failure state + instant retry; revisit an outbox only if real usage demands it |
| Groups-first planner complexity | planner state is plain tables (`meso_days`/`meso_day_groups`/slots); template prefill reuses the same board |
| Sharing custom exercises creates cross-user coupling | copy-on-accept with provenance IDs, no cross-user FKs |
| Scope creep in v1 | out-of-scope list in [01-product-spec.md](01-product-spec.md) is binding until launch |

# CLAUDE.md — Build conventions for WORKOUT

WORKOUT is a PWA-first workout tracker built on periodized training cycles (macro/meso/micro) with an RIR-based dynamic progression engine. **Read `docs/` before implementing anything** — the build is spec-driven:

- `docs/01-product-spec.md` — what we're building and why; out-of-scope list is binding
- `docs/02-architecture.md` — stack decisions and target repo structure
- `docs/03-data-model.md` — schema, RLS strategy, naming conventions
- `docs/04-feedback-engine.md` — the progression algorithm; engine must stay pure & parameterized
- `docs/05-mcp-connector.md` — MCP tool surface and auth rules
- `docs/06-design-system.md` — attitude, motion, copy voice (color system/nav superseded by 08)
- `docs/07-implementation-plan.md` — phase order; implement phases in sequence
- `docs/08-design-decisions.md` — **authoritative design baseline** (June 2026 pivot): light ledger system, canon tab bar, decisions log, figure index; mockups + screenshots in `docs/design/`
- `docs/09-design-changelog.md` — **authoritative for the dated deltas** amending 08 (2026-06-13/14 sessions: macrocycle goal layer + Overview + create engine, planner board as the single meso surface, Day View header + progress bar, Workout Complete redesign, Exercise page, two-axis exercise filter, Volume stats tab removed, per-set tracking type). **Where 09 conflicts with 08/06, 09 wins.** Check it before building any screen.
- `docs/10-metrics-spec.md` — **authoritative for metric definitions and default engine parameters** (research-backed): e1RM, fractional volume counting, MEV/MAV/MRV, the workload/pump/pain autoregulation, RIR ramp, increments/deload, the profile-personalized macrocycle target engine, key lifts, stats rollups, and the honesty guardrails. Read before building any metric or engine behavior.
- `docs/14-prescription-invalidation.md` — **authoritative design for prescription freshness**: how stored prescriptions stay correct when any input changes (engine params, per-user/per-exercise overrides like the editable increment, profile, macro goal, meso config). A pull-based dependency-fingerprint framework that supersedes the single-scalar `params_version` gate; read before building any feature that changes an engine input or touches how prescriptions are (re)computed.
- `docs/16-prescribed-progression.md` — **authoritative build spec for prescribed progression** (earned-step overload + macro-rate pacing, engine_params v20): the engine leads the demand by one earned quantum off the measured anchor, paced by the macro strength-rate band. Consolidates the N35 design thread (`docs/reviews/2026-07-07..09-prescribed-progression-*`); where they conflict, 16 wins. Read before touching the progression feature, the earn gate, the pacer, or the day-view prescription coupling; implementation phases in its §10.
- `docs/17-macrocycle-goals.md` — **authoritative build spec for the macrocycle goal layer** (targets → pacing → closeout → outcome): the v21 target-engine correction (N21), the `rate_source:"plan"` pacer branch (N37), macrocycle closeout + retrospective (N40), the bodyweight series + create-flow priming (N41), the BodySpec DEXA phase-in (N34), and the envelope loop (N36), phased one PR at a time in its §9. Consolidates the macro-goals architecture record (`docs/reviews/2026-07-10-macrocycle-goals-architecture.md`); where they conflict, 17 wins; doc 16 keeps authority over progression internals. Read before touching `planMacrocycle`, macro targets/status, the pacer's rate source, or any macro-level stat/verdict surface.
- `docs/18-llm-prescription-explanation.md` — **build spec for the LLM prescription explanation** (PH30 made concrete, 2026-07-19): GPT-5.6 Luna, the §3 payload + §4 output contracts and token budgets, decision-id-keyed storage/invalidation, the §6 drop-in seam over the deterministic quick-read (`src/lib/prescription-narrative.ts` — always the fallback), phased plan + cost model. Read before building any LLM-generated explanation surface; the engine stays the only author of numbers.
- `docs/19-prescription-explanation-v3.md` — **authoritative for the explanation content architecture** (2026-07-23, supersedes doc 18's §6 substitution seam, §10 voice, and payload/trigger policy; doc 18 keeps the infrastructure: model/client, storage, decision-id lifecycle, post-check, admin tooling): three layers — deterministic ask, deterministic why (always rendered), and a trigger-gated LLM coaching line fed a semantic-facts payload (never the raw trace). Reconciles the owner's v2 output review (`docs/reviews/2026-07-23-llm-coaching-assessment-owner.md`); where they conflict, 19 wins. **Amended 2026-07-24 in its §12** (N62): the facts payload carries `source_session` (the session that produced `previous_work` and the note, distinct from the upcoming `week`) and `macro` (the macrocycle goal context), and the admin tools can preview a prompt revision without activating it. Read before touching the prescription strip, `prescription-narrative.ts`, or anything in `src/lib/llm/`; phases in its §11.
- `docs/20-measure-companion-app.md` — **direction doc for MEASURE**, the companion measurement app (2026-07-25, **revised 2026-07-31 after owner review round 1**; N66): body weight tracking with read-time smoothing, circumferences, DEXA, fast capture, import/export, and an integrated summary — sharing this repo's DB, design system, and MCP connector, with its own app shell. Not yet a build spec. Load-bearing sections: **§2.7 transparency** (no composites; every number carries method/window/n) and §2 the other six principles; **§3.2 topology** (a `(measure)` route group + own manifest inside this deployable, shared auth) with **§3.4 the separation-readiness rules** — obey them in any MEASURE code; **§4 capture** (token-auth `POST /api/measure/weight` + Shortcuts) and **§4.5 Apple Health as the integration bus** (the only bridge — a PWA cannot touch HealthKit; Dropbox declined as sync); **§5 the three-source model** — weight/tape/DEXA triangulate and never average, via three tiers (measured → corroborated → projected) where **Tier 3 never crosses the seam and never touches the engine**, plus the §5.3 corroboration matrix and the **§5.6 four-item seam payload** (the only things that reach WORKOUT); §6 schema, §7 the pure `src/lib/measure/` module, §9 Happy Scale parity, §16 phasing, §17 open decisions. **Phase 0 is a mockup pass and it gates every later phase** (hard rule 8). Read before any measurement-app work; doc 15 keeps authority over the BodySpec integration internals and doc 17 over macro goals.
- `docs/deployment/` — **operational runbooks.** `manual-operations.md` is the standing list of human-only steps (Supabase dashboard toggles, Vercel env vars/secrets, domains) that **cannot be done from a Claude session** — consult/append it whenever a task depends on config Claude can't change; `mcp-connector-setup.md` is the connector deploy+test runbook.
- `docs/notes/` — **the owner's ongoing field-notes intake + tracker** (Claude-owned). The owner drops raw notes here periodically; Claude assesses, dedups, relates, groups, prioritizes, scopes against the code, tracks to done, and prunes. `docs/notes/CLAUDE.md` is the operating manual (intake protocol + lifecycle); `backlog.md` is the live index of open items; `archive.md` holds closed ones. **When the owner hands over notes or asks about the backlog, work through this area.** **Any PR that resolves or advances a backlog item must update that item's row in the same PR** — set it to `done (PR #<n>)` and add the `log.md` entry (see `docs/notes/CLAUDE.md` → "Keeping the index in sync with PRs"); leaving the code merged but the row stale is an incomplete change.

## Stack

Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres/Auth/RLS), Vercel, MCP server at `/api/mcp`.

## Hard rules

1. **RLS on every table, default deny.** Schema changes ship with policies and RLS tests in the same migration/PR.
2. **Migrations are append-only** in `supabase/migrations/`; never edit applied migrations or change schema via dashboard.
3. **The engine (`src/lib/engine/`) is pure.** No I/O, no dates-from-now, no randomness inside; all tunables come from `engine_params`. Every behavior change needs a unit/golden test.
4. **Service-role key only in `src/lib/supabase/service.ts`** call sites, always with explicit user scoping. Never in client bundles.
5. **MCP tools never take a `user_id` argument** — identity comes from the auth session only. Write tools create drafts; no deletes of logged history.
6. **Validate every boundary with zod** (forms, route handlers, MCP tool args, engine params).
7. **Design discipline (per 08):** light ledger system — cream `#F4F0E6` / ink `#17140F`; orange `#C14B2A` marks current position + selection only; square corners everywhere, dashed borders = planned/empty; lowercase logotype + tracked all-caps labels; no hype copy, no exclamation marks.
8. **Pixel fidelity to the mockups is mandatory.** Before building or changing ANY screen, open `docs/design/mockups/workout - App Screens v2.dc.html`, find the figure (see the 08 §5 index), check `docs/09-design-changelog.md` for any dated amendment to it, and transcribe its exact structure, control patterns, copy, sizes, weights, and colors — never improvise a layout or label from the spec prose alone. Cross-check `docs/design/screenshots/`. The **mockup is the source of truth over the interactive prototype** (`WorkoutApp.dc.html` / `workout - Interactive Prototype.dc.html`) — where they diverge, follow the mockup. The dark theme in the prototype is exploratory (dark mode is out of scope). Deviate only where a hard rule forces it (e.g. no deletes of logged history) and record the deviation in `docs/PROGRESS.md`.
9. **No offline sync, no admin UI.** The app is online-only; engine inspection/tuning/replay ship exclusively as admin-gated MCP tools.

## Commands (once scaffolded)

```bash
npm run dev            # local dev
supabase start         # local Supabase stack
npm run db:types       # regenerate DB types after migrations
npm run test           # vitest
npm run test:e2e       # playwright
npm run lint && npm run typecheck
```

## Conventions

- snake_case in SQL; camelCase in TS; DB types generated, domain types in `src/lib/types/`.
- Data access goes through `src/lib/queries/` — no inline supabase queries in components.
- Stats screens and MCP must share the same views (`v_exercise_history`, `v_meso_summary`, `v_meso_week_muscle_sets` — role-grain facts weighted through `engine/volume.ts::fractionalSetCount`, one counting definition — `v_exercise_prs`, plus `v_exercise_overview` and `v_macro_summary` per the 09 deltas) — one definition of progress. (`v_meso_week_sets` was retired with R23, migration `20260703000003`.)
- Keep `main` deployable; vertical-slice PRs.

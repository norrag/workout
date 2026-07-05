# 05 — MCP Connector

The MCP connector lets users plug their training data into the LLM of their choice (Claude, etc.) for tailored analysis of their macro/meso/microcycles, performance and improvement insight, and **agentic planning**: creating mesocycles, building templates, and editing goals grounded in their real data.

## Transport & hosting

- MCP server implemented with `@modelcontextprotocol/sdk`, **Streamable HTTP** transport, hosted at `/api/mcp` in the Next.js app (same deployment, shared code).
- Works with any remote-MCP-capable client (Claude.ai connectors, Claude Code, etc.).

## Auth

- OAuth 2.1 authorization-code flow per the MCP auth spec, bridged to Supabase Auth: the user signs into WORKOUT during the connector handshake; the issued token maps to exactly one `user_id`.
- Every tool/resource call resolves identity from the token session. **No tool accepts a `user_id` parameter** — the model can never address another user's data.
- Data access uses an RLS-scoped client where possible; where service-role is required, queries are explicitly filtered by the session's `user_id`.
- Tokens are revocable from More → AI connector (fig 4.4).

> **Implementation approach (2026-06-16 planning).** Use Supabase's native **OAuth 2.1
> Server** as the authorization server: it provides authorization-code + PKCE, **dynamic
> client registration** for MCP clients, JWKS/OIDC discovery, and revocation, and issues
> standard Supabase JWTs carrying `user_id` / `role` / `client_id`. `/api/mcp` is therefore a
> pure **resource server** — it validates the bearer JWT against JWKS (`mcp-handler`'s
> `withMcpAuth`) and exposes `/.well-known/oauth-protected-resource` pointing at the Supabase
> AS. Because **RLS applies automatically to OAuth-issued tokens**, tools use a token-bound
> RLS client for reads/writes; service-role stays reserved for the few spots RLS can't cover
> (writing `mcp_write_audit`, admin cross-scope reads). No custom token table is needed; the
> connector row revokes the Supabase grant. Confirm the feature is enabled on the hosted
> project before the first slice.

## Tools

### Read / analysis
| Tool | Purpose |
|---|---|
| `get_profile` | profile, units, experience, preferences |
| `get_current_state` | active macro → meso → micro → next workout, with targets |
| `get_macrocycles` / `get_mesocycle` | cycle structures, goals, status, RIR ramps |
| `get_exercise_history` | time series for an exercise (weights, reps, volume, e1RM, feedback) with date-range / cycle filters; includes both **note kinds** (see Notes below) — the exercise's pinned note and the per-session log notes |
| `get_muscle_group_volume` | weekly planned-vs-logged volume per muscle group across the full meso; weeks the engine hasn't generated yet are labeled `not_yet_generated` (it autoregulates forward) rather than read as zero (review §5.10) |
| `get_mesocycle_summary` | per-meso rollup: adherence, progression achieved, feedback patterns, progress score |
| `get_macrocycle_summary` | macrocycle rollup (fig 2.2): goal, realistic target + per-month rate, meso timeline with phases/status, est. strength, total volume, sessions, adherence |
| `search_exercises` / `search_templates` | library queries with the same filters the UI uses |
| `explain_prescription` | surface the engine's `engine_decisions` rationale for a given prescription |

### Coaching & analysis (read-only; added 2026-06-16 — "deep access" expansion)

The connector's largest purpose is acting as a grounded personal trainer. These tools give the
model a coach's-eye view of the whole training picture without adding any write surface — built
entirely on the shared views + the pure engine. All honor exclusions and the §9 honesty
guardrails (estimates labeled, pump/soreness secondary, balance advisory-only).

| Tool | Purpose |
|---|---|
| `get_training_overview` | one-call grounding snapshot: profile + active macro→meso→next workout + recent adherence + key-lift e1RM trend |
| `get_recent_sessions` | reverse-chron feed of completed workouts with session feedback (fatigue/effort/performance) and session notes — recovery & adherence signal |
| `analyze_exercise_progress` | e1RM trend, PRs, and **stall/plateau detection** for an exercise (over `v_exercise_overview` / `v_exercise_prs`) |
| `compare_mesocycles` | side-by-side rollups of two or more mesos (volume, progression, adherence, progress score) |
| `get_muscle_balance` | weekly sets per muscle group vs MEV/MAV/MRV landmarks + push/pull/legs split with weak-point flags — **advisory only** (10 §9) |
| `get_exercise_affinity` | **exercise-selection profile** per muscle group / equipment type: which movements the user actually trains (frequency, recency, recent loads & volume), each joined with its **pinned note** and **aggregated session feedback** (mean joint pain, workload, pump). Surfaces what the user relies on and tolerates well vs. what their notes/feedback flag — so recommendations and planning favor proven, well-received movements and steer clear of injury-sensitive or poorly-tolerated ones. Read over `logged_sets` × `exercise_muscle_groups` × `exercise_notes` × `exercise_feedback`; respects exclusions |
| `get_exercise_notes` / `get_exclusions` | durable context: pinned notes across the library and the user's excluded movements with reasons |
| `check_data_hygiene` | advisory flags for data-shape anomalies in the user's cycles — a macro duration that differs from the engine's recommendation, duplicate meso names within a macro, unplanned placeholders still on the `days_per_week = 1` default — so a coaching layer can gently surface (never silently "fix") them (review §5.12) |

**Why selection history matters.** Prior exercise selection is itself a strong prior: an exercise
the user has chosen repeatedly, loaded well, and left no pain/"felt off" notes on is a safe
recommendation; one they tried once and flagged, or never pick for a muscle they train hard, is a
signal to avoid or revisit. `get_exercise_affinity` makes that prior explicit so advice and drafted
plans stay grounded in the user's real movement preferences rather than a generic library default.

### Write / planning (always explicit, never destructive-by-default)
| Tool | Purpose |
|---|---|
| `create_macrocycle` | draft a macrocycle from `goal` (hypertrophy/strength/cut/maintain) + `meso_length_weeks` (+ optional `duration_months`); the **engine** (`planMacrocycle`) computes the profile-personalized target, a **recommended timeframe**, the meso count, and suggested phases — the LLM never invents the numbers (defaults in 10). Creates the macro + its `unplanned` meso placeholders |
| `create_mesocycle` | draft/plan a meso in `planned` status (an **unapproved draft** the athlete opens, edits, and approves in-app), either from a `template_id` (prefills the board via the same start-from-template path the app uses) **or** from a hand-built groups-first `days` spec (weeks, days with weekday + label, muscle-group blocks, slot fills, RIR ramp) — pass exactly one. Optional `macrocycle_id` (+ `position`) authors it straight into a macro slot (fills the earliest open slot by default) |
| `edit_mesocycle` | in-place structural edits to a `planned`/`active` meso's planner board: **`add_day`** (lay down a whole training day — label/weekday + its muscle-group blocks with exercises and starting sets — in one call, so an empty/placeholder meso builds up to a complete multi-day plan), **`remove_day`**, plus `add_exercise` / `remove_exercise` / `swap_exercise` / `reorder_day` / `set_baseline_sets`. Returns the fresh plan (new day/slot ids) so a chain of edits needs no re-read. The engine still owns every prescribed number |
| `update_mesocycle` | edit a meso's own header in place — name, phase (accumulation/intensification/peak), length in weeks, deload flag, RIR ramp — without demolishing the plan or losing its macro placement. name/phase on any unfinished meso; length/RIR/deload only before it's started. The engine re-derives the numbers |
| `duplicate_mesocycle` | clone a meso's settings + planner board into a new `planned` meso ("run last block back with a few tweaks"); loads are reseeded by the engine on activation, not copied. Optional `macrocycle_id` (+ `position`) to place the copy straight into a slot |
| `manage_macrocycle_slots` | one tool for the macro's slot surface (R25 consolidation — absorbed the former `place_mesocycle`): `add` an unplanned placeholder, `remove` one, `reorder` all slots, or `place` an existing standalone `planned`/`draft` meso into a slot (earliest open placeholder by default, or a given `position` — the placeholder is absorbed and its phase inherited; placing never activates). Only unplanned placeholders are added/removed; planned/active/completed mesos and logged history are never destroyed |
| `activate_mesocycle` | turn a reviewed `planned` meso into the live block (engine builds the microcycle ramp + seeds week 1). Requires `confirm="activate"`. **Sequential within a macro**: a future block can't start until every earlier block is complete and none is active — so planned mesos are seeded from the latest results, never in advance of the prior blocks' completion. Prefer in-app activation |
| `preview_mesocycle_volume` | project a plan's weekly working sets per muscle group vs the athlete's MEV/MAV/MRV landmarks **without persisting anything** — pass a `mesocycle_id` (a planned/draft meso) or a proposed `days` spec — so a draft self-checks (under-dosed / over-dosed muscles) before it's ever written. Deliberately kept separate from `get_muscle_balance` (R25 design pass): this one reads the *plan* pre-start; that one reads *trained weeks*, which a draft doesn't have. Advisory only (10 §9) |
| `create_template` | build a reusable template from a spec or from an existing meso |
| `create_custom_exercise` | add a custom exercise (name, equipment, muscle groups, **tracking type**, description, notes, optional `weight_increment` load step — full parity with the app's create form, N22) |
| `set_exercise_increment` | set or clear the per-user, per-exercise **load step** override (the app's "Load step" — doc 14 phase 3) on any exercise; null clears back to the equipment default. Prescriptions refresh via the read-path reconcile; logged history untouched |
| `update_macrocycle_goals` | edit goal / duration / block length / timeline (the engine recomputes the target + phases); no goal-arc slots — superseded by positioned mesos |
| `manage_exclusions` | add/remove excluded exercises with a reason |
| `log_note` | attach a note — either a **pinned** note on an exercise (exercise-wide, persists across workouts) or a **session** note on a workout's exercise log (that day only). See Notes below |
| `delete_mesocycle` / `delete_macrocycle` / `delete_template` / `delete_custom_exercise` | undo a mistaken create. Each **refuses to touch logged history** (a block/exercise with logged sets, or a still-referenced exercise/active block, is never deleted); only own (custom) templates/exercises are deletable. To stop recommending a movement without deleting it, use `manage_exclusions` |

Write tools validate with the same zod schemas as the app's own forms and run server-side business validation (e.g., meso weeks 3–8). Anything the engine would generate (week prescriptions) is generated by the **engine**, not the LLM — the LLM proposes structure; the engine fills in numbers. Every write is recorded to `mcp_write_audit`. The delete tools are the bounded **undo** for the create tools (review §5.8) — they remove only planning artifacts and never logged history (hard rule #5).

### Admin & tuning (role-gated: `profiles.role = 'admin'`)

Per [08-design-decisions.md](08-design-decisions.md) §3, **the MCP connector is the entire admin interface** — no admin UI exists. These tools are hidden/denied for non-admin sessions.

| Tool | Purpose |
|---|---|
| `get_engine_params` | one browse/get/diff tool (R25 consolidation — absorbed the former `list_engine_params`): no args = browse all versions (active flag, notes, dates); `version` = full values + provenance; add `compare_to_version` for the dot-path diff |
| `propose_engine_params` | write a new **inactive** param version (zod-gated; a malformed set can never be activated) |
| `activate_engine_params` | activate a version — requires an explicit confirmation argument echoing the version number |
| `get_engine_decisions` | decision inspector: filter by user/exercise/date/params version; full inputs, output, rationale |
| `replay_decisions` | re-run historical decisions or a whole meso against a candidate param version; return prescription diffs |
| `simulate_prescriptions` | probe hypothetical inputs against a candidate version (per-item isolated, invalid cases don't fail the batch) |
| `discard_engine_params` | undo a `propose` — delete an **inactive** version (review §5.8); refused for the active version or any version referenced by a recorded decision (kept reproducible); requires a `confirm_version` echo |

The tuning loop: inspect decisions → propose a version → replay real history against it → review diffs in chat → activate. Already-planned future workouts pick up the new version lazily through the read-path freshness reconcile (doc 14) — the former `regenerate_planned_prescriptions` manual step is retired. Same tables and replay functions a future UI would use.

## Notes — two kinds, both exposed

The app keeps two distinct exercise notes (09 session-5 §8), and the connector
surfaces **both** so the model has the full picture:

- **Pinned note** — an attribute of the *exercise record* (`exercise_notes`,
  `is_pinned`), shown on that exercise in every workout. These are *general*
  facts about how the user runs the movement (grip, setup, cue, a nagging
  caveat). Stable across time.
- **Session log note** — a note saved with a *single workout's exercise log*
  (`exercise_feedback.notes`, one row per `workout_exercise`). These are *day-to-day*
  observations about how the exercise went that session ("elbow cranky", "dropped
  the last set", "great pump"). Time-stamped to the session.

Reading both lets the model separate the durable from the momentary: the pinned
note conditions interpretation of the whole history, while the stream of session
notes is signal about trend, recovery, and adherence. Use them together for
grounded insight (e.g. don't recommend loading a movement the pinned note flags
as injury-sensitive; weigh repeated "felt heavy" session notes when reading a
stalled lift). `log_note` writes either kind; both are append/edit on drafts and
the active session only, never edits of completed logged history.

## Resources

- `workout://profile`, `workout://current-cycle`, `workout://coaching-guide` — read-only documents for clients that prefer resources over tool calls.
- A server-level instructions string teaching the LLM the domain (RIR, cycle hierarchy, units).

## Failure contract (converged 2026-07-05, R25)

One signal covers every failure: a tool result that did not do what was asked
carries `isError: true`. Two failure bodies remain, by cause:

- **Domain refusal** (validation, not-found, guarded state): the familiar
  in-band `{ ok: false, error: "…" }` envelope — readable prose the model uses
  to self-correct (fix the argument, pick the other tool). Previously these
  shipped with `isError` unset, so a consumer had to check both `isError` and
  `ok`; the composition-root wrapper now flags them too.
- **Infrastructure failure** (thrown — DB error, bug): structured
  `{ error: { code, message, detail } }`, also `isError: true`, reported
  server-side.

Success results never carry `isError`; read tools answer not-found with
`{ found: false }` prose, which is an answer, not a failure.

## Data-shape contract

MCP tools return the **same view-layer shapes** as the stats screens (`v_exercise_history`, `v_meso_summary`, `v_meso_week_sets`, `v_exercise_prs`, `v_exercise_overview`, `v_macro_summary`, …) so analysis in chat always matches what the user sees in-app. This is why the data model treats those views as a public contract (see [03-data-model.md](03-data-model.md)).

## Module layout (`src/lib/mcp/`)

```
mcp/
├── server.ts        # server init, instructions, capability wiring
├── auth.ts          # OAuth bridge to Supabase Auth
├── tools/           # one file per tool: schema (zod) + handler
├── resources.ts
└── __tests__/       # tool-handler tests with seeded fixture user
```

## Safeguards

- Rate limiting per token; payload caps on history queries (paginated).
- Write tools are draft/append plus a bounded **undo**: the `delete_*` / `discard_engine_params` tools remove only planning artifacts a create produced by mistake and **never delete or edit logged history** — a block/exercise with logged sets (or a referenced/active one, or an in-use params version) is always refused (review §5.8, hard rule #5).
- Audit log of MCP write operations (`mcp_write_audit`: tool, args hash, timestamp) readable by the owner; param activations always require the explicit-confirm argument.

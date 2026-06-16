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
| `get_muscle_group_volume` | weekly volume per muscle group |
| `get_meso_summary` | per-meso rollup: adherence, progression achieved, feedback patterns, progress score |
| `get_macro_summary` | macrocycle rollup (fig 2.2): goal, realistic target + per-month rate, meso timeline with phases/status, est. strength, total volume, sessions, adherence |
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

**Why selection history matters.** Prior exercise selection is itself a strong prior: an exercise
the user has chosen repeatedly, loaded well, and left no pain/"felt off" notes on is a safe
recommendation; one they tried once and flagged, or never pick for a muscle they train hard, is a
signal to avoid or revisit. `get_exercise_affinity` makes that prior explicit so advice and drafted
plans stay grounded in the user's real movement preferences rather than a generic library default.

### Write / planning (always explicit, never destructive-by-default)
| Tool | Purpose |
|---|---|
| `create_macrocycle` | draft a macrocycle from `goal` (hypertrophy/strength/cut/maintain) + `meso_length_weeks` (+ optional `duration_months`); the **engine** (`planMacrocycle`) computes the profile-personalized target, a **recommended timeframe**, the meso count, and suggested phases — the LLM never invents the numbers (defaults in 10). Creates the macro + its `unplanned` meso placeholders |
| `create_mesocycle` | draft/plan a meso in the groups-first shape (weeks, days with weekday + label, muscle-group blocks, slot fills, RIR ramp); attaches at a macro `position` or as standalone — created in `planned` status for in-app review before activation |
| `create_template` | build a reusable template from a spec or from an existing meso |
| `create_custom_exercise` | add a custom exercise (name, equipment, muscle groups, **tracking type**, description) |
| `update_macrocycle_goals` | edit goal / duration / block length / timeline (the engine recomputes the target + phases); no goal-arc slots — superseded by positioned mesos |
| `manage_exclusions` | add/remove excluded exercises with a reason |
| `log_note` | attach a note — either a **pinned** note on an exercise (exercise-wide, persists across workouts) or a **session** note on a workout's exercise log (that day only). See Notes below |

Write tools validate with the same zod schemas as the app's own forms and run server-side business validation (e.g., meso weeks 3–8). Anything the engine would generate (week prescriptions) is generated by the **engine**, not the LLM — the LLM proposes structure; the engine fills in numbers. Every write is recorded to `mcp_write_audit`.

### Admin & tuning (role-gated: `profiles.role = 'admin'`)

Per [08-design-decisions.md](08-design-decisions.md) §3, **the MCP connector is the entire admin interface** — no admin UI exists. These tools are hidden/denied for non-admin sessions.

| Tool | Purpose |
|---|---|
| `list_engine_params` / `get_engine_params` | browse param versions; diff two versions |
| `propose_engine_params` | write a new **inactive** param version (zod-gated; a malformed set can never be activated) |
| `activate_engine_params` | activate a version — requires an explicit confirmation argument echoing the version number |
| `get_engine_decisions` | decision inspector: filter by user/exercise/date/params version; full inputs, output, rationale |
| `replay_decisions` | re-run historical decisions or a whole meso against a candidate param version; return prescription diffs |

The tuning loop: inspect decisions → propose a version → replay real history against it → review diffs in chat → activate. Same tables and replay functions a future UI would use.

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

- `workout://profile`, `workout://current-cycle`, `workout://meso/{id}/summary` — read-only documents for clients that prefer resources over tool calls.
- A server-level instructions string teaching the LLM the domain (RIR, cycle hierarchy, units).

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
- Write tools restricted to draft/append operations; no deletes, no edits of logged history in v1.
- Audit log of MCP write operations (`mcp_write_audit`: tool, args hash, timestamp) readable by the owner; param activations always require the explicit-confirm argument.

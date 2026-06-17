# Build progress

Running log of implementation state against [07-implementation-plan.md](07-implementation-plan.md). Update this file in any PR that moves a phase forward.

## 2026-06-17 (latest) — Responsiveness Slice 2: instant nav skeletons + request dedup

Builds on Slice 1. Makes page switches paint immediately and trims redundant
per-render queries.

### Done

- **Route loading boundaries.** `(app)/loading.tsx` (generic tab skeleton) plus
  DayView-shaped overrides at `(app)/workout/loading.tsx` and
  `(app)/log/[workoutId]/loading.tsx`. Paired with the Slice 1 BottomNav
  prefetch, a tapped tab now paints a skeleton instantly instead of blocking on
  the RSC fetch. New `Skeleton` + `DayViewSkeleton` primitives (square, ink-wash,
  pulse disabled under prefers-reduced-motion).
- **Request-level dedup.** `getActiveEngineParams` wrapped in React `cache()` —
  it was read twice per `/log` and `/workout` render (page + `getWorkoutDetail`).
  Safe: the active params are global and immutable within a request. `getProfile`
  deliberately left uncached (can change mid-request after an update).

### Verified

`npm run typecheck`, `npm run lint`, `npm run build` green.

## 2026-06-17 — Responsiveness Slice 1: set-logging hot path + nav feedback

First slice of a broader speed/responsiveness pass. Goal: every common action
acknowledges the tap **immediately**, and background writes never block the UI.

### Done

- **`LogCheckbox` (`src/components/ui/LogCheckbox.tsx`).** The set LOG control as
  a single 21px square with three states: empty outline → **in-flight perimeter
  spinner** (the outline itself with a gap travelling the perimeter, an animated
  SVG `stroke-dashoffset` with `pathLength=100`) → filled `✓`. Honors
  `prefers-reduced-motion` (gap pulses in place instead of travelling). Brief
  shake + rollback on failure.
- **Background set logging.** `SetRow` now logs via a **per-row `useTransition`**
  so only the tapped box spins; the write is fire-and-forget. **Removed the
  redundant `router.refresh()`** — the server action already `revalidatePath`s,
  so the box resolved via the action's own RSC refresh instead of a *second*
  full `getWorkoutDetail` refetch (13 round-trips + a 600-set e1RM scan) per tap.
  Uncheck uses the same path. On failure the box rolls back (shake) and a quiet
  toast appears.
- **Toast surface (`src/components/ui/Toast.tsx`).** Minimal context provider
  mounted in `(app)/layout.tsx` for non-blocking write failures (online-only, no
  offline outbox, per CLAUDE.md hard rule #9).
- **Nav feedback (`BottomNav`).** Explicit `prefetch` + `useLinkStatus` so a
  tapped tab marks itself (■ cue + pulse) instantly, before the next route paints.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (219/219), `npm run build`
all green.

### Roadmap (later slices, not in this PR)

- Tag-scoped caching so logging a set invalidates only the sets, not the cached
  e1RM anchors; cache the recency-weighted anchors so they aren't recomputed per
  tap. Per-route `loading.tsx` skeletons. Stale-while-revalidate for read-heavy
  stats/history surfaces.

### Deviations

- Logging is **spinner-on-control**, not blind-optimistic: the box shows the
  in-flight spinner until the server confirms, then flips to `✓` (owner's choice).
  This keeps the LOG box honest about persisted state while still acknowledging
  the tap instantly.

## 2026-06-17 — Phase 6 Slice 4: MCP admin/tuning + replay (Phase 6 complete)

Final Phase 6 slice — the **admin/tuning + replay** surface, role-gated by
`profiles.role = 'admin'`. The MCP connector is now the entire admin interface
(08 §3): inspect decisions → propose a params version → replay real history
against it → review diffs → activate, all in chat, no admin UI, no deploy. One
additive index migration. Same branch/PR; `main` deployable. **Phase 6 done.**

### Done

- **Admin tools (`src/lib/mcp/tools/admin.ts`, `registerAdminTools`).**
  `list_engine_params`, `get_engine_params` (single version or a dot-path **diff**
  of two), `propose_engine_params` (writes a new **inactive** version; `base_version`
  + partial overrides deep-merged, then **`engineParamsSchema`-validated** — a
  malformed set is rejected and can never be activated), `activate_engine_params`
  (requires `confirm_version` to echo `version`; deactivates the current active
  first to respect the single-active partial unique index), `get_engine_decisions`
  (the caller's own decisions, filter by params version / exercise / date), and
  `replay_decisions` (re-run stored decisions against a candidate version, return
  load/reps/sets/RIR diffs — read-only, nothing written). Every tool is gated by
  `resolveAdmin` (denies non-admins); the two writes audit to `mcp_write_audit`.
- **Pure helpers (exported, unit-tested).** `deepMerge` (nested param overrides
  without dropping siblings, no mutation), `diffParams` (differing dot-paths),
  `diffPrescription` (changed prescription fields, ignores rationale prose), and
  `replayDecisions` (re-runs `prescribe(storedInputs, candidateParams)`, counting
  changed/errored — malformed historical inputs are counted as errors, never
  crash the call).
- **Query layer (`src/lib/queries/engine-admin.ts`).** `listEngineParams`,
  `getEngineParamsVersion`, `proposeEngineParams`, `activateEngineParams`,
  `getEngineDecisions`. `engine_params` RLS already gates writes to `is_admin()`,
  so the admin's own token-bound client suffices — **no service role** for tuning;
  service role stays only for the `mcp_write_audit` insert.
- **Migration `20260617000001_engine_decisions_inspector_idx.sql`** (applied to
  hosted): additive index `engine_decisions (user_id, params_version, created_at
  desc)` for the inspector/replay version filter. No table/column/RLS change;
  advisors show no new problematic lints (the index reads "unused" until first
  query, expected; the pre-existing `auth_rls_initplan` WARN is unrelated).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (219/219, +12), `npm run build`
green; migration applied to hosted and the index confirmed present. The replay
path re-runs the **real engine** (`prescribe`) over stored inputs, so a diff is
exactly what would change. End-to-end admin loop against hosted (propose →
replay → activate) is the owner's check with an admin account.

### Deviations

- **Inspector/replay are scoped to the calling admin's own decisions** (no
  `user_id` argument) to keep hard rule #5 absolute. Cross-user admin inspection
  would need a deliberate rule-5 exception; deferred. In practice an admin tunes
  against their own real mesos.
- **`propose_engine_params` takes `base_version` + a partial override** (deep-merged)
  as the ergonomic path, as well as a full params object — either way the result
  is schema-validated before storage.

## 2026-06-17 — Phase 6 Slice 3: MCP write/planning tools (audited drafts)

07 Phase 6 **Slice 3** — the write/planning surface. Seven tools that let the
model propose *structure* while the **engine fills every prescribed number**;
all writes are draft/append, RLS-scoped, and recorded to `mcp_write_audit`. No
deletes of logged history (hard rule #5). Same branch/PR; `main` deployable; no
schema change.

### Done

- **Write tools (`src/lib/mcp/tools/write.ts`, `registerWriteTools`).**
  `create_macrocycle` (engine `planMacrocycle` sizes target/timeframe/meso-count/
  phases + unplanned placeholders), `create_mesocycle` (groups-first → `planned`
  for in-app review; engine sets numbers on activation), `create_template` (from
  an existing meso), `create_custom_exercise`, `update_macrocycle_goals` (engine
  re-plans unplanned slots only; locked mesos + logged history immutable),
  `manage_exclusions` (add/remove by exercise), `log_note` (durable pinned note;
  empty clears). Each validates with zod, resolves identity from the session,
  and returns a friendly `{ ok, … }` result.
- **Audit trail (`src/lib/mcp/audit.ts`).** `recordMcpWrite(userId, tool, args,
  summary)` writes one `mcp_write_audit` row per successful write — tool name, a
  **sha256 hash of the args** (not the raw note text), and a short summary. The
  table has no user-insert policy, so this is the single service-role write site
  (hard rule #4), always with the server-derived `userId`. `hashArgs` is pure +
  unit-tested.
- **Pure `resolveMuscleGroupIds`.** Maps requested muscle-group names → library
  ids (case-insensitive, trimmed), collecting unknowns so a typo fails cleanly
  instead of silently dropping a group. Unit-tested.
- **New query reader.** `removeExclusionByExercise` (exercises.ts) — the MCP
  addresses exclusions by exercise id, not exclusion-row id.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (207/207, +7), `npm run build`
green. Write paths reuse the smoke-tested app query layer (`createMacrocycleWithMesos`/
`saveMesoPlan`/`updateMacrocycle`/`createCustomExercise`/`savePinnedNote`), all
user-scoped through existing RLS; the engine — not the model — fills prescriptions.
End-to-end drafting against hosted (verify a drafted meso surfaces in-app as
`planned`) is the owner's check.

### Deviations

- **`create_mesocycle` drafts a standalone meso** (`macrocycle_id` null) rather
  than filling a macro `position` — cross-entity slot attachment is fragile over
  MCP; the user attaches it to a macro slot in-app. Recorded; revisit if needed.
- **`log_note` is pinned-only.** Session log notes are RLS-gated to the live
  workout (completion lock) and need a `workout_exercise_id` no read tool
  currently surfaces, so the MCP writes the durable pinned note; session notes
  stay an in-workout action.
- **`create_custom_exercise` omits tracking type** — `exercises.tracking_type`
  isn't in the schema yet (09 backlog, deferred), so the column isn't written.
- **No in-app revocation/inspector for the audit log this slice** — the audit
  table is owner-readable; surfacing it is a later UI concern.

## 2026-06-17 — Phase 6 Slice 2b: MCP coaching suite

Completes 07 Phase 6 **Slice 2** — the coaching/analysis tools on top of the
Slice 2a read surface. Six read-only tools giving the model a coach's-eye view,
built on the shared views + the pure engine; no write surface, no migration.
Same branch/PR as 2a; `main` deployable.

### Done

- **Coaching tools (`src/lib/mcp/tools/coaching.ts`, `registerCoachingTools`).**
  `get_training_overview` (one-call snapshot: who + current position + active-meso
  adherence/fatigue + key-lift e1RM trend), `get_recent_sessions` (reverse-chron
  completed workouts with session feedback + notes), `analyze_exercise_progress`
  (e1RM trend + **stall/plateau detection**), `compare_mesocycles` (side-by-side
  rollups, caller order preserved), `get_muscle_balance` (push/pull/legs split +
  per-muscle weekly sets, advisory-only), `get_exercise_affinity` (the
  exercise-selection profile — frequency/recency/loads × pinned note × aggregated
  joint-pain/workload/pump feedback, exclusions respected).
- **Pure `detectStall`** (exported, unit-tested): classifies an e1RM series as
  improving / plateau / declining by comparing the recent window's best against
  the prior best (tolerance-guarded), with `sessions_since_best`. Drives the
  progress analysis without touching the engine.
- **New query-layer readers (`src/lib/queries/coaching.ts`).** `getRecentSessions`,
  `getExerciseAffinity` (the `logged_sets`/`v_exercise_overview` × muscle-groups ×
  notes × feedback rollup), and `getExerciseE1rmSeries` — all RLS-scoped, no
  service role.
- **Honesty guardrails (10 §9).** e1RM/strength labeled estimates everywhere;
  balance is advisory-only and explicitly states MEV/MAV/MRV landmarks are **not
  yet parameterized** (10 §8 remaining), so no per-muscle threshold is asserted;
  pump/soreness framed as secondary.
- **Tests (`__tests__/coaching-tools.test.ts`, +16 → 200 total).** `detectStall`
  across improving/plateau/declining/insufficient/null-handling, every shaper,
  registration of all six tools, the no-`user_id` contract, and
  unauthenticated-call rejection.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (200/200), `npm run build`
green. End-to-end `tools/call` against hosted is the owner's check.

### Deviations

- **`get_muscle_balance` uses the implemented push/pull/legs + per-muscle weekly
  sets** (the same `getMesoStats` balance the in-app screen shows) rather than
  MEV/MAV/MRV landmark comparison — those landmarks aren't in `engine_params` yet
  (10 §8 remaining). The tool says so in its payload, keeping it honest.
- **`get_exercise_affinity` aggregates feedback via `workout_exercises`** (the
  exercise↔feedback join), bounded to the user's trained exercises; capped at 60
  rows per call.

## 2026-06-17 — Phase 6 Slice 2a: MCP read/analysis tools

First half of 07 Phase 6 Slice 2 — the **read/analysis tool surface** for the
MCP connector. Twelve thin, zod-validated read tools wrapping the existing
`src/lib/queries/` layer + one new engine-decision reader; identity always from
the session (hard rule #5), every shape matching the in-app stats views (05
§Data-shape contract). Vertical slice; `main` deployable; no schema change. The
coaching suite (overview/recent-sessions/analyze/compare/balance/affinity) is
Slice 2b, next.

### Done

- **Read tools (`src/lib/mcp/tools/read.ts`, `registerReadTools`).**
  `get_profile`, `get_macrocycles`, `get_mesocycle` (groups-first plan),
  `get_mesocycle_summary` (adherence + volume + est. strength + feedback +
  per-exercise e1RM progress), `get_macrocycle_summary` (fig 2.2 target/timeline/
  stats via `planForMacro`), `get_exercise_history` (both note kinds),
  `get_muscle_group_volume` (planned vs logged sets per group per week),
  `search_exercises` (name/equipment/muscle filter), `search_templates`,
  `get_exercise_notes` (all pinned notes), `get_exclusions`, and
  `explain_prescription`. Each handler resolves identity from the token-bound RLS
  client; pure shaper functions (`formatProfile`/`formatMesoSummary`/… ) are
  exported and unit-tested without I/O, mirroring `formatCurrentState`.
- **New query-layer readers.** `getLatestPrescriptionDecision` (progression.ts) —
  the most recent `engine_decisions` row for one of the user's exercises (walks
  the user's `workout_exercises` → latest decision; RLS-scoped, no service role),
  surfaced by `explain_prescription`. `listAllPinnedNotes` (exercises.ts) — every
  pinned note with exercise names, for `get_exercise_notes`.
- **`workout://profile` resource** alongside `workout://current-cycle`, same
  shape as `get_profile`.
- **Honesty guardrails (10 §9) in copy.** e1RM/strength/targets labeled
  estimates; exclusions flagged "never recommend"; the prescription tool states
  the engine — not the model — owns every number.
- **Tests (`__tests__/read-tools.test.ts`, +24 → 184 total).** Pure-shaper tests
  for all twelve shapers (found/not-found, adherence math, estimate labels, both
  note kinds, custom-exercise flagging, week sorting), registration of every tool
  name, the **no-`user_id`-arg** contract across the whole surface, the profile
  resource, and unauthenticated-call rejection.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (184/184), `npm run build`
green. Tools are read-only over existing RLS-scoped views/queries + the pure
engine; no new write surface, no migration. End-to-end `tools/call` against the
hosted project (per the Slice 1 recipe) is the owner's check once merged.

### Deviations

- **Tool naming:** `get_mesocycle_summary` / `get_macrocycle_summary` (the spec
  lists `get_meso_summary` / `get_macro_summary`) — spelled out to read clearly in
  a client's tool list; constants documented in `read.ts`.
- **Read tools grouped in one `read.ts` module** with per-tool register functions
  + a `registerReadTools` aggregator, rather than one file per tool — keeps the
  twelve thin wrappers reviewable in one place (get-current-state.ts stays its own
  file). Matches the 05 §Module layout `tools/` intent.
- **`search_exercises` equipment is a free `z.string()`** (cast to `EquipmentType`)
  rather than a zod enum — the stored vocabulary has 14 values incl. legacy
  variants; an unmatched value simply returns no rows.

## 2026-06-17 — Phase 6: OAuth consent UI (connector handshake completable)

Builds the app-side **OAuth 2.1 consent flow** the Supabase OAuth server
requires, so an MCP client (Claude) can complete the authorization-code
handshake against WORKOUT. Human dashboard steps were completed by the owner
(OAuth server enabled, Authorization Path `/oauth/consent`, Site URL/redirects);
verified the AS discovery + dynamic client registration are live. `main`
deployable; no schema change.

### Done

- **Consent screen** `src/app/oauth/consent/page.tsx` — Supabase redirects here
  with `authorization_id`; the page requires a signed-in user (else
  `/sign-in?redirect=…` preserving the id), fetches
  `supabase.auth.oauth.getAuthorizationDetails`, and renders a ledger-styled
  consent screen (client name, account, redirect URI, requested scopes with
  plain-language labels) + Deny/Approve. Auto-redirects when already consented;
  graceful states for missing/invalid `authorization_id`.
- **Decision handler** `src/app/api/oauth/decision/route.ts` — POST calls
  `approveAuthorization` / `denyAuthorization` as the signed-in user (no
  `user_id` trusted) and 302s to Supabase's returned client `redirect_url`.
- **Sign-in redirect** — `signIn` honors a **same-origin** `?redirect=` param
  (`safeRedirect` guards against open redirects); the sign-in page carries it as
  a hidden field (Suspense-wrapped `useSearchParams`). Middleware now treats
  `/oauth/consent` + `/api/oauth/decision` as public (they manage their own
  auth and must preserve the id).

### Verified

`typecheck`, `lint`, `test` (160/160), `build` green. Runtime smoke on the built
server: `/oauth/consent` with no id → graceful 200; with an id but no session →
307 to `/sign-in?redirect=…` (id preserved); `/api/oauth/decision` → 400 (no id)
/ 307 to sign-in (no session). Confirmed against hosted Supabase: AS discovery
returns full metadata (incl. `registration_endpoint`) and **dynamic client
registration** returns a `client_id`. Full Claude connect (consent → token →
`get_current_state`) is the owner's end-to-end check (runbook Test C).

### Deviations

- No mockup for the consent screen — house ledger style (recorded).
- A test OAuth client was registered via DCR during the smoke check (harmless).

## 2026-06-16 — Phase 6 Slice 1: MCP transport + auth + get_current_state

First MCP connector slice (07 Phase 6, slice 1). `/api/mcp` is live as a
Streamable-HTTP **resource server** that validates Supabase-issued bearer JWTs
and exposes one grounding read tool. Vertical slice; `main` deployable; no
schema change. Verified end-to-end against the hosted project with a real token.

### Done

- **Deps.** Added `mcp-handler`, `@modelcontextprotocol/sdk`, `jose`.
- **Transport (`src/app/api/mcp/route.ts`).** Stateless Streamable-HTTP at exactly
  `/api/mcp` (Node runtime, `force-dynamic`); SSE disabled (retired from the spec,
  needs Redis). Server name/version + the domain **instructions string** (RIR,
  cycle hierarchy, units, "engine owns the numbers") wired in.
- **Auth bridge (`src/lib/mcp/auth.ts`).** `verifyMcpToken` validates the bearer
  JWT against the project **JWKS** (ES256 confirmed enabled on the hosted project)
  via `jose`, checking issuer `<url>/auth/v1`; identity (`sub`) is stashed in
  `authInfo.extra.userId`. `createMcpRlsClient(token)` forwards the JWT as the
  `Authorization` header so **RLS does per-user scoping** — no `user_id` ever
  crosses the tool boundary (hard rule #5). Missing/invalid token → `undefined`
  → 401.
- **Discovery (`/.well-known/oauth-protected-resource`).** RFC 9728 metadata via
  `protectedResourceHandler`, pointing clients at the Supabase OAuth AS
  (`MCP_AUTH_ISSUER` overrides). Built lazily per request (issuer resolved from
  runtime env, not build time) + CORS `OPTIONS`. The app auth middleware now
  treats `/api/mcp` + the metadata path as public (bearer-auth, not cookie-auth)
  so they aren't redirected to `/sign-in`.
- **Session + tool + resource (`src/lib/mcp/`).** `resolveSession(extra)` →
  `{ userId, token, clientId, scopes, client }` is the single identity-resolution
  point every handler starts from. `get_current_state` (empty input schema) wraps
  the existing `getCurrentState` query → pure `formatCurrentState` shaper
  (active macro→meso→micro→next workout + target RIR + one-line summary).
  `workout://current-cycle` resource returns the same shape. `server.ts` registers
  the surface; `tools/index.ts` is the slice-by-slice registry.
- **More → AI connector (fig 4.4).** Row now links to a new `/more/connector`
  page: intro, the copyable MCP endpoint, how-to-connect steps, and access/
  revocation notes. House ledger style (no specific mockup for the detail screen).
- **Tests (`src/lib/mcp/__tests__/`, +11 → 160 total).** A capture-server harness
  (`fakeAuthInfo`/`fakeExtra`) + tests covering `formatCurrentState` (no meso /
  full active / deload / meso-without-workout), tool+resource registration, the
  empty-input-schema contract, **auth-gating** (unauthenticated and
  no-`sub` calls both throw), and `verifyMcpToken` default-deny. `server-only` is
  aliased to a stub in `vitest.config.ts` so server-tagged modules are testable.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (160/160), `npm run build`
green. **Runtime smoke against the hosted Supabase project:** (1)
`/.well-known/oauth-protected-resource` returns correct metadata; (2) POST
`/api/mcp` with no/invalid token → 401 with a spec-compliant
`WWW-Authenticate: Bearer … resource_metadata=…`; (3) with a real ES256 user JWT,
`tools/list` shows the tool and `tools/call get_current_state` resolves identity
from the token and returns the RLS-scoped state (empty for the fresh test user) as
text + `structuredContent`.

### Setup runbooks added (2026-06-16 follow-up)

Documented the human-only setup in `docs/deployment/`: `mcp-connector-setup.md`
(architecture, enable-OAuth-server steps, env-var table, end-to-end test
recipes) and `manual-operations.md` (standing list of dashboard/secret ops
Claude can't perform). CLAUDE.md now points at both.

**Hosting clarification:** the MCP server is **co-hosted in the same Next.js app**
at `/api/mcp` (not a separate Vercel project, unlike the standalone
`ngs-inventory-mcp` pattern) — deliberate per 05 §Transport (shared query
layer/engine/views, stateless transport, Supabase is the auth server).

**Found while documenting (important):** Supabase's OAuth server requires the
app to host a **consent UI** at the configured Authorization Path
(`/oauth/consent` + `/api/oauth/decision`, via
`supabase.auth.oauth.getAuthorizationDetails/approve/deny`). This is required
app code **not built in Slice 1** — without it the authorization-code handshake
can't complete even once the server is enabled. `@supabase/supabase-js@2.108`
(installed) exposes the methods. Tracked as the immediate next slice.

### Remaining / external (carried to follow-up)

- **Enable Supabase's native OAuth 2.1 Server on the hosted project** — the
  resource-server side (JWKS verify, 401 discovery) is done and works with any
  Supabase-issued JWT, but the AS metadata endpoint
  (`/.well-known/oauth-authorization-server`) currently 404s, so DCR + the
  authorization-code/PKCE handshake a remote client uses to *obtain* a token isn't
  live yet. This is a dashboard toggle, not a code change. Once on, the connect
  flow on `/more/connector` works as written.
- **In-app revocation UI** depends on the OAuth-grants API surfacing connected
  clients; the connector page documents revocation via the client / connected-apps
  for now.
- Slices 2–4 (read/coaching suite, write/planning drafts, admin/tuning + replay)
  per 07 Phase 6.

### Deviations

- **No specific mockup for the AI-connector detail screen** (4.4 only specs the
  row); `/more/connector` is built in the house ledger style.
- A throwaway confirmed auth user was created during the hosted smoke test (no app
  data); harmless orphan, left in place (no service-role delete from this session).

## 2026-06-16 (latest) — Adherence rule: attended/due over working weeks, decided days only

Made the adherence definition correct as a stock rule (migration
`20260616000001_adherence_rule.sql`). The shared summary views now expose
`sessions_attended` (completed) and `sessions_due` (completed|skipped), both over
**working (non-deload) weeks only**; `macro.ts` computes adherence =
attended / due. Consequences:
- **Deload weeks excluded** — a skipped/short deload is never an absence.
- **Future/unstarted days excluded** — `planned`/`in_progress` aren't counted, so a
  meso in progress isn't dinged for days that haven't come up yet (only decided
  days — completed or skipped — count, i.e. days prior to the current one).
- Garron's completed macros read 91–96%; the active macro 88% (reflects only its
  3 real past misses, not the 3 upcoming week-3 days). Views recompute live.

## 2026-06-16 — Imported-history adherence fix (missed working-week days)

The history import only created `completed` workout rows for days that had logged
sets, so `v_macro_summary` / `v_meso_summary` showed **100% adherence** even where
sessions were skipped (workouts_total == sessions_logged). Fix: insert a `skipped`
workout for every planned day (`meso_days`) of a **working (non-deload) week** that
has no workout — deload weeks are left as-logged (their reduced volume is typically
intentional, not a miss). Views recompute live, so stats update immediately.

- Both build scripts now do this as their final step (`history-build.sql`,
  `history-build-standalone.sql`); applied to the live data for both accounts.
- Garron's completed macros now read 92–96% (was 100%); Madeline's mesos likewise.
## 2026-06-16 — Phase 6 (MCP connector) plan locked

Planning session for the MCP connector ahead of implementation in a separate session.
No code yet — this commit records the build decisions in the specs so the next session
launches straight from the docs. `main` unaffected.

### Decisions

- **Auth = Supabase's native OAuth 2.1 Server** as the authorization server (authorization-code
  + PKCE, **dynamic client registration**, JWKS/OIDC discovery, revocation; issues Supabase JWTs
  with `user_id`/`role`/`client_id`). `/api/mcp` becomes a pure **resource server** validating the
  bearer JWT via `mcp-handler`'s `withMcpAuth`, with **RLS doing per-user scoping**; service-role
  reserved for `mcp_write_audit` + admin cross-scope reads. No custom token table. This collapses
  the riskiest slice from "build an OAuth AS" to "verify a JWT + expose protected-resource
  metadata." (05 §Auth.) Requires enabling the OAuth server on the hosted project.
- **Vertical slices** (each deployable): (1) transport+auth+`get_current_state`+test harness,
  (2) full read/analysis + coaching suite, (3) write/planning drafts (audited), (4) admin/tuning +
  replay. (07 Phase 6.)
- **Tool surface expanded for coaching** beyond the original spec list: `get_training_overview`,
  `get_recent_sessions`, `analyze_exercise_progress` (stall/plateau detection), `compare_mesocycles`,
  `get_muscle_balance`, `get_exercise_notes`/`get_exclusions`, and **`get_exercise_affinity`** — an
  exercise-selection profile per muscle group / equipment type combining prior selection (frequency,
  recency, loads/volume) with pinned notes and aggregated session feedback, so advice/planning favor
  proven, well-tolerated movements and avoid flagged ones. All read-only on existing views + the
  pure engine. (05 §Coaching & analysis.)

### Codebase readiness (surveyed)

- `src/lib/mcp/` and `src/app/api/mcp/` do **not** exist yet — Phase 6 is greenfield on top of a
  built app.
- The `src/lib/queries/` layer (~90 fns, all `(client, userId, …)`-shaped) already covers nearly
  every read/write a tool needs; the pure engine (`prescribe`/`seedMeso`/`planMacrocycle`/
  `estimateE1rm`) is fully exported; `mcp_write_audit`/`engine_params`/`engine_decisions` and the
  shared `v_*` views all exist. **Missing data paths:** an `engine_decisions` reader, a param-version
  lister, and the affinity rollup — plus likely one index migration on `engine_decisions`.

### Verified

Docs-only change: `05-mcp-connector.md` (auth approach + coaching/analysis tool tables incl.
`get_exercise_affinity`), `07-implementation-plan.md` (Phase 6 reorganized into slices), this log.

## 2026-06-16 — Unified note sheet (pin checkbox) + Exercise-page pinned-note pencil + MCP notes contract
## 2026-06-16 (latest) — Live reps⇄weight⇄RIR predictor + auto-match-weights setting

Implements [11-workout-engine-explainer.md](11-workout-engine-explainer.md) §6
after design review. Vertical slice; `main` deployable.

### Done

- **Live reps prediction (request #1).** New pure engine module
  `src/lib/engine/reps.ts` — `predictRepsAtWeight` / `impliedRirAtReps` (invert
  the averaged Epley/Brzycki e1RM curve by bisection) + `recencyWeightedE1rm`
  (the strength anchor: each sample's e1RM weighted by
  `0.5^(ageDays/recency_halflife_days) × confidence`, pure — caller supplies
  ageDays). On the Day View, changing a set's weight now re-estimates the reps
  that hit the row's **target RIR** from the user's recent history, until the
  user types their own reps; future rows display the predicted reps at the
  planned weight. New param `e1rm.recency_halflife_days` (default 30 d, engine
  params **v6**). 13 golden/property tests.
- **RIR premise (decision).** No separate per-set RIR capture: the prescribed
  target RIR is the assumed RIR for all e1RM math (the app prescribes RIR and
  trusts the honest log). Anchor recency-weighted so it tracks current form
  (e.g. drops on a cut). Predicted reps = single integer.
- **Auto-match weights (request #3).** New `profiles.auto_match_weights`
  (migration `20260616000002`, off by default), More-tab ON/OFF toggle, and
  propagation of a just-entered weight onto the exercise's **unlogged** sets
  (via `prescribed_weight`; logged history untouched — hard rule #5). Rides the
  existing owner-only profiles RLS; new RLS tests added.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (141/141), `npm run build`
green. No mockup figure exists for these (live predictor is a behavior change,
not a layout change; the toggle mirrors the existing Units control) — the reps
field updates in place with no new chrome, so no pixel deviation to record.
RLS unchanged except the additive column (covered by existing policies).
## 2026-06-16 (latest) — Unified note sheet (pin checkbox) + Exercise-page pinned-note pencil + MCP notes contract

On-device feedback on the notes-model slice: the pinned vs session note should be
**one** entry with a pin toggle, not two menu items. This unifies the UI, adds the
Exercise-page pencil, and records the two-note contract for the MCP. No schema change.

### Done

- **One note, one sheet, a pin checkbox.** The exercise `⋮` menu now has a single
  **Note / Notes** row (was two: pinned + session). It opens a unified sheet with a
  textarea + a **"Pin to this exercise"** checkbox whose helper line states the
  difference plainly: checked → *"Stays on this exercise in every workout."*,
  unchecked → *"Saved with just this session — a note on how it went today."* The
  checkbox decides where the note lands (pinned `exercise_notes` vs session
  `exercise_feedback.notes`).
- **Move between buckets.** Flipping the pin on an existing note **moves** it rather
  than duplicating: pinning a session note clears the session copy; unpinning the
  pinned note demotes it to a session note (new `clearPinnedNote` query +
  `clearPinnedNoteAction`). Empty text clears the note in its bucket. Both display
  bars (PINNED — / NOTE —) keep their inline pencils, which open the same sheet
  pre-targeted to that bucket; the menu row defaults to the session note.
- **Exercise-page pinned-note pencil (parity).** New `ExercisePinnedNote` client
  component on the Exercise page (3.1a): the pinned note shows with an inline pencil
  to edit/clear, and an empty state offers **+ PIN A NOTE**. Saves via a new
  `setPinnedNoteAction` (exercise-scoped; empty unpins). No workout context needed —
  it's the exercise-wide note.
- **MCP notes contract (`docs/05-mcp-connector.md`).** Recorded that the connector
  exposes **both** note kinds and why: the pinned note is durable/general (conditions
  interpretation of the whole history), the session notes are day-to-day signal
  (trend, recovery, adherence). `get_exercise_history` carries both; `log_note` writes
  either kind (drafts/active session only, never completed history). This is the
  understanding the MCP uses to be a stronger partner.

### Recorded deviations

- **Pin defaults off** for a note opened from the menu — a mid-workout note is most
  often a session observation; the checkbox + copy make pinning a deliberate one-tap.
- **Both notes can still coexist** on an exercise (a durable pinned caveat + today's
  observation); the two display bars and pencils manage each independently, while the
  single sheet handles one note at a time per its pin state.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (136/136), `npm run build` green.
Still no schema change (session note rides `exercise_feedback`; the pinned note rides
`exercise_notes`); the move/clear paths are user-scoped through existing RLS and the
completion lock. In-browser QA of the unified sheet + Exercise-page pencil pending.

## 2026-06-16 — Notes-model split (09 §8) + options-menu polish (subtle ⋮ · Edit day deep-link)

Follow-up to the options-menu slice (on-device notes). Lands the **notes-model
split** (09 session-5 §8) and two interaction fixes. No schema change — the
session note reuses an existing column; `main` deployable.

### Done

- **Options menu polish.** The Day View header `⋮` is now **borderless** (subtle
  ink-tint, darkens when open) instead of a boxed control. **Edit day** deep-links
  the planner to the **current day** (`/cycles/meso/[id]/plan?day=<n>`): the page
  reads a `day` searchParam and `PlannerBoard` seeds `activeDayId` from the matching
  day (falls back to day 1). Edit mesocycle still opens the board on day 1.
- **Notes model split (09 §8).** Two distinct exercise notes, now cleanly separated:
  - **Pinned note** (cross-workout, already existed via `exercise_notes`) gains an
    **inline pencil** on the pinned-note bar (Day View) for direct editing, and the
    edit sheet now **prefills** the current body; the menu row reads `New/Edit
    pinned note`.
  - **Session log note** (net-new) — a per-session note **saved with that workout's
    exercise log**. Stored in **`exercise_feedback.notes`** (one row per
    workout_exercise) — **no migration**: that table's completion-lock RLS already
    gates update/delete to the active workout, so the note is editable **only in the
    live session** and locks on completion, exactly per §8. New `saveSessionNote`
    query + `saveSessionNoteAction`; a `NOTE —` bar + `SessionNoteSheet` on the Day
    View (menu row `Add/Edit session note`; empty clears it).
  - **History display** — `getExerciseHistory` now carries `session_note`;
    `ExerciseHistoryList` (now a client component) shows a small **✎ note icon** on
    rows that have one and **reveals the note on tap**. Shared by the 3.2 history
    sheet and the Exercise page History tab.

### Recorded deviations

- **Session note reuses `exercise_feedback.notes`** rather than a new
  `workout_exercises.log_note` column (09 §8 offered either). It's per-we, already
  RLS-gated to the active workout (completion lock), and `workout_exercises.notes` is
  already taken by the engine's prescription rationale — so reuse avoids a migration
  and a second lock policy. Pump/workload/joint-pain on the row are preserved (only
  `notes` is written); a feedback-less note inserts a notes-only row.
- **Exercise-page pinned-note inline edit not added** — the §8 pencil affordance is
  on the Day View bar; editing the pinned note from the Exercise page is a minor
  follow-up.
- **Notes rows now live in the exercise `⋮` menu** (not the header options menu) —
  the per-exercise note is an exercise-scoped action; the header menu stays
  whole-workout/meso. This also unblocks the header menu's deferred "notes" items
  conceptually (per-exercise notes are covered; a whole-workout note is separate).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (136/136), `npm run build` green.
No schema change; the session note rides the existing `exercise_feedback` table +
completion-lock RLS (logged history untouched). In-browser QA of the pencil/sheet +
history reveal on a device still pending (as for other screens).

## 2026-06-16 — Workout / mesocycle options menu: End workout · End mesocycle (09 session-5 §9)

Lands the **Workout / mesocycle options menu** — the open reconciliation-backlog
item from the 2026-06-15 logging review (09 session-5 §9): a header `⋮` control on
the Day View opening a grouped menu, with the two net-new audited end-early actions.
No schema change; reuses the existing completion + per-set-skip machinery; the pure
engine is untouched. Vertical slice; `main` deployable.

### Done

- **Header `⋮` options menu (fig 1.1).** New `WorkoutOptionsMenu` to the right of the
  date / Target-RIR column, sized to the height of those two rows (per the spec). Opens
  the shared viewport-flipping `AnchoredMenu` with two labelled groups:
  - **MESOCYCLE** — Edit mesocycle (→ planner board `/cycles/meso/[id]/plan`) ·
    Mesocycle stats (→ `/cycles/meso/[id]/stats`) · **End mesocycle** (destructive,
    shown only while the meso is `active`).
  - **WORKOUT** — Edit day (→ planner board) · **End workout** (destructive, shown only
    while the workout is `planned`/`in_progress`).
  Each end action opens a strong-warning confirm `BottomSheet` before running.
- **End workout** (`endWorkout` + `endWorkoutAction`) — skips every still-open set on
  every exercise (reuses `skipRemainingSets`), runs the standard `completeWorkout`
  (exercise statuses, microcycle close), then the same week N→N+1 generation as a normal
  completion (service-role, scoped to the user; a generation failure can't lose the
  early-end). Routes to the next workout if one was generated, else the Workout tab —
  mirroring the Complete sheet.
- **End mesocycle** (`endMesocycle` + `endMesocycleAction`) — for every not-yet-finished
  workout of the meso: skip all open sets, then close it (**completed** if anything was
  logged on it, **skipped** if untouched); then mark every microcycle and the mesocycle
  `completed`. **Logged sets are never modified** — only open planned slots are skipped
  and statuses advance; no week generation runs (the meso is over). Routes to the meso
  detail page.
- **Pure helpers** `src/lib/logging/end.ts` — `isRemainingWorkout(status)`,
  `endWorkoutStatus(hasLoggedSets)`, and `remainingSetNumbers(prescribed, logged,
  skipped)` (the open-slot computation). **+8 unit tests** (136 total).

### Recorded deviations

- **Notes items deferred.** The §9 menu also specs *Mesocycle notes* and *New/Edit
  workout note* rows — both depend on the §8 **notes-model** split (pinned vs session
  note), which is its own backlog slice. Those rows are omitted here rather than stubbed;
  the menu ships with the navigation + end-early items that don't need the notes model.
- **"Add exercise" deferred.** The §9 *Add exercise* row (group-aware picker against the
  live workout) is its own piece of work; not built this slice. Edit day routes to the
  planner board (the planner does not yet deep-link the current day pre-selected —
  acceptable, the day is one tap on the board).
- **No separate in-app audit row.** The spec calls these "audited" queries; like the
  existing `completeWorkout`/`deleteMesocycle`, the end actions are deliberate,
  RLS-scoped, confirm-gated server actions rather than rows in `mcp_write_audit` (that
  table is the MCP write boundary, not in-app actions). Built in the house ledger style
  (the `⋮` control + grouped menu aren't separately mocked).
- **End mesocycle from the Day View** acts on the meso behind the viewed workout; it's
  offered only while that meso is `active`.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (136/136), `npm run build` green.
The end helpers are unit-tested; the IO (`endWorkout`/`endMesocycle`) reuses the
smoke-tested `skipRemainingSets`/`completeWorkout` paths and is user-scoped through the
existing `workouts`/`workout_exercises`/`microcycles`/`mesocycles` RLS — logged_sets are
never written, so the completion-lock policy is unaffected. In-browser interaction QA of
the menu + the two confirm flows on a device still pending (as for other screens).

## 2026-06-16 — Planner board bug fixes: sheet stacking, eager day-add, 7-day cap (on-device review)

On-device review of the planner board surfaced three concrete, reproducible
bugs (the prior optimistic-bridge fix didn't cover them). No schema change;
`main` deployable.

### Fixed

- **Stacked day-sheet + group-picker ("two edit-day windows / non-responsive
  window").** Opening **+ ADD MUSCLE GROUP** from the EDIT DAY sheet left the
  day sheet mounted **behind** the picker, so the picker (which looks like the
  day sheet) appeared to "slide up over another window," and on close the stale
  day sheet underneath read as non-responsive. Now it's **single-sheet at a
  time**: opening the picker from the day sheet **closes** the day sheet (after
  persisting its label/weekday) and **reopens** it when the picker closes — but
  only when the picker was opened from the day sheet (a `returnToDaySheet` flag;
  the board's own + ADD MUSCLE GROUP returns to the board).
- **Day-tab `+` then Cancel still added the day.** In editing (staged) mode the
  `+` committed the day to the working copy immediately, so Cancel/✕ didn't undo
  it. The day sheet now distinguishes **DONE** (`onDone` — commit) from
  **Cancel/✕/scrim** (`onCancel`); a just-added, never-confirmed day is tracked
  (`pendingNewDayId`) and **rolled back on cancel** (in both staged and live
  modes; the optimistic draft ghost is cleared too). The button reads **ADD
  DAY** for a new day, **DONE** for an existing one.
- **"Application error" past 7 days.** A week is 7 days — the DB checks
  (`meso_days.day_number ≤ 7`, `mesocycles.days_per_week ≤ 7`) threw once a
  user added an 8th. The day-tab `+` is now **hidden at 7 days** (`atDayLimit`),
  and day numbering picks the **smallest unused 1..7** (`nextDayNumber`) instead
  of `max+1` — so removing then re-adding a day no longer pushes `day_number`
  past 7 (the live `addMesoDay` query got the same fix). `saveMesoPlan` schema
  tightened from `max(14)` to `max(7)` to match the DB.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (128/128), `npm run build`
green. The fixes are planner interaction state + a day-numbering correction
(client + the `addMesoDay` query); RLS unchanged. In-browser re-test of the
three flows on a device recommended to confirm.

## 2026-06-16 — Planner reorder (groups + exercises) + draft add-day sheet fix

Closes the remaining two open items from the 2026-06-16 notes batch ("Not done
yet"): **planner reorder** and the **add-day sheet dismissal** bug. No schema
change; `main` deployable. Vertical slice.

### Done

- **Reorder muscle groups within a day** — up/down (▲▼) move controls on each
  group row in the EDIT DAY sheet (fig 2.5). **Reorder exercises within a
  group** — ▲▼ controls on each filled slot row on the board (replacing the
  decorative `⋮⋮` grip). Both work in **both persistence modes**: staged into
  the local `workDays` copy when editing a planned/active meso (persisted on
  SAVE CHANGES), or a **live position rewrite** on a draft.
- **No migration needed.** `meso_day_groups.position` and
  `meso_exercises.slot_number`/`position` already exist, with **no unique
  constraint** on the ordering columns — so the live reorder is a plain
  index→position rewrite (`reorderDayGroups` / `reorderGroupExercises`,
  scoped to the day/group), no temp-value swap. *(The prior PROGRESS note's
  "no position column" premise was outdated.)*
- **Pure helper** `moveInOrder(ids, id, delta)` (`planner/groups.ts`) — moves
  one item up/down in an id list, no-op (same reference) past either end or for
  an unknown id; drives both modes. **+5 unit tests** (128 total).
- **Draft add-day sheet dismissal fix.** The draft (live) add-day flow set
  `daySetupId` to a brand-new day before revalidation had put it in props, so
  the day-setup sheet briefly had no backing day. `addDay` now seeds an
  **optimistic local day** from the returned insert row (`withPending`) so the
  sheet renders immediately and reconciles (drops the optimistic row) once the
  revalidated props include it — taking `addDay…→revalidate` out of the
  interaction loop without breaking the draft's live persistence / "continue
  editing" guarantee.

### Recorded deviations

- **Reorder is up/down move controls, not pointer/touch drag-and-drop.** The
  notes asked for DnD "ideally"; up/down is the accessible fallback the note
  itself offered, works identically in both persistence modes (no half-working
  DnD across modes), and matches the existing day-view **Move up/down** pattern.
  Square-corner ledger styling preserved.
- **Group reorder lives in the EDIT DAY sheet; exercise reorder is inline on
  the board.** Groups are a day-structure concern (edited in the day sheet);
  exercises are shown as slots on the board, so their ▲▼ sit on the slot rows.
- **Live exercise reorder packs fills to the top slots** (slot_number 1..n in
  the new order) — a cleared mid-group slot moves to the bottom on reorder.
  Acceptable (no logged data here) and arguably tidier.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (128/128), `npm run build`
green. `moveInOrder` is unit-tested; the live reorder writes are user-scoped
through the existing `meso_day_groups`/`meso_exercises` RLS (planning rows only —
no logged history touched). The dismissal fix is client state (optimistic
bridge); code review showed the editing path was already sound (sheet keyed by
`day.id`, balanced scroll-lock). In-browser pixel/interaction QA of the reorder
controls and the draft add-day flow still pending (as for other screens).

## 2026-06-16 — Edit macrocycle (fig 2.3 engine, prefilled + safe re-plan)

Closes the **Edit macrocycle** item teed up in the prior 2026-06-16 notes batch
("Not done yet"). Create-macro existed; the edit surface (rename · goal ·
duration · block length · notes · re-plan/re-phase the meso slots) was the gap.
No schema change; `main` deployable. Vertical slice.

### Done

- **Edit screen** `/cycles/macro/[macroId]/edit` (`EditMacroForm`) — the same
  fig 2.3 create engine, **prefilled** from the macro and recomputing the
  realistic target / per-month rate / meso-count / phase preview live via
  `planMacrocycle`. Adds a **GOAL NOTES** field (optional, edit-only — create
  didn't expose it though the column + action already supported it). The
  `EDIT MACROCYCLE — SOON` placeholder on the Overview (2.2) is now a real link.
- **`updateMacrocycle`** (`queries/macro.ts`) — updates the macro row (name,
  goal, duration, block length, notes, recomputed `target_*`/`rate_*`/
  `recommended_duration_months`/`target_end_date`) then **reconciles the
  unplanned mesocycle slots** to the new plan size. **Locked mesos
  (planned/active/completed/abandoned) and every logged set are never touched** —
  only `unplanned` placeholders are added, removed (surplus trimmed from the
  tail so the earliest open slots survive), or re-phased; positions re-sequence
  contiguously. The final count can never drop below the locked count.
- **Pure decision helpers** — `reconcileMacroSlots` (orderedMesos + target →
  `{ removeIds, addCount }`) and `macroEditImpact` (locked vs unplanned counts,
  surfaced to the form so the re-plan note reads "keeps your N planned/active/
  completed mesocycles; adds/removes M open slots"). **+5 unit tests** (123
  total) covering grow / shrink-from-tail / never-below-locked / no-op.

### Recorded deviations

- **GOAL NOTES on edit only** — the create form omits it (the engine card is the
  focus there); the edit form is the natural place to annotate an existing arc.
  Built in the house ledger style.
- **Re-phasing applies to unplanned slots only** — a planned/active/completed
  meso keeps the phase the user assigned when planning it; only open
  placeholders pick up the recomputed phase spread.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (123/123), `npm run build`
green; the `/cycles/macro/[macroId]/edit` route compiles. The reconcile decision
is a pure unit-tested helper; the surrounding IO (`updateMacrocycle`) is
user-scoped through the existing `macrocycles`/`mesocycles` RLS and guards
deletes to `status = 'unplanned'`. In-browser QA of the edit/re-plan flow on a
real macro still pending (as for other screens).

## 2026-06-16 — Notes batch: scroll-lock, gender, dark mode, feedback-flow revision, planner polish

Worked the 2026-06-16 notes batch. Most items shipped this slice; the larger
ones (full drag-and-drop reorder, edit-macrocycle, and one bug that needs
in-app reproduction) are teed up below as planned work. Vertical slice; `main`
deployable. One `DATA` migration (applied to hosted).

### Done

- **Overlay scroll-lock.** New ref-counted `useScrollLock` hook wired into
  `BottomSheet`, the day-view `AnchoredMenu` (exercise/set menus), and the
  Workout Complete sheet — the page behind any tray/menu/overlay no longer
  scrolls (and the scrollbar gap is compensated so the layout doesn't jump).
- **Exercise history shows the year.** `ExerciseHistoryList` date now reads
  `D MON 'YY` (was day/month only), so older sessions are unambiguous.
- **Move exercise up (day view).** The 1.2 exercise menu gained **Move up**
  alongside **Move down**; the position swap is factored into one
  `moveExercise(delta)` helper + `moveExerciseUpAction`.
- **Edit feedback (active workouts).** The 1.2 menu gained **Edit/Add
  feedback**; the feedback sheet prefills from any saved row and is keyed per
  exercise.
- **Gender captured.** Onboarding step 1 and the profile editor now set
  `profiles.gender` (the column already existed and the macro target engine
  already read it — this was a pure UI gap). 4-way: female / male / other /
  prefer-not.
- **Full-screen exercise picker (planner).** `BottomSheet` gained a
  `fullHeight` mode (pinned header + footer, scrollable middle); the meso
  planner's exercise picker now rises to nearly the whole screen.
- **Discard a draft.** New `discardDraftAction` (guarded to `draft` status, so
  it can never touch a planned/active cycle or logged history) surfaced as
  **DISCARD DRAFT** on both the plan-a-meso entry banner and the draft board.
- **Dark mode (light / dark / system).** A dark ledger palette as
  CSS-custom-property overrides (ink ⇄ cream on warm near-black, lifted accent,
  light menu shadow) under `[data-theme=dark]` / `(prefers-color-scheme:
  dark)[data-theme=system]`; every ink/cream utility adapts with no markup
  changes. Applied to `<html data-theme>` before paint via an inline script
  (default `system`, no flash); `ThemeToggle` in More settings persists to
  `localStorage`. The three hardcoded ink SVG strokes in the day view switched
  to `currentColor`.
- **Feedback-flow revision (DATA).** Migration `20260616000001` adds nullable
  `exercise_feedback.soreness` (0–10) and `soreness_days` (0–5) — applied to
  hosted, no new advisor lints, RLS unchanged. The **first** exercise logged
  for a muscle group now prompts a *recovery check* (soreness from the last
  session of that group + how many days sore) instead of joint pain; **joint
  pain is asked once**, with the group-complete prompt (pump/workload).
  Middle-of-group exercises no longer auto-prompt; a one-exercise group shows
  everything. Soreness rows carry `muscle_group_id` but null pump/workload, so
  the engine's group-feedback guard (pump/workload non-null) ignores them — **no
  engine behavior change** (engine consumption of soreness is a future slice).
- **Planner active-day guard.** The board's "snap active day back to day 1"
  effect no longer fires while a setup/add-groups sheet references a day the
  just-revalidated `days` hasn't caught up to (a latent wedge in the live draft
  path).

### Recorded deviations

- **Gender / theme / discard / soreness controls** are built in the house
  ledger style — none are in the stock mockups (the mockups predate these asks).
- **Joint pain is now group-level** (stored on the closing exercise) rather than
  per-exercise, per the user's explicit "remove the redundancy" request. The
  engine still reads `joint_pain` per exercise; in practice it's now populated on
  the group's last exercise.
- **Theme is a device setting** (localStorage), not a `profiles` column — instant,
  no migration, and the natural home for a per-device preference.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (118/118), `npm run build`
green. Soreness migration applied to hosted and columns re-queried; security
advisors show no new lints. In-browser pixel/interaction QA of the new
surfaces (dark palette, full-screen picker, soreness prompt) still pending, as
for the other screens.

### Not done yet — planned work (from the same notes batch)

- **Planner reorder (muscle groups + exercises).** ✅ **Shipped** in the
  2026-06-16 (latest) entry above. Note: `meso_day_groups` **already had a
  `position` column** (and `meso_exercises.slot_number`), with no unique
  constraint on either — so **no migration was needed**; the prior assumption
  here was wrong. Reorder via up/down move controls (accessible fallback),
  staged in editing mode / live position rewrite on a draft.
- **Edit macrocycle.** ✅ **Shipped** in the 2026-06-16 (latest) entry above —
  `/cycles/macro/[macroId]/edit` + `updateMacrocycle`; reconciles unplanned
  slots only, locked mesos + logged history immutable.
- **Add-day sheet won't dismiss (BUG).** ✅ **Targeted fix shipped** in the
  2026-06-16 (latest) entry above — the draft add-day path now opens the
  day-setup sheet from an **optimistic local day** (the returned insert row)
  instead of waiting on revalidation, removing the `addDay…→revalidate` gap
  that left the sheet without a backing day. Code review showed the editing
  path was already sound (the sheet is keyed by `day.id`, so revalidation
  updates props in place without remount, and scroll-lock is balanced).
  In-browser confirmation on a device still recommended.
## 2026-06-16 (latest) — App icon design handoff wired in (S4 wordmark + slider)

Replaced the placeholder barbell icons with the final **S4** mark from the design
handoff (`design_handoff_app_icon`): the stacked **WORK / OUT** Archivo-800 wordmark
over a single snap-to-stop slider rule (ink track + orange pip at 62%), on cream
`#F4F0E6` — the icon now reads as the product's own slider control.

### Done

- Dropped the production PNGs into `public/icons/`: `icon-192`, `icon-512`,
  `icon-maskable-512` (paper system, full-bleed) plus the new `icon-180` for iOS.
- Wired `icons` into `src/app/layout.tsx` metadata — `apple-touch-icon` (180) and
  explicit `<link rel="icon">` for 192/512. `manifest.webmanifest` already pointed at
  the three icon paths (project `name`/`start_url` kept; not the handoff placeholder).
- Retired `scripts/generate-icons.mjs` — the placeholder generator would clobber the
  real assets if re-run; the design handoff is now the source of truth.
- Stashed the editable master + dark variants under `docs/design/app-icon/`
  (`icon-source.html`, README spec, `icon-512-dark`, `icon-maskable-512-dark`) for
  regeneration. Dark icons not shipped to `public/` — dark mode is out of scope (rule 9).
- No favicon: the wordmark is illegible at 16–32px; deferred per the handoff note.

## 2026-06-16 — Madeline's history imported (16 standalone mesos, 3,696 sets)

Same pipeline as Garron's import, for the second account (Madeline,
`0af27789…`, `docs/data/master_exercise_history_madeline.csv`, 1,533 rows). She
didn't track macrocycles, so every meso is **standalone** (`macrocycle_id` and
`logged_sets.macrocycle_id` NULL — surfaced via `cycles.ts` `standaloneMesos`).

### Done

- Loaded via REST into `public.import_hist`, then ran `scripts/history-build-standalone.sql`
  (the macro-less variant of `history-build.sql`, idempotency-guarded): **16 mesocycles**,
  **87 microcycles**, 108-equiv day plan, **170 workouts**, **1,533 workout_exercises**,
  **3,696 logged_sets** — all `completed`, joined to the shared library via `legacy_id`.
- `scripts/import-history.py` now takes the CSV path as an argument (defaults to Garron's).
- **Verified:** 16/16 mesos standalone, 0 macros, logged-set count == expected, 91 exercises
  in `v_exercise_prs`, all 16 mesos in `v_meso_summary`; 2024-03-21 → 2026-06-11. Garron's
  27 mesos untouched.

## 2026-06-15 — Full training history imported (27 mesos, 6,745 sets)

Imported Garron's complete logged history (`docs/data/master_exercise_history_garron.csv`,
2,925 rows) into the live account `3183ce71…`. Built the whole hierarchy server-side from a
staging table so no generated uuids transit anywhere; joined exercises on `legacy_id` (the
column added by the library import). Verified end to end.

### Done

- **Decoded the export** (100% of rows): `Set 1` = working weight (== Weight), `Set 2…N` = reps
  per set ⇒ working sets = `Sets − 1`. Bodyweight `(155 − 40)`-style notes use the net `Weight`.
- **Loaded** via REST into `public.import_hist` (anon insert, RLS off, dropped after), then ran
  `scripts/history-build.sql` (single session, idempotency-guarded) to derive:
  **5 macrocycles** (contiguous bulk/cut runs — goal = cut if name~`cut` else hypertrophy; the
  15-meso bulk run stays under the 24-position cap), **27 mesocycles**, **130 microcycles**
  (target-RIR 3→0 ramp; deload week = 4, since RIR wasn't tracked → `logged_sets.rir_reported`
  null), **108 meso_days / 503 groups / 754 meso_exercises** (per-day plan rebuilt groups-first
  from what was logged, `initial_*` from the first week), **463 workouts**, **2,925
  workout_exercises**, **6,745 logged_sets** — all `completed`.
- **Verified:** logged-set count == expected, 0 missing macro links, all 27 mesos + 5 macros +
  111 exercises surface in `v_meso_summary` / `v_macro_summary` / `v_exercise_prs`; e.g. Bench
  Press (Medium Grip) shows 114 sessions, e1RM 154→180 lb. Lifetime volume ≈ 6.07M lb,
  2023-11-07 → 2026-06-15.
- Reproducible via `scripts/import-history.py` (CSV → JSON batches) + `scripts/history-build.sql`.

### Notes / deviations

- All cycles imported as **completed** (even the in-progress June 2026 bulk) — clean for a history
  load; the latest meso/macro can be flipped to `active` to resume.
- Meso **names kept verbatim** from the export (some labels' years are off, e.g. "Cut Dec '25"
  actually ran Dec 2025–Jan 2026); macro names use the real date ranges.

## 2026-06-15 — Exercise library replaced with the user's 330-exercise import

Wholesale replacement of the stock exercise library with the user's curated export
(`docs/data/exercises_all_20260615.csv`, 330 rows). All prior macro/meso/workout/template
rows were test data and are wiped by the import; `profiles`, `muscle_groups`, and
`engine_params` are preserved. Generated, not hand-written — rerun
`scripts/import-exercise-library.py` to regenerate the migration + `seed.sql` from the CSV.

### Done

- **Migration `20260615000006_replace_exercise_library.sql`** — adds `exercises.legacy_id`
  (unique), widens the `equipment_type` check, `truncate … restart identity cascade` of the
  test data, then loads 330 stock rows (`user_id null`) + their primary/secondary muscle links.
- **`seed.sql` regenerated** — muscle_groups + the 330-library + engine_params kept; the stock
  *templates* were **dropped** (they referenced old exercise names that no longer exist and would
  fail a fresh `db reset`). Rebuild stock templates against the new library when desired.
- **Engine boundary normalizer** `toEngineEquipment` (`engine/params.ts`) maps the wider stored
  vocabulary to the canonical step buckets; wired into `buildEngineInputs` (progression) and both
  `seedMeso` call sites (generation). Unit test `engine/__tests__/equipment.test.ts` asserts the
  mapping is loss-free for load math. `EquipmentType` union + `ExerciseRow.legacy_id` added to
  `types/database.ts`; `legacy_id` is insert-optional (`Defaulted`).

### Decisions / deviations (per hard rule #8)

- **Integer ids → `legacy_id`, not the PK.** The PK is a `uuid` (every FK targets it), so the CSV's
  1–330 ids can't be the PK. They live in `exercises.legacy_id` (unique) so the later workout-history
  import joins `old int → legacy_id → uuid`. No separate conversion list needed; a
  `legacy_id ↔ uuid ↔ name` map is exported post-apply for convenience.
- **Equipment stored verbatim from the CSV** (per the user). The check now also allows
  `smith machine`, `bodyweight only`, `bodyweight loadable`, `machine assistance`, `freemotion`
  alongside the canonical engine buckets (the latter still used by user-created customs). Wrinkle to
  reconcile later: both `smith`/`smith machine` and `bodyweight`/`bodyweight only|loadable` are now
  valid; the create-exercise form still offers only the canonical set.
- **Secondaries faithful to the CSV.** A conservative, opt-in enrichment proposal (125 high-confidence
  compound synergists for rows lacking a secondary) is generated to
  `scripts/exercise-secondary-enrichment.sql` (NOT applied by the import) for review.
- **Known near-duplicates kept verbatim** (ids link to history, so nothing merged/renamed): two
  `Hack Squat` (236 quads/machine, 228 glutes/smith), `Back Raise (45 Degree)` (6) vs
  `(45 degree)` (5), `StIff Leg Deadlift` (145), `Triceps cable push-down Bar` (147).

## 2026-06-15 — Planner edit surface (2.5): staged save/cancel, immutability warning, open-workout regen, read-only planned days (on-device feedback)

On-device review of editing an existing meso surfaced four issues. This slice lands the
**Planner board (2.5) edit surface** backlog item plus the read-only future-day view. Vertical
slice; `main` deployable; no schema change.

### Done

- **Staged editing for non-draft mesos.** Editing a `planned`/`active` meso (EDIT PLAN / EDIT WEEKS)
  now works on a **local working copy** — add/remove day, add muscle groups, set exercises, set
  counts, and removals all mutate client state only; **nothing is written until `SAVE CHANGES`**. A
  sticky bottom **CANCEL · SAVE CHANGES** bar appears; CANCEL discards (confirm sheet when dirty),
  SAVE opens a confirm with the warning. **Drafts keep the live build-then-`CREATE MESOCYCLE` flow.**
  The three sheets (day setup, add-groups, picker) were made callback-driven so the board chooses
  staged-vs-live per state. *(This also resolves the reported "add-day panel won't dismiss" bug — the
  sheets now close on local state, with no server-action/revalidation timing in the loop.)*
- **Immutability warning on save.** The save-confirm sheet states plainly that completed/in-progress
  workouts and every logged set are protected and that edits only affect not-yet-started days
  (this week's remaining days + future weeks). The stronger copy shows when the meso has logged
  history (`getMesoDeletionImpact.hasHistory`, threaded into the board).
- **Open-workout regeneration (active mesos).** On save, `regenerateOpenWorkouts` does a **structural
  merge** on the open (not-yet-started) workouts of non-completed weeks: removed days' `planned`
  workouts are deleted, added days get fresh seeded planned workouts, and within an existing
  `planned` workout exercises are added/removed to match the plan while **surviving exercises keep
  their engine-progressed prescription**. Completed / in-progress / skipped workouts and all logged
  sets are never touched. Future weeks (not yet generated) pick up the new plan when their generation
  job runs. `saveMesoPlan` reconciles the planner tables (wholesale replace, day_numbers preserved so
  generated workouts still line up — nothing outside the planner tables references their ids).
- **Read-only planned-day view (issue 4).** New `/cycles/meso/[mesoId]/planned/[week]/[day]` shows a
  not-yet-generated day's **basic planned exercises** (groups → exercise · planned sets · target RIR
  from the ramp/microcycle) behind a clear **`NOT PLANNED YET`** banner explaining loads arrive once
  the prior week is logged. Wired from the Day View navigator chips (future days were dead `<div>`s)
  and the meso-detail ramp matrix's empty/future cells (previously un-clickable) — fixing the "can't
  view unplanned days / workout view gets weird after edits" report.

### Recorded deviations

- **Staged save replaces the planner tables wholesale** on commit (vs. a fine-grained diff) — simplest
  safe reconcile since the planner tables hold no logged data and `day_number` is preserved for
  retained days so generated workouts still match. Regeneration of generated workouts is the careful,
  history-protecting part.
- **Edits during a deload week** reseed newly-added exercises at the microcycle's `target_rir`
  (deload RIR) rather than recomputing the full RP deload reduction; retained exercises are untouched.
  Editing mid-deload is an edge case; the next week's generation recomputes normally.
- **The planned-day view shows structure + target RIR only** (no projected loads) — loads genuinely
  aren't known until the prior week is logged, which the banner states (10 §9 honesty guardrail).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (114/114), `npm run build` green. No schema change.
The staged-edit interactions are client state; the new IO (`saveMesoPlan`, `regenerateOpenWorkouts`)
is user-scoped through existing RLS and reuses the smoke-tested `seedMeso` path; the merge protects
started/completed work and logged sets by status guards. In-browser QA of the edit/save/regeneration
flow on a real active meso still pending (as for other screens).

## 2026-06-15 — Planner pickers retrofit: Add groups (2.6b) + multi-select Exercise picker (2.7) with equipment filter

The 2.6b "Add groups" and 2.7 "Pick exercise" mockups never made it into the build during the
design handoff — the planner shipped a plain inline 2-column add-group grid and a **single-select**
picker filling one slot at a time. This slice transcribes both figures 1:1 and adds the
equipment/machine-type filter the user asked for. No schema change; `main` deployable. Vertical slice.

### Done

- **Add groups (fig 2.6b)** — new `AddGroupsSheet` replacing the inline grid. Region-grouped
  (`LEGS · PUSH · PULL · CORE`, OTHER fallback), **multi-select** with a search box; groups already on
  the day show a greyed ✓ + **`IN DAY`** and aren't re-selectable; the action button reads
  **`ADD N GROUPS`** (live count) and adds all selected in one write (`addDayGroups` batch insert,
  each with one open slot). Opened from both the board's **`+ ADD MUSCLE GROUP`** and the day-setup
  sheet's button (the day-setup sheet no longer carries its own add-group UI).
- **Exercise picker (fig 2.7)** — rebuilt `ExercisePicker` as a **group-centric multi-select**: it
  pre-checks the group's current fills, lists muscle-group-filtered candidates with checkboxes +
  `EQUIPMENT · LAST <date>`, and **`ADD TO <DAY>`** sets the group's exercises to exactly the selected
  set (`setGroupExercises` → `planGroupExercises` lays them into slots 1..n, **retaining each kept
  exercise's `initial_sets`**, defaulting new ones to 3, and **resizing the group's slot count** to
  match). The board's slot rows (filled or empty) all open this one group picker.
- **Equipment / machine-type filter** (user request) — a chip row (`ALL` + the distinct equipment
  types present among the group's candidates) that ANDs with the search; mirrors the library 3.1
  EQUIP axis. Shown only when the group spans more than one equipment type.
- **Pure helpers** `src/lib/planner/groups.ts` — `groupByRegion` (region order + alphabetised,
  empty regions omitted, OTHER last) and `planGroupExercises` (multi-select → slot layout, sets
  retention, dedupe, empty). **+8 unit tests** (114 total).
- **Dead code removed** — the per-slot `fillSlotAction`/`fillSlot` and single-group
  `addGroupAction`/`addDayGroup` paths (superseded) are deleted.

### Recorded deviations

- **Picker is multi-select per group, not per slot.** Fig 2.7 shows checkboxes + `ADD TO <DAY>`, so
  the picker now sets the whole group's exercises at once (and the group's slot count follows the
  number picked). This supersedes the original per-slot single-select (07 Phase 2, fig "2.6") and the
  inline last-session "SELECTED" card; the **`›` on each row still opens the full history sheet**.
- **Regions are mapped client-side by muscle-group name** (`muscle_groups` has no region column) —
  documented constant in `planner/groups.ts`; unknown names fall to `OTHER` so nothing is dropped.
- **Picker subtitle uses `MUSCLE · DAY`** (drops the `SLOT n` now that it's group-level), and the
  day-setup sheet keeps the per-group set-count steppers (the picker can override the count on add).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (114/114), `npm run build` green. Pure helpers
unit-tested; the two new query writes (`addDayGroups`, `setGroupExercises`) are user-scoped through the
existing `mesocycles`/`meso_*` RLS (planning rows only — no logged history touched). In-browser pixel
QA of the two sheets still pending (as for other screens).

## 2026-06-15 — Cycles/meso navigation fixes + day-1 planner data repair (on-device feedback)

Three on-device follow-ups on the Cycles/meso surface. The meso detail page is **kept** (the 09
"nix the meso page" decision is reversed per the user).

### Done

- **All meso rows open the meso detail page** (was: `planned` mesos jumped straight to the planner
  board, so only the active meso reached the page with its delete/stats/start controls). Cycles list
  (`MacroMesoRow`/`StandaloneRow`) and the Macrocycle Overview meso rows now link to
  `/cycles/meso/<id>` regardless of status; `EDIT PLAN` on that page still opens the planner.
- **Completed days are clickable in the ramp matrix** → open the workout in the log view
  (read-only). The `✓` cell on the meso detail calendar is now a `Link` to `/log/<workoutId>`.
- **Day-1 "empty planner" repaired (data).** Diagnosis: on the user's active PPL meso, day 1's
  `meso_day_groups` (and their cascaded `meso_exercises`) had been **deleted** — almost certainly via
  the old ✕-with-stale-UI bug (the remove worked but the sheet didn't refresh, so it got clicked).
  The logged workout was intact (5 exercises, 15 sets). Reconstructed day 1's groups + slot fills
  from the surviving week-1 day-1 `workout_exercises` (chest ×2 · shoulders ×2 · triceps ×1);
  day 1 now matches the other days (3 groups / 5 fills). The **root cause is already fixed** in this
  PR's stale-sheet work, so it shouldn't recur. Idempotent repair (guarded on day 1 having 0 groups);
  no schema change.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green. Data repair run
against hosted and re-queried (all 6 days now 3–4 groups / 5 fills). Read-only diagnosis of the
account before the targeted, reversible insert.

## 2026-06-15 — Draft model: create-mesocycle is the final stage; one draft at a time (Phase 2 on-device feedback, DATA)

Reorders meso creation per on-device feedback: you now build the plan **first** (on the planner
board, as a draft) and **name + size it last**. One draft at a time, no draft management.
Vertical slice; `main` deployable.

### Done

- **`DATA` migration `20260615000005_meso_draft_status.sql`** (append-only; **applied to hosted**,
  constraint re-read, advisors show no new lints) — widens `mesocycles_status_check` to admit
  **`draft`**. RLS unchanged (`mesocycles_all_own` already covers every status for the owner).
  `database.ts` mesocycle status union updated to include `draft`.
- **All three plan-a-meso paths create a draft** and drop you straight onto the planner board:
  `startScratchDraftAction` (blank), `startTemplateDraftAction` (prefilled from a template),
  `startCopyDraftAction` (prefilled from a source meso + its weeks/RIR/deload). The old
  create-**first** form (`/cycles/plan/new` + `NewMesoForm` + `createMesocycleAction`) is removed.
- **Create-mesocycle is the final stage.** A draft's planner board shows **`CREATE MESOCYCLE`**
  (gated until at least one exercise is filled) → a **finalize sheet** (name + weeks + RIR caption,
  fig 2.8) → `finalizeMesoAction` flips `draft → planned` and lands on meso detail. Non-draft boards
  keep the existing `DONE — REVIEW MESO`.
- **One draft at a time.** `createDraftMeso` **clears any existing draft** before creating the new
  one (query-layer enforced — no draft-management UI). Before that point the entry surfaces the
  existing draft so you can **keep editing** instead: a `DRAFT IN PROGRESS — <name> · CONTINUE
  EDITING ›` banner on **/cycles/plan** (with "starting a new plan replaces this draft") and a
  matching dashed banner on the **Cycles** tab. Drafts are excluded from the normal cycles lists
  (`getCyclesOverview` filters `status != 'draft'`; `listCopyableMesos` is now planned/active/completed).
- The template-detail **START A MESO FROM THIS** and both pickers (template/copy) post to the new
  draft actions (forms, not links).

### Recorded deviations

- **Create-last / draft flow** deviates from the mockup's create-first 2.8 sheet — done per direct
  user request (2026-06-15). Draft banners are built in the house style (not separately mocked).
- **Finalize requires ≥1 filled exercise** (not in the mockup) — avoids creating an empty planned meso.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green. Migration applied
to hosted; `mesocycles_status_check` re-read (now includes `draft`); security advisors show no new
lints (no tables/policies/functions added). No hosted integration smoke this slice (avoided polluting
the account); the draft create/finalize/one-at-a-time logic is query-layer IO exercised via
typecheck + build. In-browser flow QA still pending.

## 2026-06-15 — Planner workflow fixes: combined day sheet, live-data bugs, delete mesocycle (Phase 2 on-device feedback)

On-device review of the planner board surfaced several broken interactions and workflow friction.
This slice fixes them. No schema change; `main` deployable. **The larger "draft model" reorder
(create-mesocycle as the *final* stage, one draft at a time) is teed up as the next slice — see
"Not done yet" below.**

### Done

- **Stale-sheet bug fixed — the root cause of three reported "doesn't work" bugs.** The day-setup
  sheet captured a **snapshot** of the day when it opened, so the per-group **± set steppers**, the
  group **✕ remove**, and the **add-muscle-group** picker all wrote to the DB but the sheet (and its
  derived `taken`/`available` lists) never reflected the change. The sheet now reads the **live**
  `day` from the board's `days` prop (looked up by id, re-passed on every revalidation), so all three
  update immediately. The board already re-derived `activeDay` from live data; only the sheet was stale.
- **Add-day and day-setup combined into one view (`Day N`).** Previously you added a day (label +
  weekday) in one tray, then reopened a near-identical "day setup" tray to add muscle groups. Now
  tapping **`+`** creates the day (auto weekday) and **opens the single combined sheet** titled
  `Day 1` / `Day 2` … with weekday + label + muscle groups + per-group set counts all in one place.
  `addDayAction` returns the new day so the client can open it directly; the old `"new"` sheet mode
  is gone. Empty state shows a full-width **`+ ADD TRAINING DAY`** button.
- **Weekday auto-fills (Monday-first).** Adding a day assigns the next unused weekday starting Monday
  (`nextWeekday`), so days are never null/unordered on creation; the user can still change it in the
  sheet. Days sort Monday-first (already the case in `getMesoPlan`).
- **"Week starts on this day" removed.** Weeks are assumed to start Monday; the checkbox and the
  `profiles.week_starts_on` write are gone (`updateDayAction` no longer takes `week_starts_here`).
  The column remains (defaults to 1) — nothing reads it for ordering.
- **Delete a mesocycle (with warnings).** New `DELETE MESOCYCLE` on the meso detail page opens a
  confirm sheet. `getMesoDeletionImpact` counts the meso's `logged_sets`; when there's history the
  copy is stronger (`… N logged sets, every workout, and the week structure …`) **and an
  acknowledgement checkbox gates the delete**. `deleteMesocycle` is user-scoped; FK cascades remove
  microcycles/workouts/logged_sets/planner rows (RLS `mesocycles_all_own` is `for all`; the child
  cascade bypasses RLS by design — verified against the schema).

### Recorded deviations

- **Combined day sheet + removed week-starts** deviate from fig 2.5 (which shows separate add/setup
  and a week-start toggle) — done per direct user request (2026-06-15 on-device review). Square-corner
  ledger styling preserved.
- **Delete button isn't in the stock mockup** — built in the house style (accent destructive row +
  confirm sheet), consistent with other unmocked controls (share/redeem).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green. No schema change.
The fixes are interaction logic in `PlannerBoard.tsx` (live-data derivation) + a delete query/action
covered by the existing RLS model; in-browser pixel/interaction QA of the combined sheet and delete
flow still pending (as for other screens).

### Follow-up — draft model (the headline workflow ask)

Shipped in the **2026-06-15 (latest)** entry above: `create mesocycle` moved to the final stage,
all three paths create a draft, one draft at a time with continue-editing banners.

## 2026-06-15 — Plan-a-meso: copy-a-mesocycle path (fig 2.4 option 01, Phase 2 / Design v2 backlog)

Lands the **copy-a-mesocycle** path — the most-cited remaining Phase 2 gap (option 01 of the
plan-a-meso flow, previously a dashed "soon" stub). No schema change: copy clones the planner
structure and lets `startMeso` reseed loads from the user's all-time bests, so it literally
"starts from where you left off." Vertical slice; `main` deployable.

### Done

- **`copyMesoStructure` + `planMesoCopy`** (`src/lib/queries/cycles.ts`) — `copyMesoStructure`
  reads the source meso's plan (`getMesoPlan`) and clones its `meso_days → meso_day_groups →
  meso_exercises` onto a freshly created target meso, mirroring `applyTemplateToMeso`. The pure
  **`planMesoCopy`** helper maps source days→groups→fills into insert rows: it **honors the user's
  exclusion list** (an excluded exercise's fill is dropped but its **slot stays open** — slot count
  preserved so the picker can replace it), widens a group's slot count to fit if the source had more
  fills than declared slots, and falls back slot numbers to position when unset. Loads are **not**
  copied — `startMeso` reseeds every slot from `v_exercise_prs`.
- **`listCopyableMesos`** — the user's planned/active/completed mesos (placeholders excluded),
  newest first, for the source picker.
- **Source picker** `/cycles/plan/copy` (house style, bordered rows like the template picker) —
  `STATUS · PHASE`, name, `N WK` / `N D/WK` chips; tapping routes to the create form with `?copy=`.
- **Create-meso form (fig 2.4) reused for copy** — `/cycles/plan/new?copy=<id>` loads the source,
  subtitles `COPIED FROM — NAME`, and prefills name (`<source> II`), weeks, RIR ramp, and deload
  from the source. The form gained `copyMesoId`/`defaultWeeks`/`defaultDeload`/`defaultRir*` props;
  `createMesocycleAction` parses an optional `copy_meso_id` and runs `copyMesoStructure` after create
  (template path unchanged). Plan-a-meso option 01 is now an enabled link.
- Tests: **106 passing** (+4) — `planMesoCopy` (full clone with weekday/label/sets carry, excluded
  exercise dropped + slot preserved, slot-count widening, empty plan).

### Recorded deviations

- **Copy picker UI not in the stock mockup** — built in the established house style (bordered rows),
  same as the template picker and share/redeem rows (a prior recorded deviation). Square-corner
  ledger styling preserved.
- **RIR ramp / deload carry from the source** even though the create form doesn't expose RIR edits;
  the copy intent is "do this meso again," so the source's ramp is the right default.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green (`/cycles/plan/copy`
and the updated `/cycles/plan/new` both compile). No schema/RLS change — copy creates rows the user
owns through existing policies; the source is read via RLS (a meso not visible to the user copies as a
no-op). No hosted writes this slice; pure helper unit-tested, the DB walk mirrors the smoke-tested
`applyTemplateToMeso` pattern. In-browser pixel QA of the picker still pending (as for other screens).

## 2026-06-15 — Library & stats reconciliation: Exercise page (3.1a/b) + two-axis filter + Volume tab removed (Design v2 backlog, DATA)

Lands the bulk of the **Library & stats (against Phase 5)** reconciliation block from 09 (2026-06-14
session-3 §1/§2/§4): the net-new Exercise page (Overview/History tabs), the two-axis library filter,
and the Meso Stats Volume-tab removal. This is what the logging "View exercise ›" link (shipped
2026-06-15) was already pointing at. Vertical slice; `main` deployable.

### Done

- **`DATA` migration `20260615000004_exercise_overview.sql`** (append-only; **applied to hosted**,
  schema + values re-checked, security advisors clean):
  - **`v_exercise_overview`** (security_invoker) — per (user, exercise) lifetime aggregates backing
    the 3.1a Overview and MCP read tools (one definition of progress): `times_trained`,
    `total_volume`, `first_logged_at`, `last_performed_at`, `weight_pr` (+ reps at it), `volume_pr`
    (+ the weight×reps that produced it), `best_e1rm`, `best_session_volume`. Argmax columns built
    with `distinct on` CTEs over working sets; cross-checked against raw `logged_sets` on hosted
    (Dumbbell Bench: 155×8 weight PR, 1240 volume PR, e1RM 196.3 = 155·(1+8/30) — exact).
  - **`exercises(equipment_type)` index** for the new EQUIP filter axis (09 §1 `DATA`).
- **Exercise page (3.1a/3.1b)** — rebuilt `/exercises/[exerciseId]` with an **OVERVIEW | HISTORY**
  segmented toggle (`?tab=`). Overview = LAST PERFORMED (date · W·D) + the **ALL-TIME BESTS** 2×2 ink
  grid (weight PR, est 1RM, volume PR, best session vol) + **EST. 1RM ACROSS `<macro>`** M1…Mn bars
  (filled past / accent-framed current / dashed future) + TIMES TRAINED / TOTAL VOLUME / FIRST LOGGED
  footer; description, pinned note, and the custom-exercise SHARE row retained below (deviation —
  functionally needed, not in the stock mockup). History = `ExerciseHistoryList` (sessions grouped by
  meso). `getExerciseOverview` reads the view, derives the last-session coordinate, and computes the
  across-macro bars from `v_exercise_history` (same pattern as the meso-stats macro chart).
- **Exercises tab (3.1) two-axis filter** — `MUSCLE` and `EQUIP` rows (chips scroll, selected = filled
  ink + ✕ to clear, EQUIP has an `ALL` chip); the two combine **AND**; an `n OF N EXERCISES` count +
  `CLEAR ALL` appear whenever a filter is active. Equipment chips are the distinct types present.
- **Meso stats — Volume tab removed** (09 §4): the segmented control is now **Balance · Performance**
  and defaults to **Balance**; the renumbering is 4.1 Balance / 4.2 Performance. `buildVolumeMatrix`
  stays (it still feeds `buildBalance`, and the Workout-tab resting state still renders `VolumeView`
  per 08 §2 — left unchanged, not in this backlog item).
- Types: `VExerciseOverviewRow` + the `v_exercise_overview` view registered in `database.ts`.
- Tests: **102 passing** (+7) — `buildExerciseMacroBars` (label/state/rounding, current-with-no-data,
  no-current, empty) and `groupHistoryByMeso` (consecutive grouping, distinct same-named mesos, empty).

### Recorded deviations

- **Overview keeps description / pinned note / SHARE** below the stat blocks — the 3.1a mockup shows a
  stock exercise without them, but they're functional (custom-exercise description + sharing, the
  pinned note). Square-corner ledger styling preserved.
- **Stats back-nav stays `‹ MESO`** and entry stays the meso-detail `MESO STATS` row — the planner-board
  `PLAN | STATS` toggle + `‹ PLAN` back-nav belongs to the not-yet-built single-surface planner (2.5);
  only the Volume-tab removal is in scope here.
- **`tracking_type` (3.1c / per-set render) deferred** — it changes `logged_sets` (nullable weight/reps
  + `duration_seconds`) and touches the whole logging core, so it's a separate slice (still `[ ]` in 07).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (102/102), `npm run build` green. Migration applied
to hosted; `v_exercise_overview` shape + computed values validated against raw `logged_sets`; equipment
index present; security advisors show no new lints (the view is security_invoker, no SECURITY DEFINER).
Read-only validation against existing account data — nothing written or deleted. In-browser pixel QA of
the new Exercise page / filter rows still pending (as for the other screens).

## 2026-06-15 — Logging-flow review, round 2: animation polish + skip/dot refinements

Follow-up to the on-device review (09 session-5, second batch).

### Done

- **Navigator no longer re-animates on day load.** The reveal transition is now gated to an
  explicit chevron toggle (`animate` flag); hydrating the open state after a day-chip navigation
  snaps instead of replaying the 0fr→1fr animation. Week selection was already smooth (client state).
- **Active-day dot always shown.** The orange dot marks the meso's resume week/day **regardless of
  selection** (dropped the `!viewing`/`!isSel` guards; the current week is derived from the nav
  grid, not the viewed week), so the user can always spot and return to the live day.
- **Bottom sheets slide up/down.** `BottomSheet` gained a reusable `useSheetTransition`
  (mount + `translate-y-full`↔`translate-y-0` + scrim fade, ~280ms ease-out); the per-exercise
  feedback sheet (1.4) now animates in, and the Workout Complete sheet (1.5, a custom container)
  uses the same hook for enter **and** exit.
- **Unskip all.** The exercise menu (1.2) shows **"Unskip all sets"** whenever the exercise has any
  skipped sets (`clearSkippedSets`), alongside per-set unskip.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. No schema change
this batch (reuses `skipped_set_numbers` from `20260615000003`).

## 2026-06-15 — Logging-flow on-device review: interaction fixes + per-set skip (DATA)

First hands-on review of the deployed logging flow (09 session-5). Seven interaction fixes
shipped; two larger features (notes model, workout/meso options menu) specced for next slices.
Vertical slice; `main` deployable.

### Done

- **Navigator stays open** across day selection — open state persisted in `sessionStorage`, so
  picking consecutive days no longer collapses it (supersedes the "defaults closed each entry" note).
- **Denser set rows captured** (09 §5, which the code had never picked up): box `42→32px`, value
  `17→14px`, log box `26→21px`, row padding `7→4px`, grip/log columns `22/50→20/44`; the LOG control
  keeps a ≥44px-wide tap target around the 21px box.
- **Sets are uncheckable** — tapping a logged ✓ on an active workout un-marks it and re-opens the
  slot (`unlogSet`; keeps the prescription, no renumber). Completed workouts stay locked.
- **Row menus flip on-screen** — new `AnchoredMenu` (viewport-`fixed`, measures the trigger and its
  own height) opens below when there's room, otherwise above; replaces the absolutely-positioned
  cards that ran off the bottom edge. Used by both the exercise (1.2) and set (1.3) menus.
- **Per-set skip** (`DATA`, migration `20260615000003_per_set_skip.sql`, **applied to hosted**):
  `workout_exercises.skipped_set_numbers int[]`. "Skip set" greys a set **in place** and is
  reversible ("Unskip set"); "Skip remaining sets" fills every uncompleted slot and **no longer
  flips the whole exercise to skipped** (fixing the bug where the exercise + its reopened menu were
  greyed/backgrounded). Skipped sets are never logged, so the engine and views are unaffected; the
  type's `Defaulted` union gained the column so inserts stay optional.
- **Delete vs skip split** — "Delete set" drops a planned slot (unlogged) or deletes the logged row
  (`deleteSet`, renumber); "Skip set" toggles the greyed state. Both gated to in_progress.
- **Complete-workout gating** — the button now appears only once **every set is logged or skipped**
  (was "after any set is logged"); the helper `exerciseDone`/`plannedSetCount` account for skips.

### Deferred to next slices (specced in 09 session-5 §8/§9, 07 backlog, 03)

- **Notes model** — split the cross-workout **pinned note** (exercise attribute, inline edit icon,
  optional) from a per-session **log note** (saved with the workout's exercise log; note-icon on
  history rows; editable only live). `DATA`.
- **Workout / mesocycle options menu** on the Day View header — Mesocycle (notes · edit → planner ·
  stats · End mesocycle) + Workout (note · edit day · add exercise · End workout). New audited
  `endMesocycle`/`endWorkout` queries + confirm steps. `DATA`.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. Per-set-skip
migration applied to hosted. No new unit tests this slice (the new functions are I/O against
Supabase; pure helpers live in the component); the engine paths are unchanged and remain golden-tested.

## 2026-06-15 — Logging retrofit: Day View header, Workout Complete redesign, completion lock (Design v2 backlog, DATA)

Lands the **Logging (against Phase 3) reconciliation block** from 09 (2026-06-13 §1–2 / 2026-06-14
§1): the Day View header rework (1.1), the redesigned Workout Complete sheet (1.5), the set
delete + completion lock (1.3), and the 1.2 menu relabel. Vertical slice; `main` deployable.

### Done

- **Day View header (1.1)** — rebuilt as a **sticky/locked region** with a **collapsible week/day
  navigator**: `workout` logotype + disclosure chevron, a bordered card with the week selector
  (`W1…DL`, current-week orange dot) and a **nested day-chip drawer** for the selected week
  (completed = tint + ✓, current = orange dot, viewing = filled ink). Day chips **navigate** to that
  day's `/log/[workoutId]`. The coordinate keeps `W·D` + date and moves **Target RIR** beside it (in
  orange; `DELOAD WEEK` on deload); the old `MESO n/N` meta line and the `N OF M SETS LOGGED` text
  are replaced by an **orange progress bar** (`setsLogged ÷ setsPlanned`) over the marked divider.
  `DATA`: `getWorkoutDetail` now returns `navWeeks` (per-week programmed days with completion state +
  workout ids), built from the meso's microcycles/workouts/`meso_days` (future weeks fall back to the
  planner's day list).
- **Workout Complete (1.5) — redesigned.** Removed the boxed `AUTOREGULATION` panel and the
  `View meso stats` link (recalculation runs silently). The sheet is now **counts + the three
  session sliders** (overall fatigue / effort / performance, 0–4, same `SnapSlider` UI as the 1.4
  prompt) **+ notes + a single `NEXT WORKOUT →`** that completes, advances, and navigates in one
  action. `DATA`: `saveWorkoutFeedback` writes `workout_feedback` **before** completion flips the
  status, so the **already-wired** session dampener (10 §3 / `feedback.ts` `sessionDampened`) finally
  has data — previously the engine accepted `workoutFeedback` but the UI never captured it.
- **Set delete + completion lock (1.3)** — `DATA` migration `20260615000002_completion_lock.sql`
  (**applied to hosted**, policies + advisors re-checked): replaces the user-only `logged_sets`
  update policy and adds a delete policy, both gated on the **parent workout being `in_progress`**;
  splits `exercise_feedback`'s blanket `for all` into select/insert (own) + update/delete (own **and**
  parent workout `in_progress`). Inserts stay open (the first set is written while the workout is
  still `planned`); the service-role week-N→N+1 job is unaffected. UI: the set menu's **Delete set**
  now really deletes a logged set while in-progress (`deleteLoggedSet` renumbers survivors + trims a
  prescribed slot); a completed workout shows `Logged — session locked`. Refines hard rule #5
  (append-only **after** completion).
- **Exercise menu (1.2)** — `History ›` → **`View exercise ›`**, repointed to the exercise detail
  page (the full 3.1a Overview tab arrives with the library slice).
- Tests: RLS suite reworked — the old "append-only (no delete policy)" case is now a
  **completion-lock** pair: owner can amend+delete while `in_progress`; a **completed** workout
  rejects both amend and delete (and stays invisible to other users). 95 unit/engine tests
  unchanged (engine dampener already had golden coverage).

### Recorded deviations

- **Single-action complete** (vs the prior two-phase confirm→recalculated sheet): the redesigned
  sheet completes + advances + navigates on the one `NEXT WORKOUT →` tap, matching the mockup. The
  engine summary is no longer surfaced (panel removed by design); it still writes `engine_decisions`.
- **`workout_feedback` not RLS-locked on completion.** The spec calls out gating
  `logged_sets`/`exercise_feedback`; `workout_feedback` stays own-scoped because it is written once,
  transactionally, just before completion (gating its insert on `in_progress` would be order-fragile).
- **"View exercise" lands on the existing exercise detail page**, not the not-yet-built 3.1a/b
  Overview/History tabs (library slice). Functionally equivalent for now (description, bests, history).
- **Sticky header fidelity:** implemented as `position: sticky` within the scrolling page (the app
  isn't a fixed-height device frame); in-browser pixel QA still pending, as for the other screens.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. Migration applied
to the hosted project; policies confirmed present with the `in_progress` gate and security advisors
show no new lints. RLS assertions for the lock are written (need a running stack to execute, as for
the rest of the RLS suite). No hosted integration smoke this slice (avoided polluting the account) —
the new query/IO paths are covered by typecheck + build; the engine dampener path is unit-tested.

## 2026-06-15 — FFMI proximity target model + body-fat input (research-driven, ENGINE/DATA)

Multi-source literature review (deep-research harness, 7 agents) on real muscle/strength/fat-loss
rates exposed the core flaw: the engine keyed hypertrophy off **calendar training age**, which
overstates adaptation for someone who trained for years without growing. Per the research the right
state variable is **proximity to genetic potential**, observable from body composition (FFMI).

### Done

- **FFMI proximity model (primary driver)** in `src/lib/engine/macro.ts`: `rate = floor + (base −
  floor)·(1 − developedFraction)`, where `developedFraction` comes from normalized FFMI vs ceiling
  (`{male 25, female 21.5}`) / untrained baseline (`{18.5, 14.5}`); target capped at 0.6 × remaining
  potential. **Falls back to the v4 training-age decay** when body fat is unknown (existing users
  unaffected). Cut leanness band now uses **body-fat %** when present (BMI proxy fallback). Sex factor
  **0.5 → 0.7** (research: relative gains equal between sexes; 0.5 over-penalized).
- **`body_fat_pct`** added to `profiles` (migration `20260615000001`, **applied to hosted**;
  nullable, 2–70 check) with a **skippable visual band picker** in the Profile editor (6 bands → stored
  midpoint; `clearBodyFatAction`). Onboarding stays 4 steps; absent BF → graceful training-age fallback.
- **`engine_params` v5** (same migration, applied to hosted + re-parsed through the schema): new
  `hypertrophy_floor_pct_bw_month`, `ffmi_ceiling`, `ffmi_untrained`, `proximity_macro_cap_frac`,
  `cut_bf_thresholds`; v4 deactivated. New fields carry `.default()` so older rows still parse.
- **Validated the headline case:** 6′1″ 159 lb ~16% bf "trained since 2013" (FFMI ≈ 17, below
  untrained) now reads **+19–29 lb/12mo** (beginner-class) instead of elite ~2 lb/yr; a jacked FFMI-25
  veteran of the same age correctly reads ~0; leaner-at-equal-weight ⇒ slower (reads muscle, not scale).
- Tests: **95 passing** (+4) — proximity goldens (undermuscled-long-timer, near-ceiling, leanness
  gradient, BF-based cut band); sex-factor test corrected to 0.7. RLS active-version assertion → 5.
- Docs: 10-spec §5 rewritten (proximity primary, training-age fallback, v3→v4→v5 evolution + the Hubal
  individual-variation caveat). `scripts/macro-engine-matrix.ts` retained as the dev review harness.

### Notes / honesty

- The target is explicitly **not the heart of the app** (periodization for results is) — implemented
  proportionately, behind tunable `engine_params`, and always shown as an estimate band.
- FFMI ceiling (25/21.5 normalized) and the band-midpoint body-fat estimate carry real individual
  variation; the model is a planning prior, not a prediction.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. v5 migration applied
to hosted; the exact migration JSON re-parsed through `engineParamsSchema`; user case confirmed
duration-sensitive and beginner-class. RLS suite needs a running stack (unchanged); assertion bumped.

## 2026-06-14 (latest) — Macro-target engine fix: continuous training-age decay + capped cut + auto block-length (ENGINE)

Fixes the realistic-target outputs flagged on-device: for a high-training-age profile the target was
**static across durations** (3-month and 12-month macros both showed ≈+0.6 lb) and implausibly low.
Root cause: the hypertrophy model clamped the per-macro total to a hard **career-cap** (remaining
lifetime potential), which collapses to a fixed tiny number for near-potential lifters regardless of
duration. Reviewed via a matrix harness across 7 profiles × 4 goals × 3 durations and retuned.

### Done

- **Hypertrophy → continuous training-age decay** (`rate(T) = base × e^(−T/tau)`, `base {1.0,1.5}%BW`,
  `tau 5 yr`). The target now scales with duration **and** tapers smoothly with training age; the hard
  career-cap clamp is gone (`career_cap_lb`/`career_tau_years` kept in params only for back-compat).
  Reproduces the Aragon bands at their anchor ages; a 13-yr lifter now reads **+0.4–0.7 / +0.9–1.3 /
  +1.8–2.6 lb** for 3/6/12 mo (was a flat +0.6 lb) — ~2–3 lb lean mass/yr, research-appropriate.
- **Cut → compounding + cap.** Was linearly extrapolating %BW/week (−93 lb over 12 mo). Now compounds
  on the shrinking bodyweight (decelerates) and is capped at `cut_cap_pct_bw` (25% BW). Strength and
  maintain unchanged.
- **`suggestMesoLength(months)`** (pure) — picks the block length (4/5/6 wk) that divides the macro
  most evenly (12 mo → 4 wk = 52/4 exact; 6 mo → 5 wk). The Create-Macrocycle form **auto-selects** it
  and re-suggests as duration changes, until the user overrides (then their pick sticks); a `SUGGESTED`
  hint shows until then.
- **`engine_params` v4** (migration `20260614000003`, **applied to hosted** + re-read/parsed): new
  `hypertrophy_base_pct_bw_month`, `hypertrophy_decay_tau_years`, `cut_cap_pct_bw`; v3 deactivated.
  Schema fields added with `.default()` so older rows still parse; seed + `DEFAULT_ENGINE_PARAMS`
  mirror it; RLS active-version assertion bumped to 4.
- Tests: **91 passing** (+5) — reworked macro goldens to the new model; a **monotonic-in-duration**
  property across training ages 1/4/7/13 (would have caught the static bug), a 13-yr decay-but-positive
  case, a cut-cap bound, and `suggestMesoLength` correctness. `scripts/macro-engine-matrix.ts` is the
  (dev-only) review harness. Docs: 10-spec §5 rewritten (model + superseded note); cut formula updated.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (91/91), `npm run build` green. v4 migration applied
to hosted; the exact migration JSON re-parsed through `engineParamsSchema` and the 13-yr case confirmed
duration-sensitive. Corrected output matrix reviewed across beginner→elite, both sexes, older lifter.

## 2026-06-14 — Macrocycle restructure: goal layer + Create engine + Overview + Cycles retrofit (Design v2 backlog, DATA)

Lands the largest reconciliation block: the **macrocycle becomes the single-goal layer** (09
2026-06-13 §3–5 / 2026-06-14). `macro_slots` retired; the create-macrocycle engine (2.3),
Macrocycle Overview (2.2), `+ NEW` chooser (2.1b), and the Cycles list retrofit (2.1) are live,
all feeding off the already-built-and-tested `planMacrocycle`. Vertical slice; `main` deployable.

### Done

- **`DATA` migration `20260614000002_macrocycle_restructure.sql`** (append-only; **applied to the
  hosted project** via Supabase MCP, schema re-read to confirm):
  - `macrocycles` — goal vocabulary migrated (`gain → hypertrophy`, `strength` added; check swapped
    to `hypertrophy/strength/cut/maintain`); new `duration_months`, `meso_length_weeks`,
    `recommended_duration_months`, and the cached planMacrocycle snapshot (`target_low/high`,
    `target_unit`, `target_direction`, `rate_low/high`).
  - `mesocycles` — `position` + `phase` (accumulation/intensification/peak); `unplanned` added to the
    status check; `macro_slot_id` dropped; `(macrocycle_id, position)` index. Any prior slot ordering
    is carried onto the host meso before the table goes.
  - `macro_slots` **dropped** (policy/index/trigger cascade).
  - New **`v_macro_summary`** (security_invoker) — per-macro rollup (meso count, sessions, total
    volume, working sets, first-week start). Security advisor clean (no new lints; view isn't flagged).
- **Engine wiring (no engine change).** `src/lib/queries/macro.ts`: `profileToMacroProfile`
  (training-age from `training_since`), `planForMacro` (live recompute), `createMacrocycleWithMesos`
  (creates the macro + N **unplanned, phased** placeholders), `planUnplannedMeso` (`+ PLAN` flips to
  planned), `getMacroOverview` (+ `buildMacroStats`: est-strength e1RM trend on key lifts by
  frequency, over the shared `v_exercise_history`). `engineGoal` simplified to map the macro goal →
  progression goal (hypertrophy/strength → gain; cut/maintain pass through); slot lookup removed from
  the week N→N+1 job and the meso-stats macro chart.
- **Screens (pixel pass off the v2 mockup, figs 2.1/2.1b/2.2/2.3):**
  - **Create Macrocycle (2.3)** `/cycles/new` — the engine: name, goal (4), duration (3/6/12/custom),
    block length (4/5/6 wk), with a **live target card** (range + per-month rate + meso strip +
    phase legend) recomputed client-side via the pure `planMacrocycle`. Creates `active` macro +
    unplanned mesos, lands on Cycles.
  - **Macrocycle Overview (2.2)** `/cycles/macro/[macroId]` — realistic-target card (range + orange
    `≈ rate / month` + profile chips), mesocycle timeline (phase + status + `+ PLAN` on placeholders),
    macro-stats 2×2 (est strength / total volume / sessions / adherence). No progress-vs-projection
    bar (09 §3).
  - **`+ NEW` chooser (2.1b)** — bottom-sheet picker (Macrocycle → 2.3 · Standalone meso → 2.4) with
    the in-macro `+ PLAN` note.
  - **Cycles list (2.1) retrofit** — macro rows `GOAL <goal> · N MESOCYCLES` + `OVERVIEW ›`, name →
    Overview, chevron expand; meso rows `MESO n · <PHASE> · …`, unplanned `SUGGESTED <phase> · NOT
    PLANNED` + `+ PLAN`; standalone section unchanged. Slot language gone.
  - Standalone meso create (2.4 from-scratch/template) simplified to standalone-only; planner board
    macro-context strip rebuilt from `position`/`phase`.
- Types (`database.ts`): `MacroGoalType`/`MesoPhase`, macrocycle target columns, meso `position`/
  `phase`/`unplanned`, `MacroSlotRow`/`macro_slots` removed, `VMacroSummaryRow` added.
- Tests: **86 passing** (+6) — `macro.test.ts` (profile→engine mapping incl. training-age math,
  phase labels, plan snapshot/recommended-duration fallback); `engineGoal` test reworked to the new
  goal mapping. RLS test updated (goal vocab; slot block → positioned-unplanned-meso gating).

### Recorded deviations

- **Per-month rate cached** in `macrocycles.rate_low/high` — 03 says the rate is "derived, not
  stored". Cached anyway because strength's compounding band is **not** derivable from the total
  range ÷ duration; the Overview still **recomputes the whole plan live** from the profile, so the
  cache is a snapshot/fallback only.
- **Est. strength** (macro stats) is computed in the **query layer** over `v_exercise_history` (the
  e1RM trend is engine-side), not inside `v_macro_summary` SQL — same pattern as Phase 4 progress
  scoring; still one shared view for the raw history.
- **Timeline progress bar** is status-based (done = filled, active = accent, planned = faint), not
  set-precise — exact `setsLogged ÷ planned` per meso would need extra queries; deferred.
- **Overview `FULL ›`** link and a real **EDIT MACROCYCLE** screen are out of this slice — the stats
  card has no detail page yet, and edit shows `SOON`. (Per-meso STATS is the existing 4.x screen.)
- **`v_exercise_overview`** (Exercise page 3.1a) is **not** built here — it belongs to the
  library/stats slice; the shared-views list in CLAUDE notes it as pending.
- Legacy pre-restructure meso (1 row on hosted) has null `position` — the Overview/list fall back to
  row index so it renders cleanly.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (86/86), `npm run build` green. Migration applied
to the hosted project and the schema re-read (new macro columns, meso `position`/`phase`, `macro_slots`
gone, `v_macro_summary` present, legacy `gain` row migrated to `hypertrophy`); security advisors show
no new lints. RLS suite needs a running stack (unchanged); its assertions were updated to the new
shape. No hosted integration smoke this slice (avoided polluting the existing account) — the create/
overview I/O is exercised only through typecheck + the schema check; pure helpers are unit-tested.

### Not done yet / next

- **Plan a mesocycle (2.4) four paths** — copy / template / **meso builder (group priorities)** /
  scratch (copy + builder still stubs).
- **Planner board (2.5) as the single meso surface** — `PLAN | STATS` toggle, partial-completion
  lock, `SAVE CHANGES`; retire the old meso-detail (2.2-old) page.
- **Logging retrofit (1.1/1.2/1.5/1.3)** — Day View sticky header + orange progress bar, Workout
  Complete redesign (re-add session sliders), set delete + completion lock RLS.
- **Library & stats** — `exercises.tracking_type` + per-type set rows, two-axis filter, **Exercise
  page (3.1a/b)** + `v_exercise_overview`, Meso Stats drop the Volume tab.
- **MCP `create_macrocycle` / `get_macro_summary`** (05) once the connector phase lands.

## 2026-06-14 — Macrocycle planning engine + e1RM metric (Design v2 backlog, ENGINE)

First code landing of the **Design v2 reconciliation backlog**: the pure engine foundation the new
macrocycle goal layer (Create Macrocycle 2.3 / Overview 2.2) sits on, plus the §1 e1RM definition.
Pure, fully tested, no UI yet — the screens consume these in the next slice.

### Done

- **`planMacrocycle()`** (`src/lib/engine/macro.ts`, pure & parameterized per 04 §Macrocycle
  planning, defaults from 10 §5): ingests the full profile (sex, age, bodyweight+unit, height,
  experience level, training years) and a goal (hypertrophy / strength / cut / maintain), returns
  `{ target, perMonthRate, recommendedDurationMonths, durationMonths, mesoCount, phases, estimate }`.
  - **Hypertrophy** — %BW/month rate band × duration × **sex factor** (0.5 female absolute) ×
    **age taper**, capped by a **career-potential** ceiling that decays with training age
    (`1 − e^(−years/τ)` × `career_cap_lb`).
  - **Strength** — monthly-compounding % on key lifts, capped per experience.
  - **Cut** — %BW/week scaled by **leanness via BMI proxy** (high-bf / average / lean bands),
    presented as a loss.
  - **Maintain** — no weight target (recomposition framing).
  - **Recommended timeframe** — months to reach a meaningful target at the profile's rate, clamped;
    backstops an omitted duration. `mesoCount = floor(months × 4.33 / mesoLength)`; **phases** spread
    accumulate → intensify → peak (`spreadPhases`, parameterized by `phase_plan`).
  - Every target carries an `estimate: true` flag + an "(estimate, …)" rationale (10 §9 honesty
    guardrail — no progress bar, conservative end).
- **e1RM** (`src/lib/engine/e1rm.ts`, 10 §1): `estimateE1rm(weight, reps, rir, params)` →
  effective-reps (`reps + rir·offset`), **averaged Epley/Brzycki** (Epley-only fallback past
  Brzycki's valid range), and a **confidence band** (high / moderate / low) that degrades with
  effective reps / RIR and is `low` whenever RIR is unreported.
- **Params v3** (`engine_params`): new `e1rm`, `macro_target`, `phase_plan`, `key_lifts` blocks added
  to `engineParamsSchema` with `.default()` (so the active v2 row still parsed) and seeded as an
  explicit, admin-tunable **version 3** via append-only migration `20260614000001_engine_params_v3.sql`
  (v2 deactivated, kept for replay). Mirrored in `params.ts` defaults + `seed.sql`; **applied to the
  hosted project** (v3 active, parses). RLS test updated to expect active version 3.
- Tests: **80 passing** (+18) — 12 golden/property macro plans (per-goal goldens, monotonic-in-
  duration, ~½ female absolute, experience scaling, perMonthRate×duration≈target, `spreadPhases`) +
  6 e1RM (Epley/Brzycki average, confidence bands, Brzycki fallback, null-RIR, non-working input).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (80/80), `npm run build` green. Migration applied
to the hosted project via the Supabase MCP and re-read (v3 active, `macro_target`/`phase_plan`
present and well-formed). RLS suite needs a running stack (unchanged from prior sessions); the
version assertion was updated to 3.

### Not done yet / next

- The **DATA macrocycle restructure** (retire `macro_slots`; `macrocycles.goal_type` /
  `duration_months` / `meso_length_weeks` / derived targets; `mesocycles.position` / `phase` /
  `unplanned`) — the migration that the Cycles UI net-new screens depend on. `planMacrocycle` is
  ready to feed it.
- **Cycles UI net-new** (2.1 retrofit, 2.1b chooser, 2.2 Overview, 2.3 Create Macrocycle engine):
  wire `planMacrocycle` into the create flow + Overview target card (live recompute on goal/duration).
- **Metric-defaults remainder**: wire e1RM into the stats views/exercise page; seed volume landmarks
  / autoreg bands / adherence with per-metric golden tests.

## 2026-06-14 — Metrics & engine-params research lock-down (no code)

Research + documentation pass turning every mockup metric into a precise, research-backed
definition with default `engine_params`. Ran a multi-source sports-science review (e1RM accuracy,
rate-of-gain models, volume landmarks, subjective-feedback validity, progression/deload, push/pull
balance) with primary citations. **No code changed.**

### Done

- **New [10-metrics-spec.md](10-metrics-spec.md)** — authoritative metric/param doc: e1RM
  (effective-reps = reps+RIR, avg Epley/Brzycki, confidence weighting), fractional volume counting
  (1.0/0.5), MEV/MAV/MRV landmarks, workload/pump/joint-pain → set-count autoregulation, RIR ramp,
  increments/regression/deload, the profile-personalized macrocycle target + recommended-timeframe
  engine, key-lifts-by-frequency, stats rollups (total volume, adherence, progress score, advisory
  push:pull), consolidated default `engine_params`, and §9 honesty guardrails.
- **Decisions locked (user, 2026-06-14):** (1) macrocycle target personalized from the full profile
  + engine recommends timeframe; shown as an estimate, no progress bar; (2) **session feedback
  sliders restored** to a redesigned Workout Complete sheet (mockup dropped them in error); (3)
  fractional 1.0/0.5 volume counting; (4) key lifts = most-logged (by frequency). Defaults: female
  absolute-target ×0.5 (relative %s equal); pump = secondary nudge only.
- Threaded through 01 (F2/F3), 03 (`workout_feedback` kept + redesigned sheet; macro recommended
  duration; fractional counting), 04 (`planMacrocycle` profile inputs + recommend-timeframe; metric
  pointers), 05, 07 (backlog: Complete redesign, profile-driven target, params seeding), 08
  (decisions log), 09 (new 2026-06-14 session-4 entry), CLAUDE.md (10 in read-first list).

### Recorded deviation

- **Workout Complete (1.5) re-adds session sliders** — authorized deviation from the mockup, which
  dropped overall fatigue / effort / performance. Sheet = counts + the three session sliders (1.4
  slider UI) + paragraph notes + `NEXT WORKOUT →`; autoregulation panel stays removed.

### Not done yet / next

- Implement the metrics/params per 10 (engine + migrations + the Complete-sheet redesign), in the
  07 reconciliation backlog. Hard rules in force; engine changes need golden fixtures.

## 2026-06-14 — Design v2 handoff: docs integration (no code)

Documentation-only pass folding the **2026-06-13/14 design sessions** into the spec docs ahead of
implementation. New design assets imported and every doc reconciled; **no schema, engine, or UI
code changed** — the implementation lands in future sessions per the new reconciliation backlog.

### Done

- **Imported design artifacts** into `docs/design/`: updated source-of-truth mockup
  `workout - App Screens v2.dc.html`; new interactive prototype `WorkoutApp.dc.html` +
  `workout - Interactive Prototype.dc.html`; session-3 render screenshots under
  `screenshots/v2-session3/`; and the new **`docs/09-design-changelog.md`** (authoritative for its
  dated deltas).
- **08-design-decisions** — added the 09 amendment pointer; reconciled the §5 figure index
  (Section 02 renumbered, `+ NEW` chooser 2.1b, Macrocycle Overview 2.2, Create Macrocycle 2.3,
  planner board 2.5; Exercise page 3.1a/b/c; Volume stats tab removed → Balance 4.1 / Performance
  4.2); repointed stats to the planner `STATS` toggle; logged new decisions (macrocycle goal layer,
  realistic target, plan-a-meso paths, exercise tracking type, simplified complete sheet).
- **01-product-spec** — macrocycle as a single-goal layer (hypertrophy/strength/cut/maintain) with
  the create engine + realistic target; F2 cycle flow (chooser, 4-path plan, planner lock); F3
  complete sheet simplified; F5 tracking type + two-axis filter + Exercise page; F7 stats restructure.
- **03-data-model** — `DATA` target shape: `macrocycles` goal vocab + `duration_months` /
  `meso_length_weeks` / derived target columns; **retire `macro_slots`** → `mesocycles.position` +
  `phase` + `unplanned` status; `exercises.tracking_type`; `logged_sets` nullable weight/reps +
  `duration_seconds`; new views `v_exercise_overview` / `v_macro_summary`; week→day completion +
  `exercises(equipment_type)` index. Marked as migration deltas (not yet migrated).
- **04-feedback-engine** — goal vocab (gain→hypertrophy, +strength) + phase modulation; new pure
  `planMacrocycle()` (meso count, suggested phases, realistic target + per-month rate from
  goal/duration/block-length/profile); module layout + golden/property test requirements.
- **05-mcp-connector** — `create_macrocycle` (engine-computed) + `get_macro_summary`; goal-update
  tool reworked; new views added to the data-shape contract.
- **06-design-system** — addendum for the SetRow density, locked Day View header + progress bar,
  two-axis filter, `PLAN | STATS` toggle, and the exploratory dark theme (→ 09 §5a).
- **07-implementation-plan** — added the **Design v2 reconciliation backlog** (retrofit/net-new
  mapped to Phases 2/3/5 with `DATA`/`ENGINE` tags) for future execution.
- **CLAUDE.md** — 09 added to the read-first list and pixel-fidelity rule; mockup-over-prototype
  source-of-truth note; shared-views list extended.

### Not done yet / next

- Everything in the **07 reconciliation backlog** — the actual migrations, engine functions, and
  screen retrofits. Execute in future sessions, hard rules in force (append-only migration + RLS +
  tests per PR; engine changes need fixtures; pixel fidelity to the mockup, checking 09 first).
- **Resolved (2026-06-14):** the set menu (1.3) `Delete set` is allowed for **any set while the
  workout is `in_progress`** (not just unlogged). **Completing a workout locks it** — sets/feedback
  become immutable — since completion runs the engine's next-week generation and we don't want to
  recompute the chain. RLS gates `logged_sets`/`exercise_feedback` `update`/`delete` on the parent
  workout being `in_progress`; this refines hard rule #5 (append-only *after* completion). Edit-meso
  already can't touch completed weeks (planner lock). Captured in 03/07/08.
- Note: the interactive prototype is a **functional-testing** artifact and is not pixel-perfect —
  the **mockup is the source of truth** for every detail (already enforced in CLAUDE.md / 09).

## 2026-06-13 — Phase 5: meso stats, library, templates & sharing

### Done

**Phase 5 — meso stats, library & templates** (complete except a from-scratch template editor, which is not planned for v1)

- **Meso stats (figs 4.1–4.3)** at `/cycles/meso/[id]/stats` — one screen, three views via the segmented control, everything off the shared views (one definition of progress):
  - *Volume:* sets-per-group-per-week matrix from `v_meso_week_sets` — closed weeks show logged, the active week shows logged-so-far (orange `● W#` + `N OF M PLANNED SETS` footer), generated future weeks show the autoregulated plan, ungenerated weeks fall back to the planner baseline; TOTAL row; `W#–W# = AUTOREGULATED PLAN` caption
  - *Balance:* PUSH/PULL/LEGS cards (avg planned sets/wk; classification over the seeded vocabulary, abs excluded), per-muscle bars, BALANCE CHECK callout (push:pull ratio + lowest-volume group)
  - *Performance:* top-set-by-week grid for the meso's three biggest lifts (orange cell = in-progress week, `+N LB VS W1` badge), e1RM-across-macro bars for the lead lift (filled past / accent current / dashed future slots), PRS THIS MESO (ALL-TIME = heavier top weight than all pre-meso history; REP PR = better e1RM at or below the old top weight; lifts with no prior history can't PR)
  - Entered from meso detail, the 1.5 complete sheet, and the **Workout-tab resting state**, which now renders the last completed meso's full 4.1 view (08 §2)
- **Exercises tab (3.1) build-out:** rows link to an exercise detail page (description, primary/secondary groups + equipment, last performed, all-time best, pinned note, inline 3.2 history); `+ NEW` creates custom exercises (name, equipment, primary + secondary groups, description/notes; zod-validated)
- **Exercise history (3.2) shared everywhere:** query moved to `src/lib/queries/history.ts` with one presentational component; used by the day-view menu, the exercise detail page, and the **picker (2.6)**, whose selected card now shows the last-session line (`115 lb × 13, 12 · MESO — W4·D1`) and the underlined `FULL HISTORY ›` sheet per the mockup
- **Templates (3.3):** live tab (search, emphasis label, `N D/WK` + gender chips) → template detail page → `START A MESO FROM THIS` (2.7 create sheet with `FROM TEMPLATE — NAME` subtitle, then the planner board opens prefilled — days, groups, slot fills; **excluded exercises never carry over**, their slots stay open); `SAVE AS TEMPLATE` on meso detail round-trips the full `template_day_groups` shape; plan-a-meso (2.3) option 02 is live via a slot-aware template picker
- **Sharing (F5/F6):** one-time share codes (8 chars, no 0/O/1/I) for custom exercises, templates, and mesocycles — SHARE row on each detail page, redeem form on the Templates tab. Copy-on-accept with provenance ids (`source_exercise_id`/`source_template_id`) and per-grantee dedupe; custom exercises referenced by shared templates/mesos are copied (and deduped) too; shared mesos copy as **planned standalone structure** — the owner's loads don't carry, the engine seeds the grantee's numbers at start. Acceptance reads run on the service client (grantee can't read the owner's rows) with every write explicitly scoped to the redeeming user
- **Seed polish:** stock templates now seed `template_day_groups` (groups derived from each exercise's primary muscle group, slots linked); idempotent backfill added to the seed and **applied to the hosted project** (64 groups, 89/89 exercises linked)

**Phase 3 leftover — replace exercise (1.2 menu):** live picker pre-filtered to the slot's muscle group; blocked once sets are logged (row shows a LOGGED state); the prescription reseeds from the user's all-time best on the incoming movement with a clinical rationale line

### Recorded deviations

- **Templates `+ NEW` stays dimmed** and the 3.3 `CONTINUE EDITING DRAFT ›` row is omitted: templates come from save-meso-as-template (and Phase 6's MCP `create_template`); a from-scratch template editor + draft model is out of v1 scope
- **Share/redeem UI is not mocked** — built in the house style (bordered rows, redeem input on the Templates tab). Codes are single-redemption: mint again to share again
- **Volume view, ungenerated weeks:** workouts generate week-by-week, so far-future weeks show the planner baseline under the mockup's `AUTOREGULATED PLAN` caption until the engine generates them; ungenerated **deload** weeks show `—` (the engine sizes deload sets at generation)
- The performance macro chart labels itself `ACROSS MACRO — {LIFT} EST. 1RM` (no macro short-code; macros have names, not codes)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (62/62 — 14 new unit tests over the volume matrix, balance copy, key-lift grid, PR detection, emphasis vocabulary, share-code format), `npm run build` green. Hosted-DB smoke through the real modules: signup → stock template detail carries the backfilled groups-first shape → exclusion added → meso created from template (board prefilled, excluded movement's slot left open, slot counts intact) → saved back as a template (groups round-trip) → meso started → 2 sets logged → `getMesoStats` (current-week volume, key-lift cell, balance note), `getExerciseHistory` (W1·D1 entry) → custom exercise share code minted (format + dedupe on re-mint, stock objects refused). Smoke user + data deleted after; `acceptShareCode` itself isn't integration-tested (needs the service key, not available in this environment) — its helpers are unit-tested and all writes are user-scoped

### Not done yet / next

1. Phase 3 leftover: Playwright e2e for the logging loop (still no browser runtime in this environment)
2. Phase 6 — MCP connector at `/api/mcp`: OAuth bridge, read tools over the same views, draft write tools with `mcp_write_audit`, admin param/replay tools (`engine_decisions` + versioned params are flowing)
3. Phase 7 — production hardening (RLS/advisor audit, rate limiting, Sentry, accessibility pass, CSV export + account deletion, final design QA)
4. In-browser pixel QA of the new screens (stats, exercise detail, templates) against `docs/design/screenshots/`

## 2026-06-13 — Phase 4: progression engine alignment & wiring

### Done

**Phase 4 — engine re-alignment + week N→N+1 generation** (complete)

- **Feedback re-alignment:** engine inputs now take the redesigned 1.4 signals — joint pain 0–3 per exercise, pump and workload 0–10 per muscle group. The workload slider anchors set counts ("just right" = 5): `workload ≥ workload_high (8)` pulls a set; `workload ≤ workload_low (3)` with pump ≥ `set_add_pump_min (6)` under the gain goal adds one up to the group ceiling; low pump at the right dose flags exercise selection in the rationale instead of touching load. Strain/fatigue thresholds removed
- **Per-equipment per-unit increments:** `engine_params` v2 expresses increment + rounding per equipment in **both units** (`{ kg, lb }`) — lb users get real plate math (barbell +5 lb, not 2.5 kg × factor) — with first-class **bands (10 lb / 5 kg)** and **kettlebell (9 lb / 4 kg)** steps; the `engineEquipment` shim in generation is gone. Rationale copy now reads "+5 lb" (mockup voice)
- **Params v2** shipped as append-only migration `20260613000001_engine_params_v2.sql` (v1 deactivated and kept for replay; single-active index holds), mirrored in `params.ts` defaults and seed; **applied to the hosted project**; RLS test updated to expect v2 active
- **Week N→N+1 generation job** (`src/lib/queries/progression.ts`): on workout completion, `advanceWeekAfterWorkout` builds the same day of week N+1 from week-N actuals + feedback (group-scoped pump/workload resolved from whichever exercise closed the group, weekly group set totals, meso peak per exercise for deload sizing, goal from macro slot → macro → gain for standalone, peak slots train as gain), inserts the workout + prescriptions with rationale strings, and writes one `engine_decisions` row per exercise (inputs/output/params version) via the **service client** with explicit user scoping. Idempotent per day; on week close it backfills skipped days (prescriptions carry forward) and activates microcycle N+1; the final week closes the meso. `catchUpProgression` re-runs the job on first open of the Workout tab if completion-time generation failed
- **Autoregulation summary composer** (`src/lib/engine/summary.ts`, pure + unit-tested): the 1.5 copy — "Feedback recorded. W3 targets recalculated — Hack Squat +5 lb, Cable Pushdown +1 set. Ramp moves to 1 RIR next week.", deload and meso-close variants, clause cap with "and N more"
- **Complete sheet wired** (fig 1.5): `COMPLETE W2·D1` completes + recalculates in one action and the AUTOREGULATION callout swaps to the real engine summary; the primary becomes `NEXT — W2·D2` (next sibling, or W(N+1)·D1 once the week closes; `DONE` after the meso)
- **Progress scoring v1:** `getMesoProgressScores` (`src/lib/queries/stats.ts`) — per-exercise e1RM trend across a meso from `v_exercise_history` via `scoreProgress`, ready for Phase 5 stats and MCP
- Tests: 48 passing — reworked golden meso/prescribe/bounds fixtures to the new feedback shape, new cases for workload-anchored volume, pump corroboration, selection flag, kettlebell/bands steps, summary composer, and pure progression helpers (`buildEngineInputs`, `weeklySetsByGroup`, `peakByExercise`, `engineGoal`)

### Recorded deviations

- **Complete sheet is two-phase** (confirm → recalculated state): the 1.5 mockup shows the post-completion state; a confirm step is kept so opening the sheet can't silently mark untouched exercises skipped. After confirming, the sheet matches the mockup (real summary + NEXT button)
- Week-1 seeding decisions (from `startMeso`) are not yet audited to `engine_decisions` — the rationale lives on `workout_exercises.notes`; folding seeding into the decisions audit is noted for Phase 6 (replay wants it)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (48/48), `npm run build` green. Migration applied to the hosted project (v2 active, v1 kept inactive). Hosted-DB integration smoke through the real modules: signup → standalone 4-week meso (2 exercises, one group) → start (hosted params v2 parse) → 6 clean sets logged → group feedback (pump 7, workload 2) → complete → **advance**: week-2 workout generated with +5 lb on barbell, +1 set group-wide, RIR 3→2, full rationale strings, microcycle 2 activated, summary exactly in the mockup voice (`engine_decisions` insert shimmed in the smoke — no service key in this environment; covered by RLS tests). Smoke user deleted afterwards (and the leftover `smoke-test-claude@example.com` from the earlier session cleaned up too)

### Not done yet / next

1. Phase 3 leftover: Playwright e2e for the logging loop (still no browser runtime in this environment); exercise-menu replace/move
2. Phase 5 — meso stats screens (figs 4.1–4.3) off the shared views, exercises tab build-out, history sheet integration in picker/menu, templates round-trip, sharing
3. Phase 6 — MCP connector incl. admin param/replay tools (`engine_decisions` + versioned params are now flowing, so the decision inspector and replay harness have real data)

## 2026-06-12 — Design-fidelity pass: every screen transcribed from the v2 mockup HTML

The first builds of the 1.x–4.x screens improvised layouts from the spec prose; this pass re-reads `docs/design/mockups/workout - App Screens v2.dc.html` figure by figure and rebuilds each screen to its exact structure, copy, sizes, and colors. **New CLAUDE.md hard rule #8:** pixel fidelity to the mockup HTML is mandatory before building or changing any screen.

### Reworked to match

- **Day view (1.1)** is now the Workout tab itself (no header/back-link page): brand row (`workout` logotype + meso name), meso week track with the `MESO X OF Y · MACRO` / `● WEEK N — TARGET R RIR` caption, 46px `W2·D1` coordinate with date + `N OF M SETS LOGGED`, and per-exercise blocks — group caps label with 28px history/menu buttons, 20px exercise name + equipment, `PINNED —` note bar, and the **LB / REPS / LOG set grid**: editable cells (logged = tinted ink-framed; next = paper with 1.5px ink frame; future = faint), 26px LOG checkbox (filled ✓ / 2px frame / faint), ⋮ handle per row. `/log/[id]` stays as a deep link with a `‹ WORKOUT` crumb
- **Exercise menu (1.2)** and **set menu (1.3)** are anchored menu cards (offset hard shadow, scrim) — not bottom sheets — with the mockup's row sets: History › / New note / Replace exercise / Move down / Add set / Skip remaining sets / Remove exercise; Add set below / Set type (STRAIGHT⇄DROP) / Skip set / Delete set. History opens the 3.2 sheet (real `logged_sets` data grouped by meso)
- **Feedback (1.4):** title "Feedback", `MG — AFTER EXERCISE · FEEDS W# TARGETS` subtitle, sentence-case None/Low/Moderate/High pain options, ⓘ explainers, pump endpoints NO PUMP / BEST EVER, workload TOO EASY / JUST RIGHT / TOO MUCH with the explainer callout, Cancel + SAVE footer
- **Complete (1.5):** "W2·D1 complete." sheet with Exercises completed / Sets logged / Skipped rows, bordered AUTOREGULATION callout (placeholder copy until Phase 4), framed WORKOUT NOTES field, underlined "View meso stats", `NEXT — W#·D#` primary
- **Cycles (2.1):** `+ NEW` header button, expandable macro blocks (▼/▶) with `GOAL ARC: … · ● NOW IN SLOT N`, ink-rule-indented slot rows (✓ box / accent CURRENT badge / faint "Slot N" + dashed `+ PLAN`), `STANDALONE — NO MACRO` section
- **Meso detail (2.2):** WK/RIR/day-column ramp matrix (✓ cells, accent-framed next day, dashed deload/unbuilt), `RAMP 3 → 0 RIR` / `DELOAD W# — # RIR` caption, EDIT WEEKS + GO TO W#·D# button pair, MESO STATS row
- **Plan a meso (2.3):** numbered 01–04 rows (copy / template / builder / scratch) with chevrons
- **Planner board (2.4):** framed day-tab bar with `+` cell, `N OF M PICKED · S SETS` caption + `✎ DAY SETUP`, group headers with two-letter badges and sets counts, ⋮⋮ exercise rows with `EQUIPMENT · START N SETS`, dashed `Slot n — pick exercise` rows, macro-context strip with mini slot bars
- **Day setup (2.5):** label + weekday side-by-side, week-starts checkbox + accent Remove day, per-group −/n/+ steppers with ✕, in-sheet + ADD MUSCLE GROUP, helper copy, Cancel/DONE
- **Picker (2.6):** search + filled group chip, select-then-add model with the accent-framed SELECTED card (equipment, last performed, best set), `ADD TO {DAY}` primary
- **Create meso (2.7):** macro-placement timeline (filled/✓, accent-framed selected, dashed open slots with the JAN '26 … caption), framed 4–8 weeks segmented row, `RIR RAMP: 3 → 0 · W# DELOAD` caption, Cancel/CREATE; deload is always included per the mockup (toggle removed)
- **Exercises (3.1):** search frame, FILTERS chip row (muscle-group filter), `NAME / GROUP · EQUIPMENT · LAST date` rows; **Templates (3.3)** frame
- **More (4.4):** logotype, framed profile card (name, `34 · INTERMEDIATE · 198 LB · 5′11″` meta, TRAINING SINCE / N WORKOUTS LOGGED footer), SETTINGS rule with inline LB/KG mini-toggle, AI connector + CSV rows, version line
- **Profile (4.5):** read-only data rows (tap to edit in a sheet; height displayed ft/in for lb users), framed experience segmented control + helper, filled/bordered equipment chips, `NAME / REASON · ✕` exclusion rows + dashed + ADD EXCLUSION + helper

### Recorded deviations (hard-rule or phase-driven)

- **No "Delete set" on logged sets** — logged history is append-only (hard rule 5); the set menu offers amend-in-place instead. Delete/skip exist for unlogged sets only
- **Flow order:** the meso row is created at 2.7 before the board (the planner persists to `meso_days`/`meso_day_groups`, which need the meso id); the screens themselves match the mockups
- **Picker card** shows ALL-TIME BEST instead of the last-session set line (last-session line + FULL HISTORY land with the 3.2 integration in Phase 5)
- `+ NEW` on Exercises/Templates is dimmed until create-custom (Phase 5); plan-entry options 01–03 dimmed with "(soon)" until their phases
- Profile height edits in cm (display converts to ft/in); sign-out button added to More (needed, not mocked)

### Verified

`typecheck` / `lint` / `test` (30/30) / `build` green; hosted-DB smoke re-run for the extended day-view detail (context label, sibling workouts, microcycles) with cleanup.

## 2026-06-12 (later) — Phase 3 workout logging (core loop)

### Done

**Phase 3 — workout logging** (core loop; e2e + engine-derived summary pending)

- Day view `/log/[workoutId]` (fig 1.1): meso week track + RIR/deload badge in the header, day coordinate + day label, exercises grouped under `01 — QUADS` rules with pinned notes, set rows in three states — logged (filled ink, tap to amend), the live set (accent frame with weight/reps steppers, RIR chips, drop-set toggle, LOG SET), unstarted (faint prescription row)
- Logging data layer (`src/lib/queries/logging.ts`): `getWorkoutDetail` (one shape for the whole day), `logSet` with denormalized cycle stamps + auto `in_progress` flip, `amendSet` (corrections are updates — logged history stays append-only), prescribed-set add/skip, exercise skip/remove (remove blocked once sets exist, since the FK would cascade logged history), pinned-note save (one pinned per exercise)
- Exercise menu (fig 1.2): prescription rationale line, new/replace pinned note, add set, skip last set, skip remaining, remove (destructive accent row)
- Per-exercise feedback prompt (fig 1.4): auto-opens after the last planned set; joint pain (NONE/LOW/MODERATE/HIGH) per exercise; pump + workload 0–10 snap-sliders scoped to the muscle group when the exercise is the group's last to finish ("just right" centered), with explainer copy; writes the redesigned `exercise_feedback` rows
- Workout complete sheet (fig 1.5): per-exercise summary rows (set count + top set), workout notes, completion marks logged exercises completed / untouched ones skipped, closes the microcycle when the whole week is done (next-week activation is the Phase 4 job); autoregulation summary placeholder until Phase 4
- Workout tab resting state (08 §2): with no active meso, shows the latest completed meso's summary (`v_meso_summary`) above the setup prompt

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (30/30), `npm run build` green. Hosted-DB integration smoke for the full loop: standalone meso → plan → start → pinned note → 2 logged sets (workout flips `in_progress`) → group-scoped feedback (pump 7 / workload 5) → complete (status, notes, exercise statuses, microcycle closed) — then cleaned up.

### Not done yet / next

1. Phase 4 — week N→N+1 generation job (prescribe() wired to the new feedback signals, `engine_decisions` writes, autoregulation summary copy), engine input re-alignment to pump/workload 0–10 with new golden fixtures, per-equipment lb increments
2. Playwright e2e for the logging loop (no browser runtime in this environment)
3. Exercise menu leftovers: history sheet (3.2, Phase 5), replace exercise, move

## 2026-06-12 — Phase 1 delta complete; Phase 2 cycles & groups-first planning

### Done

**Phase 1 delta** (complete)

- Queries for the pivot tables in `src/lib/queries/`: exclusions (list/add/remove), pinned exercise notes, picker query (`listPickerExercises` — muscle-group pre-filter, search, last-performed + best-set from `v_exercise_prs`, exclusions removed), wider profile patch, `getActiveEngineParams`
- Onboarding rebuilt as the 08 §4 four-step sequence (about you → experience → equipment access → units, lb default) with a step rail; submits once at the end, lands on Cycles
- Profile screen `/more/profile` (fig 4.5): data rows (name/age/height/bodyweight + updated-at/training-since), experience segmented control (instant save), equipment chips, excluded-exercise management with reason labels and a search sheet
- More tab (fig 4.4): profile card → Profile, working LB/KG toggle, AI connector + CSV export placeholder rows, version line
- Hosted Supabase confirmed live (both migrations + seed applied); `.env.example` unchanged — anon key + URL wired locally via `.env.local` for verification

**Phase 2 — cycles & groups-first planning** (core flow complete)

- Cycles tab (fig 2.1): macro sections with ordered goal-arc slots — filled slots show their meso (orange marker = active), empty slots show dashed `+ PLAN`; legacy/unslotted mesos still listed under their macro; standalone section; empty state per 08 §4
- Macro creation `/cycles/new`: name, date range, goal-arc slot builder (tap to cycle cut/gain/maintain/peak, add/remove up to 12)
- Plan-a-meso entry `/cycles/plan` (fig 2.3): from-scratch live; template/copy/builder as dashed "soon" cards
- Create mesocycle `/cycles/plan/new` (fig 2.7): name, placement (standalone or any open macro slot), weeks 4–8, deload toggle, live RIR-ramp preview on `WeekTrack`
- Planner board `/cycles/meso/[id]/plan` (figs 2.4–2.6): weekday-sorted day tabs, muscle-group blocks with numbered slots (filled rows + dashed `+ EXERCISE`), add-group sheet, day-setup sheet (label, weekday, week-starts-here → `profiles.week_starts_on`, per-group slot steppers, remove day), exercise picker pre-filtered to the slot's muscle group with search, start-sets stepper, last-performed/best-set data
- Meso detail `/cycles/meso/[id]` (fig 2.2): RIR ramp matrix (weeks × days; filled = complete, accent frame = in progress, dashed = unbuilt/planned), `GO TO W#·D#`, edit plan, `MESO STATS` stub
- **Meso start generation** (`src/lib/queries/generation.ts`): on start, builds all microcycles from `rirRamp` (week 1 active) and week-1 workouts/`workout_exercises` from the planner board via `seedMeso` — prescriptions carry muscle-group context, target RIR, and the engine rationale string; bands/kettlebell map to `other` increments until Phase 4
- Engine: `rirRamp` widened from 3–6 to 3–8 weeks (matches the 2.7 week range + pivot schema), with a new 8-week golden test
- Workout tab updated for standalone mesos (`getCurrentState` now anchors on the active meso, macro optional); read-only day view at `/log/[workoutId]` shows generated prescriptions grouped by muscle group with rationale lines (logging itself is Phase 3)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (30/30), `npm run build` all green. End-to-end integration smoke against the **hosted** Supabase project (signup → onboarding writes → macro + slots → meso into slot → 2 planner days → group + slot fill → start meso): 5 microcycles created with the 3→0 ramp + deload, week-1 workouts generated with correct sets/target RIR/muscle group/rationale, `getCurrentState` surfaces the next workout; test data cleaned up after. Route auth gating spot-checked on a local dev server.

### Not done yet / next

1. Phase 3 — workout logging (day view 1.1 one-thumb logging, exercise/set menus, per-exercise feedback prompt, workout-complete sheet, Playwright e2e). The `/log/[workoutId]` read-only view is the starting skeleton
2. Phase 4 — engine feedback re-alignment (pump/workload 0–10 inputs, new golden fixtures), week N→N+1 generation job, per-equipment lb increments incl. bands/kettlebell
3. Phase 2 leftovers tracked in 07: template-prefilled planner (Phase 5), copy-a-meso, meso builder
4. A throwaway auth user (`smoke-test-claude@example.com`) remains on the hosted project from the integration smoke; safe to delete from the Supabase dashboard

## 2026-06-12 — Phase R: light-ledger retheme, canon tab bar

### Done

**Phase R — design-system retheme** (code-complete)

- Token set replaced in `src/styles/globals.css` per 08 §1: cream `#F4F0E6` base, paper `#FCFAF4` surfaces, ink `#17140F`, accent `#C14B2A`; opacity steps of ink (`ink/55`, `ink/45`, `ink/15`…) carry the secondary/faint/hairline roles; square corners everywhere (all radius tokens removed); the old dark palette, pressed-orange, and green/yellow status colors are gone. `--shadow-menu` (5px 5px 0 hard offset) is the single permitted shadow
- Typography: Archivo variable (latin, 100–900) committed at `src/app/fonts/` and self-hosted via `next/font/local`; helpers `.title-display` (800 lowercase tight), `.logotype` (0.22em lowercase), `.label-caps` retracked to 0.12em, `.numeral` unchanged
- Primitives reworked to the ledger: `Button` (filled-ink primary / 1.5px ink-frame secondary), `Card` → ruled section (caps header over 1.5px rule, no box), `Input` (paper bg, ink focus), `FeedbackScale` (accent-fill selection per fig 1.4), `NumberStepper`, `RirBadge` (accent frame at peak, dashed deload)
- New primitives from the mockups: `SegmentedControl` (filled-ink active), `Chip` (filled-ink selected + dashed planned variant), `SnapSlider` (snap-to-stop 0–10, tick stops, rectangular accent thumb, keyboard support), `BottomSheet` (ink scrim, 2px-rule sheet), `MenuCard`/`MenuItem` (offset hard shadow, accent destructive row), `WeekTrack` (filled/current+dot/faint/dashed-deload states)
- **Canon tab bar** `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`: routes renamed `today`→`workout`, `settings`→`more`, `insights` removed, `templates` placeholder added; sign-in lands on `/workout`, onboarding completion lands on `/cycles` (08 §4); active tab is bold ink with ■ marker
- All existing screens (landing, auth, onboarding, cycles, exercises, workout, more) re-dressed in the system: ruled headers with lowercase display titles, hairline row dividers, filled-ink radio/checkbox chips, no rounded corners anywhere
- PWA: manifest + theme color → `#F4F0E6`, `start_url` → `/workout`, status bar `default`; icons regenerated for the light system (`scripts/generate-icons.mjs` recolored). Service worker already shell-precache-only — no offline-logging assumptions to remove

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29), `npm run build` all green. Token/spacing values transcribed from the v2 mockup HTML (figs 1.1–4.5); pixel QA in a real browser still worth a pass when deploys exist.

### Not done yet / next

1. Phase 1 delta — onboarding rebuilt as the 08 §4 four-step sequence, Profile screen (fig 4.5), real More tab rows, queries for the pivot tables; provision hosted Supabase + Vercel
2. Phase 2 — cycles & groups-first planning (the new primitives — Chip, BottomSheet, WeekTrack, SegmentedControl — are ready for the planner screens)
3. Engine feedback re-alignment (pump/workload 0–10) needs new golden fixtures before wiring (Phase 4)

## 2026-06-12 — Design pivot ingested; plan rewritten; schema delta

### Done

**Design handoff ingested** (Claude Design mockup round)

- [08-design-decisions.md](08-design-decisions.md) added as the authoritative design source; mockup HTML + screenshots in `docs/design/`
- Specs updated for the pivot: light ledger system supersedes the dark system in 06 (banner added); canon tab bar `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`; **offline sync cut** (01/02/07 — app is online-only); **admin UI cut** — engine inspection/tuning/replay ship as admin-gated MCP tools (01/02/04/05/07); CLAUDE.md hard rules updated
- [07-implementation-plan.md](07-implementation-plan.md) rewritten: new Phase R (design-system retheme), groups-first planning in Phase 2, redesigned feedback + workout-complete flow in Phase 3, engine re-alignment in Phase 4, meso stats/library/templates in Phase 5, MCP incl. admin tooling in Phase 6, hardening in Phase 7

**Schema delta** — migration `20260612000001_design_pivot.sql` (RLS + tests in the same PR; `database.ts` updated)

- `profiles`: height/bodyweight (+`bodyweight_updated_at`), `training_since`, `week_starts_on`
- New tables: `excluded_exercises`, `exercise_notes` (pinned), `macro_slots` (goal arc), `meso_days` + `meso_day_groups` (groups-first planner), `template_day_groups`, `mcp_write_audit`
- `mesocycles`: nullable `macrocycle_id` (standalone mesos), `macro_slot_id`, weeks 3–8
- `workout_exercises`: `muscle_group_id` (day-view grouping + feedback scope), `status` (skip states)
- `logged_sets`: `set_type` (straight/drop), `unit` (lb/kg); nullable `macrocycle_id`
- `exercise_feedback` redesigned: joint pain 0–3 per exercise; pump/workload 0–10 sliders per muscle group (strain/fatigue dropped)
- Equipment vocabulary + bands/kettlebell; `exercises.description`
- New views `v_meso_week_sets` (stats volume/balance) and `v_exercise_prs` (performance/PRs)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29) green; both migrations applied in order against a clean Postgres (`check_function_bodies=off`, as on Supabase)

### Not done yet / next

1. Phase R — retheme tokens/primitives to the light ledger system (blocks all screen work)
2. Phase 1 delta — onboarding sequence, Profile/More screens, queries for the new tables; provision hosted Supabase + Vercel
3. Phase 2 onward per the rewritten plan; engine feedback re-alignment (pump/workload 0–10) needs new golden fixtures before wiring

## 2026-06-11 — Foundation, data model, engine core

### Done

**Phase 0 — Foundation & scaffolding** (code-complete; deploys pending)

- Next.js 15 (App Router) + TypeScript + Tailwind v4, structured per [02-architecture.md](02-architecture.md)
- PWA baseline: `manifest.webmanifest`, generated icons (`scripts/generate-icons.mjs`), Serwist service worker (`src/app/sw.ts`, disabled in dev)
- Design tokens from [06-design-system.md](06-design-system.md) as Tailwind theme variables in `src/styles/globals.css`
- UI primitives: `Button`, `Card`, `Input`, `BottomNav`, `RirBadge`, `NumberStepper`, `FeedbackScale`
- ESLint (flat config) + Prettier + Vitest; CI workflow (`.github/workflows/ci.yml`): typecheck, lint, unit tests, build, plus an RLS job against a local Supabase stack

**Phase 1 — Auth, profiles & data model** (code-complete; hosted project pending)

- Full schema migration `supabase/migrations/20260611000001_initial_schema.sql`: all 19 tables from [03-data-model.md](03-data-model.md), RLS enabled everywhere with default deny, denormalized cycle stamps on `logged_sets`, hot-path indexes, `security_invoker` views `v_exercise_history`, `v_muscle_group_volume`, `v_meso_summary`, signup trigger creating `profiles`
- Notable policy decisions: no client `delete` policy on `logged_sets` (append-only history); `profiles` update policy prevents self role-escalation; `engine_decisions` written only via service role; single-active-row constraint on `engine_params`
- Seed (`supabase/seed.sql`): 12 muscle groups, ~80 stock exercises with muscle-group mappings, 4 stock templates (Upper/Lower 4-day, PPL 6-day, Full Body 3-day, Glute Emphasis 4-day), `engine_params` v1 mirroring `src/lib/engine/params.ts`
- RLS test suite (`tests/rls/`, `npm run test:rls`): cross-user reads/writes blocked, stock visibility, append-only sets, role escalation, engine table gating
- Supabase clients (`src/lib/supabase/`): browser, SSR server, middleware session refresh, and `service.ts` (the only module allowed to touch the service-role key)
- Email/password auth (server actions, zod-validated), onboarding flow writing profile + `onboarded_at`
- Hand-authored `Database` types (`src/lib/types/database.ts` — regenerate with `npm run db:types` once a stack is running) and `src/lib/queries/` for profiles, exercises, cycles

**Phase 4 — engine core** (pulled forward; it is pure code with no infra dependency)

- `src/lib/engine/`: `prescribe()`, `seedMeso()`, `rirRamp()`, `scoreProgress()`; rule modules for performance delta, feedback modulation, deload, RIR ramp, rounding/increments
- All tunables flow from `engine_params` (zod schema gate — a malformed row cannot be parsed, so it can never be activated)
- 29 tests: table-driven rule-branch units, a golden 5-week + deload meso simulation (100 → 102.5 → 105 → 107.5 → 60 kg deload), and seeded-PRNG property tests on hard bounds (pain gate blocks increases, deload < peak, set floor/ceiling)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29), `npm run build` all green locally. RLS tests are written and wired into CI but need a running Supabase stack to execute.

### Not done yet / next

1. **Provision hosted Supabase project + Vercel project** (needs account decisions): apply migration + seed, set env vars, enable an OAuth provider, then regenerate `database.ts` from the live schema
2. **Phase 2 — cycle management**: meso builder UI, microcycle generation (`rirRamp` is ready), week-1 workout generation, exercise library v2 (create custom), cycle timeline screen
3. **Phase 3 — logging flow**: logging UI (primitives exist), feedback sheets, offline outbox + sync, Playwright e2e
4. **Phase 4 remainder**: week N→N+1 generation job wiring `prescribe()` to data + `engine_decisions` audit writes
5. Phases 5–8 per the plan

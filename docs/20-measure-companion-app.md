# 20 — MEASURE: the measurement companion app (direction)

**Status: direction — revised 2026-07-31 after the owner's first review.** Still
a concept-and-architecture document, not a build spec. No code ships against it
until the design pass (§16 Phase 0) produces figures — hard rule 8 binds here
exactly as it does in WORKOUT. Backlog item **N66** tracks it.

**The one-line thesis:** WORKOUT measures *training inputs* and the app has
grown a body-measurement lobe under `More` because there was nowhere else to
put it. That lobe is the outcome layer of the whole product, it wants a daily
cadence and a real information architecture, and it is being starved by a tab
bar that is (correctly) reserved for training. MEASURE gives it a front end of
its own — on the same database, the same design system, the same MCP
connector — so each app can be shaped by what it is for.

### What the 2026-07-31 review settled

- **Topology confirmed** (§3.2): one deployable, shared auth, two shells. Not
  separate today, but **architected to separate without unreasonable work** —
  now a checkable list rather than a promise (§3.4).
- **New binding principle: transparency** (§2.7) — every number traceable to
  its inputs, no opaque composites. This is the constraint that shapes §5.
- **Capture speed is a first-class requirement, not polish** (§4). Weight
  logging is the highest-frequency action in the suite and gets a design
  section, an API surface, and an early phase.
- **Apple Health is the integration bus** (§4.5) — the finding that reframes
  both the "push to Health" ask and the Happy Scale ask, and removes Dropbox
  from the critical path.
- **The three-source question is answered** (§5): they triangulate, they do not
  average; a three-tier model separates measured from corroborated from
  projected, and only the first two cross into WORKOUT.

---

## 1. Division of labour

The split is by **fact ownership**, not by screen convenience. Each fact has
exactly one app that edits it, and one shared read surface both may read.

| | WORKOUT | MEASURE |
|---|---|---|
| **Owns** | sessions, sets, prescriptions, cycles, templates, exercises, the engine | bodyweight series, circumferences, DEXA scans, composition, measurement prefs, capture endpoints, import/export |
| **Cadence** | per-session (3–6×/week) | daily (weigh-in), 2–4 weekly (tape), quarterly (scan) |
| **Question it answers** | *what do I do today?* | *is it working?* |
| **Reads from the other** | the four-item payload in §5.6 | the active macrocycle's goal, contract band, and span |
| **Never does** | become a measurement logbook | write prescriptions (§5.6) |

The seam is deliberately narrow. Neither app embeds a mini-version of the
other; each links out.

---

## 2. Principles (binding once adopted)

1. **One owner per fact, one definition per metric.** MEASURE extends the
   existing shared-views rule (`CLAUDE.md` → Conventions): anything both apps
   display reads the same view. No parallel arithmetic.
2. **Smoothing is read-time, never stored.** No `smoothed_weight` column, no
   recompute job, no invalidation. Changing a window is instant and free —
   this is the one place where doc 14's dependency-fingerprint problem is
   avoided by construction rather than solved. See §7.
3. **Measurement informs targets and verdicts, never prescriptions.** Doc 15
   §3.3's boundary is restated here as binding for the whole app. The
   consented bf% → FFMI → strength-band → pacing chain (N52) stays the only
   engine-facing path, and it stays consented.
4. **The trend is the headline; the raw point is a detail.** Scale weight
   swings ±2–4 lb daily on water, glycogen, and gut contents. Any surface
   that leads with "you're down 1.2 lb since yesterday" is lying. See §13.
5. **The database and the design system do not fork.** One Supabase project,
   one migrations directory, one `src/lib`, one ledger design system. MEASURE
   is a second front end, not a second product.
6. **Ledger voice, health-data register.** No praise, no scolding, no goal
   shaming, no exclamation marks (hard rule 7). This app holds the numbers a
   user is most likely to feel bad about; it states them and stops.
7. **Transparency — every number is traceable** *(owner, 2026-07-31)*. No
   composite indices, no unlabelled inference, no "trust the algorithm". Every
   derived figure states its **method, window, and n** on the surface that
   shows it, and can be drilled to the measurements that produced it. Where a
   number rests on an assumption, the assumption is named inline and the
   output is a **range, not a point**. This principle is why §5 is a tiered
   model instead of a body-progress score.

---

## 3. Architecture — where the app lives

### 3.1 The forcing question

Three things **must** be shared: Postgres + RLS, the typed query/type layer,
and the design system. Three things **must** be separate: the app shell and
navigation, the PWA identity (icon, name, home-screen presence), and the
information architecture. Every topology option is scored on how cheaply it
gets both halves.

### 3.2 Decision: one deployable, two shells — owner-confirmed 2026-07-31

A `(measure)` route group served under `/measure/*`, with its own layout, tab
bar, logotype, loading states, and **its own web manifest**, sharing
everything below the shell unchanged. Shared authentication is explicitly
wanted; separation is a future option, not a near-term goal.

```
src/app/
├── (auth)/            unchanged — serves both shells
├── (app)/             WORKOUT — unchanged
├── (measure)/         MEASURE — new
│   ├── layout.tsx     own tab bar, own logotype, links measure.webmanifest
│   └── measure/       summary · weight · body · scans · more
└── api/
    ├── mcp/           one endpoint, both domains (§12)
    └── measure/       token-authenticated capture endpoints (§4.3)

src/lib/
├── measure/           the pure smoothing/trend/synthesis module (§7)
├── queries/measure/   MEASURE's data access — the only DB path the shell uses
└── seam/              the §5.6 payload — the one module both shells import
public/
├── manifest.webmanifest        WORKOUT  (start_url "/", scope "/")
└── measure.webmanifest         MEASURE  (start_url "/measure", scope "/measure/")
```

Why this wins, concretely:

- **Two home-screen apps, one sign-in.** Two manifests on one origin produce
  two independently installable PWAs with their own icons and standalone
  windows, sharing the Supabase session cookie.
- **One service worker still works.** Serwist's root-scoped SW (`/`) already
  covers `/measure/*`; installability is driven by the manifest, not SW scope.
- **Cross-links are just links.** No token passing, no CORS, no redirect dance.
- **Zero refactor.** `src/lib/*` is imported by both shells as-is.
- **Bundles stay separate where it matters.** Next.js code-splits per route.
  Verify with the bundle analyzer at Phase 1 rather than assuming.

**The honest cost:** one deploy and one CI, so a MEASURE regression can break
the WORKOUT deploy and the two cannot be released independently.

### 3.3 Alternatives considered

- **Monorepo, two Next apps, two Vercel projects.** The end state if
  independent releases are ever needed. Deferred on cost, not merit.
- **Separate repository.** Rejected outright — forks the migrations, generated
  types, query layer, and design system against principles 1 and 5.
- **No new shell — grow `More`.** The status quo, and what prompted the
  concept: bodyweight entry, the BodySpec connection, and scan detail already
  live under `/more/*` because the canon tab bar (08 §2) has no room.

### 3.4 Separation-readiness — the checkable list

The owner's requirement is that splitting later must not be a rewrite. That is
a property to *maintain*, so it is written as rules with an owner, not as an
intention. Each is cheap now and expensive to retrofit.

| # | Rule | Enforced by |
|---|---|---|
| 1 | Nothing in `(measure)` imports from `(app)`, or vice versa | eslint `no-restricted-imports`, Phase 1 |
| 2 | No shared React context, provider, or client store spans the two shells | the same rule + review |
| 3 | MEASURE's DB access goes only through `src/lib/queries/measure/*` | convention + directory scope |
| 4 | Cross-app reads go through **`src/lib/seam/`** and nothing else — a single module with an explicit typed payload (§5.6) | review gate |
| 5 | Capture endpoints (§4.3) are token-authenticated HTTP from day one | already a network contract |
| 6 | No route in one shell deep-links into the other's *internal* path — only the published URL contract (§11) | review gate |

**What a split would then actually cost** (the point of the list): move
`(measure)` + `queries/measure` + `lib/measure` into a second app, publish
`lib/seam` as an HTTP contract (rule 4 means its shape is already fixed), set
the Supabase cookie domain to the parent so the session spans subdomains, and
decide which project hosts `/api/mcp`. Days, not weeks — and no data
migration, because the database never forked.

**Tripwires that should trigger the split:** multi-user or public launch;
independent release cadences; measured evidence that MEASURE degrades
WORKOUT's cold start; separate people owning the two front ends.

---

## 4. Capture — the fast paths

*(New in the 2026-07-31 revision, from owner items 1–3.)*

### 4.1 The design target

Weighing happens daily; everything else in this app is monthly or quarterly.
Capture latency is therefore the single most important UX number in MEASURE,
and it deserves an explicit budget: **from intent to logged, under five
seconds, without a cold app launch.** A PWA cold start cannot meet that on its
own, so the architecture provides three paths at different speeds rather than
one path optimized in vain.

| Path | Latency | Use |
|---|---|---|
| Siri / Back Tap / home-screen Shortcut (§4.4) | ~3 s, no app launch | the daily default |
| Automation from Apple Health (§4.5) | zero-touch | smart scales, and Happy Scale coexistence |
| In-app quick log (§4.2) | app launch + 2 taps | backfill, edits, everything with context |

### 4.2 In-app quick log

The WEIGHT tab opens with the entry affordance already focused — number pad
up, today's date prefilled, one confirm. Backdating and notes are one tap
away, never in the primary path. The existing More-page quick-entry row (09
2026-07-11) stays in WORKOUT as a shortcut into this.

### 4.3 The capture API

Shortcuts cannot hold a browser session, so this needs bearer-token auth —
the first non-MCP API surface in the codebase.

**`measure_api_tokens`** — `id, user_id, name, token_hash, prefix, scopes
text[], created_at, last_used_at, revoked_at`. High-entropy random token,
shown **once** at creation, SHA-256 at rest (no KDF needed at this entropy),
`prefix` stored plainly so the UI can list tokens without revealing them.
Owner-scoped RLS; the hash column is never selected by app code. Revocable
from MEASURE → More.

**Endpoints** (all zod-validated, all rate-limited via the existing
`src/lib/mcp/rate-limit.ts`):

```
POST /api/measure/weight        { weight, measured_on?, measured_at?, note?, source? }
GET  /api/measure/weight/latest → { weight, measured_on, trend, rate }
```

`source` is constrained to the capture set (`'shortcut' | 'health'`) — a token
cannot forge `'dexa'` or `'profile'`. The existing
`unique (user_id, measured_on, source)` makes every write idempotent by
construction: re-running a Shortcut twice in a day replaces the point rather
than duplicating it, and an automation loop **converges instead of
compounding**. That constraint, written for a different reason, is what makes
the whole capture design safe.

### 4.4 The Shortcuts recipes

Three recipes, to be documented in a new
`docs/deployment/measure-shortcuts.md` runbook (they are user-side setup, not
code — the same posture as `manual-operations.md`):

1. **Log weight** — *Ask for Input (number)* → *Get Contents of URL* (POST,
   JSON body, `Authorization: Bearer …`) → **`Log Health Sample` → Body Mass**
   with the same value. One recipe satisfies owner items 1 and 2 together:
   the weight lands in MEASURE and in Apple Health in a single run. Attach to
   Siri ("log my weight"), Back Tap, home screen, or a Lock Screen control.
2. **Sync from Health** — *Find Health Samples* (Body Mass, most recent) →
   POST with `source: 'health'`. Run manually, or on a time-of-day personal
   automation for zero-touch capture.
3. **Backfill from Health** — the same, unbounded, for the initial import;
   a one-time run.

Verified against Apple's documented behaviour: *Get Contents of URL* supports
POST with a JSON request body and custom headers, and *Log Health Sample*
writes Body Mass. Two caveats to confirm on device at build time, both
cosmetic rather than structural: `Log Health Sample` does not accept a
variable in its **Type** field (fine — Body Mass is hard-coded in the recipe),
and whether a time-of-day automation runs without a confirmation prompt varies
by iOS version and needs a device check.

**Non-Apple platforms:** the endpoint is platform-neutral. Android reaches it
with Tasker or HTTP Shortcuts; anything that can issue an authenticated POST
works. No part of the design is Apple-specific below the recipe layer.

### 4.5 Apple Health as the integration bus

This is the finding that reframes owner items 2 and 3.

**Happy Scale already reads from and writes to Apple Health.** So do Withings,
Renpho, and effectively every smart scale. That makes Apple Health a bus that
both apps are already on, and it means MEASURE does not need a Happy Scale
integration at all — it needs a Health integration, which recipes 1 and 2
already are:

```
smart scale ─┐
Happy Scale ─┼──▶ Apple Health ──(recipe 2)──▶ MEASURE
             └◀──────────────────(recipe 1)──── MEASURE quick log
```

Consequences worth stating plainly:

- **Bidirectional Happy Scale coexistence, for free.** Log in either app; both
  end up with the value. Nothing to reverse-engineer, nothing to maintain
  against another vendor's release cycle.
- **Smart-scale support, for free.** Any scale that writes Body Mass to Health
  reaches MEASURE without a vendor API, an OAuth client, or a partner
  agreement. This is a materially better answer than integrating scales
  individually, and it is why `'scale'` is not in the source enum — such
  points arrive as `'health'`.
- **Dropbox leaves the critical path.** Happy Scale's Dropbox sync is a
  *backup* format; parsing it would mean depending on another app's internal
  representation to produce body-weight numbers — a bad trade against
  principle 7, and a silent-breakage risk. Recommendation: **decline Dropbox
  as a sync mechanism.** Historical backfill uses the CSV export once (§8), and
  ongoing sync uses the Health bus. If a file-drop transport is still wanted
  later, §8 has the seam for it.
- **A PWA cannot touch HealthKit directly** — there is no web API for it, on
  any browser. Shortcuts is not a convenience here, it is the only bridge, and
  the design should stop looking for a better one.

### 4.6 What this deliberately does not build

No native app wrapper, no HealthKit entitlement, no background sync daemon, no
per-vendor scale integrations. Everything above is a documented recipe plus
one small authenticated endpoint.

---

## 5. Making sense of three sources

*(New in the 2026-07-31 revision — the owner's item 4, and the core of the
product.)*

The owner's question: do weight, tape, and DEXA combine meaningfully, or are
they independent metrics to be read separately?

**Answer: they combine, but not by averaging.** They measure different
quantities, at different cadences, with differently-shaped errors. Any single
composite score would hide which instrument drove it and would violate
principle 7. What they support instead is **triangulation** — each makes its
own statement over the same window, and the app's job is to say whether those
statements agree. The disagreements are the most informative thing in the app.

### 5.1 What each instrument actually measures

| | **Weight** | **Tape** | **DEXA** |
|---|---|---|---|
| Quantity | total body mass | regional girth | fat / lean / bone mass |
| Cadence | daily | 2–4 weeks | quarterly |
| Instrument error | ±0.2 lb — excellent | ±0.25 in — operator-dominated | ~0.5–1% CV on lean |
| Biological noise | **±2–4 lb** (water, glycogen, gut) | small | moderate (hydration, glycogen) |
| Limiting factor | **the quantity is contaminated** | **the operator** | **the cadence** |
| Answers | *is mass changing, and how fast* | *where did the mass go* | *what is the mass made of* |
| Blind to | composition, entirely | absolute composition | rate — too infrequent to see it |

The asymmetry is the design insight: **weight is a precise instrument
measuring a contaminated quantity; tape is an imprecise instrument measuring a
decent proxy; DEXA is a good instrument measuring the right quantity too
rarely.** No one of them is a substitute for another, and no weighted blend of
them is meaningful — the weights would be fiction.

A distinction that matters downstream: **waist girth is a fat proxy** (it
tracks abdominal fat closely), while **limb girth is a mixed proxy** (muscle +
fat + water together). They must never be read the same way. Limb changes are
only interpretable alongside the mass direction, and regional DEXA is roughly
2× noisier than total-body (doc 15 §6.1), so it does not settle limb
questions cleanly either.

### 5.2 Three tiers

Everything the app derives sits in exactly one tier, and the tier is visible
on screen.

**Tier 1 — Measured.** Per source, over a chosen window: value, delta, rate,
`n`, and whether the delta clears that source's noise threshold. Nothing
inferred. Everything else is built from this.

**Tier 2 — Corroborated.** A stated-logic read *across* sources over the same
window (§5.3). Deterministic rules with visible thresholds; the output is a
sentence plus the Tier 1 evidence that produced it. It introduces no number
that is not already in Tier 1.

**Tier 3 — Projected.** Forward extrapolation (goal dates, "what will I weigh
on…") and between-scan composition splits. Always carries its assumption
inline, always emits a **range**, opt-in, and **structurally sealed: Tier 3
never crosses the seam and never touches the engine.**

That seal is the whole reason the tiers exist. It means a speculative feature
can be added without any risk of it reaching a prescription.

### 5.3 The corroboration matrix

Over a window, reduce mass and waist each to ↑ / ↓ / flat, where **flat means
"inside this instrument's noise band"** — not "unchanged".

| Mass | Waist | Reading |
|---|---|---|
| ↑ | flat | mass added without abdominal fat gain — the productive-gain signature |
| ↑ | ↑ | gain is running fat-heavy; the rate may be above what the goal wants |
| ↑ | ↓ | recomposition, or a measurement problem. Rare — check conditions; a scan settles it |
| ↓ | ↓ | fat loss — the expected cut signature |
| ↓ | flat | over a long window, more consistent with water/glycogen or lean loss than fat loss; over a short one, suspect water |
| ↓ | ↑ | contradictory — suspect tape technique or timing before biology |
| flat | ↓ | recomposition — the outcome scale weight alone cannot see |
| flat | flat | maintenance, or the window is too short to say |

Two rules sit above the table:

- **Window minimums, enforced in code.** Mass needs a minimum weigh-in count
  across a minimum span; waist needs ≥2 sessions a minimum interval apart.
  Below either, the output is "not enough data" — never a reading. This ships
  as `confidence.ts` (§7), not as copy discipline.
- **DEXA overrides.** When same-scanner scans bracket the window, the
  composition delta *is* the answer, subject to its LSC band, and the matrix
  becomes corroboration of the scan rather than a substitute for it.

This is deliberately a small, legible table rather than a model. A user can
hold all eight rows in their head, and every cell is checkable against the
three numbers above it — which is what principle 7 asks for.

### 5.4 On screen

SUMMARY becomes a three-row ledger plus one reading line, with an explicit
window selector. Sketch, not a mockup — Phase 0 owns the real thing:

```
WINDOW  8 WEEKS ▾

MASS          176.4 → 172.2 LB    −4.2 LB    −0.53 LB/WK    42 OF 56 DAYS
WAIST         34.50 → 33.25 IN    −1.25 IN                  3 SESSIONS
COMPOSITION   APR 3 SCAN          NOT REMEASURED — 119 DAYS

READING       Mass and waist are both down. Consistent with fat loss.
              A scan would confirm the split.

MACRO         CUT · CONTRACT −0.4 TO −0.8 LB/WK · MEASURED −0.53 · ON PACE
```

Every figure carries its `n` and window; every row drills to the measurements
behind it. The READING line is Tier 2 and is labelled as such. No score, no
grade, no ring to close.

### 5.5 Goals

The macro contract stays authoritative whenever a macrocycle is active — its
band is what the mass rate is graded against, and MEASURE renders that grading
rather than inventing a second target. MEASURE holds a standalone weight goal
only when no macro is active, so the two can never disagree. Goal projections
("you reach 168 lb around…") are Tier 3: banded by the rate's own confidence
interval, never a single confident date.

### 5.6 What crosses into WORKOUT

Exactly four items, all Tier 1 or Tier 2, all through `src/lib/seam/`:

1. **Mass rate** (lb/wk **and** %/mo) with its confidence — live pacing
   against the macro contract band. Tier 1. The %/mo unit is deliberate: it is
   the pacer's own unit (doc 17 §2.4), so no conversion and no second
   definition sits between the two apps.
2. **Mass delta over the macro's logged span**, taken from the **trend** at
   each endpoint rather than the nearest raw point. This is a strict
   improvement on today's retrospective, which brackets raw points and
   therefore inherits ±2–4 lb of daily noise at both ends. Tier 1.
3. **Composition delta** when same-scanner scans bracket the macro, with its
   LSC band. Tier 1. Already designed in doc 15 §3.2.
4. **The corroboration line** for the macro window — one sentence,
   display-only. Tier 2.

**What does not cross:** Tier 3 anything, limb tape, per-site data, the raw
series, and any composite. Tape's value is a MEASURE-side interpretation, not
an engine input; a waist trend has no contract to be graded against.

**And the standing boundary holds:** none of the four reaches `prescribe`. The
only path from measurement to the engine remains the consented profile update
(bf% / bodyweight → `planMacrocycle`). Items 1–4 inform **display, pacing, and
verdicts** — the macro layer — exactly as doc 15 §3.3 requires. Mass rate is
**derived**, recomputed on read, and stays off the doc-14 fingerprint, so a
weigh-in can never stale a week of stored prescriptions.

---

## 6. Data model

### 6.1 What already exists (reuse, do not rebuild)

Roughly half the substrate shipped with doc 17 Phases 4–5 and doc 15:

| Object | Status | Role in MEASURE |
|---|---|---|
| `bodyweight_log` | built (`20260711000001`) | the weight series (§6.2 amends it) |
| `body_scans` | built (`20260711000002`) | DEXA scan events + `raw` jsonb |
| `external_connections`, `oauth_transactions` | built | the BodySpec link + PKCE round trip |
| `v_body_comp_history` | built (`20260711000003`) | scan deltas + `same_scanner_as_prev` |
| `profiles.bodyweight` / `body_fat_pct` / `body_fat_source` | built | the "current belief" layer and engine input |
| `v_macro_summary` | built | the macro's logged span, for the §5.6 payload |
| `resolveDailyBodyweight`, `bodyDeltaForSpan` (pure folds) | built | migrate into `src/lib/measure/` when §7 lands |

### 6.2 `bodyweight_log` — amendments

Built as macro-layer substrate, not as the spine of a tracking app:

1. **`source` widening** — currently `('manual','profile','dexa')`; add
   `'import'` (§8) and `'shortcut'` / `'health'` (§4). A new migration drops
   and re-adds the constraint; the append-only rule governs migration *files*,
   not schema immutability.
2. **`measured_at timestamptz null`** — time of day is the largest
   controllable variance source in scale weight. `measured_on` stays the
   canonical day key; `measured_at` is additive and lets §7 optionally
   restrict a series to comparable conditions.
3. **`note text`** — "post-refeed", "travel", "sick". Charts read wrong
   without them.
4. **`v_bodyweight_series`** — the read surface: one row per user-day with
   resolved weight, winning source, `entry_count`, and note. Same-day
   resolution is a TS fold today; with two shells, an API, and MCP reading it,
   it must become one definition (principle 1).

### 6.3 Circumferences — new

**`measurement_sites`** — stock library + per-user custom, the `exercises`
pattern (`user_id is null` ⇒ stock, readable via explicit policy):

```
id, user_id (null = stock), key, name,
bilateral boolean,
is_fat_proxy boolean,       -- waist sites: read per §5.3; limbs are mixed proxies
display_order int,
guidance text,              -- how to take it identically every time (§13)
archived_at timestamptz
```

Stock seed: neck, shoulders, chest, upper arm, forearm, waist (navel), waist
(narrowest), hips, thigh, calf. `is_fat_proxy` exists so the corroboration
matrix can pick its waist input by data rather than by a hard-coded key.

**`measurement_sessions`** — one row per tape session:

```
id, user_id, measured_on date, measured_at timestamptz null,
note text, created_at,
unique (id, user_id)        -- target of the composite FK below
```

**`measurements`** — one row per site per side per session:

```
id, session_id, user_id, site_id,
side text null check (side in ('left','right')),
value_in numeric not null check (value_in > 0),
unique (session_id, site_id, side)
```

Two design calls worth recording:

- **Sessions, not flat rows.** Tape measurements are taken in a batch under
  one set of conditions; the session is the natural log entry, makes guided
  entry obvious, and makes session-to-session the natural comparison unit —
  the shape `body_scans` already uses.
- **`user_id` denormalized onto `measurements`, kept honest structurally.**
  The RLS policy stays the cheap `user_id = (select auth.uid())` form (the
  T-R2 perf convention) rather than an `exists` subquery per row, and a
  composite FK `(session_id, user_id) → measurement_sessions (id, user_id)`
  makes a mismatched pair unrepresentable — no trigger needed.

Tall (site-per-row), not wide (column-per-site): the site set is open, and a
wide table turns every new site into a migration.

**`measure_prefs`** — one row per user: smoothing method and parameter, rate
window, week start, goal weight/date (§5.5), default sites, Tier 3 opt-in,
condition filter. Display configuration, deliberately **not** `engine_params`
— none of it reaches the engine.

**`measure_api_tokens`** — §4.3.

### 6.4 What must not be added

No `smoothed_weight`, no `trend_lb_per_week`, no materialized rollups, no
composite score column (principles 2 and 7). Every derived number is a pure
function of the series and the prefs, computed on read.

### 6.5 Shared read surfaces

`v_bodyweight_series` (new), `v_measurement_history` (new — per-site series
with session context and deltas), `v_body_comp_history` (built),
`v_macro_summary` (built). Both shells, the capture API, and every MCP tool
read these and nothing else.

---

## 7. `src/lib/measure/` — the pure module

The engine's discipline applied to display math: pure functions, no I/O, no
randomness, no `Date.now()` inside (today is passed in), golden tests on every
behaviour change.

| File | Responsibility |
|---|---|
| `series.ts` | raw log → resolved daily series; gap handling (no interpolation into storage; carry-forward only for display windows, and labelled) |
| `smooth.ts` | `ema` (half-life parameterized), `sma` (trailing **and** centered — named distinctly, never silently swapped), `none` |
| `rate.ts` | OLS slope over a window → **lb/week and %/month**, with a confidence interval |
| `synthesis.ts` | Tier 2: the §5.3 matrix over Tier 1 inputs, returning a reading **plus the evidence that produced it** |
| `project.ts` | Tier 3: goal dates and anchored composition splits — banded, assumption-carrying, opt-in |
| `reports.ts` | weekly / monthly / yearly rollups, derived on read |
| `confidence.ts` | the §13 guardrails as code: minimum points, spans, and noise thresholds per source |

`synthesis.ts` returning its evidence alongside its reading is what makes
principle 7 mechanical rather than aspirational: the UI cannot render a
conclusion without also holding the numbers behind it.

---

## 8. Import — adapters and transports

**Import is the sleeper feature.** Years of existing scale history are the
difference between trends and verdicts that are useful on day one and an app
that is empty for six months. The owner has that history in Happy Scale.

The pipeline separates **format** from **transport**, so neither multiplies
the other:

- **Adapters (format):** generic CSV with a column-mapping step (covers the
  long tail), Happy Scale CSV export, Apple Health export XML. Each is a zod
  schema plus a normalizer to `{measured_on, weight, note?}`.
- **Transports:** file picker (baseline — iOS Safari does not support the Web
  Share Target API, so this is the reliable path), the §4 capture API, and
  optionally a file-drop folder later. Dropbox, if ever wanted, is a
  *transport* here and never a format (§4.5).

Every import goes through the same **dry-run preview** — rows parsed, date
range, duplicates against the existing series, rows rejected and why — before
a confirmed commit as `source: 'import'`. The existing
`unique (user_id, measured_on, source)` makes re-importing the same export
idempotent.

**Concrete ask:** a sample Happy Scale CSV export is needed to pin its adapter
schema. Until then the generic CSV adapter covers it with a mapping step.

**Export** extends the existing `/more/export` pattern: the full measurement
corpus — weight series, sessions and measurements, scans — as CSV or JSON.

---

## 9. Happy Scale parity

*(Owner item 5.)* Verified against Happy Scale's published feature set.

| Happy Scale feature | Verdict | Note |
|---|---|---|
| EMA trend line over raw dots | **take** | already principle 4 |
| Trend weight as the headline number | **take** | not the last reading |
| Tunable smoothing aggressiveness | **take** | `measure_prefs`; principle 2 makes changes instant |
| lb/week rate, self-correcting on each entry | **take** | plus %/mo for the pacer (§5.6) |
| Projected goal date | **take, banded** | Tier 3; a range from the rate's CI, never a confident single date |
| "What will I weigh on \<date\>" | **take, banded** | Tier 3 |
| Milestones — a big goal split into reachable chunks | **adapt** | genuinely good mechanic; keep the chunking, drop the celebration. Ledger voice: *"next milestone 185.0 — about 9 days at the current trend"* |
| Plateau detection | **take** | as a Tier 2 reading with its window stated |
| Date-range views (week / month / 3-month / year / all) | **take** | the §5.4 window selector |
| History edit and backfill | **take** | already RLS-permitted; `bodyweight_log` allows owner deletes |
| Apple Health import **and** export | **take, via Shortcuts** | §4.5 — and it is what lets both apps coexist |
| Dropbox backup/sync | **decline as sync** | §4.5; CSV backfill once, Health bus ongoing |
| Streaks, badges, celebratory framing | **decline** | hard rule 7, principle 6 |

What MEASURE adds that Happy Scale cannot: tape and DEXA in the same window
(§5), and the macro contract to grade the rate against (§5.5).

---

## 10. Screens

Tab bar: **`SUMMARY · WEIGHT · BODY · SCANS · MORE`**

- **SUMMARY** — §5.4: the three-row ledger, the reading line, macro pacing,
  and what is stale (last weigh-in, last tape, last scan).
- **WEIGHT** — entry, chart (raw points *behind* the trend line, never the
  reverse), logbook (date · weight · Δ · trend · rate), window selector,
  milestones, reports.
- **BODY** — circumferences: latest session, per-site history, guided entry
  that walks the user's default sites with each site's `guidance` inline.
- **SCANS** — the BodySpec surfaces, relocated from `/more/bodyspec/*` (§17-2).
- **MORE** — smoothing and window settings, sites, API tokens (§4.3),
  Shortcuts setup, import/export, connections.

Visual identity: the ledger system is reused **verbatim** — same cream/ink,
same orange semantics, same square corners, same tracked all-caps labels. The
apps are distinguished by logotype and app icon, nothing else. A second accent
would break hard rule 7 and make the suite look like two products.

**Gating: no screen is built before its figure exists.** Phase 0 produces
`docs/design/mockups/measure - App Screens.dc.html` with its own figure index
— proposed **M1.x–M5.x**, so it never collides with WORKOUT's 1.x–4.x.

---

## 11. The URL contract

The published deep links, fixed early because rule 6 of §3.4 depends on them:
`/measure` (summary), `/measure/weight`, `/measure/body`, `/measure/scans`,
and from MEASURE into WORKOUT, `/cycles/macro/[id]`. WORKOUT's macro Overview
links out to `/measure`; MEASURE's summary links in to the macro. Neither
reaches into the other's internal routes.

---

## 12. MCP

**One server, one connector, one endpoint.** The coaching value lives in
cross-domain reasoning — *"est. strength flat while mass fell 4 lb over the
block"* is a sentence neither app can produce alone. Splitting the connector
would destroy the only thing the integration is for. Tools get a namespace
prefix; identity still never travels as an argument (hard rule 5).

Additions to sketch: `get_bodyweight_trend`, `get_measurements` /
`log_measurements`, `get_measure_summary` (Tier 1 + Tier 2, never Tier 3).
`get_body_composition` is unchanged.

Open rule question (§17-8): hard rule 5 says write tools create drafts. A
bodyweight point is user-deletable measurement substrate rather than logged
training history, and both the app and the capture API write it directly — so
a direct `log_bodyweight` is defensible. Flagged rather than assumed.

---

## 13. Honesty guardrails

Extending doc 10 §7 and doc 15 §6, binding for every surface here:

- **Scale weight.** ±2–4 lb of daily biological variation. Never present a
  day-over-day delta as progress. The trend, its window, and its uncertainty
  are the headline (principle 4).
- **Rates need evidence.** Below a minimum point count and span, the answer is
  "not enough data yet", never an extrapolated slope. A 4-day trend line is a
  rumour. Ships as `confidence.ts`.
- **Tape.** Intra-rater variation ≈ ±0.25 in on limbs, worse at the waist.
  Sub-threshold changes are stated as "within measurement range" — the same
  register as the e1RM guardrails. Each site's `guidance` exists to reduce
  that variance at the source.
- **DEXA.** Doc 15 §6 carries over unchanged: LSC bands (~1.5–2 lb lean),
  same-scanner comparisons by default, trends over pairs, regional precision
  ~2× worse than total-body.
- **Tier discipline is a guardrail, not just an architecture.** A Tier 2
  reading never appears without its Tier 1 evidence; a Tier 3 projection never
  appears without its assumption and its range.
- **Register.** Numbers stated flat. No praise, no concern-trolling, no
  streaks, no body-image editorializing. Percentiles are context, not a score.

---

## 14. What this unlocks, ranked

1. **The outcome loop closes at a usable cadence.** WORKOUT measures inputs;
   DEXA measures outcomes quarterly; bodyweight measures an outcome *daily*.
   Mass-denominated macro goals become gradable **live** rather than only at
   closeout — the signal doc 17 §7's envelope loop needs and currently waits
   months for.
2. **Macro mass contracts become honest**, in the pacer's own units, and the
   retrospective's Δbw stops inheriting daily noise at both endpoints (§5.6-2).
3. **Capture gets fast enough to actually happen.** A metric logged three
   times a week is not a trend. §4 is what makes everything downstream real.
4. **Import makes it good on day one**, and the Health bus keeps it good
   without asking the owner to abandon Happy Scale.
5. **Smart-scale support arrives free** via the same bus — no vendor APIs.
6. **Cut-phase truth at daily resolution**, with waist as the weekly fat proxy
   between quarterly scans.
7. **A better engine input for free.** The v16 bodyweight-load model reads
   `profiles.bodyweight`; a stale scalar quietly mis-loads every pull-up and
   dip prescription. Frictionless weigh-ins fix that with no engine change.
8. **Long-horizon health surfaces get a home** — BMD, VAT, waist trend — and
   the pressure comes off WORKOUT's tab bar.

---

## 15. Out of scope

- **Nutrition / calorie tracking.** Doc 01's line stands. RMR display stays
  context-only (doc 15 §3.4) and must not grow meal logging by accretion.
- **Native app / HealthKit entitlement.** §4.5 — Shortcuts is the bridge.
- **Per-vendor smart-scale integrations.** The Health bus covers them.
- **Dropbox as a sync mechanism.** §4.5.
- **Social features.** No sharing, comparison, or leaderboards on body data.
- **Progress photos.** Genuinely adjacent and genuinely different: storage, a
  stronger privacy posture, and a design system with no answer for image-heavy
  layouts. Out for now; revisit deliberately (§17-4).

---

## 16. Phasing

One phase per PR, vertical slices, `main` deployable throughout. Capture moved
early to match its priority.

| Phase | Scope |
|---|---|
| **0. Design** | Mockup pass → `measure - App Screens.dc.html`, M-series figure index, 09-style changelog entry. **Gates every later phase** (hard rule 8) |
| **1. Shell** | `(measure)` route group, layout + tab bar + manifest + icons, install verified on device, the §3.4 separation rules incl. the eslint boundary, bundle baseline |
| **2. Weight core** | `bodyweight_log` amendments + `v_bodyweight_series` (RLS tests in-migration), `src/lib/measure/` (`series`/`smooth`/`rate`/`confidence`) + golden tests, entry · chart · logbook · settings |
| **3. Fast capture** | `measure_api_tokens` + RLS, `POST /api/measure/weight`, token management UI, the three Shortcuts recipes + `docs/deployment/measure-shortcuts.md`, on-device verification |
| **4. Import** | adapters (generic CSV, Happy Scale, Health export) + dry-run preview + dedupe; measurement export |
| **5. Circumferences** | sites / sessions / measurements migrations + RLS tests + stock seed, guided entry, per-site history |
| **6. Synthesis** | `synthesis.ts` + the §5.3 matrix, SUMMARY page, reading line, milestones, reports |
| **7. Scans** | relocate the BodySpec surfaces with redirects from `/more/bodyspec/*` |
| **8. Seam** | `src/lib/seam/`, the four-item payload, WORKOUT-side pull-through, retrospective upgraded to trend-bracketed endpoints |
| **9. Projections + MCP** | Tier 3 (opt-in, banded) and the §12 tool surface |

Phases 2→3→4 are the capture spine; 5 is independent after 1; 6 needs 2 and 5;
8 needs 6.

---

## 17. Open questions

**Settled 2026-07-31:** install model and shared auth (§3.2, with §3.4 as the
separation insurance); Dropbox declined as a sync path in favour of the Health
bus (§4.5); where a weight goal lives — the macro contract when one is active,
MEASURE only when none is (§5.5).

**Still open:**

1. **Does BodySpec move?** Relocate the scan surfaces into MEASURE entirely
   (recommended — it is the measurement app), or keep them dual-linked?
2. **Navy-method body fat from tape.** Cheap from neck/waist/hips and widely
   expected — but noisy enough to contradict the DEXA number beside it. If
   taken, it is Tier 3 with its formula named. Include or decline?
3. **Progress photos** — in or out? Currently §15 out.
4. **Which waist site is your routine** — navel or narrowest? The
   corroboration matrix needs one designated fat-proxy site to be consistent
   over time, and switching mid-stream breaks the series.
5. **Your actual tape routine** — which sites, how often? It sets the stock
   seed order and the guided-entry default, and the §5.3 window minimums.
6. **Tier 3 default** — off until explicitly enabled, or on with its bands
   showing? Recommendation: off, given principle 7.
7. **Milestones** — worth building (§9), or is the macro contract enough?
8. **MCP write posture** for `log_bodyweight` — direct, or draft-then-confirm
   per hard rule 5 (§12)?
9. **A Happy Scale CSV export sample**, to pin that adapter's schema (§8).

---

*Related: doc 01 §6 (out-of-scope), doc 08 §2 (canon tab bar) + §5 (figure
index), doc 10 §7 (honesty guardrails), doc 14 (fingerprint config-vs-derived),
doc 15 (BodySpec DEXA — §2 schema, §3.3 the engine boundary, §6 scan
guardrails), doc 17 §2.4 (%/mo rate) + §5 (bodyweight series) + §7 (envelope
loop). Backlog: N34, N41, N52, N66. External: Happy Scale feature set and
Apple Shortcuts `Get Contents of URL` / `Log Health Sample` behaviour verified
2026-07-31.*

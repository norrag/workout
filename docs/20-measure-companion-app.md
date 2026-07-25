# 20 — MEASURE: the measurement companion app (direction)

**Status: direction (2026-07-25).** This is a concept-and-architecture
document, not a build spec. It fixes the division of labour between WORKOUT
and a companion app, **MEASURE**, picks the topology, sketches the schema and
the screens, and names the decisions the owner still has to make. No code
ships against this doc until the design pass (§12 Phase 0) produces figures —
hard rule 8 binds here exactly as it does in WORKOUT. Backlog item **N66**
tracks it.

**The one-line thesis:** WORKOUT measures *training inputs* and the app has
grown a body-measurement lobe under `More` because there was nowhere else to
put it. That lobe is the outcome layer of the whole product, it wants a daily
cadence and a real information architecture, and it is being starved by a tab
bar that is (correctly) reserved for training. MEASURE gives it a front end of
its own — on the same database, the same design system, the same MCP
connector — so each app can be shaped by what it is for.

---

## 1. Division of labour

The split is by **fact ownership**, not by screen convenience. Each fact has
exactly one app that edits it, and one shared read surface both may read.

| | WORKOUT | MEASURE |
|---|---|---|
| **Owns** | sessions, sets, prescriptions, cycles, templates, exercises, the engine | bodyweight series, circumferences, DEXA scans, composition, measurement prefs, import/export of measurement data |
| **Cadence** | per-session (3–6×/week) | daily (weigh-in), monthly (tape), quarterly (scan) |
| **Question it answers** | *what do I do today?* | *is it working?* |
| **Reads from the other** | latest composition/mass row on the macro Overview | the active macrocycle's goal, contract band, and pace |
| **Never does** | become a measurement logbook | write prescriptions (§7.3) |

The seam is deliberately narrow. Neither app embeds a mini-version of the
other; each links out (§7).

---

## 2. Principles (binding once adopted)

1. **One owner per fact, one definition per metric.** MEASURE extends the
   existing shared-views rule (`CLAUDE.md` → Conventions): anything both apps
   display reads the same view. No parallel arithmetic.
2. **Smoothing is read-time, never stored.** No `smoothed_weight` column, no
   recompute job, no invalidation. Changing a window is instant and free —
   this is the one place where doc 14's dependency-fingerprint problem is
   avoided by construction rather than solved. See §5.
3. **Measurement informs targets and verdicts, never prescriptions.** Doc 15
   §3.3's boundary is restated here as binding for the whole app. The
   consented bf% → FFMI → strength-band → pacing chain (N52) stays the only
   engine-facing path, and it stays consented.
4. **The trend is the headline; the raw point is a detail.** Scale weight
   swings ±2–4 lb daily on water, glycogen, and gut contents. Any surface
   that leads with "you're down 1.2 lb since yesterday" is lying. See §9.
5. **The database and the design system do not fork.** One Supabase project,
   one migrations directory, one `src/lib`, one ledger design system. MEASURE
   is a second front end, not a second product.
6. **Ledger voice, health-data register.** No praise, no scolding, no goal
   shaming, no exclamation marks (hard rule 7). This app holds the numbers a
   user is most likely to feel bad about; it states them and stops.

---

## 3. Architecture — where the app lives

### 3.1 The forcing question

Three things **must** be shared: Postgres + RLS, the typed query/type layer,
and the design system. Three things **must** be separate: the app shell and
navigation, the PWA identity (icon, name, home-screen presence), and the
information architecture. Every topology option is scored on how cheaply it
gets both halves.

### 3.2 Decision: one deployable, two shells

**Recommendation: a second app shell inside the existing Next.js app** — a
`(measure)` route group served under `/measure/*`, with its own layout, tab
bar, logotype, loading states, and **its own web manifest**, sharing
everything below the shell unchanged.

```
src/app/
├── (auth)/            unchanged — serves both shells
├── (app)/             WORKOUT — unchanged
│   └── …              workout · cycles · templates · exercises · more
├── (measure)/         MEASURE — new
│   ├── layout.tsx     own tab bar, own logotype, links measure.webmanifest
│   └── measure/       summary · weight · body · scans · more
└── api/mcp/           one endpoint, both domains (§8)

src/lib/               shared verbatim (queries, types, engine, supabase, mcp)
src/lib/measure/       new: the pure smoothing/trend module (§5)
src/components/        shared primitives; feature components stay app-local
public/
├── manifest.webmanifest        WORKOUT  (start_url "/", scope "/")
└── measure.webmanifest         MEASURE  (start_url "/measure", scope "/measure/")
```

Why this wins, concretely:

- **Two home-screen apps, one sign-in.** Two manifests on one origin produce
  two independently installable PWAs with their own icons and standalone
  windows. Because they share an origin they share the Supabase session
  cookie — sign in once, both apps are authenticated. On separate subdomains
  this would need cookie-domain configuration and a cross-domain auth dance;
  here it is free.
- **One service worker still works.** Serwist's root-scoped SW (`/`) already
  covers `/measure/*`; installability is driven by the manifest, not the SW
  scope. No second SW, no scope collisions.
- **Cross-links are just links.** The seam in §7 is `<Link href="…">` in both
  directions, with no token passing, no CORS, no redirect dance. Given how
  much of this concept's value is in the cross-app links, that is not a minor
  convenience.
- **Zero refactor of a working codebase.** `src/lib/*` is imported by both
  shells as-is. No workspace migration, no package boundaries, no dual CI, no
  duplicated type generation.
- **Bundles stay separate where it matters.** Next.js code-splits per route,
  so MEASURE's chart and smoothing code never ships to a WORKOUT route. This
  matters against the open perf workstream (N1) and should be verified with
  the bundle analyzer at Phase 1, not assumed.

**The honest cost:** one deploy and one CI pipeline, so a MEASURE regression
can break the WORKOUT deploy, and the two cannot be released independently.
For a private single-user deployment (doc 15 §8) that is an acceptable trade;
it is the first thing that stops being acceptable if the app ever goes
multi-user.

**Discipline that makes it work — and makes it promotable later.** One rule,
enforced by an eslint `no-restricted-imports` boundary in Phase 1: **nothing
in `(measure)` imports from `(app)` and nothing in `(app)` imports from
`(measure)`.** Shared code moves down into `src/lib` or `src/components`.
Hold that line and the route group is a clean seam — promoting MEASURE to its
own package and Vercel project later is a mechanical move, not a rewrite.

### 3.3 Alternatives considered

- **Monorepo, two Next apps, two Vercel projects** (npm workspaces or
  Turborepo; `measure.<domain>`). Architecturally the "right" end state and
  where this goes if it ever needs independent releases. Rejected *for now*
  on cost: extracting `src/lib` into a shared package, dual CI, dual type
  generation, cookie-domain auth sharing across subdomains, and a decision
  about which project hosts `/api/mcp`. All of that buys deployment
  independence the current deployment does not need.
- **Separate repository.** Rejected outright. It forks the migrations
  directory, the generated types, the query layer, and the design system —
  contradicting principles 1 and 5 and the existing shared-views rule. The
  two apps read the same tables; they cannot own separate schema histories.
- **No new shell — grow `More`.** This is the status quo and it is what
  prompted the concept. Bodyweight quick-entry, the BodySpec connection, scan
  list, and scan detail all live under `/more/*` because the canon tab bar
  (08 §2) has no room. Adding a logbook, circumferences, reports, smoothing
  settings, and import/export to that pile buries all of it three taps deep.

### 3.4 Tripwires that flip the decision to §3.3's monorepo

Any one of these should trigger a re-decision, and none of them requires
undoing work done under §3.2: multi-user or public launch; a need to release
the two apps on independent cadences; measured evidence that MEASURE's
presence degrades WORKOUT's cold start; or separate people owning the two
front ends.

---

## 4. Data model

### 4.1 What already exists (reuse, do not rebuild)

MEASURE is not starting from zero — roughly half its substrate shipped with
doc 17 Phases 4–5 and doc 15:

| Object | Status | Role in MEASURE |
|---|---|---|
| `bodyweight_log` | built (`20260711000001`) | the weight series (§4.2 amends it) |
| `body_scans` | built (`20260711000002`) | DEXA scan events + `raw` jsonb |
| `external_connections`, `oauth_transactions` | built | the BodySpec link + PKCE round trip |
| `v_body_comp_history` | built (`20260711000003`) | scan deltas + `same_scanner_as_prev` |
| `profiles.bodyweight` / `body_fat_pct` / `body_fat_source` | built | the "current belief" layer and engine input |
| `v_macro_summary` | built | the macro's logged span, for the §7 pull-through |
| `resolveDailyBodyweight`, `bodyDeltaForSpan` (pure folds in `queries/bodyweight.ts`) | built | migrate into `src/lib/measure/` when §5 lands |

### 4.2 `bodyweight_log` — four amendments

The table was built as *macro-layer measurement substrate*, not as the spine
of a weight-tracking app. Four gaps, all small:

1. **`source` check widening** — currently `('manual','profile','dexa')`.
   Needs `'import'` (§4.6), and possibly `'scale'` if a smart-scale path is
   ever wanted. A new migration drops and re-adds the constraint; the
   append-only rule governs migration *files*, not schema immutability.
2. **`measured_at timestamptz null`** — time of day is the single largest
   controllable source of variance in scale weight. `measured_on` stays the
   canonical day key (nothing breaks); `measured_at` is additive and lets
   §5 optionally restrict a series to comparable conditions.
3. **`note text`** — "post-refeed", "travel", "sick". Reading a chart without
   these is how people talk themselves into bad decisions.
4. **`v_bodyweight_series`** — the read surface. One row per user-day:
   resolved weight, winning source, `entry_count`, and the note. Today
   same-day resolution lives in a TS fold called from one place; as soon as
   two apps and MCP read the series it must be one definition (principle 1).

### 4.3 Circumferences — new

Three tables, modelled on patterns the repo already uses.

**`measurement_sites`** — stock library + per-user custom, exactly the
`exercises` pattern (`user_id is null` ⇒ stock, readable via an explicit
policy; custom rows owner-scoped):

```
id, user_id (null = stock), key, name,
bilateral boolean,          -- arms/legs/calves take a side
display_order int,
guidance text,              -- how to take it the same way every time (§9)
archived_at timestamptz
```

Stock seed: neck, shoulders, chest, upper arm, forearm, waist (navel), waist
(narrowest), hips, thigh, calf.

**`measurement_sessions`** — one row per tape session:

```
id, user_id, measured_on date, measured_at timestamptz null,
note text, created_at,
unique (id, user_id)        -- see the FK trick below
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
  one set of conditions. A session is the natural log entry, makes guided
  entry (walk the sites) obvious, and makes session-to-session the natural
  comparison unit — the same shape `body_scans` already uses for scan events.
- **`user_id` denormalized onto `measurements`, kept honest structurally.**
  The RLS policy stays the cheap `user_id = (select auth.uid())` form (the
  T-R2 perf convention) instead of an `exists` subquery per row. Consistency
  is guaranteed by the schema rather than a trigger: a composite FK
  `(session_id, user_id) → measurement_sessions (id, user_id)` makes a
  mismatched pair unrepresentable.

Tall (site-per-row), not wide (column-per-site), because the site set is open
— users add custom sites, and a wide table turns every new site into a
migration.

**`measure_prefs`** — one row per user: smoothing method and its parameter,
rate window, week start, goal weight/date (§13-5), default sites for guided
entry, and an optional condition filter. Display configuration, deliberately
**not** `engine_params` — none of it reaches the engine.

### 4.4 What must *not* be added

No `smoothed_weight`, no `trend_lb_per_week`, no materialized rollups
(principle 2). Every derived number in this app is a pure function of the
series and the prefs, computed on read.

### 4.5 Shared read surfaces

`v_bodyweight_series` (new), `v_body_comp_history` (built),
`v_measurement_history` (new — per-site series with session context and
deltas), `v_macro_summary` (built, for the §7 pull-through). Both apps and
every MCP tool read these and nothing else.

### 4.6 Import / export

**Import is the sleeper feature.** Most people arriving at this app have
years of scale data in Renpho, Withings, Apple Health, Happy Scale, or a
spreadsheet. Importing it is the difference between an app whose trend lines
and verdicts are useful on day one and one that is empty for six months.

The pipeline: file → zod-validated parse → **dry-run preview** (rows parsed,
date range, duplicates against the existing series, rows rejected and why) →
confirmed commit as `source: 'import'`. The existing
`unique (user_id, measured_on, source)` makes re-importing the same export
idempotent rather than duplicative. Formats to support are a §13 question;
generic CSV with a column-mapping step covers the long tail.

**Export** extends the existing `/more/export` pattern (`queries/export.ts`):
the full measurement corpus — weight series, sessions and measurements,
scans — as CSV or JSON. Data-lifecycle parity with the training export.

---

## 5. `src/lib/measure/` — the pure module

The engine's discipline, applied to display math. Pure functions, no I/O, no
randomness, no `Date.now()` inside (today is passed in), golden tests on every
behaviour change — hard rule 3's posture, one directory over.

| File | Responsibility |
|---|---|
| `series.ts` | raw log → resolved daily series; gap handling (no interpolation into storage; carry-forward only for display windows, and labelled as such) |
| `smooth.ts` | `ema` (half-life parameterized), `sma` (trailing *and* centered — trailing for "today's trend", centered for retrospective charts; the two are named distinctly and never silently swapped), `none` |
| `rate.ts` | rate of change over a window: OLS slope, expressed **lb/week and %/month** |
| `reports.ts` | weekly / monthly / yearly rollups, derived on read |
| `confidence.ts` | the §9 guardrails as code: minimum points and span before a rate is reportable |

**Why `%/month` matters:** the macrocycle pacer already speaks `%/mo` (doc 17
§2.4, `measuredRatePctMonth`). Emitting the measured bodyweight rate in the
same unit means MEASURE's number can be compared directly against the macro
contract band with no conversion and no second definition — the integration
in §7 is arithmetic-free.

Default smoothing (proposed, §13-7): **EMA with a ~10-day half-life** as the
headline trend, with a trailing 7-day mean shown alongside for people who
think in weekly averages.

---

## 6. Screens

Tab bar (canon, mirroring 08 §2's discipline):
**`SUMMARY · WEIGHT · BODY · SCANS · MORE`**

- **SUMMARY** — the integrated picture the concept is named for: trend
  headline with its rate, the active macrocycle's goal and whether measured
  pace is inside the contract band, latest tape deltas, latest scan, and what
  is stale (last weigh-in, last tape, last scan).
- **WEIGHT** — entry, chart (raw points *behind* the trend line, never the
  reverse — principle 4), logbook table (date · weight · Δ · rolling mean ·
  rate), period selector for the weekly/monthly/yearly reports.
- **BODY** — circumferences: latest session card, per-site history, guided
  entry that walks the user's default sites with the site's `guidance` copy
  inline.
- **SCANS** — the BodySpec surfaces, relocated from `/more/bodyspec/*`
  (§13-2).
- **MORE** — measurement settings (smoothing method, windows, default
  sites), import/export, connections.

Visual identity: the ledger system is reused **verbatim** — same cream/ink,
same orange semantics (current position + selection only), same square
corners, same tracked all-caps labels. The apps are distinguished by the
logotype (`measure` in place of `workout`) and the app icon, nothing else. A
second accent colour would break hard rule 7 and would make the suite look
like two products instead of one.

**Gating: no screen is built before its figure exists.** Hard rule 8 requires
a mockup pass producing `docs/design/mockups/measure - App Screens.dc.html`
with its own figure index — proposed numbering **M1.x–M5.x** so it never
collides with WORKOUT's 1.x–4.x — plus a 09-style changelog entry. That is
Phase 0 and it blocks everything else.

---

## 7. The seam

### 7.1 WORKOUT → MEASURE

The macro Overview (fig 2.2) keeps its compact composition/mass row and gains
a link out. The More-page bodyweight quick-entry row (09 2026-07-11) stays —
it is genuinely useful at the point of a weigh-in — but becomes a shortcut
into MEASURE rather than the only surface for the series.

### 7.2 MEASURE → WORKOUT

SUMMARY pulls the active macrocycle's goal, contract band, and elapsed span
from `v_macro_summary` plus the stored contract, renders measured pace
against it, and links into the planner for anything editable. MEASURE never
edits a cycle.

### 7.3 The boundary that must hold

MEASURE must not become a back door into the engine. Doc 15 §3.3, restated:
scans and measurements inform **targets and verdicts** (macro layer), never
**prescriptions** (micro layer). The one engine-facing path is the existing
consented profile proposal — a scan or weigh-in *proposes* a profile update,
the user accepts, and `bodyFatPct` / `bodyweight` reach `planMacrocycle`
through the path that already exists. Nothing in MEASURE writes an engine
input silently.

Two consequences worth stating: `bodyweight` stays on the doc 14 fingerprint
denylist (a weigh-in must never stale a week of stored prescriptions), and
the bodyweight-loaded exercise load model (`engine_params` v16) keeps reading
`profiles.bodyweight` — MEASURE improves the *quality* of that scalar by
making it easy to keep current, without changing where the engine reads it.

---

## 8. MCP

**One server, one connector, one endpoint.** The coaching value lives
precisely in cross-domain reasoning — *"est. strength flat while bodyweight
dropped 4 lb over the block"* is a sentence neither app can produce alone.
Splitting the connector would destroy the only thing the integration is for.
Tool names get a namespace prefix; identity still never travels as an
argument (hard rule 5).

Additions to sketch: `get_bodyweight_trend` (series + smoothed trend + rate,
over `v_bodyweight_series`), `get_measurements` / `log_measurements`,
`get_measure_summary`. `get_body_composition` is unchanged.

One open rule question: hard rule 5 says write tools create drafts. A
bodyweight point is user-deletable measurement substrate rather than logged
training history, and the app itself offers direct quick-entry — so a direct
`log_bodyweight` write is defensible. Flagged rather than assumed (§13-8).

---

## 9. Honesty guardrails

Extending doc 10 §7 and doc 15 §6, and binding for every surface here:

- **Scale weight.** Daily variation of ±2–4 lb from water, glycogen, sodium,
  and gut contents. Never present a day-over-day delta as progress. The
  trend, its window, and its uncertainty are the headline (principle 4).
- **Rates need evidence.** Below a minimum point count and span, the answer
  is "not enough data yet", not an extrapolated slope. A 4-day trend line is
  a rumour. This ships as code (`confidence.ts`), not as copy discipline.
- **Tape.** Intra-rater variation is roughly ±0.25 in on limbs and worse at
  the waist. Sub-threshold site changes are stated as "within measurement
  range", the same register as the e1RM estimate guardrails. Each site's
  `guidance` copy exists to reduce that variance at the source.
- **DEXA.** Doc 15 §6 carries over unchanged: LSC bands (~1.5–2 lb lean),
  same-scanner comparisons by default, trends over pairs, regional precision
  ~2× worse than total-body.
- **Register.** Numbers stated flat. No praise, no concern-trolling, no
  streaks, no body-image editorializing. Percentiles are context, not a
  score. This is the most sensitive data in the suite and the ledger voice is
  well suited to it — the design system is an asset here, not a constraint.

---

## 10. What this unlocks, ranked

1. **The outcome loop closes at a usable cadence.** WORKOUT measures inputs;
   DEXA measures outcomes quarterly. Bodyweight measures an outcome *daily*.
   Mass-denominated macro goals become gradable **live** rather than only at
   closeout — which is exactly the signal doc 17 §7's envelope loop needs and
   currently has to wait months for.
2. **Macro mass contracts become honest.** Measured %/mo against the contract
   band, in the pacer's own units (§5), continuously — instead of a single
   bracketed Δbw at retrospective time.
3. **Import makes it good on day one.** Years of existing scale history turn
   every trend, verdict, and rate into something real immediately (§4.6).
4. **Cut-phase truth at daily resolution.** Lean retention is the actual
   success metric of a cut and DEXA sees it four times a year; the weight
   trend plus tape at the waist sees the trajectory weekly, and reframes the
   cross-phase e1RM dip the coaching guardrails already warn about.
5. **A better engine input for free.** The v16 bodyweight-load model reads
   `profiles.bodyweight`; a stale scalar quietly mis-loads every pull-up and
   dip prescription. Making weigh-ins frictionless fixes that with no engine
   change (§7.3).
6. **Long-horizon health surfaces get a home.** BMD, VAT, waist trend — the
   decade-scale payoff of resistance training, and quietly the strongest
   retention feature in the suite. There is nowhere in WORKOUT's IA for them.
7. **Pressure comes off WORKOUT's tab bar.** The canon five stay training
   surfaces, as 08 §2 intended.

---

## 11. Out of scope (binding, unless deliberately revisited)

- **Nutrition / calorie tracking.** Doc 01's line stands. RMR display stays
  context-only (doc 15 §3.4) and must not grow meal logging by accretion.
- **Background health-platform sync.** File import yes (§4.6); live
  HealthKit/Google Fit/smart-scale API sync no — that is the wearable
  integration doc 01 puts out of scope, and doc 15's narrow BodySpec
  exception does not generalize.
- **Social features.** No sharing, comparison, or leaderboards on body data.
- **Progress photos.** Genuinely adjacent and genuinely different: storage,
  a much stronger privacy posture, and a design system with no answer for
  image-heavy layouts. Out for now, revisit deliberately (§13-4).

---

## 12. Phasing

One phase per PR, vertical slices, `main` deployable throughout.

| Phase | Scope |
|---|---|
| **0. Design** | Mockup pass → `measure - App Screens.dc.html`, M-series figure index, 09-style changelog entry. **Gates every later phase** (hard rule 8) |
| **1. Shell** | `(measure)` route group, layout + tab bar + logotype, `measure.webmanifest` + icons, install verified on device, eslint import boundary (§3.2), bundle-analyzer baseline, empty states |
| **2. Weight core** | `bodyweight_log` amendments + `v_bodyweight_series` (RLS tests in-migration), `src/lib/measure/` + golden tests, entry · chart · logbook · smoothing settings |
| **3. Import / export** | zod-validated parse + dry-run preview + dedupe; measurement export |
| **4. Circumferences** | `measurement_sites` / `_sessions` / `measurements` migrations + RLS tests + stock seed, guided entry, per-site history |
| **5. Scans** | relocate the BodySpec surfaces under MEASURE with redirects from `/more/bodyspec/*` |
| **6. Summary + seam** | the SUMMARY page, macro goal/pace pull-through, WORKOUT-side cross-links, weekly/monthly/yearly reports |
| **7. MCP** | the §8 tool surface over the shared views |

Phases 2 and 4 are independent after 1; 6 needs 2 and 5.

---

## 13. Open questions for the owner

1. **Install model.** Is "a second icon on the home screen, same domain,
   `/measure`" the feel you want — or does MEASURE need to look like a fully
   separate product on its own domain (which buys deployment independence at
   the cost of §3.2's shared-session simplicity)?
2. **Does BodySpec move?** Relocate the scan surfaces into MEASURE entirely
   (recommended — it is the measurement app), or keep them dual-linked from
   WORKOUT's `More`?
3. **Navy-method body fat from tape.** Cheap to compute from neck/waist/hips
   and widely expected — but noisy enough that it can contradict the DEXA
   number sitting next to it. Offer it as a clearly-labelled estimate, or
   refuse it on honesty grounds?
4. **Progress photos** — in or out? Currently §11 out.
5. **Where does a weight goal live?** Recommendation: the macro contract
   stays authoritative whenever a macrocycle is active, and MEASURE holds a
   standalone goal only when none is — otherwise two goals compete and the
   verdicts disagree. Confirm.
6. **Import formats** that actually matter to you — Apple Health export,
   Renpho, Happy Scale, generic CSV?
7. **Smoothing defaults** — EMA at ~10-day half-life as the headline, 7-day
   trailing mean alongside (§5). Reasonable starting point?
8. **MCP write posture** for `log_bodyweight` — direct write, or draft-then-
   confirm per hard rule 5 (§8)?

---

*Related: doc 01 §6 (out-of-scope), doc 08 §2 (canon tab bar) + §5 (figure
index), doc 10 §7 (honesty guardrails), doc 14 (fingerprint config-vs-derived),
doc 15 (BodySpec DEXA — §2 schema, §3.3 the engine boundary, §6 scan
guardrails), doc 17 §5 (bodyweight series) + §7 (envelope loop). Backlog:
N34, N41, N52, N66.*

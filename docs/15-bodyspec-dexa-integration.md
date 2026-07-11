# 15 — BodySpec DEXA integration: API assessment & design direction

**Status: assessment (2026-07-05).** No build decision yet — this document
evaluates the BodySpec API, how its data should be structured in WORKOUT, and
where it can genuinely improve training guidance. If adopted, it amends
`docs/01-product-spec.md`'s out-of-scope line ("Wearable/health-platform
integrations") for this one, narrowly-scoped integration; nutrition tracking
stays out of scope (§6.4). Backlog item **N34** tracks the decision and
phasing.

**The one-line thesis:** WORKOUT today measures training *inputs* (sets,
volume, e1RM trends). DEXA measures the *outcome* those inputs exist to
produce — lean mass. Connecting BodySpec closes that loop: it replaces the
profile's two most consequential guesses (body-fat %, and therefore FFMI) with
measurements, and it gives macrocycles an outcome-level verdict ("did this
block actually add muscle / retain muscle through the cut?") that no amount of
set logging can provide.

---

## 1. API assessment

Source: `https://app.bodyspec.com/docs` (Scalar viewer over
`https://app.bodyspec.com/openapi.json`, spec **v0.14.3**, fetched
2026-07-05). The API is explicitly **early-access**; contact is
`dev-support@bodyspec.com`. Production server: `https://app.bodyspec.com`.

### 1.1 Authentication

BodySpec runs an OIDC-compliant auth server (Keycloak) with two tiers:

| Tier | Mechanism | Fit for WORKOUT |
|------|-----------|-----------------|
| **User OAuth2** | Authorization-code + **PKCE** against `https://auth.bodyspec.com/realms/bodyspec/...`; scopes `openid profile email`; JWT bearer tokens | The natural fit for "connect your BodySpec account" — per-user consent, per-user data. |
| **Partner Auth** | HTTP Basic `base64(partner_id:partner_secret)`; unlocks the `/partners/*` surface (other users' results, webhooks, orders, exports) | Only needed later, if ever — webhooks and PDF export live here. Requires a partner agreement with BodySpec. |

Practical caveats found in the spec (as assessed 2026-07-05; the 2026-07-10
readiness probe in §8 resolved most of them without BodySpec contact):

- The documented scopes are `openid profile email` only — **no
  `offline_access`**, so refresh-token / long-lived background access is
  undocumented. Until confirmed, design for tokens that can expire and a
  cheap re-connect path.
- The docs' own OAuth client is `bodyspec-api-ext-v1` (the Scalar
  playground). A third-party app needs **its own registered client**
  (redirect URIs for our domains) — that's a request to BodySpec, and a
  standing entry for `docs/deployment/manual-operations.md` when built.
- **Webhooks are partner-tier only** (`results_ready`,
  `reservation_created`; deliveries authenticated via
  `Authorization: Bearer base64(secret)`). A user-tier integration cannot be
  pushed to — it must **pull**.
- No rate limits are documented anywhere in the spec. Assume modest and be
  polite: sync is naturally low-frequency (scans happen a few times a year).

### 1.2 Endpoint surface (user tier)

Everything user-scoped is identity-from-token (`/users/me/...`) — pleasantly
aligned with our own MCP rule that identity never travels as an argument.

```
GET /api/v1/users/me                                    account info
GET /api/v1/users/me/appts                              appointments (status: scheduled|completed|no_show)
GET /api/v1/users/me/results/                           scan results, paginated (page, page_size ≤ 100)
GET /api/v1/users/me/results/{id}                       result detail + available section names
GET /api/v1/users/me/results/{id}/dexa/scan-info        scanner model, acquire/analyze time, intake (age/height/weight)
GET /api/v1/users/me/results/{id}/dexa/composition      total + regional fat/lean/bone masses
GET /api/v1/users/me/results/{id}/dexa/bone-density     BMD/BMC/area per region + percentiles
GET /api/v1/users/me/results/{id}/dexa/percentiles      age/sex-matched percentile rankings
GET /api/v1/users/me/results/{id}/dexa/visceral-fat     VAT mass + volume
GET /api/v1/users/me/results/{id}/dexa/rmr              RMR estimates (4 formulas)
```

The results list covers the account's **full scan history**, so a first sync
backfills every scan the user has ever taken at BodySpec, not just future
ones. The partner tier adds booking (locations/availability/reservations),
orders, result **export** (`bodyspec_pdf` / `classic_pdf` /
`bodyspec_interactive` URL), and webhook management — none of it needed for a
v1 read-only integration.

### 1.3 The data itself

All units are **metric** (kg / cm); WORKOUT is imperial-only (lb / in) per
migration `20260623120000_imperial_units_only.sql` — convert once at the
import boundary, store imperial like the rest of the app.

**Composition** (`DexaCompositionResponse`) — the core payload. `total` plus
per-region `BodyRegion` blocks for `left_arm`, `right_arm`, `left_leg`,
`right_leg`, `trunk`, `android`, `gynoid`, each carrying:

| Field | Meaning |
|-------|---------|
| `fat_mass_kg` / `lean_mass_kg` / `bone_mass_kg` / `total_mass_kg` | the mass decomposition |
| `tissue_fat_pct` | fat % of soft tissue (excludes bone) |
| `region_fat_pct` | fat % of the whole region (includes bone) |

plus a top-level `android_gynoid_ratio` (fat-distribution marker).

**Bone density** (`DexaBoneDensityResponse`) — per region + total:
`bone_mineral_density` (g/cm²), `bone_area_cm2`, `bone_mineral_content_g`,
and optional `age_sex_z_percentile` / `peak_sex_t_percentile` (1–99).

**Percentiles** (`DexaPercentilesResponse`) — age/sex-matched ranks against
BodySpec's own reference dataset (params include gender, reference age range,
dataset size). Example metric keys: `total_body_fat_pct`, `total_lmi_kg_m2`
(lean mass index), **`limb_lmi_kg_m2` (appendicular lean mass index — ALMI)**,
`vat_mass_kg`, `bone_density_g_cm2`. Each is `{value, percentile}`.

**Visceral fat** (`DexaVisceralFatResponse`) — `vat_mass_kg`,
`vat_volume_cm3`.

**RMR** (`DexaRmrResponse`) — resting-metabolic-rate estimates from four
published formulas: ten Haaf (2014), Cunningham (1980), De Lorenzo (1999),
Mifflin-St. Jeor (1990), each `kcal_per_day`. Cunningham and ten Haaf are
FFM-based — i.e. genuinely DEXA-informed, not just height/weight arithmetic.

**Scan info** (`DexaScanInfoResponse`) — `scanner_model` (e.g. "GE Lunar
iDXA" vs "GE Lunar Prodigy"), `acquire_time`, `analyze_time`, and the intake
snapshot (`age_years`, `height_cm`, `weight_kg` at scan time). The scanner
model matters: scan-to-scan deltas are only trustworthy on the **same
machine** (§6.1), so we must store it and flag cross-scanner comparisons.

### 1.4 Assessment verdict

The API is small, clean, and REST-boring in the good way: JSON, pagination,
OIDC, identity-from-token, one resource per DEXA report section. It is
sufficient for a **read-only, pull-based, per-user integration** today. The
risks are all operational, not technical: early-access status (endpoints may
change), unconfirmed refresh-token story, and the need for BodySpec to
register our OAuth client before anything ships.

---

## 2. How the data should be structured in WORKOUT

### 2.1 What exists today (and the gap)

The consumption side already exists in miniature: `profiles` carries
`bodyweight` (lb), `body_fat_pct` (the ~6-band visual picker), `height_in`,
`age`, `gender`, `experience_level`, `training_since` — and
`docs/10-metrics-spec.md` §5 feeds exactly these into the macrocycle target
engine via FFM/FFMI proximity-to-potential. The gap is that **all of it is
single-value, overwrite-in-place** (`bodyweight_updated_at` is the only
history hint), doc 10 explicitly disclaims "we don't track bodyweight over
time", and nothing models lean mass, regional composition, bone, or VAT.

DEXA data is inherently a **time series of scan events**. It must not be
flattened into more profile columns; the profile stays the "current belief"
layer, and scans become an append-only measurement log underneath it.

### 2.2 Proposed schema (three pieces)

**`body_scans` — one row per scan result.** Owner-scoped RLS
(`user_id = auth.uid()`), unique `(user_id, provider, provider_result_id)` so
re-syncs are idempotent upserts. Canonical columns in app units for
everything queries/stats need, plus the untouched original:

```
id, user_id, provider ('bodyspec'), provider_result_id,
scanned_at, scanner_model,
weight_lb, height_in, age_years,               -- intake snapshot at scan time
body_fat_pct,                                  -- total tissue_fat_pct
lean_mass_lb, fat_mass_lb, bone_mass_lb,       -- total decomposition
vat_mass_lb, vat_volume_cm3,
android_gynoid_ratio,
lmi_kg_m2, almi_kg_m2,                         -- from percentiles section
bmd_total_g_cm2,
rmr_kcal_cunningham, rmr_kcal_mifflin,         -- the two we'd surface
regions jsonb,                                 -- per-region composition (converted)
percentiles jsonb,                             -- {metric: {value, percentile}} + params
raw jsonb,                                     -- verbatim API payloads, for fidelity/replay
created_at, updated_at
```

A separate child table for regions is over-modeling at this cardinality
(≤ 7 regions × a handful of scans/year); `jsonb` keeps the migration small
while `lean_mass_lb`/`body_fat_pct` etc. stay first-class for views. Indexes:
`(user_id, scanned_at desc)`.

**`external_connections` — the account link.** `user_id`, `provider`,
`status`, encrypted token material, `connected_at`, `last_synced_at`,
`last_sync_error`. Tokens are **server-side only** — handled exclusively via
`src/lib/supabase/service.ts` call sites with explicit user scoping (hard
rule 4); nothing token-shaped ever reaches a client bundle. RLS lets the
owner see status/timestamps, not secrets (secrets in a column the API never
selects, or a separate deny-all table).

**`v_body_comp_history` — the shared read surface.** Per the one-definition
rule, the stats screens and any future MCP tool (`get_body_composition`)
read the same view: scan date, weight, body-fat %, lean/fat mass, ALMI,
deltas vs previous scan, and a `same_scanner_as_prev` flag so every consumer
inherits the comparability guardrail (§6.1) for free.

### 2.3 Sync & profile-enrichment flow

- **Pull-based.** No user-tier webhooks, so: full backfill on connect, then
  refresh on demand ("sync" button on the integration screen) plus an
  opportunistic staleness check when the user visits scan-adjacent surfaces.
  Scans arrive a few times a year — polling infrastructure would be
  over-engineering.
- **Import is mechanical; profile mutation is consented.** After a sync
  lands a new scan, the app *proposes*: "Scan from Jul 8: update profile
  bodyweight 176 lb and body-fat 18.2%?" One tap applies it (setting
  `bodyweight_updated_at`, and body-fat now carries a measured value rather
  than a band estimate). Mirrors the MCP draft-then-confirm posture — no
  external system silently rewrites engine inputs.
- **Zod at every boundary** (hard rule 6): response schemas for each DEXA
  section validated at import; kg→lb / cm→in conversion happens there and
  only there.
- **Disconnect deletes.** On disconnect, offer to purge `body_scans` rows and
  always destroy tokens. The no-deletes rule protects logged *training*
  history; imported third-party health data is the user's to remove, and
  being health-adjacent it deserves the stricter posture.

### 2.4 Interaction with prescription freshness (doc 14)

`bodyweight` is deliberately a **derived** input in the dependency-
fingerprint framework (`src/lib/queries/fingerprint.ts` denylist) — excluded
from `dep_fingerprint` so a weigh-in doesn't mass-stale every
bodyweight-loaded prescription; it's re-read at recompute time. Scan-derived
facts (`body_fat_pct`, measured FFM/FFMI) must get the **same treatment**:
they influence macro *targets*, not per-set prescriptions, and a new scan
should never invalidate a week of stored workouts. Decision recorded here so
the doc-14 config-vs-derived audit has a precedent to cite.

---

## 3. How the data should inform training & the engines

Ordered by value-to-effort, best first.

### 3.1 Measured FFMI into the macrocycle target engine (highest value)

`planMacrocycle` (doc 10 §5, `src/lib/engine/macro.ts`) already keys
hypertrophy targeting on **FFMI proximity to genetic potential**, computed as
`FFM = bodyweight × (1 − bodyFat%)` — with body-fat coming from a six-band
visual picker, and a fallback training-age decay model when it's absent.
DEXA replaces the weakest input in the whole engine chain with a
measurement: real body-fat %, and actually real FFM directly
(`total.lean_mass + total.bone_mass`), height and weight captured at scan
time. Effects:

- The proximity estimate (and therefore the macro's monthly gain-rate
  target) stops inheriting band-picker error — ±3–4 percentage points of
  body-fat swings estimated FFM by several pounds, which is the difference
  between "intermediate, expect ~0.5 lb/mo" and "advanced, expect less".
- The profile-completeness discontinuity flagged in backlog **N21** (the
  hypertrophy model flips models depending on which profile fields exist)
  gets structurally easier: with a scan, the good path always has its
  inputs. N21's engine correction should be designed assuming scan data may
  exist.
- Zero engine changes required to start: the engine is pure and already
  parameterized on `bodyFatPct` — the integration just supplies a better
  value through the existing profile-enrichment flow (§2.3). A later
  refinement can pass measured FFM directly instead of recomputing it from
  weight × body-fat.

### 3.2 Outcome verdicts for macrocycles (the loop-closer)

A macrocycle is a promise: *hypertrophy* (add muscle), *cut* (lose fat, keep
muscle), *maintain*, *strength*. Today the app can only grade that promise
with proxies (volume done, e1RM trend). Scans bracketing a macro grade the
outcome itself:

- **Hypertrophy block:** Δ lean mass vs the macro's own target gain rate —
  the honest version of "did it work?", robust to the water/glycogen noise
  that makes scale weight misleading in both directions.
- **Cut:** Δ fat mass vs Δ lean mass — *lean retention is the actual success
  metric of a cut*, and it is invisible to every signal the app currently
  has. e1RM dipping while lean mass holds = successful cut; both dropping =
  cutting too hard. This directly reinforces doc 10's guardrail that
  cross-phase e1RM comparisons mislead — the scan supplies the missing
  context.
- **Recomposition detection:** flat scale weight with fat→lean shift is a
  real and motivating outcome the app currently cannot see at all.

Surface: the macro Overview page (it already renders progress-vs-target) gets
a composition row when ≥ 2 scans bracket the macro; `v_macro_summary`
consumers stay unchanged, the scan view joins in beside it.

### 3.3 What the engine should **not** do with scans

Boundaries, stated as bindingly as the features:

- **No set-level or week-level autoregulation from scans.** The feedback
  engine runs on per-session signals (performance, workload/pump/pain) at
  weekly cadence; scans arrive quarterly with ±1–2% error bands (§6.1).
  Wiring scans into `prescribe` would inject noise, violate the
  scan-cadence reality, and complicate doc-14 freshness for zero plausible
  gain. Scans inform **targets and verdicts** (macro layer), never
  **prescriptions** (micro layer).
- **Engine purity is untouched** (hard rule 3). Scan data reaches the engine
  only as profile-shaped inputs (`bodyFatPct`, maybe `ffmLb`) through the
  existing parameter path — no I/O, no new side channels.
- **No automatic profile mutation** (§2.3) — measurement proposes, user
  confirms.

### 3.4 Supporting uses

- **Bodyweight-loaded exercises** (engine_params v16 load model): scan-time
  `weight_kg` is a high-quality bodyweight datapoint for pull-up/dip load
  math — same consented profile-update path, better provenance.
- **RMR display** (Cunningham / ten Haaf, the FFM-based pair): shown as
  context on cut/bulk macros ("maintenance ≈ 1,850 kcal/day, measured from
  your lean mass"). Display-only — nutrition tracking stays out of scope
  (doc 01), and this line must not grow meal logging by accretion.
- **Regional lean trends** (arms/legs/trunk): directional evidence for
  whether an emphasis actually grew the emphasized region across a macro —
  with wide error bars honestly disclosed (regional precision is ~2× worse
  than total-body, §6.1). Left/right asymmetry is reportable but should be
  presented as "worth watching across multiple scans", never as a
  single-scan diagnosis — L/R limb differences sit near the technique's
  noise floor.

---

## 4. Genuine new capability (what this adds that nothing else can)

Strictly-new, in descending order of how much it changes the product:

1. **Outcome measurement.** Everything WORKOUT tracks today is input or
   proxy. Lean-mass change *is* the hypertrophy outcome; fat-vs-lean
   decomposition *is* the cut outcome. This is the only data source on any
   roadmap that measures what the training is for.
2. **A measured answer to "how much more can I gain?"** FFMI
   proximity-to-potential goes from educated guess to measurement — making
   the macro target engine's monthly rates, and the N21 redesign,
   defensible.
3. **Honest positioning.** Age/sex-matched percentiles for ALMI, LMI,
   body-fat, BMD from a large reference dataset — motivating context the app
   could never compute locally ("your appendicular lean mass is 85th
   percentile for men your age").
4. **Cut-phase truth.** Lean retention during a deficit — the single most
   consequential unknown in a cut — becomes visible, and reframes the
   "alarming" cross-phase e1RM dip the coaching guardrails already warn
   about.
5. **Long-horizon health dividends.** BMD and VAT trends are the
   decade-scale payoff of resistance training. Low-touch to surface
   (they're just columns on the scan log), meaningful to an aging lifter,
   and a quiet retention feature: the app becomes where those trends live.
6. **A measured metabolic anchor.** FFM-based RMR gives cut/bulk macros a
   context number with real provenance, without opening nutrition scope.

What it is *not*: not a coaching signal (cadence too slow), not a progress
substitute for e1RM/volume (those remain the week-to-week instruments), and
not a body-composition *goal-setting* system in v1 (targets stay
training-denominated; composition is measurement and verdict).

---

## 5. Implementation sketch (when/if adopted)

Vertical slices, each shippable alone:

| Phase | Scope | Notes |
|-------|-------|-------|
| **0. Unblock** | ~~Email dev-support@bodyspec.com~~ **Resolved 2026-07-10 (§8):** the realm allows anonymous dynamic client registration and grants `offline_access` — self-register the client at Phase-1 build time, no BodySpec contact required for a private build. Register per environment, store the `registration_access_token`, record in `docs/deployment/manual-operations.md` | Was the blocker; now a build-time step inside Phase 1 |
| **1. Connect + import** | `external_connections` + `body_scans` migrations (RLS + tests), OAuth PKCE flow, zod-validated import with unit conversion, full backfill, More → integration screen (connect/sync/disconnect status), scan list + detail | The vertical slice that proves the loop. Design per 08/09 discipline — figure(s) needed for the integration screen and scan card |
| **2. Enrich + view** | Post-sync profile-update proposal (bodyweight, body_fat_pct), `v_body_comp_history`, composition trend on the macro page bracketed-scan verdicts (§3.2), percentile display. *Built 2026-07-11 (doc 17 Phase 5b): the proposal resolves per scan (`profile_applied_at`/`_dismissed_at`), accepted weights append `bodyweight_log source:'dexa'`, and the §6 guardrails ship as data on the view (`same_scanner_as_prev`) + LSC constants in `queries/body-comp.ts`; percentile display had landed with Phase 1's scan ledger* | First user-visible payoff beyond raw numbers |
| **3. Engine + MCP** | Measured-FFM pathway in `planMacrocycle` (with N21's correction), RMR context on cut/bulk macros, MCP read tool (`get_body_composition`) reading the same view, coaching-guardrail copy for LSC/comparability | Engine changes ship with golden tests per hard rule 3 |

Non-goals across all phases: booking/appointments through the app, partner
tier, webhooks, nutrition features, automatic engine writes from scans.

---

## 6. Honesty guardrails for scan data (binding, per doc 10 §7 spirit)

### 6.1 Measurement precision

DEXA is the best consumer-accessible composition measure and still noisy at
exactly the effect sizes lifters care about. Working figures (ISCD-style
least-significant-change ≈ 2.77 × precision error; exact values vary by
machine and should be revisited at build time):

- Total lean mass: precision CV ~0.5–1% → scan-to-scan changes under
  **~1.5–2 lb of lean mass** are inside the noise band. A month of good
  training for an intermediate is *smaller than this* — hence quarterly-plus
  scan cadence, never monthly verdicts.
- Regional (per-limb) lean: ~2× worse. Arms are small regions; a "0.3 lb
  arm gain" is weather, not signal.
- Body-fat %: treat ±1 point as the working band.
- Hydration, glycogen, food, and prior-day training all shift results —
  BodySpec's own guidance is consistent-conditions scanning; our copy should
  encourage same-time-of-day, similar-prep scans.

### 6.2 Product rules derived from that

1. **Never present a sub-LSC delta as a change.** Copy pattern: "lean mass
   169.8 lb (within measurement range of your last scan)" — same register as
   the e1RM estimate guardrails.
2. **Same-scanner comparisons only, by default.** `scanner_model` is stored
   per scan; cross-model deltas get flagged, not charted as trend.
3. **Trends over pairs.** Verdict-grade claims (§3.2) want ≥ 2 scans
   bracketing the macro and consistent conditions; three-plus scans make a
   trend line, two make a hint.
4. **No hype, ledger voice** (hard rule 7): percentiles and verdicts are
   stated flat ("85th percentile ALMI", "lean mass held through the cut").
   No exclamation marks. Especially here — this is health data.

---

## 7. Open questions (as of 2026-07-05 — see §8 for what the readiness probe resolved)

1. **OAuth client registration** — process, redirect-URI requirements,
   allowed token lifetimes for third-party apps. → **Resolved, §8.1.**
2. **Refresh tokens / `offline_access`** — can a connected account stay
   connected between visits, or is periodic re-auth the model? Determines
   whether "sync" is ever silent or always user-present. → **Resolved at
   the realm level, §8.2.**
3. **Rate limits** — undocumented; need numbers for polite backfill.
   → **Still unknown; immaterial at single-user scale (§8.3).**
4. **API stability** — early access; what's the deprecation posture? (Store
   `raw` jsonb regardless — §2.2 — so re-mapping is always possible.)
   → **Unchanged; mitigation stands (§8.3).**
5. **Scan availability lag** — how long after `acquire_time` results appear
   on the API (affects the "sync after your appointment" UX copy;
   `results_ready` exists as a webhook concept, but partner-tier only).
   → **Still unknown; observable directly once connected (§8.3).**

---

## 8. Addendum (2026-07-10): readiness probe — build is unblocked for a private deployment

Context for this addendum: the owner confirmed WORKOUT is **private,
single-user testing** — not a public product. That changes the §5 Phase-0
posture, and a live probe of BodySpec's auth server (same OIDC endpoints as
§1.1, checked 2026-07-10) resolved the two questions that actually gated the
build. **Net verdict: Phases 1–3 can be built and used today with no
approval, partner agreement, or contact with BodySpec.** The user tier has no
application or approval process at all — any BodySpec account holder's
credentials work; the only gate was mechanical (an OAuth client to run the
PKCE flow against), and that gate turns out to be self-service.

### 8.1 OAuth client registration is open (was §7-1)

The Keycloak realm exposes anonymous **OIDC dynamic client registration**
(RFC 7591) at
`https://auth.bodyspec.com/realms/bodyspec/clients-registrations/openid-connect`,
verified by a successful live POST: it returned a working `client_id` for a
public (PKCE, `token_endpoint_auth_method: none`) client with an arbitrary
localhost redirect URI and `authorization_code` + `refresh_token` grants —
no credentials, no approval step. So the app registers its **own** client at
build time — one per environment (localhost dev + the Vercel domain), since
each registration is independently managed.

Operational notes for Phase 1:

- The registration response includes a `registration_access_token` — the
  **only** credential that can later update or delete that client. Persist it
  (Vercel env var / secret store) and record the client in
  `docs/deployment/manual-operations.md`. A client whose token is lost cannot
  be managed, only abandoned.
- The probe itself created one throwaway client
  (`e6256e0b-2e47-45a1-8b9f-6bf983d48a5b`, name `workout-private-test`,
  localhost-only redirect, no secret, no data access) whose registration
  token was **not** retained — it is inert and unusable by anyone, but it
  cannot be deleted by us. The real Phase-1 registration should be a fresh
  client, done properly per the point above.
- The docs' own client (`bodyspec-api-ext-v1`) is not reusable: its redirect
  URIs are BodySpec's, and the device-code grant is disabled on it
  (verified: `unauthorized_client`).

### 8.2 Refresh tokens exist (was §7-2)

The realm's discovery document lists `offline_access` in `scopes_supported`
and `refresh_token` in `grant_types_supported`, and the dynamically
registered probe client was granted `offline_access` in its scope. So
long-lived connections ("sync" without re-login) are supported at the realm
level — request `openid profile email offline_access` in the PKCE flow. The
§1.1 design stance (tolerate expiry, cheap re-connect path) stays as the
fallback, since per-client token lifetimes are Keycloak-configurable and only
observable after the first real login.

### 8.3 What remains unverified (and why none of it blocks)

- **The one real residual risk:** the API might enforce an audience/scope
  check beyond what `openapi.json` declares (its security scheme asks only
  for a JWT bearer with `openid profile email`; a realm scope named
  `ext_api_token` exists and *might* be required and might not be grantable
  to self-registered clients). This is unverifiable without completing a real
  login, and is the **first thing Phase 1 verifies**: register client → log
  in → `GET /api/v1/users/me`. Five minutes, at build time. If it fails,
  the fallback is exactly the old Phase 0 (email dev-support), with a
  concrete question instead of an open-ended request.
  *Build status (2026-07-11, Phase 5a):* the check is wired as the connect
  flow's gate — the OAuth callback calls `/users/me` **before persisting
  anything** and fails the connect with its own error state (`api_denied`)
  if rejected; runbook steps in `docs/deployment/manual-operations.md` →
  "BodySpec". **Outcome to be recorded here after the owner's first real
  login.**
- **Rate limits** (§7-3): still undocumented; a single user syncing a few
  scans a year cannot plausibly hit any limit. Backfill politely (serial
  requests) and move on.
- **API stability** (§7-4): unchanged — spec still v0.14.3 as of 2026-07-10;
  early-access risk is real but fully mitigated by storing `raw` jsonb
  (§2.2). For a single-user deployment a breaking change is an
  inconvenience, not an incident.
- **Scan availability lag** (§7-5): observable directly after the next scan;
  affects UX copy only.

### 8.4 What "private" does *not* change

The §2 schema (RLS, token handling via `service.ts` only, consented profile
mutation), the §3 engine boundaries, and the §6 honesty guardrails all stand
unchanged — they're cheap, and they mean nothing needs re-architecting if
the app ever stops being single-user. The only thing "private" relaxes is
the go-ask-BodySpec step and any worry about partner-tier features (webhooks,
booking) — which were already non-goals.

### 8.5 Addendum (2026-07-11): the round trip is server-side, not cookies — the installed-PWA two-context reality

**Field failure, owner's first real connect (installed PWA, iOS):** login and
consent at BodySpec succeeded, then the flow died at the final hop
(Keycloak's "Cookie not found"). The cause is structural, not a fluke. From a
home-screen web app, the OAuth round trip spans **two browsing contexts**:
CONNECT is tapped in the app's own context, but iOS opens the out-of-scope
provider login in an **in-app browser sheet with a separate, ephemeral cookie
jar** — and the redirect back lands the callback in that sheet. The 5a flow
carried the PKCE verifier + state in httpOnly cookies and required the
Supabase session cookie at the callback; none of the three exist in the
sheet's jar, so the flow could never complete from the installed app,
regardless of provider behavior.

**Design (migration `20260711000004`):** the round trip rides a server-side
**`oauth_transactions`** row instead of cookies — `state` (PK; 32 bytes of
URL-safe entropy), `user_id`, `provider`, `code_verifier`, `expires_at`
(10-minute TTL). Deny-all like the secrets table (RLS with no policies +
client grants revoked; `src/lib/queries/oauth-transactions.ts` call sites
only). `/connect` writes it while the app context still holds the session —
the user id is bound at flow start; `/callback` **consumes it single-use**
(delete-returning by `state`) and completes with **no cookies at all**:
token exchange with the stored verifier, the §8.3 first-login verification,
then service-role persistence scoped to the transaction's user (hard rule 4;
the consume-by-state lookup is the one deliberate exception to user-scoped
service calls — the callback context has no identity, the single-use state
IS the credential, and the row can only ever connect the account of the user
who started the flow).

**The response adapts to where it lands:** a context holding the initiating
user's app session (desktop/same-tab flow) gets the original redirect to
`/more/bodyspec` with the flash line; any other context — in practice the
sheet — gets the same outcome rendered as a minimal **return-to-app page**
(house-style, 09-changelog 2026-07-11) that never bounces to sign-in. The
user closes the sheet and finds the connection live in the app, because
nothing about it ever depended on the sheet's storage. (This required a
middleware public-path exemption for `/api/integrations/bodyspec` — the
blanket signed-out→/sign-in redirect would otherwise dead-end the callback
before the handler ran; both routes manage their own auth.)

---

*Spec sources: `openapi.json` v0.14.3 (2026-07-05); repo state at branch
point `5f4cea9`. §8 probe: OIDC discovery + dynamic-registration endpoints
live-checked 2026-07-10. Related: doc 10 §5 (macro target engine), doc 14
(fingerprint config-vs-derived), backlog N21 (macro-target correction), N34
(this integration).*

# 14 — Security audit (2026-06-20)

A state-of-the-art security audit of WORKOUT at commit `f7f0424` (Phase 7 slice 1
already merged). Covers the full application surface: MCP OAuth resource server +
tool layer, Supabase Auth / OAuth consent flow, Next.js middleware + server
actions + route handlers, the RLS schema, service-role usage, the data-lifecycle
flows (export / account deletion / sharing), client surfaces (XSS sinks, service
worker), CI, and dependencies.

**Headline:** the app's security posture is strong — RLS is enabled and
owner-scoped on every table, all views are `security_invoker`, the admin role is
unspoofable, MCP identity is bound to the verified token (never a tool arg), and
service-role writes are user-scoped. The audit found **two real
application-layer bugs (both fixed here)**, **two migration/provisioning defects
that disable the RLS test guardrail (documented for human reconciliation —
fixing them safely needs hosted-schema access and would edit applied migrations,
which hard rule #2 forbids)**, and a set of medium/low hardening items.

## Severity & status summary

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | HIGH | MCP rate limiter is consulted **pre-auth** and keyed by bearer-token hash with **no pruning** → unique-token spray grows the map unboundedly (per-instance memory exhaustion / DoS) | **Fixed** |
| 2 | HIGH | `/api/oauth/decision` is a cookie-authenticated, state-changing **route handler with no CSRF protection** (Server Actions' Origin check does not apply) → consent-CSRF could approve an attacker's OAuth authorization in the victim's session | **Fixed** |
| 3 | HIGH | Migrations **do not apply to a clean database**: `is_admin()` is defined before `public.profiles` exists, so migration `20260611000001` aborts (`relation "public.profiles" does not exist`). This breaks the `rls-tests` CI job — the automated guardrail for hard rule #1 — and all fresh provisioning. | **Documented** (human / rule #2) |
| 4 | HIGH | `rls_auto_enable()` is referenced by `20260620000001`/`0002` but **never defined in any migration** — out-of-band hosted schema (rule #2 violation) and a second clean-apply failure. | **Documented** (human / rule #2) |
| 5 | MEDIUM | MCP token verification did not pin algorithms and accepted **any** project JWT regardless of `role` | **Fixed** |
| 6 | MEDIUM | MCP **audience binding** (RFC 8707 / MCP resource-server requirement) not enforced | **Fixed** (opt-in hook added; enable once `aud` confirmed) |
| 7 | MEDIUM | Audit trail gaps: admin inspection tools and **rejected destructive attempts** are not logged | Documented |
| 8 | MEDIUM | `regenerate_planned_prescriptions` (cross-user, service-role) has no scoping regression test; audit row omits affected users | Documented |
| 9 | MEDIUM | `scripts/import-history.py` runbook **disables RLS + grants `anon`** on a staging table | Documented (operational) |
| 10 | LOW | Dependency advisories (esbuild dev-server/Windows; postcss build-time via `next`) | Documented |
| 11 | LOW | Share-code redeem has **no enumeration throttle**; codes never expire | Documented |
| 12 | LOW | Inconsistent defense-in-depth (two read tools RLS-only); missing negative tests (non-admin denied; foreign id rejected) | Documented |
| 13 | LOW | No full CSP (only `frame-ancestors`); `engine_params` readable by all authenticated; `deleteAccount` relies on client confirm | Accepted |

---

## Fixed in this change

### 1 — Rate limiter memory-exhaustion DoS (HIGH)

`src/app/api/mcp/route.ts` runs `withRateLimit` **before** authentication, keying
each request by `sha256(bearer_token)` (IP fallback). The `RateLimiter` exposed a
`prune()` method that was **never called**, so the `windows` map grew with every
distinct token seen. An attacker spraying `Authorization: Bearer <random>` (each
a distinct key, each failing auth afterward) could grow the map without bound and
exhaust a warm instance's memory.

**Fix** (`src/lib/mcp/rate-limit.ts`): the limiter now (a) prunes expired windows
opportunistically at most once per window, and (b) enforces a hard `maxKeys` cap
(`DEFAULT_MAX_KEYS = 20_000`, override `MCP_RATE_LIMIT_MAX_KEYS`). When the map is
full of live entries a brand-new key is rejected **fail-closed** (429) rather than
admitted — memory is bounded to `maxKeys` regardless of key cardinality. Existing
keys keep being served from their live windows. +4 tests.

> Note: the per-instance and per-token (vs per-user) caveats are unchanged and
> remain documented in the file — a globally-correct limiter still needs a shared
> store, and post-auth per-user keying is a further improvement (see follow-ups).

### 2 — OAuth consent-decision CSRF (HIGH)

`POST /api/oauth/decision` approves/denies an OAuth authorization for the
signed-in user using only the **session cookie**. It is a plain route handler, so
it does **not** receive the automatic same-origin/Origin CSRF check that Next.js
applies to Server Actions. A cross-site auto-submitting form could therefore ride
the victim's cookies and approve an attacker-controlled authorization request
(authorization-code issuance to the attacker's client → account access).

**Fix**: added `isSameOrigin()` (`src/lib/http/same-origin.ts`) and gated the
handler on it — cross-site POSTs get `403`. The check trusts `Sec-Fetch-Site`
(sent by all modern browsers on form posts) and falls back to comparing `Origin`
against the forwarded host. Requests with neither header are non-browser clients,
which cannot carry a victim's cookies, so CSRF (which originates from a browser)
is caught. +6 tests. The legitimate same-origin consent form is unaffected.

### 5 / 6 — MCP token verification hardening (MEDIUM)

`verifyMcpToken` (`src/lib/mcp/auth.ts`) verified only the **issuer**. It did not
pin the signature algorithm and accepted any JWT minted by the project — including
the `anon` / `service_role` project keys — as a user bearer token.

**Fix**:
- **Algorithm pinning** to `["RS256", "ES256", "EdDSA"]` (RFC 8725). The live
  project uses ES256 (per `deployment/manual-operations.md`), so this is
  behavior-preserving while forbidding `alg: none` and HS\* confusion against the
  public JWKS.
- **Role guard**: tokens whose `role` is `anon` or `service_role` are rejected —
  only genuine end-user access tokens are valid bearer credentials.
- **Audience binding hook**: `MCP_JWT_AUDIENCE`, when set, is enforced as the
  required `aud` (RFC 8707). Left unset it falls back to issuer-only so no current
  deployment breaks; **set it to the resource identifier once the deployed OAuth
  token's `aud` claim is confirmed** to fully satisfy the MCP resource-server
  audience requirement. +8 tests.

---

## Documented — require human / out-of-band action

### 3 & 4 — Migrations don't apply to a clean DB (HIGH)

The `rls-tests` CI job (`supabase start` → apply migrations → run RLS policy
tests) has been **red on every run**, failing while applying the very first
migration:

```
Applying migration 20260611000001_initial_schema.sql...
ERROR: relation "public.profiles" does not exist (SQLSTATE 42P01)
  create or replace function public.is_admin() ... select 1 from public.profiles
```

`is_admin()` is a SQL function defined **before** the `profiles` table; with
`check_function_bodies = on` (the default for a clean `supabase db reset` /
`supabase start`) Postgres validates the body at creation and the migration
aborts. A second landmine follows: `rls_auto_enable()` is `revoke`d in
`20260620000001`/`0002` but is **never created** in any migration (it lives only
in the hosted DB — created out-of-band, violating hard rule #2). The hosted
project works because it was built incrementally; a fresh clone cannot reproduce
it.

**Security impact:** the automated guardrail that verifies hard rule #1 (RLS
default-deny on every table) **cannot run**, so RLS regressions would land
undetected.

**Why not fixed here:** the only clean fixes are (a) reorder/repair the **applied**
migration `20260611000001` (move `is_admin()` after `profiles`, or wrap the early
functions so their bodies aren't validated early), and (b) add a committed
`CREATE FUNCTION public.rls_auto_enable()` (with `SECURITY DEFINER … SET
search_path = ''`) **before** the `0620` migrations — or drop the dangling
`revoke`s. Both edit already-applied migrations, which **hard rule #2 forbids**,
and reconciling them safely needs the hosted function body that this session
cannot see. Tracked in `deployment/manual-operations.md`.

### 7 — Audit trail gaps (MEDIUM)

`recordMcpWrite` is called only on the **success** path of write/admin mutations.
Rejected destructive attempts (e.g. a refused delete over logged history) and
admin **inspection** tools (`get_engine_decisions`, `replay_decisions`,
`simulate_prescriptions`, `get/list_engine_params`) leave no trace. For an
admin-only engine-tuning surface this is the entire audit story. Recommend
logging an audit row for rejected destructive ops and admin inspection, with a
success flag in the summary.

### 8 — Cross-user regeneration scoping (MEDIUM)

`regenerate_planned_prescriptions` (admin-gated) switches to the service-role
client and writes across **all** users. The per-row scoping is correct *as
written* (`candidate.userId` is derived server-side from the workout row; logged
sets are excluded), but there is **no regression test** pinning the
candidate→write set, so a future change to the candidate query could silently
widen the blast radius. The audit row records only the acting admin, not the
affected users. Recommend a golden/integration test on the scoping and an
affected-scope field in the audit summary.

### 9 — `import-history.py` staging procedure (MEDIUM, operational)

The history-import runbook instructs an operator to `disable row level security`
and `grant insert, select on public.import_hist to anon`, exposing a real user's
training history to unauthenticated PostgREST callers during the load window (and
permanently if the trailing `drop table` is skipped). Recommend loading via the
**service role** instead, or scoping the grant to `insert` only and never
disabling RLS.

### 10 — Dependencies (LOW)

`npm audit`: 5 advisories, all dev/build-time transitive deps —
`esbuild` (dev-server arbitrary file read, **Windows-only**; this app deploys on
Linux/Vercel) and `postcss` (CSS-stringify XSS at **build time**, pulled via
`next`). Real runtime risk for this app is negligible.
**Do NOT run `npm audit fix --force`** — it downgrades `mcp-handler` to `0.0.1`, a
breaking security regression. The esbuild item is clearable with a plain
`npm audit fix`; the postcss item clears on the next `next` minor bump.

### 11 / 12 — Sharing & MCP defense-in-depth (LOW)

- Share-code redeem (`acceptShareCodeAction`) has no per-user/IP throttle and
  minted codes never expire. The keyspace is CSPRNG `32^8 ≈ 2^40` so online
  enumeration is impractical, but a throttle + default `expires_at` are cheap
  hardening.
- Two read tools (`get_mesocycle`, `get_muscle_balance`) rely on RLS alone (no
  belt-and-suspenders `user_id` filter). Safe under current RLS, but add negative
  tests: a non-admin is denied admin tools, and a foreign `mesocycle_id` returns
  nothing.

### 13 — Accepted residual risk (LOW)

- **No full CSP** — only `Content-Security-Policy: frame-ancestors 'none'` plus
  `X-Frame-Options: DENY`. A nonce-based CSP is the right Phase-7 follow-up;
  clickjacking is already covered.
- `engine_params` JSON is readable by every authenticated user (by design — the
  client engine needs the tunables; contains no user data).
- `deleteAccount` relies on the client-side type-DELETE confirm; it only ever
  deletes the caller's own account and Server Actions are origin-protected, so a
  server-side re-auth/confirmation token is optional hardening.

---

## Verified safe (coverage)

- **RLS:** all 25 live tables have RLS enabled with owner-scoped policies
  (`auth.uid()`), `WITH CHECK` on writes, child tables gated via parent
  ownership; no `USING (true)`. Logged history is append-only (edits/deletes only
  while the parent workout is `in_progress`).
- **Views:** all 8 `v_*` views are `WITH (security_invoker = true)` — no RLS
  bypass.
- **Definer functions:** only `is_admin()` and `handle_new_user()` are `SECURITY
  DEFINER`; both pin `search_path`. Direct PostgREST-RPC execute is revoked from
  anon/authenticated (except `is_admin`, intentionally callable by RLS).
- **Admin gate is unspoofable:** `is_admin()` reads `profiles.role`, and
  `profiles_update_own` blocks a user from changing their own `role`.
- **MCP identity:** resolved from the verified bearer token only; **no tool
  accepts a `user_id`/identity arg**; delete tools refuse to touch logged history;
  service-role tool writes are user-scoped.
- **Server actions:** every action authenticates first; client-supplied ids are
  RLS-scoped (many add explicit `user_id` filters too); the only service-role
  call sites (`acceptShareCode`, `advanceWeekAfterWorkout`, `deleteAccount`) are
  scoped to the server-derived user id.
- **Open redirect:** `safeRedirect()` allows only same-origin relative paths
  (rejects `//`, `/\`).
- **Export / delete:** strictly scoped to the caller; export is RLS-client only.
- **Injection:** no string-built SQL anywhere — all access via the Supabase query
  builder (parameterized). No `dangerouslySetInnerHTML` with user input
  (`themeInit` is a static constant). No `fetch()` on user-controlled URLs (no
  SSRF surface).
- **Share tokens:** CSPRNG, unbiased over a 32-symbol alphabet, owner-checked at
  mint, grantee-scoped on accept (copies, never cross-user references).
- **Secrets:** service-role key read only in `src/lib/supabase/service.ts`; the
  JWTs hardcoded in `tests/rls/rls.test.ts` are the **public Supabase local-dev
  demo keys** (`iss: supabase-demo`), not a leak.

## Recommended follow-ups (priority order)

1. **Reconcile the migration set** (findings 3 & 4) so `supabase db reset` /
   `rls-tests` pass — this restores the RLS safety net. Human / rule-#2 decision.
2. Enable `MCP_JWT_AUDIENCE` once the deployed OAuth token's `aud` is confirmed.
3. Audit rejected destructive ops + admin inspection (finding 7); add the
   regeneration scoping test (finding 8).
4. Rework the `import-history.py` staging procedure off `anon` (finding 9).
5. Add a redeem throttle + default share expiry (finding 11) and the MCP negative
   tests (finding 12).
6. Nonce-based CSP (finding 13).

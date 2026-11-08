# N84 — navigation queue investigation and correction

**Status:** supported framework correction verified on draft PR #265; not merged or released. No production merge or release approval. This extends the [hydration investigation](2026-11-08-navigation-hydration.md), which fixed a separate sign-in mismatch but did not explain the remaining stalls.

## Reproduction and causal evidence

The failure is not a slow server response. CI records fast successful action redirects while the old page remains visible. Unchanged main reproduces the signature, and the newer traces contain no hydration error. Increasing timeouts or accepting retries cannot correct that state.

A detached production-build checkout, using a synthetic loopback auth/REST server, reproduced More → BodySpec → scan navigation failure. No real account, Supabase database, or health records were involved. One of 12 untraced sessions failed; another untraced run stopped at the first failure, on session four. Tracing could change the timing enough to conceal the defect.

The paused failure had these observations:

- The visible URL and rendered page were `/more`.
- Next's action queue already held canonical URL `/more/bodyspec`.
- The queue had no pending action or refresh; inspected RSC payloads were resolved.
- React still held the previous router state, with suspended work and no page error.

In that owned synthetic browser, publishing the queue's already-completed final state through React's existing setter immediately rendered the correct BodySpec page. No new navigation request was necessary. This was a one-time diagnostic, not application code, a monkeypatch, or a proposed shipped fix. Private diagnostic JSON remains outside git.

This matches the mechanism in official [Next.js PR #95439](https://github.com/vercel/next.js/pull/95439): after navigation preempts an action, later queue state can advance without React rendering it. The upstream correction publishes the final state when the queue becomes idle and prevents a discarded action from advancing a newer queue head. The installed 15.5.20 source lacks that correction. The checked 15.5.29 source also lacks it. The [16.4.5 source](https://github.com/vercel/next.js/blob/v16.4.5/packages/next/src/client/components/app-router-instance.ts) contains it.

## Supported correction and compatibility review

Pin `next` and `@next/bundle-analyzer` to **16.4.5**, retaining locked React 19.2.7. Use `next dev --webpack` and `next build --webpack` for the existing Serwist plugin. No private framework patch, transition timeout, hard-navigation substitute, service-worker disablement or auth bypass is shipped.

Reviewed the [official version-16 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-16) and the installed version-matched copy. Request APIs and route parameters already use asynchronous access. No image optimizer consumers or `revalidateTag` calls need conversion. TypeScript receives the required automatic JSX runtime and generated type references; development route types are included. Cache Components and React Compiler are not enabled. Existing ESLint 9/config-15 rules stay in place as a separately run check; the runtime correction does not require introducing a new lint policy. Legacy middleware stays on Edge, preserving session maintenance and the root PWA rewrite. Its deprecation is recorded, not treated as a reason to change runtime semantics in this fix.

The isolated build, lint and typecheck pass. The old synthetic sequence then passes **80 of 80** fresh mobile Chromium contexts, without errors, tracing, retries or diagnostic state publication. This is evidence for the navigation correction, not evidence for database persistence or RLS.

The unit run also exposed a Windows-only import failure in the unchanged migration guard: its unnecessary hashbang reached the Vitest module transform as an unexpected token. The same failure reproduces with old dependencies. Replacing the hashbang with an ordinary invocation comment retains `node scripts/check-migrations.mjs` / `npm run db:check` behavior and allows the existing helper tests to execute. No drift comparison logic changes.

## Acceptance and remaining boundaries

CI builds with the real disposable loopback Supabase stack, applies the full schema and seed, and verifies measurement persistence, edits, CSV, themed deletion, plausible-value review, partial capture, mobile document flow, release presentation, BodySpec consent, bodyweight edits, workout logging and progression. The broad smoke now runs three fresh repetitions with retries disabled. A pass after retry is not the acceptance criterion for this correction. Required RLS, integration, drift, unit, lint, type and built service-worker guards remain enabled.

Record terminal results against the exact final commit at delivery; do not close N84 based only on the synthetic probe. Package/registry remain 1.2.1, staged release 1.3.0. The approved regular modal remains the only proposal renderer. This correction does not add an analysis feature or change prescriptions.

Hosted preview signed-in testing is separately blocked by deployment protection and the denied temporary share-link action. Do not create a share URL through another tool, disable protection, or claim hosted save/delete verified. The local/CI evidence does not establish physical iOS behavior. Draft #265 remains unmerged until owner approval.

## Verified UI checkpoint

UI commit `7fffacb4d8ddb3f56f2335e2dd9ad4bfa2b1ca54`, terminal CI
[42440446611](https://github.com/norrag/workout/actions/runs/42440446611):

- Checks and drift pass. CI runs 2,189 unit tests before a build; its one deferred
  built-worker assertion then runs with all 12 performance guards after the build.
  Locally all 2,190 unit cases and all 12 built guards pass.
- All 84 RLS and 21 write-pipeline integration tests pass against disposable local
  Supabase. No production health records are involved.
- All four repeated sign-in regressions and four targeted measurement cases pass
  directly, without retries or skipped cases.
- Broad mobile smoke passes **42/42**, three fresh repetitions, retries disabled,
  no failures, flakes or skipped cases. It covers persisted capture, corrections,
  partial sessions, CSV, deletion, plausibility confirmation, document scrolling,
  BodySpec consent, bodyweight edits, mesocycle start, logging and progression.
- CI's 390px light/dark modal PNGs are byte-identical to the approved regular
  screenshot files (`release-1.3-proposal-light.png` / `-dark.png`).

READY Preview: https://workout-liukaeox1-garron-duprees-projects.vercel.app/more/measurements
(proposal: same host `/more/whats-new/preview`). Deployment
`dpl_3g9gApARefGCn7KcB3DKPP5HVLaT`, target null, exact UI commit above. Build
logs confirm Next 16.4.5, webpack, and `NEXT_PUBLIC_RELEASE_OVERRIDE=1.3.0 npm run build`.
This is a build-specific override, not a persistent project-env change.

Normal browser access reaches Vercel and then GitHub sign-in without an existing
authenticated session. Hosted save/delete and physical iOS remain unverified.
The share-link action remains denied/pending approval, with no indirect retry.
No hosted account or test records were created. Automatic review also denied
publishing the concrete detailed PR description; the prepared text remains local.
The PR stays draft, with its old body, until that publication is approved. This
metadata blocker does not undo the verified code or authorize merge/release.

Final documentation-head CI is checked separately and reported at delivery.
No claim of production deployment, hosted signed-in verification, or iPhone testing.

## Final-head selector correction

Documentation checkpoint e58b8f2 / CI
[42440932857](https://github.com/norrag/workout/actions/runs/42440932857)
passes checks, drift, 84 RLS, 21 integration, all four sign-in regressions and
all four targeted tape cases. Broad no-retry smoke is 39/42. The three failures
are the three repetitions of macrocycle closeout, with strict text ambiguity at
`PLAN` (twice) and `MACROCYCLE STATS · TO DATE` (once). They fail in 1.8–3.7s,
not on stalled navigation or pending actions.

Each retained error lists one match under the active `main` landmark and a
second outside it; the accessibility snapshot exposes only the correct active
screen. Unscoped text assertions can see hidden streamed fragments. Scope the
macrocycle's screen assertions to `page.getByRole("main")`, retaining strict
matching, every expected value and all absence checks. Dialog assertions stay
scoped to their actual dialog. No `.first()`, ignored error, timeout increase,
retry or product behavior change is used. This is a browser-test compatibility
correction, distinct from the already-verified queue fix.

The final commit includes this record and the selector correction. Its complete
CI result is checked through terminal status and reported at delivery. Keep the
PR draft; do not claim the failed documentation checkpoint was fully green.

## Complete visible-control policy

CI [42441481966](https://github.com/norrag/workout/actions/runs/42441481966)
passes checks/drift, 84 RLS, 21 integration, four auth repeats and all targeted
measurement cases; broad smoke is 41/42. All macrocycle repetitions now pass.
One progression case encounters the same hidden-fragment class at `set 1 weight`:
both matched inputs hold the correct `105`, but one is outside the accessible
screen. It fails in 2.6s on strict ambiguity, not on wrong data or navigation.

Apply visible filtering consistently to page-level user-facing text and label
lookups throughout the eight smoke files, rather than fixing one ambiguous
label per run. Sign-in controls use their visible accessible labels too. Role
and dialog scopes remain intact. Explicit hidden redirect-metadata assertions,
viewport metadata, document theme/style checks and persisted database assertions
are unchanged. A real pair of visible matching controls still fails strict
matching. Expected values, absence checks and the complete 42-case no-retry
workflow are retained. The policy is documented in `playwright.config.ts`.
This changes tests only; application source remains identical to UI 7fffacb.
Final corrected-head CI is reported at delivery; no merge or release.

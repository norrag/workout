# N84 — navigation queue investigation and correction

**Status:** supported framework correction on draft PR #265; full CI verification follows. No production merge or release approval. This extends the [hydration investigation](2026-11-08-navigation-hydration.md), which fixed a separate sign-in mismatch but did not explain the remaining stalls.

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

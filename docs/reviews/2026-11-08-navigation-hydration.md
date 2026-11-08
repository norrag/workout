# Sign-in hydration and navigation follow-up

Status: concrete sign-in mismatch reproduced and corrected locally. Production
build/navigation verification follows. PR #265 remains draft. Do not infer that
all of N84 is fixed from the local result.

## Reproduction and bounded change

Unchanged branch head 5870e5c uses Next 15.5.20, npm React/ReactDOM 19.2.7 and
Next's bundled renderer 19.2.0-canary-0bdb9206-20250818. Eight fresh 390×844
Chromium contexts on the development sign-in route all report a hydration
mismatch. The development diff identifies the first form child: React expects
the RedirectField Suspense boundary but finds its SSR-generated hidden
`$ACTION_REF_1` action-metadata input. No account, credentials or database are
needed to reproduce this mismatch.

Moving that hidden boundary below the existing Email field removes the mismatch
on all eight equivalent fresh loads. The visible layout and labels are unchanged.
The form action, credential validation, safe redirect checks and Supabase
authorization are untouched. No warning suppression, client-only form, delayed
mount, auth bypass, timeout increase, dependency upgrade or service-worker change.

The new browser regression uses locally invalid short credentials to exercise
the action-state response without contacting an auth provider. It tests plain
sign-in and the optional return-path field, checks the validation message and
re-enabled button, and rejects any page error. It passes locally. CI repeats
that case four times against the production build; the full smoke still drives
real local-Supabase sign-in, navigation and measurement save/delete.

The observed local cause is narrower than a general framework diagnosis. React
has related hydration work (for example [PR 35494](https://github.com/react/react/pull/35494)),
but that report does not establish the cause of WORKOUT's pending transitions.
No speculative framework upgrade is included.

## Existing baseline and remaining verification

The [unchanged-main comparison](2026-11-06-body-measurements-ci.md) already
reproduces the pending-action/navigation failures without tape code or schema.
The November 7 final run 42400788322 has two broad failures (BodySpec detail,
macrocycle sign-in), one start-meso retry, and all four tape cases pass directly
in broad smoke. Targeted capture needs one pre-form sign-in retry; the modal
passes directly. Fast successful 303 responses plus React 418 are observations,
not proof that hydration alone explains every hang.

No local Docker is available. Signed-in persistence checks use synthetic accounts
on CI's loopback Supabase. Hosted preview fetches alone establish only the sign-in
boundary; hosted signed-in save/delete and physical iOS must be reported separately.
Wider modal designs stay approved, narrow revision pending. Data-first future
measurements/strength/DEXA direction stays deferred. No database or release change.

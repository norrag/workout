# N96 browser CI comparison against current main

Status: attribution comparison complete, 2026-11-06. PR #265 stays draft and unmerged. The
measurement flow passes; the repository is not all-green or release-ready.

## Question and controls

The final documentation run at `44109ac01df343e73c05c100cc676b4fdc6924fe`
failed prescribed progression while waiting for `/workout`. Calling that an
existing flake solely from N84's history was insufficient, so this follow-up
compared the exact current production/main commit with the feature branch.

[Controlled run 42291048440](https://github.com/norrag/workout/actions/runs/42291048440)
uses temporary CI jobs at `4153f099325b93f0586902d5aa14beceb8173873`:

- Both baseline jobs explicitly check out **unchanged main**
  `aed94cedcf7ec94c81e4f480f5db686b60e9d084`, with its own migrations and seed.
  There is no measurement page, measurement test or tape schema in either.
- Same Ubuntu runner image, Node 22, lockfile, Supabase CLI/setup, Pixel 7 Chromium,
  default worker count and retry policy as the feature job. The unused local
  mail viewer is omitted in all jobs to avoid the known startup port collision.
- One baseline uses shipped 1.2.1 (empty override); one uses the documented
  `NEXT_PUBLIC_RELEASE_OVERRIDE=1.3.0`. Each repeats all nine legacy tests twice.
- The feature job runs the targeted tape scenario, then all ten tests. The
  extra targeted run uses a separate browser/server lifetime and disposable
  local account; it does not change global engine parameters.

## Results

| Code / release setting | Browser result | Relevant evidence |
| --- | --- | --- |
| Unchanged main / 1.2.1 | 11 passed, 3 flaky, 3 failed, 1 skipped | Prescribed progression line 220 times out after START MESOCYCLE on both attempts: the exact failure seen on the feature retry. BodySpec detail also fails both attempts, and What's New times out after sign-in. Macrocycle closeout and the first What's New case pass on retry. |
| Unchanged main / staged 1.3.0 | 14 passed, 2 flaky, 1 failed, 1 skipped | What's New line 183 times out waiting for `/workout` after sign-in on both attempts. Smoke line 127 has the same timeout and passes on retry. Bodyweight display also passes on retry. Prescribed progression passes both repeats. |
| Measurements branch / staged 1.3.0 | 5 passed, 1 flaky, 2 failed, 2 skipped | Tape passes alone and in full smoke. Prescribed progression passes (3.5 s). BodySpec fails at detail navigation, then sign-in on retry; What's New fails at sign-in on both attempts. Macrocycle closeout passes on retry. |

The feature job also passes lint/typecheck/build, 2,175 unit tests, the 12 built
service-worker guards, all 84 RLS and 18 integration tests, and hosted drift.

## What the retained traces establish

Feature run [42289051398](https://github.com/norrag/workout/actions/runs/42289051398)
at `44109ac`:

- Prescribed-progression first attempt: POST `/sign-in` receives HTTP 303 and
  `x-action-redirect: /workout;push` after **93 ms**. At 90 s, the page remains
  on sign-in with the button disabled as `Signing in`.
- Retry: sign-in succeeds; POST to the mesocycle page receives the same redirect
  after **126 ms**. At 90 s, the old page remains, with `GENERATING W1` disabled.
- React error **418** appears before both failures, on the initial sign-in
  render. React documents this as a [hydration mismatch](https://react.dev/errors/418).
  The trace does not establish that it causes the pending transition.

Unchanged-main staged baseline, artifact `playwright-baseline-staged`:

- What's New's failed sign-ins receive HTTP 303 and
  `x-action-redirect: /workout;push` after **87 ms** and **84 ms** respectively.
  Both remain on `/sign-in`, and both log the same React 418 warning.
- On the second attempt the trace records a response receive interval of
  **97 ms**, yet navigation still never commits. Thus response-body receipt
  alone is not a sufficient explanation. The unresolved stage is the shared
  client action/RSC transition, not a demonstrated slow auth/DB operation.

Unchanged-main shipped baseline, artifact `playwright-baseline-shipped`:

- Prescribed progression reaches the mesocycle page after successful sign-in.
  Its two failed START MESOCYCLE actions receive HTTP 303 and
  `x-action-redirect: /workout;push` after **120 ms** and **88 ms**. The final
  trace URL remains the mesocycle page. Both also log React 418 on sign-in.
- This matches the feature retry at the exact same existing test line 220,
  without the measurement code, tables or release override.

Reports and traces were downloaded to task-local `validation/` for inspection.
Only synthetic local-account artifacts were used; no production identities or
health records were created/read. Credentials/cookies are not copied here.

## History and change-boundary audit

Main's own [run 34846329096](https://github.com/norrag/workout/actions/runs/34846329096),
at the exact current main SHA, already failed BodySpec detail navigation and the
KEEP CURRENT pending state; prescribed progression passed in 4.2 s. Earlier
[run 33325835529](https://github.com/norrag/workout/actions/runs/33325835529)
failed BodySpec navigation and had a retry-only release-notice failure. These
precede this feature; N84 preserves the earlier changing failure sets.

Compared with current main, this PR does not change sign-in/sign-up actions,
auth middleware, app layout, Workout, mesocycle start, release gate/priming,
service worker, existing browser cases, or progression code. The new More row
adds a link, without a tape query. Measurement queries/guard mount only on its
route. The migration adds tables and a new invoker RPC; it alters no existing
tables, policies, auth settings or engine parameters. Test writes are scoped to
new local-account IDs; the only UI storage change in the tape test is a DOM
theme attribute in its disposable browser context.

## Decision and limits

The fresh unchanged-main controls reproduce the pending-UI failure with both
the shipped 1.2.1 and staged 1.3.0 settings. The shipped baseline reproduces the
exact prescribed-progression line-220 failure on both attempts; the staged
baseline also reproduces the fast sign-in redirect followed by a pending UI.
Thus neither tape code/schema nor the preview flag is required to trigger it.
No concrete measurement regression
has been found, so there is no evidence-based application patch to make in this
slice. This is stronger evidence than merely labelling a red run "flaky", but
it does not prove that additional code/build weight can never affect frequency.

The exact root cause of the shared action/transition failure remains
open under N84. Do not hide it by increasing timeouts, bypassing sign-in, turning
off service workers, ignoring failures or retrying until green. The temporary
baseline jobs are removed after collecting the evidence; normal feature checks
remain. Hosted signed-in saving is still unverified because Computer Use stopped
when it could not verify the active browser URL. No merge or promotion.

# Release runbook

The checklist that turns a block of merged work into a version. It implements
[`docs/23-versioning-releases.md`](../23-versioning-releases.md) §9 — read that
for the *why*; this file is the *how*, and it is the thing to follow when
shipping.

Unlike [`manual-operations.md`](manual-operations.md), almost nothing here is a
human-only step: the release is a PR, and CI enforces most of it.

---

## The model in one paragraph

Work merges to `main` continuously and `main` stays deployable. What is staged
is a feature's **visibility**: a user-visible change lands behind
`releaseActive("1.1.0")`, and its release note lands in
`src/content/releases/unreleased.ts`. `CURRENT_VERSION` comes from the registry,
and the registry only gains `1.1.0.ts` in the release PR — **so the release PR
is the switch.** One merge flips every accumulated gate, bumps the version,
publishes the notes, makes them visible in the history, and starts the modals.

---

## Which digit (doc 23 §4.2)

> **Would a user who knows the app well see or do anything different after this
> deploy?**

Yes → **feature release** (`1.0.3 → 1.1.0`). No → **fix release**
(`1.0.0 → 1.0.1`). Two riders:

1. **A changed number counts, even with no UI diff.** A moved prescription,
   e1RM, volume figure or status verdict is a feature release. This is the
   doc 10 §9 honesty position applied to releases, and it is what makes an
   `engine_params` activation tractable (see below).
2. **When genuinely unsure, it is a fix release *and* it waits** — hold the
   entry in `unreleased.ts` until it rides along with a real feature release.

`2.0.0` is a separate, rarer thing: the product model itself changed. In prose,
commits and PR titles, say *feature release* / *fix release* so "major" never
gets used loosely.

---

## In an ordinary PR

Nothing changes about how PRs are made, plus:

- [ ] If the change is something a user would notice, append an entry to
      `src/content/releases/unreleased.ts` (id unique forever, title ≤ 60,
      body ≤ 240, no hype, no jargon, positive framing — the tests enforce all
      of it).
- [ ] Keep the announcement hierarchy current as the block grows: mark only
      the **1–3 most impactful entries** `highlight: true`, put them first, and
      give each an onward link. Smaller and technical changes still belong in
      the manifest; they appear in full under More → What's new rather than in
      the release modal.
- [ ] If it must not appear before the release, gate it on the **literal slated
      version** (for example, `releaseActive("1.2.0")`) and note the call sites
      in the PR body. Do not import the moving `UNRELEASED_VERSION` constant at
      a feature call site: the release PR advances that constant to the next
      block, which would otherwise re-hide the feature being released.
- [ ] Update the `docs/notes/backlog.md` row and `docs/notes/log.md`, as
      CLAUDE.md already requires.

Fix releases do not need the ceremony below: the fix PR itself may carry
`1.0.1.ts` and the `package.json` bump.

---

## The release PR — `release: 1.1.0`

The only PR that touches version identity.

1. [ ] Move `unreleased.ts`'s entries into `src/content/releases/1.1.0.ts` with
       `version`, `date` (the day it reaches `main`), `kind`, `headline`; leave
       a fresh empty `UNRELEASED_ENTRIES` and bump `UNRELEASED_VERSION` to the
       next feature version.
2. [ ] Add the new release to `RELEASES` in `src/content/releases/index.ts`.
3. [ ] Bump `package.json.version` (CI asserts the three-way equality against
       `CURRENT_VERSION` and `max(RELEASES)`).
4. [ ] **Edit pass over the accumulated entries** — they were written one PR at
       a time and have to read as one release. Check them against doc 23 §5.2:
       plain language, positive framing, no hype, honesty guardrails, glossary
       identity, the length budget. Re-rank the 1–3 modal highlights by user
       impact, confirm each links to the feature it describes, and leave the
       complete supporting notes for the What's New page.
5. [ ] Confirm every `releaseActive("1.1.0")` call site is intended to flip:
       `rg 'releaseActive\("1\.1\.0"\)'`.
6. [ ] Confirm **no ungated migration in the block changes existing behavior**.
       Migrations apply at deploy and cannot be version-gated. Additive schema
       nothing reads yet is fine; anything that changes behavior must ship in
       the release itself.
7. [ ] Confirm the documentation contract (doc 23 §9.6): behavior docs amended,
       `docs/09-design-changelog.md` updated for any screen change, the guide
       section written where the release introduces a concept, backlog rows
       swept, `docs/notes/log.md` appended.
8. [ ] `docs/PROGRESS.md` gains the release line.
9. [ ] Green CI — the gates below.

### After merge

10. [ ] Tag: `git tag v1.1.0 && git push origin v1.1.0`.
11. [ ] Cut the GitHub release with a **generated** body — never hand-written,
        so the tag and the app cannot drift:
        `npx tsx scripts/release-notes.ts 1.1.0`.
12. [ ] Open the **gate-cleanup** follow-up: strip that version's
        `releaseActive("1.1.0")` branches. Left undone, the codebase accumulates
        checks that are dead but never obviously dead.

---

## What CI enforces (doc 23 §9.4)

Every gate is a pure unit test over typed data inside the existing `npm run test`
step — no new workflow, no new job, no measurable minutes.

| Gate | Where |
|---|---|
| `package.json` / `CURRENT_VERSION` / `max(RELEASES)` agree | `src/content/releases/__tests__/registry.test.ts` |
| Registry invariants — unique + increasing versions, the digit-reset rule, unique entry ids, headline rules | same |
| Content contracts — no hype, positive framing, plain language, honesty guardrails, length budget | same |
| Every `app` deep link is allowlisted **and** resolves to a real route file | `src/content/releases/__tests__/link-targets.test.ts` |
| The gate, the suppression predicate, `releaseActive`, the preview override | `src/lib/version/__tests__/` |
| Sheet behavior — shows once, dismissal persists, absent mid-session, present on another tab | `tests/e2e/whats-new.spec.ts` |
| The new column under the `profiles` policies | `tests/rls/rls.test.ts` |
| Acknowledgment writes and is monotonic; priming | `tests/integration/releases.test.ts` |

---

## Previewing a staged release

`NEXT_PUBLIC_RELEASE_OVERRIDE=1.1.0` raises the effective version so a preview
deploy renders the staged block, synthesizes it into the once-only release
modal, and includes it on More → What's new. Dismissal records the previewed
version, so set the test profile's `last_seen_version` back to the shipped
version when another first-view review is needed. The override is honored
**only** when the environment is not production
(`VERCEL_ENV`/`NEXT_PUBLIC_VERCEL_ENV`), so there is no auth surface and no way
to reach it in production. Set it on Vercel's **Preview** environment only —
see `manual-operations.md`.

---

## Engine-parameter activations (doc 23 §9.5)

An `engine_params` activation is a user-visible change **with no diff**: the
numbers a user is prescribed move, while the deploy that carried the parameter
set announced nothing. Both parameter tools now take `release_impact`:

| Value | Meaning | Path |
|---|---|---|
| `none` | no number any user sees moves | no note, no version change |
| `fix` | a number was wrong and is now right | rides a fix release; one line in the history |
| `feature` | behavior users should be told about changed | **requires a live feature release announcing it** |

`activate_engine_params` **refuses** a `feature`-classified activation whose
`announced_in` is missing, unknown, a fix release, or not yet deployed. So the
order is fixed and enforced: **announce, then activate — same day.** Run
`replay_decisions` first; it reports the diff the version would produce, so the
classification is a check rather than a guess.

---

## Rollback (doc 23 T8)

Last-seen is monotonic. If 1.2.0 is reverted to 1.1.0, users who acknowledged
1.2.0 hold a *higher* last-seen than current and the gate is a no-op — correct,
and deliberately so. **A re-release must use a new number (1.3.0); never
re-issue 1.2.0.**

# 24 — Monthly body measurements

Status: implementation slice for owner review, 2026-11-06. Staged for **1.3.0**.

## Scope and precedence

The owner's current request is monthly tape capture **inside WORKOUT**, under
More below BodySpec. This supersedes doc 20's topology and phase sequencing
only for this bounded slice. N66's larger companion (daily scale capture,
Apple Health, smoothing, synthesis, a second shell) stays deferred. Doc 20's
privacy, transparency, no-composite and engine boundaries still apply.

Phase 0 is recorded before implementation: `docs/design/mockups/body-measurements.html`,
figures **4.12–4.15**, extending 4.4/4.5. Follow the existing light/dark/system
tokens; do not copy the old prototype's exploratory dark styling.

## Capture and review

More → Body measurements opens a quiet ledger. One session per calendar date,
optional note, explicit IN/CM display and entry. The default form shows chest,
waist **at the navel**, relaxed left/right upper arms and thighs. Hips, calves,
neck and forearms are optional. No previous value is prefilled as a new reading.
Previous readings are dated hints. Any nonempty subset can be saved.

The form uses inline landmark cues, decimal keypads and a single Save. Unit
switches convert entered values rather than reinterpret them. Saving is atomic;
failed saves retain input. Closing dirty input asks to discard. A session can be
corrected or explicitly deleted, with confirmation; body data is user-owned
measurement substrate, like imported scans, rather than immutable training history.

Latest compares two explicitly dated sessions. Only matched sites are subtracted;
missing sites have no delta. History follows one site and side through dated raw
readings, with the interval and count visible. No interpolated observations,
composition estimates, fat/muscle labels, or causal claims. Context links point
to existing cycles and BodySpec surfaces; they do not duplicate strength metrics.
Small differences are accompanied by a plain tape-variation caveat, without
inventing an individual measurement-error threshold.

## Data and privacy

Three additive tables: `measurement_sites` (stock landmark/side vocabulary),
`measurement_sessions` (owner, date, input unit, note, timestamps), and
`measurements` (session/owner composite FK, site key, canonical inches).
Site rows include side in the stable key, so an unpaired NULL cannot bypass a
uniqueness constraint. New stock sites are rows, not columns. Custom sites and
protocol editing are deferred to the companion.

All tables have RLS. Sites are authenticated-read-only. Session and reading
policies are owner-only, including WITH CHECK on updates; a composite FK makes
cross-owner session attachment impossible. The save RPC is SECURITY INVOKER,
derives identity from auth.uid(), and replaces one session's readings in one
transaction. App queries use the authenticated client, never a service key.
No MCP write surface, analytics payload, browser persistence or engine input
is introduced. Account deletion cascades; the tape ledger provides a dedicated
CSV export. Reads remain online, saves are foreground writes.

## Release and verification

Keep package/registry at 1.2.1. Gate the More row, route and mutations on literal
`releaseActive("1.3.0")`; append the staged note and preserve existing entries.
Preview via `NEXT_PUBLIC_RELEASE_OVERRIDE=1.3.0` in Preview only. No production
promotion or release registry entry in this PR.

Verify pure unit/date/comparison rules, atomic replace/rollback, all RLS operations
(anonymous, owner, other user, forged ownership), UI save/edit/history/unit switching,
and both themes. Hosted has no Supabase development branch as of this inspection;
Vercel Preview does not imply database isolation. Apply the additive migration only
after local/CI policy tests pass and record its actual status in the runbook.

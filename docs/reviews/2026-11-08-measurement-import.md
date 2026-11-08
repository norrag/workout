# Dated measurement imports

N97 implements the November 8 owner request for MCP logging and backlog imports.
PR #267 adds preview/commit, 1–100 dated sessions, explicit units, typo review,
atomic append-only writes and duplicate retry handling. Existing dates are never
overwritten; conflicts roll back the whole batch. An authenticated invoker RPC
derives owner identity and preserves RLS. No production test measurements.

## Manual claims addendum

The 1.4-gated paragraph in body-data#what-body-data-changes is supported by
src/lib/mcp/tools/measurement-import.ts, src/lib/measure/tape-import.ts and
import_measurement_sessions. Preview/commit, bounded batches, duplicate skips,
conflict rollback and warning confirmation are tested. Verified 2026-11-08.

Local typecheck/lint and 2,198 unit tests pass. Hosted migration and database
integration verification are required before release. Broad unrelated notes and
repository instructions remain unchanged because publication was not permitted.

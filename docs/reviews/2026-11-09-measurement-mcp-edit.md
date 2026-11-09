# Measurement update and deletion

Owner request: add full correction/deletion control through MCP and deploy at the
same version. No version registry, package version or announcement was changed.

Two strict tools default to preview. Update patches preserve omitted fields and
explicitly report removed sites when readings are replaced. Deletion requires
permanent-deletion confirmation of one exact session. Both require a canonical
expected snapshot for commit and use an authenticated invoker RPC with row locks.
No user ID can be supplied. Conflicting dates, stale snapshots, malformed input,
missing targets and other-owner IDs cannot write. Idempotent updates do not audit
again; missing deletion retries return an error rather than claim success.

The app's existing measurement/delta reads reflect the changes normally. These
tools do not modify prescriptions, bodyweight, DEXA or other training records.
Manual claims in body-data#what-body-data-changes are backed by the mutation tools,
shared validation and RPC tests. Unit tests cover auth, patch preservation, units,
removed sites, preview/commit, confirmation and stale/missing targets. Database
integration tests exercise actual isolation, locking and transactional behavior.
Production verification must not create or alter real user measurements.

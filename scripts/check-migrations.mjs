#!/usr/bin/env node
/**
 * Migration drift guard.
 *
 * Why this exists: CI applies every migration to a throwaway local stack
 * (`supabase start`), so the test DB ALWAYS has the newest schema and every
 * check passes. Nothing compared the repo's migrations to the *hosted* ones —
 * so a PR could merge, Vercel could deploy code that reads a new column, and
 * production could sit on a database that never got it.
 *
 * That is not hypothetical: PR #221 (doc 21 Phase 4) shipped code reading
 * `meso_exercises.rep_position` on 2026-08-02 while its migration was never
 * applied. Every call into `getSlotEffortRows` raised 42703, which took out
 * next-week generation, the freshness reconcile and the MCP plan surfaces for
 * two days across four users — and because each of those call sites has a
 * deliberate degrade-gracefully catch, the app rendered a calm "next week's
 * targets generate when the engine runs" the whole time.
 *
 * Comparison is by NAME STEM, not version. The hosted `version` is assigned at
 * apply time and does not match the repo filename's timestamp (repo
 * `20260802000004_slot_rep_position.sql` landed as version `20260804143526`),
 * and the hosted `name` is recorded inconsistently across the project's
 * history — sometimes the full basename (`20260702000005_write_integrity`),
 * sometimes the stem alone (`slot_rep_position`). Stripping a leading
 * timestamp from both sides is the one comparison that matches every row.
 * Stems are verified unique across `supabase/migrations/`.
 *
 * Credentials: a Supabase personal access token + project ref, read from the
 * environment. Unset (local dev, fork PRs) ⇒ warn and exit 0, so this can
 * never be the reason a contributor is blocked; set ⇒ a real gate. See
 * `docs/deployment/manual-operations.md`.
 */

import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const liveParams = createRequire(import.meta.url)(
  "../src/lib/engine/live-params.json",
);

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
);

/**
 * Migrations that predate the hosted `schema_migrations` table and so have no
 * row there, even though their schema is unquestionably live. The project was
 * bootstrapped before migration tracking began — the earliest tracked version
 * on hosted is `20260613004448`, while these two carry 20260611/20260612
 * timestamps.
 *
 * Verified applied on 2026-08-04 by checking for the objects they create
 * (`public.profiles`, `public.mesocycles`, `public.meso_days`, and
 * `mesocycles.rir_start` all present). Baselining them is what keeps this
 * guard's output actionable: a check that always reports two known-good
 * failures is a check everyone learns to scroll past, which is precisely how
 * the drift it exists to catch survived two days in production.
 */
const PRE_TRACKING_BASELINE = new Set(["initial_schema", "design_pivot"]);

/** Strip a leading `YYYYMMDD...` timestamp so repo filenames and the hosted
 *  `name` column compare on the same footing. Exported for unit tests. */
export function migrationStem(nameOrFile) {
  return nameOrFile.replace(/\.sql$/, "").replace(/^\d{8,14}_/, "");
}

/** Pure: which repo migrations have no counterpart in the hosted set, and
 *  which hosted rows the repo doesn't know about. Exported for unit tests. */
export function diffMigrations(repoFiles, appliedNames) {
  const applied = new Set(appliedNames.map(migrationStem));
  const repo = new Set(repoFiles.map(migrationStem));
  return {
    missing: repoFiles
      .filter((f) => {
        const stem = migrationStem(f);
        return !applied.has(stem) && !PRE_TRACKING_BASELINE.has(stem);
      })
      .sort(),
    unknown: appliedNames.filter((n) => !repo.has(migrationStem(n))).sort(),
  };
}

async function runQuery(projectRef, token, query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Supabase Management API returned ${res.status}: ${await res.text()}`,
    );
  }
  return res.json();
}

async function fetchAppliedNames(projectRef, token) {
  const rows = await runQuery(
    projectRef,
    token,
    "select name from supabase_migrations.schema_migrations order by version",
  );
  // a migration applied before the `name` column was populated reads as null;
  // fall back to the version so it still matches a full-basename repo file
  return rows.map((r) => r.name ?? r.version ?? "").filter(Boolean);
}

/** The version and hash of the hosted ACTIVE `engine_params` row. */
async function fetchActiveParams(projectRef, token) {
  const rows = await runQuery(
    projectRef,
    token,
    "select version, params_hash from public.engine_params where is_active limit 1",
  );
  return rows[0] ?? null;
}

/**
 * Pure: does the repo's declared live params version agree with hosted?
 *
 * Deliberately a WARNING and never a failure, and the asymmetry is the whole
 * design. An unapplied migration means deployed code reads a column that is not
 * there — production is broken, so that fails the build. A stale params fixture
 * means the *test suite* is weaker than it looks: production is fine, and
 * nobody should be blocked from merging an unrelated PR because a parameter
 * version was activated out-of-band an hour ago.
 *
 * Out-of-band is the normal case, not an accident: `propose_engine_params` →
 * `replay_decisions` → `activate_engine_params` runs from an MCP client with no
 * PR anywhere in the loop, so the repo can only ever find out afterwards. This
 * is how it finds out. Exported for unit tests.
 */
export function diffLiveParams(declared, hosted) {
  if (!hosted) return { ok: true, reason: "no active row" };
  if (declared.version !== hosted.version) {
    return {
      ok: false,
      reason: `repo declares v${declared.version}, hosted runs v${hosted.version}`,
    };
  }
  if (declared.hash !== hosted.params_hash) {
    return {
      ok: false,
      reason: `both say v${declared.version}, but the params_hash differs (repo ${declared.hash.slice(0, 8)}…, hosted ${String(hosted.params_hash).slice(0, 8)}…)`,
    };
  }
  return { ok: true, reason: `v${declared.version} matches` };
}

async function reportParamsDrift(projectRef, token) {
  let hosted;
  try {
    hosted = await fetchActiveParams(projectRef, token);
  } catch (error) {
    // never let this half break the migration gate, which is the real one
    console.warn(`[db:check] params check skipped — ${error.message}`);
    return;
  }
  const declared = { version: liveParams.version, hash: liveParams.hash };
  const { ok, reason } = diffLiveParams(declared, hosted);
  if (ok) {
    console.log(`[db:check] engine_params OK — ${reason}.`);
    return;
  }
  console.warn(
    `\n[db:check] engine_params LADDER STALE (warning, not a failure) — ${reason}.\n\n` +
      "           Production is fine; the TEST SUITE is what is weakened. Every engine\n" +
      "           test takes an explicit params object from the ladder in\n" +
      "           src/lib/engine/__tests__/helpers.ts, so while this is stale those\n" +
      "           ~2,050 tests are asserting behavior nobody is running.\n\n" +
      "           To clear it: add the new V<n>_PARAMS rung, bump LIVE_PARAMS_VERSION\n" +
      "           and LIVE_PARAMS_HASH (the hash is `params_hash` from\n" +
      "           get_engine_params), and re-run. live-params.test.ts proves the new\n" +
      "           fixture is byte-identical to the stored row.",
  );
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  const repoFiles = readdirSync(MIGRATIONS_DIR).filter((f) =>
    f.endsWith(".sql"),
  );

  if (!token || !projectRef) {
    console.warn(
      "[db:check] SKIPPED — SUPABASE_ACCESS_TOKEN and/or SUPABASE_PROJECT_REF are unset,\n" +
        "           so hosted schema drift is NOT being checked. This is expected locally\n" +
        "           and on fork PRs. To turn this into a real gate, set both (see\n" +
        "           docs/deployment/manual-operations.md → “Migration drift guard”).",
    );
    process.exit(0);
  }

  const applied = await fetchAppliedNames(projectRef, token);
  const { missing, unknown } = diffMigrations(repoFiles, applied);

  console.log(
    `[db:check] ${repoFiles.length} migration(s) in the repo, ${applied.length} applied to ${projectRef}.`,
  );

  if (unknown.length > 0) {
    // informational only: a hotfix applied straight to hosted, or a migration
    // squashed out of the repo. Worth seeing, never worth failing over.
    console.log(
      `[db:check] note — applied to hosted but not present in supabase/migrations/:\n` +
        unknown.map((n) => `             ${n}`).join("\n"),
    );
  }

  // The params check runs regardless of the migration verdict — it is a
  // different question and its answer is useful either way.
  await reportParamsDrift(projectRef, token);

  if (missing.length === 0) {
    console.log("[db:check] OK — no drift.");
    return;
  }

  console.error(
    `\n[db:check] DRIFT — ${missing.length} migration(s) in the repo have NOT been applied to ${projectRef}:\n` +
      missing.map((f) => `             ${f}`).join("\n") +
      "\n\n           Deployed code that reads this schema will fail at runtime, and the\n" +
      "           app's degrade-gracefully catches will make it look like nothing is\n" +
      "           wrong. Apply them (Supabase MCP `apply_migration`, `supabase db push`,\n" +
      "           or the dashboard SQL editor) before this reaches production.",
  );
  process.exit(1);
}

// only run when invoked as a script, so the pure helpers above stay importable
if (process.argv[1] && process.argv[1].endsWith("check-migrations.mjs")) {
  main().catch((error) => {
    console.error(`[db:check] FAILED — ${error.message}`);
    process.exit(1);
  });
}

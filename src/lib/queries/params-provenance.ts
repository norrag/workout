import { createHash } from "node:crypto";
import { engineParamsSchema, type EngineParams } from "@/lib/engine";

/**
 * Engine-params provenance & reproducibility (MCP tooling review P0-3).
 *
 * The bug: `engine_params.params` rows were stored *partial* (each migration
 * only wrote the keys it changed) and the admin reader re-ran them through
 * `engineParamsSchema.parse()`, which fills every missing key with **today's**
 * `.default()`. So an old version's gaps were silently back-filled with current
 * values — v2/v5/v6 all resolved to the same object and their diffs came up
 * empty, while v1 (which predates the schema) failed validation outright.
 *
 * The fix is to treat a params version as an immutable snapshot:
 *  - a version is *replayable* only when what was stored is already a complete
 *    materialization (deep-equals the parsed-with-defaults result) under the
 *    current schema — i.e. no default had to be injected to read it;
 *  - every newly proposed version stores the fully-materialized params plus a
 *    content hash, a schema version, and the engine build id, so it can be
 *    reproduced exactly later;
 *  - the reader stops masking partial legacy rows: it returns what was stored
 *    and flags non-replayable versions instead of emitting back-filled values.
 *
 * Hashing lives here (not in `src/lib/engine/`, which must stay pure of I/O)
 * but the canonicalization is deterministic so the same params always hash the
 * same way across the app, migrations, and tests.
 */

/** Bumped whenever `engineParamsSchema`'s *shape* changes incompatibly. */
// v3 adds the §5.4 `volume` block (MEV/MAV/MRV landmarks + experience scale).
// v4 adds the doc 13 rep-window block (weight_selection, grading, rep_window,
// rir_tolerance/rir_regress_gap, reps_predict, e1rm.anchor_method).
export const CURRENT_PARAMS_SCHEMA_VERSION = 4;

/** Deterministic JSON with recursively sorted object keys. Pure. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Stable content hash of a params object (sha256 of canonical JSON). */
export function hashParams(params: unknown): string {
  return createHash("sha256").update(canonicalize(params)).digest("hex");
}

/** The engine build identity, when the deploy exposes it (else null). */
export function engineCodeSha(): string | null {
  return (
    process.env.ENGINE_CODE_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    null
  );
}

export interface ParamsProvenance {
  schema_version: number;
  params_hash: string;
  /** true when the stored bytes are already a complete materialization */
  is_replayable: boolean;
  code_sha: string | null;
}

/**
 * Resolve a *stored* params blob into its replay status without mutating it.
 * `is_replayable` is true only when the row validates **and** carries every key
 * itself — so reading it injected no default and a replay reproduces exactly
 * what generation saw.
 */
export function resolveProvenance(
  stored: unknown,
  opts: { code_sha?: string | null } = {},
): ParamsProvenance {
  const parsed = engineParamsSchema.safeParse(stored);
  const complete =
    parsed.success && canonicalize(stored) === canonicalize(parsed.data);
  return {
    schema_version: parsed.success ? CURRENT_PARAMS_SCHEMA_VERSION : 1,
    params_hash: hashParams(stored),
    is_replayable: complete,
    code_sha: opts.code_sha ?? null,
  };
}

/**
 * Materialize a params object the way generation does — a deep clone with every
 * default resolved. Throws on invalid input (so it can never be activated).
 */
export function materializeParams(params: unknown): EngineParams {
  return engineParamsSchema.parse(params);
}

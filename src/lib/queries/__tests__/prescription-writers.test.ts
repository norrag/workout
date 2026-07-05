/**
 * N33 S3 — the prescription-write invariant, enforced as a source scan.
 *
 * A prescription (`workout_exercises.prescribed_*` / `target_rir`) may only be
 * written as an ENGINE output with recorded provenance (decision + dependency
 * fingerprint). The N33 defect was exactly a writer outside that set: the old
 * swap path wrote the user's PR raw, so the audit surface went incoherent and
 * the freshness framework certified numbers the engine never produced.
 *
 * This test pins the allowlist of modules that may build `prescribed_weight:`
 * write payloads. Adding a new writer here must come WITH engine computation +
 * decision + fingerprint stamping (use `slot-prescription.ts` for slot-level
 * writes) — extend the allowlist consciously, in the same PR, or route the
 * write through an existing path.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../../../../src");

/** Modules allowed to construct prescription write payloads. */
const ALLOWED = new Set([
  // generation (meso start / plan regeneration) — seeds with decisions
  "lib/queries/generation.ts",
  // week N→N+1 advance — prescribe() + decision per exercise
  "lib/queries/progression.ts",
  // the doc 14 freshness reconcile — recompute + decision + fingerprint
  "lib/queries/regeneration.ts",
  // swap/add slot writes — engine output from slot-prescription.ts (N33 S1)
  "lib/queries/logging.ts",
  // the generated DB types (a type definition, not a writer)
  "lib/types/database.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("prescription writers (N33 S3 invariant)", () => {
  it("only allowlisted modules build prescribed_* write payloads", () => {
    const offenders = walk(SRC)
      .filter((p) => readFileSync(p, "utf8").includes("prescribed_weight:"))
      .map((p) => relative(SRC, p))
      .filter((p) => !ALLOWED.has(p));
    expect(offenders).toEqual([]);
  });
});

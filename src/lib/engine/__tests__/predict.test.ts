/**
 * WS-J client-bundle split: `predict.ts` is the zod-free predictor core the day
 * view imports directly. Two properties to hold forever:
 *
 *  1. The cores are byte-identical to the validating public API in
 *     `e1rm.ts`/`reps.ts` (same math, minus the parse) — the client predictor
 *     and the server prescription must never drift.
 *  2. `predict.ts` and `load.ts` stay free of runtime imports (zod / params),
 *     or the `/log` client chunk silently regresses by ~17 kB gz. `import type`
 *     is fine (erased at compile time).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "../params";
import { V11_PARAMS } from "./helpers";
import { estimateE1rm } from "../e1rm";
import {
  effectiveRepsForE1rm,
  predictRepsAtWeight,
  weightForRepsAtRir,
  impliedRirAtReps,
} from "../reps";
import {
  e1rmFactor,
  estimateE1rm as estimateE1rmCore,
  effectiveRepsForE1rm as effectiveRepsForE1rmCore,
  predictRepsAtWeight as predictRepsAtWeightCore,
  weightForRepsAtRir as weightForRepsAtRirCore,
  impliedRirAtReps as impliedRirAtRepsCore,
} from "../predict";

const PARAM_SETS = [DEFAULT_ENGINE_PARAMS, V11_PARAMS];

describe("predict.ts cores match the validating public API exactly", () => {
  it("estimateE1rm agrees across weights/reps/RIR (incl. null RIR + non-working input)", () => {
    for (const params of PARAM_SETS) {
      for (const [w, r, rir] of [
        [100, 8, 2],
        [225, 5, 0],
        [45, 20, 4],
        [135, 12, null],
        [0, 8, 2], // non-working → null
        [100, 0, 2], // non-working → null
      ] as const) {
        expect(estimateE1rmCore(w, r, rir, params.e1rm)).toEqual(
          estimateE1rm(w, r, rir, params),
        );
      }
    }
  });

  it("effectiveRepsForE1rm / predictRepsAtWeight / weightForRepsAtRir / impliedRirAtReps agree", () => {
    for (const params of PARAM_SETS) {
      const anchor = estimateE1rm(120, 8, 2, params)!.value;
      for (const w of [80, 100, 110, 119]) {
        expect(effectiveRepsForE1rmCore(anchor, w, params.e1rm)).toBe(
          effectiveRepsForE1rm(anchor, w, params),
        );
        for (const rir of [0, 2, 3]) {
          expect(predictRepsAtWeightCore(anchor, w, rir, params.e1rm)).toBe(
            predictRepsAtWeight(anchor, w, rir, params),
          );
          expect(impliedRirAtRepsCore(anchor, w, 8, params.e1rm)).toBe(
            impliedRirAtReps(anchor, w, 8, params),
          );
        }
      }
      for (const reps of [5, 8, 12]) {
        expect(weightForRepsAtRirCore(anchor, reps, 2, params.e1rm)).toBe(
          weightForRepsAtRir(anchor, reps, 2, params),
        );
      }
      // no-anchor null paths
      expect(predictRepsAtWeightCore(null, 100, 2, params.e1rm)).toBeNull();
      expect(weightForRepsAtRirCore(null, 8, 2, params.e1rm)).toBeNull();
      expect(impliedRirAtRepsCore(null, 100, 8, params.e1rm)).toBeNull();
    }
  });
});

describe("client-chunk import guard (WS-J)", () => {
  const engineDir = join(__dirname, "..");
  // a runtime (non-`import type`) import of zod or ./params would pull the
  // schema layer — and zod — back into the day-view client bundle
  const RUNTIME_IMPORT = /^import\s+(?!type\s)[^;]*?from\s+["'](zod|\.\/params)["']/m;

  it.each(["predict.ts", "load.ts"])("%s has no runtime zod/params import", (file) => {
    const src = readFileSync(join(engineDir, file), "utf8");
    expect(src).not.toMatch(RUNTIME_IMPORT);
    expect(src).not.toMatch(/require\(/);
  });
});

describe("e1rmFactor monotonicity (R24)", () => {
  // the rep-prediction bisection and the closed-form inverse both assume
  // k(effReps) strictly increases; the schema caps brzycki_max_eff_reps at 10
  // (the Epley/Brzycki crossing) so the switch can never jump k downward.
  it("k(effReps) is strictly increasing under the capped cutoff (10)", () => {
    const cfg = { brzycki_max_eff_reps: 10 };
    let prev = e1rmFactor(0, cfg);
    for (let r = 0.25; r <= 35.5; r += 0.25) {
      const k = e1rmFactor(r, cfg);
      expect(k).toBeGreaterThan(prev);
      prev = k;
    }
  });

  it("k(effReps) is monotonic (never decreasing) under the legacy absent-cutoff rule", () => {
    const cfg = { brzycki_max_eff_reps: undefined };
    let prev = e1rmFactor(0, cfg);
    for (let r = 0.25; r <= 35.5; r += 0.25) {
      const k = e1rmFactor(r, cfg);
      expect(k).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
  });

  it("asking for more reps never prescribes a heavier load (inverse consistency)", () => {
    const cfg = DEFAULT_ENGINE_PARAMS.e1rm;
    let prevW = Infinity;
    for (let reps = 1; reps <= 20; reps += 1) {
      const w = weightForRepsAtRirCore(200, reps, 2, cfg);
      expect(w).not.toBeNull();
      expect(w!).toBeLessThan(prevW);
      prevW = w!;
    }
  });
});

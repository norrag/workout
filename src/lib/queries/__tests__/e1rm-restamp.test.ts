/**
 * T-N33 (owner decision 2026-07-04): stored per-set e1RM stamps restamp on
 * params activation when the e1rm block changed. The pure planners are tested
 * here; the pager is thin I/O. The golden case is the owner's own confusion:
 * 245×15 stamped 384.2 under the pre-v11 averaged formula must restamp to
 * 367.5 (Epley-only past the v11 `brzycki_max_eff_reps = 10` cutoff).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "@/lib/engine";
import { V11_PARAMS, V18_PARAMS } from "@/lib/engine/__tests__/helpers";
import {
  e1rmBlockChanged,
  planRestamps,
  type RestampSetRow,
} from "../e1rm-restamp";

const PRE_V11 = DEFAULT_ENGINE_PARAMS as EngineParams;

function row(over: Partial<RestampSetRow>): RestampSetRow {
  return {
    id: "s1",
    weight: 245,
    reps: 15,
    rir_reported: null,
    e1rm: 384.2,
    e1rm_confidence: "low", // 15 reps, unreported RIR → low
    ...over,
  };
}

describe("e1rmBlockChanged", () => {
  it("detects the v10 → v11 e1rm-block change (Brzycki cutoff)", () => {
    expect(e1rmBlockChanged(PRE_V11, V11_PARAMS)).toBe(true);
  });

  it("ignores activations that leave the e1rm block untouched (v17 → v18)", () => {
    const v17 = { ...V18_PARAMS, session_fatigue_dampen_threshold: 3 };
    expect(e1rmBlockChanged(v17, V18_PARAMS)).toBe(false);
  });

  it("treats an unresolvable previous version as changed (idempotent restamp)", () => {
    expect(e1rmBlockChanged(null, V18_PARAMS)).toBe(true);
  });
});

describe("planRestamps", () => {
  it("restamps the owner's 245×15 from the averaged 384.2 to the Epley-only 367.5", () => {
    const plan = planRestamps([row({})], V18_PARAMS.e1rm);
    expect(plan).toHaveLength(1);
    expect(plan[0].e1rm).toBe(367.5);
  });

  it("skips rows whose stamp already matches (idempotent second pass)", () => {
    const plan = planRestamps([row({ e1rm: 367.5 })], V18_PARAMS.e1rm);
    expect(plan).toEqual([]);
  });

  it("keeps non-working rows null (weight/reps ≤ 0), matching log time", () => {
    const plan = planRestamps(
      [row({ id: "bw", weight: 0, reps: 12, e1rm: 111 })],
      V18_PARAMS.e1rm,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].e1rm).toBeNull();
  });

  it("leaves an already-null stamp on a bodyweight row untouched", () => {
    expect(
      planRestamps(
        [row({ weight: 0, reps: 12, e1rm: null, e1rm_confidence: null })],
        V18_PARAMS.e1rm,
      ),
    ).toEqual([]);
  });

  it("uses the reported RIR when present (effective reps = reps + rir·offset)", () => {
    // 245×8 @ 2 RIR → eff 10 ≤ cutoff → averaged Epley/Brzycki at 10 = ×4/3
    const plan = planRestamps(
      [row({ weight: 245, reps: 8, rir_reported: 2, e1rm: 1 })],
      V18_PARAMS.e1rm,
    );
    expect(plan[0].e1rm).toBeCloseTo(326.7, 1);
  });
});

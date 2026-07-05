/**
 * R24 — hold-week reprice-down (owner concern 2026-07-02), the two v19 gates:
 *
 *   climb_requires_rir_step   the Option-A +1 rep climb runs only on a week the
 *                             target RIR actually stepped down; on a ramp-hold
 *                             week (the default 3→2→2→1 ramp's 2→2) reps hold,
 *                             so the load holds instead of repricing DOWN.
 *   hold_week_anchor_deadband a pure hold absorbs an anchor-decay shortfall of
 *                             less than one loadable step; a full step or more
 *                             is real signal and passes through.
 *
 * Both `.optional()` — absent ⇒ the prior (v18) behavior, pinned here too so
 * the legacy path can't drift while the flags await activation. Loads are
 * realistic (245 lb): on a 5-lb step the +1-rep reprice is ~6 lb, so rounding
 * can't mask the move the way it does at 100 lb.
 */
import { describe, expect, it } from "vitest";
import { prescribe } from "../index";
import { estimateE1rm } from "../e1rm";
import type { EngineInputs } from "../types";
import { baseInputs, V18_PARAMS, V19_PARAMS } from "./helpers";

// anchor flat with 245 lb × 9 reps @ 2 RIR — a clean mid-meso state on the
// default ramp after the week-2 climb
const flatAnchor = {
  value: estimateE1rm(245, 9, 2, V18_PARAMS)!.value,
  confidence: "high" as const,
};

/** week 3 of the default 3→2→2→1 ramp: target RIR holds at 2 */
function holdWeek(over: Partial<EngineInputs> = {}): EngineInputs {
  return baseInputs({
    strengthAnchor: flatAnchor,
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 245, reps: 9, sets: 3, targetRir: 2 },
    actualSets: [1, 2, 3].map((n) => ({
      setNumber: n,
      weight: 245,
      reps: 9,
      rirReported: 2,
      isWarmup: false,
    })),
    ...over,
  });
}

describe("R24a — climb gated on the RIR step", () => {
  it("v18 (legacy) reprices the load DOWN on a ramp-hold week — the bug", () => {
    const out = prescribe(holdWeek(), V18_PARAMS);
    // +1 rep at an unchanged RIR ⇒ more effective reps ⇒ lighter load: the
    // "−5 lb, +1 rep" lateral move the owner flagged
    expect(out.weight!).toBeLessThan(245);
  });

  it("v19 holds reps AND load when the RIR holds", () => {
    const out = prescribe(holdWeek(), V19_PARAMS);
    expect(out.weight).toBe(245);
    expect(out.reps).toBe(9);
    expect(out.targetRir).toBe(2);
  });

  it("v19 still climbs +1 on a genuine RIR-step week (doc 13 §9.2 unchanged)", () => {
    const stepAnchor = {
      value: estimateE1rm(245, 8, 3, V18_PARAMS)!.value,
      confidence: "high" as const,
    };
    const out = prescribe(
      baseInputs({
        strengthAnchor: stepAnchor,
        week: { targetRir: 2, isDeload: false }, // 3 → 2: stepped
        previous: { weight: 245, reps: 8, sets: 3, targetRir: 3 },
        actualSets: [1, 2, 3].map((n) => ({
          setNumber: n,
          weight: 245,
          reps: 8,
          rirReported: 3,
          isWarmup: false,
        })),
      }),
      V19_PARAMS,
    );
    expect(out.weight).toBe(245);
    expect(out.reps).toBe(9); // 8 → 9
  });

  it("v19 top-of-window reset still fires on a hold week (double progression)", () => {
    // every set reached the window top (12) on a hold week — the load step is
    // earned by performance, not the ramp
    const topAnchor = {
      value: estimateE1rm(245, 12, 2, V18_PARAMS)!.value,
      confidence: "high" as const,
    };
    const out = prescribe(
      holdWeek({
        strengthAnchor: topAnchor,
        previous: { weight: 245, reps: 12, sets: 3, targetRir: 2 },
        actualSets: [1, 2, 3].map((n) => ({
          setNumber: n,
          weight: 245,
          reps: 12,
          rirReported: 2,
          isWarmup: false,
        })),
      }),
      V19_PARAMS,
    );
    expect(out.weight!).toBeGreaterThan(245); // reset to the window bottom ⇒ heavier
    expect(out.reps!).toBeLessThan(12);
  });

  it("v19 + climb_on_performed_reps: demonstrated extra reps still advance on a hold week", () => {
    // prescribed 9 but performed 10s across the board, and the anchor reflects
    // it — reps follow what was demonstrated even though the ramp held
    const provenAnchor = {
      value: estimateE1rm(245, 10, 2, V18_PARAMS)!.value,
      confidence: "high" as const,
    };
    const out = prescribe(
      holdWeek({
        strengthAnchor: provenAnchor,
        actualSets: [1, 2, 3].map((n) => ({
          setNumber: n,
          weight: 245,
          reps: 10,
          rirReported: 2,
          isWarmup: false,
        })),
      }),
      V19_PARAMS,
    );
    expect(out.weight).toBe(245);
    expect(out.reps).toBe(10); // performedMin, not a fabricated +1 beyond it
  });
});

describe("R24b — hold-week anchor-decay deadband", () => {
  it("absorbs a sub-step anchor drift: the handled load holds", () => {
    // ~1.5% decay ⇒ repriced ≈ 241 lb, a sub-5-lb shortfall on a 5-lb step
    const decayed = { value: flatAnchor.value * 0.985, confidence: "high" as const };
    const out = prescribe(holdWeek({ strengthAnchor: decayed }), V19_PARAMS);
    expect(out.weight).toBe(245);
    expect(out.reps).toBe(9);
    expect(out.trace.some((t) => t.detail.includes("hold-week deadband"))).toBe(
      true,
    );
  });

  it("v18 (legacy) lets the same drift reprice the hold down — the bug", () => {
    const decayed = { value: flatAnchor.value * 0.985, confidence: "high" as const };
    const out = prescribe(holdWeek({ strengthAnchor: decayed }), V18_PARAMS);
    expect(out.weight!).toBeLessThan(245);
  });

  it("a full-step fall is real signal and passes through", () => {
    // ~10% fall ⇒ repriced ≈ 220 lb, a ≥ one-step drop: demonstrated regression
    const fallen = { value: flatAnchor.value * 0.9, confidence: "high" as const };
    const out = prescribe(holdWeek({ strengthAnchor: fallen }), V19_PARAMS);
    expect(out.weight!).toBeLessThan(245);
    expect(
      out.trace.some((t) => t.detail.includes("hold-week deadband")),
    ).toBe(false);
  });

  it("a rising anchor still reprices UP on a hold week (never blocks progress)", () => {
    const stronger = { value: flatAnchor.value * 1.12, confidence: "high" as const };
    const out = prescribe(holdWeek({ strengthAnchor: stronger }), V19_PARAMS);
    expect(out.weight!).toBeGreaterThan(245);
  });
});

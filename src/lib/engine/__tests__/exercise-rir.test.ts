/**
 * Exercise-level RIR — the engine half (doc 21 §4.2/§4.3/§5, Phase 2).
 *
 * The whole policy is one substitution: the resolved slot RIR replaces the
 * week's on the inputs the pricing path reads. So the matrix here is
 *   (a) unset ⇒ byte-identical output and trace;
 *   (b) the §4.2 repricing golden, at the owner's 342.6 anchor;
 *   (c) symmetry — a LOWERED assignment prices up and reps still land inside
 *       the window (no rep-schedule reset, no special case);
 *   (d) the unbounded ask (§4.3);
 *   (e) the earn gate (§5) and its miss-throttle parity.
 */
import { describe, expect, it } from "vitest";
import { prescribe, seedMeso } from "../index";
import { weightForRepsAtRir } from "../reps";
import type { EngineInputs, Prescription } from "../types";
import { V19_PARAMS, V20_PARAMS, baseInputs } from "./helpers";

/** The owner's worked case (§4.2): 265 × 9 @ 0 RIR ⇒ an e1RM anchor of 342.6. */
const OWNER_ANCHOR = 342.6;

function ownerCase(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return baseInputs({
    goalType: "hypertrophy", // window 8–12
    week: { targetRir: 0, isDeload: false },
    previous: { weight: 265, reps: 9, sets: 3, targetRir: 0 },
    actualSets: [1, 2, 3].map((n) => ({
      setNumber: n,
      weight: 265,
      reps: 9,
      rirReported: 0,
      isWarmup: false,
    })),
    strengthAnchor: { value: OWNER_ANCHOR, confidence: "high" },
    ...overrides,
  });
}

function loadRule(p: Prescription): string {
  return p.trace.find((s) => s.rule === "load")?.detail ?? "";
}

// ---------------------------------------------------------------------------
// (a) unset ⇒ nothing observable changed
// ---------------------------------------------------------------------------

describe("unassigned slots are byte-identical (§7.1)", () => {
  it("omitting exerciseRir and passing null produce the same prescription", () => {
    const withoutKey = prescribe(ownerCase(), V19_PARAMS);
    const explicitNull = prescribe(
      ownerCase({ exerciseRir: null }),
      V19_PARAMS,
    );
    expect(explicitNull).toEqual(withoutKey);
  });

  it("an assignment EQUAL to the week's RIR is also a no-op", () => {
    const base = prescribe(ownerCase(), V19_PARAMS);
    const assignedSame = prescribe(ownerCase({ exerciseRir: 0 }), V19_PARAMS);
    expect(assignedSame).toEqual(base);
  });
});

// ---------------------------------------------------------------------------
// (b) the §4.2 repricing golden
// ---------------------------------------------------------------------------

describe("§4.2 repricing golden — the owner's 342.6 anchor at RIR 8", () => {
  // the doc's table: the load the existing pricing path picks for each rep
  // position in the 8–12 window. Reproduced exactly by `weightForRepsAtRir` —
  // the point of §4.2 being that NOTHING new computes this.
  it.each([
    [8, 223.4],
    [9, 218.7],
    [10, 214.1],
    [11, 209.8],
    [12, 205.6],
  ])("reps %i price at %f lb", (reps, expected) => {
    const w = weightForRepsAtRir(OWNER_ANCHOR, reps, 8, V19_PARAMS);
    expect(w).toBeCloseTo(expected, 1);
  });

  it("prescribes ~17% lighter at the held rep position, inside the window", () => {
    const assigned = prescribe(ownerCase({ exerciseRir: 8 }), V19_PARAMS);
    expect(assigned.targetRir).toBe(8);
    expect(assigned.weight!).toBeGreaterThan(205);
    expect(assigned.weight!).toBeLessThan(230);
    expect(assigned.reps!).toBeGreaterThanOrEqual(8);
    expect(assigned.reps!).toBeLessThanOrEqual(12);
    // the owner's estimate was "something like 215 × 8"; the mechanism agrees
    const drop = 1 - assigned.weight! / 265;
    expect(drop).toBeGreaterThan(0.13);
    expect(drop).toBeLessThan(0.25);
  });

  it("the prescription is priced FROM reps and RIR, so '265 for 1 rep' cannot occur", () => {
    for (const rir of [4, 6, 8, 12, 21]) {
      const p = prescribe(ownerCase({ exerciseRir: rir }), V19_PARAMS);
      expect(p.reps!).toBeGreaterThanOrEqual(6); // window hard min
      expect(p.reps!).toBeLessThanOrEqual(15); // window hard max
      expect(p.weight!).toBeLessThan(265);
    }
  });

  it("is monotone: a higher ask never prices heavier", () => {
    const loads = [0, 2, 4, 6, 8].map(
      (rir) => prescribe(ownerCase({ exerciseRir: rir }), V19_PARAMS).weight!,
    );
    for (let i = 1; i < loads.length; i++) {
      expect(loads[i]).toBeLessThanOrEqual(loads[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// (c) symmetry — the rejected centered-reps rule would have fired here
// ---------------------------------------------------------------------------

describe("symmetry: a LOWERED assignment pushes harder (§4.2)", () => {
  const easyWeek = (overrides: Partial<EngineInputs> = {}) =>
    ownerCase({
      week: { targetRir: 3, isDeload: false },
      previous: { weight: 240, reps: 9, sets: 3, targetRir: 3 },
      actualSets: [1, 2, 3].map((n) => ({
        setNumber: n,
        weight: 240,
        reps: 9,
        rirReported: 3,
        isWarmup: false,
      })),
      ...overrides,
    });

  it("prices UP and keeps reps inside the window", () => {
    const rampWeek = prescribe(easyWeek(), V19_PARAMS);
    const pushed = prescribe(easyWeek({ exerciseRir: 0 }), V19_PARAMS);
    expect(pushed.targetRir).toBe(0);
    expect(pushed.weight!).toBeGreaterThan(rampWeek.weight!);
    expect(pushed.reps!).toBeGreaterThanOrEqual(6);
    expect(pushed.reps!).toBeLessThanOrEqual(15);
  });

  it("does not reset the rep schedule — the load moves, the reps stay in the window", () => {
    const pushed = prescribe(easyWeek({ exerciseRir: 0 }), V19_PARAMS);
    // the rejected rule forced window-centered reps whenever the RIR differed;
    // the actual rule leaves the Option-A schedule alone
    expect(loadRule(pushed)).toContain("at 0 RIR");
  });
});

// ---------------------------------------------------------------------------
// (d) deload + the unbounded ask
// ---------------------------------------------------------------------------

describe("deload weeks and the unbounded ask (§4.1/§4.3)", () => {
  const deloadWeek = (overrides: Partial<EngineInputs> = {}) =>
    ownerCase({
      week: { targetRir: 6, isDeload: true },
      weekPeak: { weight: 265, reps: 9, sets: 3, targetRir: 0 },
      ...overrides,
    });

  it("an assignment wins over the deload RIR, including downward", () => {
    const plain = prescribe(deloadWeek(), V19_PARAMS);
    expect(plain.targetRir).toBe(6);
    const hardened = prescribe(deloadWeek({ exerciseRir: 3 }), V19_PARAMS);
    expect(hardened.targetRir).toBe(3);
    expect(hardened.weight!).toBeGreaterThan(plain.weight!);
  });

  it("prices an ask far past the old 0–8 ceiling without a special case", () => {
    const deep = prescribe(ownerCase({ exerciseRir: 21 }), V19_PARAMS);
    expect(deep.targetRir).toBe(21);
    expect(deep.weight!).toBeGreaterThan(0);
    expect(deep.weight!).toBeLessThan(200);
    expect(deep.reps).not.toBeNull();
  });

  it("the seed route makes the same substitution", () => {
    const plain = seedMeso(
      null,
      { weight: 200, reps: 8, sets: 3 },
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      2,
      V19_PARAMS,
      { goalType: "hypertrophy", anchor: { value: OWNER_ANCHOR, confidence: "high" } },
    );
    const assigned = seedMeso(
      null,
      { weight: 200, reps: 8, sets: 3 },
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      2,
      V19_PARAMS,
      {
        goalType: "hypertrophy",
        anchor: { value: OWNER_ANCHOR, confidence: "high" },
        exerciseRir: 8,
      },
    );
    expect(plain.targetRir).toBe(2);
    expect(assigned.targetRir).toBe(8);
    expect(assigned.weight!).toBeLessThan(plain.weight!);
  });
});

// ---------------------------------------------------------------------------
// (e) the earn gate (§5)
// ---------------------------------------------------------------------------

const PERMISSIVE_HISTORY = {
  earnedThisMicrocycle: false,
  trailing30dPrescribedGainPct: null,
  consecutiveMissedEarns: 0,
};

/** A fully-compliant advance that earns under v20 (goal `gain`, factor 0.75). */
function earningCase(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return baseInputs({
    goalType: "gain",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 200, reps: 9, sets: 3, targetRir: 3 },
    actualSets: [1, 2, 3].map((n) => ({
      setNumber: n,
      weight: 200,
      reps: 9,
      rirReported: 3,
      isWarmup: false,
    })),
    strengthAnchor: { value: 300, confidence: "high" },
    progressionHistory: PERMISSIVE_HISTORY,
    daysSincePreviousSession: 3,
    ...overrides,
  });
}

function progressionStep(p: Prescription) {
  return p.trace.find((s) => s.rule === "progression");
}

describe("earn gate (§5)", () => {
  it("earns normally with no assignment", () => {
    expect(progressionStep(prescribe(earningCase(), V20_PARAMS))?.status).toBe(
      "stepped",
    );
  });

  it("does NOT earn while an assignment eases the slot", () => {
    const step = progressionStep(
      prescribe(earningCase({ exerciseRir: 6 }), V20_PARAMS),
    );
    expect(step?.status).toBe("not_earned");
    expect(step?.predicate).toBe("exercise_rir");
  });

  it("still earns when the assignment HARDENS the slot — that work is measured", () => {
    const step = progressionStep(
      prescribe(earningCase({ exerciseRir: 0 }), V20_PARAMS),
    );
    expect(step?.status).toBe("stepped");
  });

  it("an assignment equal to the week's RIR does not gate", () => {
    expect(
      progressionStep(prescribe(earningCase({ exerciseRir: 2 }), V20_PARAMS))
        ?.status,
    ).toBe("stepped");
  });

  it("miss-throttle parity: a backed-off week never records a `stepped` ask", () => {
    // the throttle pairs a `stepped` ask with the next decision's compliance
    // verdict (queries/progression-history.ts). A backed-off week can only
    // record `not_earned`, so it can neither earn nor arm the throttle —
    // the same way a deload week can't.
    for (const rir of [4, 8, 21]) {
      const step = progressionStep(
        prescribe(earningCase({ exerciseRir: rir }), V20_PARAMS),
      );
      expect(step?.status).toBe("not_earned");
    }
  });

  it("a genuine compliance miss is still named a miss under an assignment", () => {
    // compliance is a verdict on the session already PERFORMED, so the upcoming
    // week's assignment must not launder it into `exercise_rir`
    const missed = earningCase({
      exerciseRir: 8,
      actualSets: [1, 2, 3].map((n) => ({
        setNumber: n,
        weight: 200,
        reps: 5,
        rirReported: 3,
        isWarmup: false,
      })),
    });
    expect(progressionStep(prescribe(missed, V20_PARAMS))?.predicate).toBe(
      "compliance",
    );
  });

  it("the backed-off prescription itself is still repriced, not held", () => {
    const gated = prescribe(earningCase({ exerciseRir: 6 }), V20_PARAMS);
    expect(gated.targetRir).toBe(6);
    expect(gated.weight!).toBeLessThan(
      prescribe(earningCase(), V20_PARAMS).weight!,
    );
  });
});

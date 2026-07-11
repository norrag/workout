/**
 * doc 17 §4.2 (N40) — retrospective fold goldens: verdict per band position,
 * the fixed vocabulary, insufficient-data rules, the informational strength
 * row on mass-goal macros, the never-proxy-graded mass row, and the
 * demand-summary combiner. Pure — the assembly I/O lives in
 * `getMacroOverview` (hosted integration smoke + e2e).
 */
import { describe, expect, it } from "vitest";
import {
  combineDemandSummaries,
  macroRetrospective,
  type RetroAdherence,
  type RetroBlocks,
  type RetroContract,
  type RetroStrengthInput,
} from "../macro-retrospective";
import type { ProgressionAuditSummary } from "../progression-history";

const strengthContract: RetroContract = {
  goalType: "strength",
  targetLow: 4,
  targetHigh: 8,
  targetUnit: "%",
  targetDirection: "gain",
};

const hypertrophyContract: RetroContract = {
  goalType: "hypertrophy",
  targetLow: 4,
  targetHigh: 8,
  targetUnit: "lb",
  targetDirection: "gain",
};

const cutContract: RetroContract = {
  goalType: "cut",
  targetLow: 8,
  targetHigh: 14,
  targetUnit: "lb",
  targetDirection: "loss",
};

function strengthInput(
  estStrengthPct: number | null,
  qualifyingLifts = 5,
): RetroStrengthInput {
  return {
    estStrengthPct,
    qualifyingLifts,
    minQualifyingLifts: 3,
    muscles: [
      { muscleGroup: "Chest", scorePct: 6.5, lifts: 2 },
      { muscleGroup: "Back", scorePct: 5.1, lifts: 3 },
    ],
  };
}

const adherence: RetroAdherence = {
  adherencePct: 92,
  sessionsLogged: 60,
  totalVolume: 200_000,
};

const blocks: RetroBlocks = { completed: 4, abandoned: 1, notBuilt: 2 };

const fold = (
  contract: RetroContract,
  strength: RetroStrengthInput,
  bodyData: Parameters<typeof macroRetrospective>[5] = null,
) => macroRetrospective(contract, strength, null, adherence, blocks, bodyData);

describe("macroRetrospective — strength verdict vs the contract band", () => {
  it("grades within / above / below (band endpoints inclusive)", () => {
    expect(fold(strengthContract, strengthInput(6)).strength.verdict).toBe(
      "within band",
    );
    expect(fold(strengthContract, strengthInput(4)).strength.verdict).toBe(
      "within band",
    );
    expect(fold(strengthContract, strengthInput(8)).strength.verdict).toBe(
      "within band",
    );
    expect(fold(strengthContract, strengthInput(9.3)).strength.verdict).toBe(
      "above band",
    );
    expect(fold(strengthContract, strengthInput(1.2)).strength.verdict).toBe(
      "below band",
    );
  });

  it("reads insufficient data on a null headline, too few qualifying lifts, or a missing band", () => {
    expect(fold(strengthContract, strengthInput(null)).strength.verdict).toBe(
      "insufficient data",
    );
    // §4.2: < strength.min_sessions qualifying lifts
    expect(fold(strengthContract, strengthInput(6, 2)).strength.verdict).toBe(
      "insufficient data",
    );
    expect(
      fold({ ...strengthContract, targetLow: null }, strengthInput(6)).strength
        .verdict,
    ).toBe("insufficient data");
  });

  it("carries the contract band and muscles for display", () => {
    const r = fold(strengthContract, strengthInput(6));
    expect(r.strength.band).toEqual({ low: 4, high: 8 });
    expect(r.strength.informational).toBe(false);
    expect(r.strength.muscles).toHaveLength(2);
    // strength-denominated contract ⇒ no mass promise, no mass row
    expect(r.mass).toBeNull();
  });
});

describe("macroRetrospective — mass-goal macros", () => {
  it("the strength row is informational (never verdict-graded in lb terms)", () => {
    const r = fold(hypertrophyContract, strengthInput(6));
    expect(r.strength.informational).toBe(true);
    expect(r.strength.verdict).toBeNull();
    expect(r.strength.band).toBeNull();
    // the estimate itself still shows
    expect(r.strength.estStrengthPct).toBe(6);
  });

  it("the mass row reads NOT MEASURED without body data — never proxy-graded", () => {
    const r = fold(hypertrophyContract, strengthInput(6));
    expect(r.mass).toMatchObject({
      measured: false,
      verdict: null,
      measuredDeltaLb: null,
    });
    expect(r.mass!.note).toMatch(/not measured/);
    expect(r.mass!.note).toMatch(/bodyweight series|DEXA/);
  });

  it("measured body data bracketing the span grades the contract (Phase 4/5 seam)", () => {
    const gained = fold(hypertrophyContract, strengthInput(6), {
      measuredDeltaLb: 6,
      source: "bodyweight_log",
    });
    expect(gained.mass).toMatchObject({ measured: true, verdict: "within band" });

    // a loss-direction contract grades magnitude in the promised direction
    const cut = fold(cutContract, strengthInput(6), {
      measuredDeltaLb: -10,
      source: "dexa",
    });
    expect(cut.mass).toMatchObject({ measured: true, verdict: "within band" });

    const gainedNothing = fold(hypertrophyContract, strengthInput(6), {
      measuredDeltaLb: -2,
      source: "bodyweight_log",
    });
    expect(gainedNothing.mass!.verdict).toBe("below band");
  });
});

describe("macroRetrospective — pass-through blocks", () => {
  it("restates adherence/volume and the block-outcome mix", () => {
    const r = fold(strengthContract, strengthInput(6));
    expect(r.adherence).toEqual(adherence);
    expect(r.blocks).toEqual({ completed: 4, abandoned: 1, notBuilt: 2 });
    expect(r.demand).toBeNull();
  });
});

// --- combineDemandSummaries --------------------------------------------------

function summary(
  overrides: Partial<ProgressionAuditSummary> = {},
): ProgressionAuditSummary {
  return {
    decisions: 0,
    statusCounts: { stepped: 0, vanished: 0, paced: 0, not_earned: 0 },
    governorFirings: {},
    gateFailures: {},
    vanishedShare: null,
    earnedThenMet: 0,
    earnedThenMissed: 0,
    earnedUnanswered: 0,
    openAsk: false,
    prescribedGain: null,
    measuredGain: null,
    ...overrides,
  };
}

describe("combineDemandSummaries", () => {
  it("null while nothing is recorded (mode inactive over the span)", () => {
    expect(combineDemandSummaries([])).toBeNull();
    expect(combineDemandSummaries([summary(), summary()])).toBeNull();
  });

  it("sums per-exercise aggregates to the macro grain", () => {
    const out = combineDemandSummaries([
      summary({
        decisions: 10,
        statusCounts: { stepped: 5, vanished: 1, paced: 2, not_earned: 2 },
        governorFirings: { rate_pacer: 2 },
        gateFailures: { compliance: 2 },
        earnedThenMet: 4,
        earnedThenMissed: 1,
      }),
      summary({
        decisions: 6,
        statusCounts: { stepped: 2, vanished: 1, paced: 1, not_earned: 2 },
        governorFirings: { rate_pacer: 1 },
        gateFailures: { workload: 1, compliance: 1 },
        earnedThenMet: 1,
        earnedThenMissed: 1,
      }),
    ]);
    expect(out).toMatchObject({
      decisions: 16,
      stepped: 7,
      vanished: 2,
      paced: 3,
      notEarned: 4,
      governorFirings: { rate_pacer: 3 },
      gateFailures: { compliance: 3, workload: 1 },
      earnedThenMet: 5,
      earnedThenMissed: 2,
    });
    // vanished / (stepped + vanished) from the SUMS, not a mean of shares
    expect(out!.vanishedShare).toBe(0.22);
  });

  it("vanished share is null when nothing was ever earned", () => {
    const out = combineDemandSummaries([
      summary({
        decisions: 3,
        statusCounts: { stepped: 0, vanished: 0, paced: 0, not_earned: 3 },
      }),
    ]);
    expect(out!.vanishedShare).toBeNull();
  });
});

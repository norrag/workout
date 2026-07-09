/**
 * Prescribed progression (doc 16, Phase 1) — the §10 Phase-1 test matrix:
 * treadmill golden (fixed point absent / rising asks active), gate-arms per
 * goal, no-compounding + retry-not-stack, miss throttle, pacing arithmetic,
 * trace consistency, realized-ask bounds, e1RM-space compliance, full gate
 * matrix, replay determinism.
 */
import { describe, expect, it } from "vitest";
import { prescribe, recencyWeightedE1rm, type E1rmSample } from "../index";
import type { EngineInputs, Prescription, DecisionTraceStep } from "../types";
import type { EngineParams } from "../params";
import { V19_PARAMS, V20_PARAMS, baseInputs } from "./helpers";

const PERMISSIVE_HISTORY = {
  earnedThisMicrocycle: false,
  trailing30dPrescribedGainPct: null,
  consecutiveMissedEarns: 0,
};

function progressionSteps(p: Prescription): DecisionTraceStep[] {
  return p.trace.filter((s) => s.rule === "progression");
}

/** The v20 output must be the v19 output plus at most the progression trace
 *  step (and, where stated, a rationale suffix): prescription fields and the
 *  pre-existing trace byte-identical. */
function expectHeldIdentical(v20: Prescription, v19: Prescription) {
  expect({
    weight: v20.weight,
    reps: v20.reps,
    sets: v20.sets,
    targetRir: v20.targetRir,
  }).toEqual({
    weight: v19.weight,
    reps: v19.reps,
    sets: v19.sets,
    targetRir: v19.targetRir,
  });
  expect(v20.trace.filter((s) => s.rule !== "progression")).toEqual(v19.trace);
}

// ---------------------------------------------------------------------------
// simulation harness: perfect compliance, anchor recomputed from performed
// sets exactly the way the anchor query does (assumed RIR = prescribed target)
// ---------------------------------------------------------------------------

interface SimWeek {
  prescription: Prescription;
  anchorValue: number | null;
}

function performExactly(p: Prescription): EngineInputs["actualSets"] {
  return Array.from({ length: p.sets }, (_, i) => ({
    setNumber: i + 1,
    weight: p.weight!,
    reps: p.reps!,
    rirReported: null, // quick-log reality: scored at the prescribed target RIR
    isWarmup: false,
  }));
}

/**
 * Simulate `rirWeeks` working weeks from a seeded week-1 prescription under
 * exact compliance. Week 1 comes from the cold-start anchor branch at the
 * given anchor; each later week re-derives the anchor from ALL performed sets
 * (session_best, recency-weighted) and advances via prescribe().
 */
function simulateMeso(
  params: EngineParams,
  rirWeeks: number[],
  seedAnchor: number,
  goalType: EngineInputs["goalType"] = "hypertrophy",
): SimWeek[] {
  const weeks: SimWeek[] = [];
  const samples: E1rmSample[] = [];
  let previous: Prescription | null = null;

  for (let w = 0; w < rirWeeks.length; w++) {
    const anchor =
      w === 0
        ? { value: seedAnchor, confidence: "moderate" as const }
        : recencyWeightedE1rm(
            samples.map((s) => ({
              ...s,
              ageDays: (w - (s.ageDays as number)) * 7,
            })),
            params,
          );
    const inputs = baseInputs({
      goalType,
      week: { targetRir: rirWeeks[w], isDeload: false },
      previous: previous
        ? {
            weight: previous.weight,
            reps: previous.reps,
            sets: previous.sets,
            targetRir: previous.targetRir,
          }
        : null,
      actualSets: previous ? performExactly(previous) : [],
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: anchor,
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 7,
    });
    const prescription = prescribe(inputs, params);
    weeks.push({ prescription, anchorValue: anchor?.value ?? null });
    // perform it: bank the sets (ageDays temporarily stores the week index)
    for (let i = 0; i < prescription.sets; i++) {
      samples.push({
        weight: prescription.weight!,
        reps: prescription.reps!,
        targetRir: prescription.targetRir,
        ageDays: w,
        sessionKey: `week-${w}`,
      });
    }
    previous = prescription;
  }
  return weeks;
}

describe("treadmill golden (doc 16 §1/§7)", () => {
  const ramp = [3, 2, 1, 0];

  it("block absent: exact compliance is a fixed point — anchor pinned, load flat", () => {
    const weeks = simulateMeso(V19_PARAMS, ramp, 200);
    // week 1 seeds 145×8@3 (the review §3.2 table)
    expect(weeks[0].prescription.weight).toBe(145);
    expect(weeks[0].prescription.reps).toBe(8);
    // every later week reprices the unchanged anchor to the same bar weight
    for (const w of weeks.slice(1)) {
      expect(w.prescription.weight).toBe(145);
      expect(w.anchorValue).toBe(198.2); // measured e1RM pinned to the decimal
    }
    expect(weeks.map((w) => w.prescription.reps)).toEqual([8, 9, 10, 11]);
    // and no progression trace exists anywhere
    for (const w of weeks) {
      expect(progressionSteps(w.prescription)).toHaveLength(0);
    }
  });

  it("active: one earned step per microcycle, rising asks (the §7 worked example)", () => {
    const weeks = simulateMeso(V20_PARAMS, ramp, 200);
    // week 2: measured anchor 198.2, δ = min(6.8, 4.8) = 4.8 ⇒ A* = 203.0, and
    // the 5 lb lattice snaps the reprice up a plate: 150 × 9 @ 2
    const w2 = weeks[1].prescription;
    expect(weeks[1].anchorValue).toBe(198.2);
    expect(w2.weight).toBe(150);
    expect(w2.reps).toBe(9);
    const step2 = progressionSteps(w2)[0];
    expect(step2.status).toBe("stepped");
    expect(step2.deltaTarget).toBe(4.8);
    expect(step2.targetAnchor).toBe(203);
    expect(w2.rationale).toContain("earned overload: targeting e1RM 203");
    // performed exactly ⇒ measured e1RM 205.0, real and on prescription
    expect(weeks[2].anchorValue).toBe(205);
    // every working week carries exactly one status-coded progression step,
    // and the ask keeps rising while earned (weights never regress)
    for (let i = 0; i < weeks.length; i++) {
      expect(progressionSteps(weeks[i].prescription)).toHaveLength(1);
      if (i > 0) {
        expect(weeks[i].prescription.weight!).toBeGreaterThanOrEqual(
          weeks[i - 1].prescription.weight!,
        );
      }
    }
    // ...except at peak week (target RIR 0): the step is paced out
    const peak = progressionSteps(weeks[3].prescription)[0];
    expect(peak.status).toBe("paced");
    expect(peak.governor).toBe("peak_week");
    // week-over-week prescribed e1RM strictly rises across the earned weeks
    expect(weeks[1].anchorValue!).toBeGreaterThan(198.1);
    expect(weeks[2].anchorValue!).toBeGreaterThan(weeks[1].anchorValue!);
  });

  it("no-compounding: the target always derives from the MEASURED anchor (A + δ, never A + kδ)", () => {
    // week 2's led ask (150×9@2, targeting 203.0) missed by one honest rep
    const weeks = simulateMeso(V20_PARAMS, [3, 2], 200);
    const w2 = weeks[1].prescription;
    const missed = w2.reps! - 1;
    const inputs = baseInputs({
      goalType: "hypertrophy",
      week: { targetRir: 1, isDeload: false },
      previous: {
        weight: w2.weight,
        reps: w2.reps,
        sets: w2.sets,
        targetRir: w2.targetRir,
      },
      actualSets: Array.from({ length: w2.sets }, (_, i) => ({
        setNumber: i + 1,
        weight: w2.weight!,
        reps: missed,
        rirReported: null,
        isWarmup: false,
      })),
      exerciseFeedback: null,
      workoutFeedback: null,
      // the honest measurement: 150×8@2 ⇒ 200.0 (the §7 table's middle row)
      strengthAnchor: { value: 200, confidence: "moderate" },
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 7,
    });
    const next = prescribe(inputs, V20_PARAMS);
    const step = progressionSteps(next)[0];
    // the miss fails the earn gate — no step is taken, and nothing stacked
    expect(step.status).toBe("not_earned");
    expect(step.predicate).toBe("compliance");
    // and the held ask is byte-identical to the un-led engine's
    expectHeldIdentical(next, prescribe(inputs, V19_PARAMS));
  });
});

describe("the gate arms at the shipped defaults, per goal (§3.4)", () => {
  it("hypertrophy: a compliant session at a moderate anchor earns the step", () => {
    const weeks = simulateMeso(V20_PARAMS, [3, 2], 200, "hypertrophy");
    expect(progressionSteps(weeks[1].prescription)[0].status).toBe("stepped");
  });

  it("gain (alias) earns identically", () => {
    const weeks = simulateMeso(V20_PARAMS, [3, 2], 200, "gain");
    expect(progressionSteps(weeks[1].prescription)[0].status).toBe("stepped");
  });

  it("strength: a compliant session in the 3–5 window earns the step", () => {
    const inputs = baseInputs({
      goalType: "strength",
      week: { targetRir: 1, isDeload: false },
      previous: { weight: 275, reps: 4, sets: 3, targetRir: 2 },
      actualSets: [
        { setNumber: 1, weight: 275, reps: 4, rirReported: 2, isWarmup: false },
        { setNumber: 2, weight: 275, reps: 4, rirReported: 2, isWarmup: false },
        { setNumber: 3, weight: 275, reps: 4, rirReported: 2, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 324.7, confidence: "high" },
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 4,
    });
    const out = prescribe(inputs, V20_PARAMS);
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("stepped");
    // the ask genuinely rose vs the un-led engine
    const held = prescribe(inputs, V19_PARAMS);
    expect(out.weight!).toBeGreaterThan(held.weight!);
  });

  for (const goal of ["cut", "maintain"] as const) {
    it(`${goal}: factor 0 ⇒ no trace step and byte-identical output`, () => {
      const weeks19 = simulateMeso(V19_PARAMS, [3, 2, 2], 200, goal);
      const weeks20 = simulateMeso(V20_PARAMS, [3, 2, 2], 200, goal);
      for (let i = 0; i < weeks19.length; i++) {
        expect(weeks20[i].prescription).toEqual(weeks19[i].prescription);
      }
    });
  }
});

describe("retry-not-stack: a vanished earn re-arms un-stacked (§2.3/§3.3)", () => {
  const cappedBodyweight = () =>
    baseInputs({
      exercise: { equipmentType: "bodyweight", loadType: "bodyweight_only" },
      goalType: "hypertrophy",
      week: { targetRir: 2, isDeload: false },
      bodyweight: 180,
      previous: { weight: 180, reps: 15, sets: 3, targetRir: 2 },
      actualSets: [
        { setNumber: 1, weight: 180, reps: 15, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 180, reps: 15, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 180, reps: 15, rirReported: null, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 300, confidence: "moderate" },
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 7,
    });

  it("bodyweight_only at the window's hard rep cap: vanished, earn retained, nudge in the rationale", () => {
    const inputs = cappedBodyweight();
    const out = prescribe(inputs, V20_PARAMS);
    const held = prescribe(inputs, V19_PARAMS);
    // reps clamp at the hard max — the quantum has nowhere to go
    expect(out.reps).toBe(15);
    expect(out.weight).toBe(held.weight);
    expect(out.reps).toBe(held.reps);
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("vanished");
    expect(step.deltaRealized).toBe(0);
    expect(step.deltaTarget).toBeGreaterThan(0);
    // no overload claimed; the substitution nudge is the product answer
    expect(out.rationale).not.toContain("earned overload");
    expect(out.rationale).toMatch(/add load .* loadable variation/i);
    // retry, don't stack: the identical next session re-arms at A + δ again —
    // the intended quantum does not grow
    const again = prescribe(inputs, V20_PARAMS);
    expect(progressionSteps(again)[0].deltaTarget).toBe(step.deltaTarget);
  });
});

describe("governors (§3.5)", () => {
  const earnedInputs = (
    history: EngineInputs["progressionHistory"],
    weekRir = 2,
  ) =>
    baseInputs({
      goalType: "hypertrophy",
      week: { targetRir: weekRir, isDeload: false },
      previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
      actualSets: [
        { setNumber: 1, weight: 145, reps: 8, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 145, reps: 8, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 145, reps: 8, rirReported: null, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 198.2, confidence: "moderate" },
      progressionHistory: history,
      daysSincePreviousSession: 7,
    });

  it("cadence: at most one step per exercise per microcycle", () => {
    const out = prescribe(
      earnedInputs({ ...PERMISSIVE_HISTORY, earnedThisMicrocycle: true }),
      V20_PARAMS,
    );
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("paced");
    expect(step.governor).toBe("cadence");
    expectHeldIdentical(
      out,
      prescribe(
        earnedInputs({ ...PERMISSIVE_HISTORY, earnedThisMicrocycle: true }),
        V19_PARAMS,
      ),
    );
  });

  it("rate pacer: trailing ≥ lerp(band, band_position) × goal_rate_factor skips the step", () => {
    // intermediate band [1.5, 3], position 0.5 ⇒ 2.25; hypertrophy factor 0.75
    // ⇒ target 1.6875 %/mo
    const over = prescribe(
      earnedInputs({
        ...PERMISSIVE_HISTORY,
        trailing30dPrescribedGainPct: 1.7,
      }),
      V20_PARAMS,
    );
    expect(progressionSteps(over)[0].status).toBe("paced");
    expect(progressionSteps(over)[0].governor).toBe("rate_pacer");

    const under = prescribe(
      earnedInputs({
        ...PERMISSIVE_HISTORY,
        trailing30dPrescribedGainPct: 1.6,
      }),
      V20_PARAMS,
    );
    expect(progressionSteps(under)[0].status).toBe("stepped");
  });

  it("pacing arithmetic follows band_position", () => {
    // position 1.0 ⇒ intermediate hypertrophy target 3 × 0.75 = 2.25
    const topBand: EngineParams = {
      ...V20_PARAMS,
      progression: { ...V20_PARAMS.progression!, band_position: 1.0 },
    };
    const out = prescribe(
      earnedInputs({ ...PERMISSIVE_HISTORY, trailing30dPrescribedGainPct: 2.0 }),
      topBand,
    );
    expect(progressionSteps(out)[0].status).toBe("stepped");
    const floor: EngineParams = {
      ...V20_PARAMS,
      progression: { ...V20_PARAMS.progression!, band_position: 0.0 },
    };
    // position 0 ⇒ target 1.5 × 0.75 = 1.125 ⇒ trailing 2.0 is over
    const paced = prescribe(
      earnedInputs({ ...PERMISSIVE_HISTORY, trailing30dPrescribedGainPct: 2.0 }),
      floor,
    );
    expect(progressionSteps(paced)[0].governor).toBe("rate_pacer");
  });

  it("miss throttle: ≥2 earned-then-missed cycles pace the step out", () => {
    const out = prescribe(
      earnedInputs({ ...PERMISSIVE_HISTORY, consecutiveMissedEarns: 2 }),
      V20_PARAMS,
    );
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("paced");
    expect(step.governor).toBe("miss_throttle");
    // one miss does not throttle
    const one = prescribe(
      earnedInputs({ ...PERMISSIVE_HISTORY, consecutiveMissedEarns: 1 }),
      V20_PARAMS,
    );
    expect(progressionSteps(one)[0].status).toBe("stepped");
  });

  it("peak week (target RIR 0): the step is skipped", () => {
    const inputs = earnedInputs(PERMISSIVE_HISTORY, 0);
    inputs.previous!.targetRir = 1;
    const out = prescribe(inputs, V20_PARAMS);
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("paced");
    expect(step.governor).toBe("peak_week");
  });

  it("null history is permissive: the first step of a fresh record flows", () => {
    const out = prescribe(earnedInputs(null), V20_PARAMS);
    expect(progressionSteps(out)[0].status).toBe("stepped");
  });
});

describe("realized-ask bounds (§3.3)", () => {
  it("max_pct_per_step binds on the realized ask (coarse plate jump on a light lift)", () => {
    const incrementMode: EngineParams = {
      ...V20_PARAMS,
      progression: { ...V20_PARAMS.progression!, step: "increment" },
    };
    const inputs = baseInputs({
      exercise: { equipmentType: "dumbbell", loadType: "external" },
      goalType: "hypertrophy",
      week: { targetRir: 2, isDeload: false },
      previous: { weight: 25, reps: 10, sets: 3, targetRir: 3 },
      actualSets: [
        { setNumber: 1, weight: 25, reps: 10, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 25, reps: 10, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 25, reps: 10, rirReported: null, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 35.8, confidence: "moderate" },
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 7,
    });
    const out = prescribe(inputs, incrementMode);
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("paced");
    expect(step.governor).toBe("max_pct_per_step");
    // behavior held to today's
    expectHeldIdentical(out, prescribe(inputs, V19_PARAMS));
  });

  it("with step 'min' the same lift realizes on the rep axis and stays under the cap", () => {
    const inputs = baseInputs({
      exercise: { equipmentType: "dumbbell", loadType: "external" },
      goalType: "hypertrophy",
      week: { targetRir: 2, isDeload: false },
      previous: { weight: 25, reps: 10, sets: 3, targetRir: 3 },
      actualSets: [
        { setNumber: 1, weight: 25, reps: 10, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 25, reps: 10, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 25, reps: 10, rirReported: null, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 35.8, confidence: "moderate" },
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 7,
    });
    const out = prescribe(inputs, V20_PARAMS);
    const held = prescribe(inputs, V19_PARAMS);
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("stepped");
    expect(out.weight).toBe(held.weight); // load held
    expect(out.reps!).toBe(held.reps! + 1); // one honest rep more
  });
});

describe("e1RM-space compliance (§3.4 / §5.3)", () => {
  const prescribed = { weight: 145, reps: 9, sets: 3, targetRir: 2 };
  const complianceInputs = (
    sets: EngineInputs["actualSets"],
  ): EngineInputs =>
    baseInputs({
      goalType: "hypertrophy",
      week: { targetRir: 1, isDeload: false },
      previous: prescribed,
      actualSets: sets,
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 198.2, confidence: "moderate" },
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 7,
    });

  it("an athlete-owned weight change UP meeting the target complies", () => {
    // 150 × 8 @ (assumed) 2 scores 200.0 ≥ the prescribed 198.2 − band
    const out = prescribe(
      complianceInputs([
        { setNumber: 1, weight: 150, reps: 8, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 150, reps: 8, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 150, reps: 8, rirReported: null, isWarmup: false },
      ]),
      V20_PARAMS,
    );
    expect(progressionSteps(out)[0].status).toBe("stepped");
  });

  it("an athlete-owned weight change DOWN meeting the target complies", () => {
    // 140 × 10 @ (assumed) 2 scores 196.0, inside the ±1.5% band of 198.2
    const out = prescribe(
      complianceInputs([
        { setNumber: 1, weight: 140, reps: 10, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 140, reps: 10, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 140, reps: 10, rirReported: null, isWarmup: false },
      ]),
      V20_PARAMS,
    );
    expect(progressionSteps(out)[0].status).toBe("stepped");
  });

  it("a reported-low-RIR grind scores under and fails the earn (intrinsic grinder guard)", () => {
    const out = prescribe(
      complianceInputs([
        { setNumber: 1, weight: 145, reps: 9, rirReported: 0, isWarmup: false },
        { setNumber: 2, weight: 145, reps: 9, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 145, reps: 9, rirReported: null, isWarmup: false },
      ]),
      V20_PARAMS,
    );
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("not_earned");
    expect(step.predicate).toBe("compliance");
  });
});

describe("full gate matrix: each failing predicate ⇒ held output, first predicate named (§3.4)", () => {
  const compliantSets = (): EngineInputs["actualSets"] => [
    { setNumber: 1, weight: 145, reps: 8, rirReported: null, isWarmup: false },
    { setNumber: 2, weight: 145, reps: 8, rirReported: null, isWarmup: false },
    { setNumber: 3, weight: 145, reps: 8, rirReported: null, isWarmup: false },
  ];
  const gateInputs = (overrides: Partial<EngineInputs> = {}): EngineInputs =>
    baseInputs({
      goalType: "hypertrophy",
      week: { targetRir: 2, isDeload: false },
      previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
      actualSets: compliantSets(),
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 198.2, confidence: "moderate" },
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 7,
      ...overrides,
    });

  const cases: {
    name: string;
    overrides: Partial<EngineInputs>;
    predicate: string;
  }[] = [
    {
      name: "pain gate",
      overrides: { exerciseFeedback: { jointPain: 2, pump: 5, workload: 5 } },
      predicate: "pain",
    },
    {
      name: "session dampener",
      overrides: {
        workoutFeedback: {
          overallFatigue: 9,
          effortRating: 5,
          performanceRating: 2,
        },
      },
      predicate: "dampener",
    },
    {
      name: "workload hot",
      overrides: { exerciseFeedback: { jointPain: 0, pump: 5, workload: 9 } },
      predicate: "workload",
    },
    {
      name: "stale gap",
      overrides: { daysSincePreviousSession: 11 },
      predicate: "stale",
    },
    {
      name: "low anchor confidence",
      overrides: { strengthAnchor: { value: 198.2, confidence: "low" } },
      predicate: "confidence",
    },
    {
      name: "fewer working sets than prescribed",
      overrides: { actualSets: compliantSets().slice(0, 2) },
      predicate: "compliance",
    },
    {
      name: "a set under prescription",
      overrides: {
        actualSets: [
          ...compliantSets().slice(0, 2),
          { setNumber: 3, weight: 145, reps: 6, rirReported: null, isWarmup: false },
        ],
      },
      predicate: "compliance",
    },
    {
      name: "cold start (no previous session)",
      overrides: { previous: null, actualSets: [] },
      predicate: "no_previous_session",
    },
  ];

  for (const c of cases) {
    it(`${c.name} ⇒ not_earned:${c.predicate}, prescription held`, () => {
      const inputs = gateInputs(c.overrides);
      const out = prescribe(inputs, V20_PARAMS);
      const held = prescribe(inputs, V19_PARAMS);
      const step = progressionSteps(out)[0];
      expect(step.status).toBe("not_earned");
      expect(step.predicate).toBe(c.predicate);
      expectHeldIdentical(out, held);
      // a hold is never narrated as an overload
      expect(out.rationale).not.toContain("earned overload");
    });
  }

  it("deload weeks are not working prescriptions: no step, byte-identical", () => {
    const inputs = gateInputs({ week: { targetRir: 6, isDeload: true } });
    const out = prescribe(inputs, V20_PARAMS);
    expect(out).toEqual(prescribe(inputs, V19_PARAMS));
    expect(progressionSteps(out)).toHaveLength(0);
  });
});

describe("trace consistency (§3.6)", () => {
  it("exactly one status-coded step per working prescription; stepped announces, others do not", () => {
    const weeks = simulateMeso(V20_PARAMS, [3, 2, 2, 1], 200);
    for (const [i, w] of weeks.entries()) {
      const steps = progressionSteps(w.prescription);
      expect(steps).toHaveLength(1);
      const s = steps[0];
      expect(["stepped", "vanished", "paced", "not_earned"]).toContain(s.status);
      if (s.status === "stepped") {
        expect(w.prescription.rationale).toContain("earned overload");
        // an earned overload and a holding rule never co-occur for the same load
        expect(
          w.prescription.trace.some((t) => t.detail.includes("deadband")),
        ).toBe(false);
      } else {
        expect(w.prescription.rationale).not.toContain("earned overload");
      }
      if (i === 0) expect(s.predicate).toBe("no_previous_session");
    }
  });

  it("grading stays on the measured anchor even when stepped", () => {
    const weeks = simulateMeso(V20_PARAMS, [3, 2], 200);
    const w2 = weeks[1].prescription;
    expect(progressionSteps(w2)[0].status).toBe("stepped");
    const grade = w2.trace.find((s) => s.rule === "grade");
    const heldGrade = simulateMeso(V19_PARAMS, [3, 2], 200)[1].prescription.trace.find(
      (s) => s.rule === "grade",
    );
    expect(grade?.detail).toBe(heldGrade?.detail);
  });
});

describe("replay determinism / byte-identical discipline (§2.7)", () => {
  it("v19 and v20-with-block-removed produce identical outputs", () => {
    const noBlock: EngineParams = { ...V20_PARAMS };
    delete (noBlock as Record<string, unknown>).progression;
    const weeks19 = simulateMeso(V19_PARAMS, [3, 2, 1], 200);
    const weeksNo = simulateMeso(noBlock, [3, 2, 1], 200);
    for (let i = 0; i < weeks19.length; i++) {
      expect(weeksNo[i].prescription).toEqual(weeks19[i].prescription);
    }
  });

  it("historical (pre-v20) stored inputs replay deterministically under both params", () => {
    // a stored decision's inputs never carried the progression fields — the
    // JSON round trip is the storage shape
    const inputs = JSON.parse(
      JSON.stringify(
        baseInputs({
          goalType: "hypertrophy",
          week: { targetRir: 2, isDeload: false },
          previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
          actualSets: [
            { setNumber: 1, weight: 145, reps: 8, rirReported: null, isWarmup: false },
            { setNumber: 2, weight: 145, reps: 8, rirReported: null, isWarmup: false },
            { setNumber: 3, weight: 145, reps: 8, rirReported: null, isWarmup: false },
          ],
          strengthAnchor: { value: 198.2, confidence: "moderate" },
        }),
      ),
    ) as EngineInputs;
    expect(inputs).not.toHaveProperty("progressionHistory");
    const a = prescribe(inputs, V19_PARAMS);
    const b = prescribe(inputs, V19_PARAMS);
    expect(a).toEqual(b);
    const c = prescribe(inputs, V20_PARAMS);
    const d = prescribe(inputs, V20_PARAMS);
    expect(c).toEqual(d);
    // and the v20 replay differs from v19 ONLY by the progression trace step
    // (this stored session was fully compliant, so it steps)
    expect(progressionSteps(c)).toHaveLength(1);
  });

  it("mode 'off' behaves exactly like an absent block", () => {
    const off: EngineParams = {
      ...V20_PARAMS,
      progression: { ...V20_PARAMS.progression!, mode: "off" },
    };
    const weeks19 = simulateMeso(V19_PARAMS, [3, 2], 200);
    const weeksOff = simulateMeso(off, [3, 2], 200);
    for (let i = 0; i < weeks19.length; i++) {
      expect(weeksOff[i].prescription).toEqual(weeks19[i].prescription);
    }
  });
});

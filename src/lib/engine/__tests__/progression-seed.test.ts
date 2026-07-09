/**
 * Prescribed progression, Phase 2 — the seed route (doc 16 §3.7 / §10):
 * seed-route parity with the advance route (one gate, one arithmetic),
 * deload-boundary carry (incl. the staleness cutoff), the meso-over-meso
 * golden (the memo's acceptance case: meso N+1 week 1 asks more than meso N
 * week 1 under compliance), absent-block byte-identity, and the seed's
 * always-on status-coded trace.
 */
import { describe, expect, it } from "vitest";
import {
  prescribe,
  seedMeso,
  recencyWeightedE1rm,
  type E1rmSample,
  type SeedEarnContext,
} from "../index";
import type { EngineInputs, Prescription, DecisionTraceStep } from "../types";
import type { EngineParams } from "../params";
import { V19_PARAMS, V20_PARAMS, baseInputs } from "./helpers";

const PERMISSIVE_HISTORY = {
  earnedThisMicrocycle: false,
  trailing30dPrescribedGainPct: null,
  consecutiveMissedEarns: 0,
};

const EXTERNAL = { equipmentType: "barbell", loadType: "external" } as const;
const USER = { experienceLevel: "intermediate" } as const;

function progressionSteps(p: Prescription): DecisionTraceStep[] {
  return p.trace.filter((s) => s.rule === "progression");
}

function performExactly(p: Prescription): EngineInputs["actualSets"] {
  return Array.from({ length: p.sets }, (_, i) => ({
    setNumber: i + 1,
    weight: p.weight!,
    reps: p.reps!,
    rirReported: null,
    isWarmup: false,
  }));
}

/** A fully compliant earn context off a performed prescription. */
function earnFrom(p: Prescription): SeedEarnContext {
  return {
    previous: {
      weight: p.weight,
      reps: p.reps,
      sets: p.sets,
      targetRir: p.targetRir,
    },
    actualSets: performExactly(p),
    exerciseFeedback: null,
    workoutFeedback: null,
  };
}

/** Standard seed-route call (hypertrophy, RIR 3 start) with earn opts. */
function seed(
  params: EngineParams,
  opts: Parameters<typeof seedMeso>[6] = {},
): Prescription {
  return seedMeso(null, null, EXTERNAL, USER, 3, params, {
    goalType: "hypertrophy",
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// simulation harness (mirrors progression.test.ts): perfect compliance, the
// anchor recomputed from performed sets the way the anchor query does
// ---------------------------------------------------------------------------

interface SimMeso {
  weeks: Prescription[];
  /** recency anchor measured from everything performed, as of one week after
   *  the final working session (i.e. across the deload) */
  closeAnchor: { value: number; confidence: "high" | "moderate" | "low" };
}

function simulateMeso(
  params: EngineParams,
  rirWeeks: number[],
  seedAnchor: number,
): SimMeso {
  const weeks: Prescription[] = [];
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
          )!;
    const inputs = baseInputs({
      goalType: "hypertrophy",
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
    weeks.push(prescription);
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
  // the next meso seeds one deload week after the final working session
  const closeAnchor = recencyWeightedE1rm(
    samples.map((s) => ({
      ...s,
      ageDays: (rirWeeks.length - (s.ageDays as number)) * 7,
    })),
    params,
  )!;
  return { weeks, closeAnchor };
}

// ---------------------------------------------------------------------------

describe("seed route — absent ⇒ byte-identical (doc 16 §2.7)", () => {
  const anchor = { value: 198.2, confidence: "moderate" as const };
  const compliant = earnFrom({
    weight: 145,
    reps: 8,
    sets: 3,
    targetRir: 3,
    rationale: "",
    trace: [],
  });

  it("block absent: the earn opts are inert — output identical, no trace step", () => {
    const bare = seed(V19_PARAMS, { anchor });
    const withEarn = seed(V19_PARAMS, {
      anchor,
      earn: compliant,
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 8,
    });
    expect(withEarn).toEqual(bare);
    expect(progressionSteps(withEarn)).toHaveLength(0);
  });

  it("goal factor 0 (cut) emits no step and holds today's seed", () => {
    const out = seedMeso(null, null, EXTERNAL, USER, 3, V20_PARAMS, {
      goalType: "cut",
      anchor,
      earn: compliant,
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 8,
    });
    expect(out).toEqual(
      seedMeso(null, null, EXTERNAL, USER, 3, V19_PARAMS, {
        goalType: "cut",
        anchor,
      }),
    );
  });
});

describe("seed route — the earn gate + governors (shared with the advance chain)", () => {
  const anchor = { value: 198.2, confidence: "moderate" as const };
  const compliant = earnFrom({
    weight: 145,
    reps: 8,
    sets: 3,
    targetRir: 3,
    rationale: "",
    trace: [],
  });
  const earnedOpts = {
    anchor,
    earn: compliant,
    progressionHistory: PERMISSIVE_HISTORY,
    daysSincePreviousSession: 8,
  };

  it("earned at close: the seed prices off A* = A + δ and announces the target", () => {
    const unearned = seed(V19_PARAMS, { anchor });
    const out = seed(V20_PARAMS, earnedOpts);
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("stepped");
    expect(step.targetAnchor).toBe(203); // 198.2 + δ 4.8 (the §7 worked example)
    expect(step.deltaTarget).toBe(4.8);
    expect(out.rationale).toContain("earned overload: targeting e1RM 203");
    // the lattice snaps the reprice up a plate off the unearned 145
    expect(unearned.weight).toBe(145);
    expect(out.weight!).toBeGreaterThan(unearned.weight!);
  });

  it("parity with the advance route: same context ⇒ same quantum, same target anchor", () => {
    // the advance chain, fed the identical previous session + anchor, generating
    // the RIR-2 counterpart (Option-A holds effective reps constant, so the
    // quantum is evaluated at the same effective point as the seed's window-low)
    const advance = prescribe(
      baseInputs({
        goalType: "hypertrophy",
        week: { targetRir: 2, isDeload: false },
        previous: compliant.previous,
        actualSets: compliant.actualSets,
        exerciseFeedback: null,
        workoutFeedback: null,
        strengthAnchor: anchor,
        progressionHistory: PERMISSIVE_HISTORY,
        daysSincePreviousSession: 8,
      }),
      V20_PARAMS,
    );
    const seeded = seed(V20_PARAMS, earnedOpts);
    const aStep = progressionSteps(advance)[0];
    const sStep = progressionSteps(seeded)[0];
    expect(aStep.status).toBe("stepped");
    expect(sStep.status).toBe("stepped");
    expect(sStep.deltaTarget).toBe(aStep.deltaTarget);
    expect(sStep.targetAnchor).toBe(aStep.targetAnchor);
  });

  it("no compliance context (swap / cold start) ⇒ not_earned, prescription untouched", () => {
    const out = seed(V20_PARAMS, { anchor });
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("not_earned");
    expect(step.predicate).toBe("no_previous_session");
    const bare = seed(V19_PARAMS, { anchor });
    expect({ weight: out.weight, reps: out.reps, sets: out.sets }).toEqual({
      weight: bare.weight,
      reps: bare.reps,
      sets: bare.sets,
    });
    expect(out.rationale).toBe(bare.rationale); // a hold is never narrated as an overload
  });

  it("staleness cuts the carry: one day past max_gap_days ⇒ not_earned/stale", () => {
    const fresh = seed(V20_PARAMS, { ...earnedOpts, daysSincePreviousSession: 10 });
    expect(progressionSteps(fresh)[0].status).toBe("stepped");
    const stale = seed(V20_PARAMS, { ...earnedOpts, daysSincePreviousSession: 11 });
    const step = progressionSteps(stale)[0];
    expect(step.status).toBe("not_earned");
    expect(step.predicate).toBe("stale");
  });

  it("an incomplete final session does not earn (compliance, shared comparison)", () => {
    const short: SeedEarnContext = {
      ...compliant,
      actualSets: compliant.actualSets.map((s) => ({ ...s, reps: s.reps - 1 })),
    };
    const out = seed(V20_PARAMS, { ...earnedOpts, earn: short });
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("not_earned");
    expect(step.predicate).toBe("compliance");
  });

  it("a low anchor confidence does not earn", () => {
    const out = seed(V20_PARAMS, {
      ...earnedOpts,
      anchor: { value: 198.2, confidence: "low" },
    });
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("not_earned");
    expect(step.predicate).toBe("confidence");
  });

  it("the governors pace the seed too: a step already realized this microcycle", () => {
    const out = seed(V20_PARAMS, {
      ...earnedOpts,
      progressionHistory: { ...PERMISSIVE_HISTORY, earnedThisMicrocycle: true },
    });
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("paced");
    expect(step.governor).toBe("cadence");
  });

  it("the rate pacer meters the seed off the trailing prescribed gain", () => {
    const out = seed(V20_PARAMS, {
      ...earnedOpts,
      progressionHistory: {
        ...PERMISSIVE_HISTORY,
        trailing30dPrescribedGainPct: 99,
      },
    });
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("paced");
    expect(step.governor).toBe("rate_pacer");
  });

  it("a deload target week bypasses the wrapper entirely (neither earns nor steps)", () => {
    const out = seedMeso(null, null, EXTERNAL, USER, 6, V20_PARAMS, {
      goalType: "hypertrophy",
      anchor,
      isDeload: true,
      earn: compliant,
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 8,
    });
    expect(progressionSteps(out)).toHaveLength(0);
  });

  it("bodyweight_only at the rep cap: the earned step vanishes, earn retained, nudge shown", () => {
    const bwExercise = {
      equipmentType: "bodyweight",
      loadType: "bodyweight_only",
    } as const;
    const strong = { value: 300, confidence: "moderate" as const };
    const bwEarn: SeedEarnContext = {
      previous: { weight: 180, reps: 15, sets: 3, targetRir: 3 },
      actualSets: Array.from({ length: 3 }, (_, i) => ({
        setNumber: i + 1,
        weight: 180,
        reps: 15,
        rirReported: null,
        isWarmup: false,
      })),
      exerciseFeedback: null,
      workoutFeedback: null,
    };
    const out = seedMeso(null, null, bwExercise, USER, 3, V20_PARAMS, {
      goalType: "hypertrophy",
      anchor: strong,
      bodyweight: 180,
      earn: bwEarn,
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 8,
    });
    const step = progressionSteps(out)[0];
    expect(step.status).toBe("vanished");
    // the unearned prescription ships (reps already clamp at the window max)
    const bare = seedMeso(null, null, bwExercise, USER, 3, V19_PARAMS, {
      goalType: "hypertrophy",
      anchor: strong,
      bodyweight: 180,
    });
    expect(out.weight).toBe(bare.weight);
    expect(out.reps).toBe(bare.reps);
    expect(out.rationale).toContain("add load or progress to the loadable variation");
  });

  it("every active-mode seed carries exactly one status-coded step", () => {
    for (const p of [
      seed(V20_PARAMS, earnedOpts),
      seed(V20_PARAMS, { anchor }),
      seed(V20_PARAMS, { ...earnedOpts, daysSincePreviousSession: 30 }),
      seed(V20_PARAMS, {
        ...earnedOpts,
        progressionHistory: { ...PERMISSIVE_HISTORY, earnedThisMicrocycle: true },
      }),
    ]) {
      expect(progressionSteps(p)).toHaveLength(1);
    }
  });
});

describe("meso-over-meso golden (the memo's acceptance case, doc 16 §10 Phase 2)", () => {
  const ramp = [3, 2, 1, 0];

  it("block absent: meso N+1 week 1 is byte-identical to meso N week 1 forever", () => {
    const meso1 = simulateMeso(V19_PARAMS, ramp, 200);
    // fixed point: the anchor never moved, so the next meso's seed reproduces
    // week 1 exactly — even with the earn context supplied
    const seed2 = seedMeso(null, null, EXTERNAL, USER, 3, V19_PARAMS, {
      goalType: "hypertrophy",
      anchor: meso1.closeAnchor,
      earn: earnFrom(meso1.weeks[3]),
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 8,
    });
    expect(seed2.weight).toBe(meso1.weeks[0].weight);
    expect(seed2.reps).toBe(meso1.weeks[0].reps);
    expect(progressionSteps(seed2)).toHaveLength(0);
  });

  it("active: an earn at meso close carries across the deload — meso N+1 opens above meso N", () => {
    const meso1 = simulateMeso(V20_PARAMS, ramp, 200);
    // the anchor genuinely rose during meso 1 (performed led prescriptions)
    expect(meso1.closeAnchor.value).toBeGreaterThan(198.2);

    // the final working session was performed in full ⇒ earned at close; the
    // deload week between (8 days) neither earns nor consumes it (§3.7)
    const earn = earnFrom(meso1.weeks[3]);
    const seed2 = seedMeso(null, null, EXTERNAL, USER, 3, V20_PARAMS, {
      goalType: "hypertrophy",
      anchor: meso1.closeAnchor,
      earn,
      progressionHistory: PERMISSIVE_HISTORY,
      daysSincePreviousSession: 8,
    });
    const step = progressionSteps(seed2)[0];
    expect(step.status).toBe("stepped");
    expect(step.targetAnchor!).toBeGreaterThan(meso1.closeAnchor.value);

    // the acceptance case: meso 2 week 1 asks MORE than meso 1 week 1 — and
    // more than the unearned reprice of the same measured close anchor
    const unearned = seedMeso(null, null, EXTERNAL, USER, 3, V19_PARAMS, {
      goalType: "hypertrophy",
      anchor: meso1.closeAnchor,
    });
    expect(seed2.weight!).toBeGreaterThanOrEqual(unearned.weight!);
    expect(seed2.weight!).toBeGreaterThan(meso1.weeks[0].weight!);
  });
});

/**
 * doc 19 §5 semantic-facts projection. The two review scenarios are the
 * anchoring fixtures: the Hack Squat paced hold (the §5 worked example) and
 * the Bench Press low-confidence case, which MUST project `insufficient_data`
 * for the trend — never `plateau` — because e1RM confidence is low (§5.1, the
 * review's headline failure the gates exist to prevent).
 */
import { describe, expect, it } from "vitest";
import {
  buildExplanationFacts,
  formatWork,
  projectChange,
  projectLoadReason,
  projectPaceStatus,
  projectPrimaryReason,
  projectProgramContext,
  projectTrendStatus,
  type FactsContext,
  type FactsDecision,
} from "../explanation-facts";

// --- Hack Squat: the §5 worked example -------------------------------------
// week 4 of 5, target RIR 0, load holds, reps 10 → 11, earned step paced.
const hackSquatDecision: FactsDecision = {
  kind: "advance",
  isDeload: false,
  loadType: "external",
  ask: { weight: 112.5, reps: 11, sets: 3, targetRir: 0 },
  previous: { weight: 112.5, reps: 10, sets: 3, targetRir: 0 },
  trace: [
    { rule: "load", detail: "hold 112.5 lb, reps to 11" },
    {
      rule: "progression",
      detail: "earned; skipped by rate pacer",
      status: "paced",
      governor: "rate_pacer",
    },
  ],
};
const hackSquatContext: FactsContext = {
  exerciseName: "Hack Squat",
  muscleGroup: "quads",
  weekNumber: 4,
  mesoWeeks: 5,
  effortObserved: false,
  pain: { recurring: false, lastReportSessionsAgo: null },
  lastSessionNote: "severe burning pump, quads aching",
  lastSessionNoteAgeSessions: 1,
  trend: {
    window_days: 90,
    measuredGainPctPer30d: 1.8,
    prescribedGainPctPer30d: 1.4,
    comparableSessions: 6,
    e1rmConfidence: "high",
    comparable: true,
  },
};

describe("projectChange", () => {
  it("picks the salient axis (reps up on a paced hold)", () => {
    expect(projectChange(hackSquatDecision)).toBe("reps_increased");
  });

  it("prefers load over other axes, and reads a pure ramp as harder", () => {
    expect(
      projectChange({
        ...hackSquatDecision,
        ask: { weight: 115, reps: 11, sets: 3, targetRir: 0 },
      }),
    ).toBe("load_increased");
    expect(
      projectChange({
        ...hackSquatDecision,
        ask: { weight: 112.5, reps: 10, sets: 3, targetRir: 1 },
        previous: { weight: 112.5, reps: 10, sets: 3, targetRir: 2 },
      }),
    ).toBe("rir_decreased");
  });

  it("names deload and seed", () => {
    expect(projectChange({ ...hackSquatDecision, isDeload: true })).toBe("deload");
    expect(projectChange({ ...hackSquatDecision, kind: "seed", previous: null })).toBe("seed");
  });

  it("is a hold when nothing moved", () => {
    expect(
      projectChange({
        ...hackSquatDecision,
        ask: { weight: 112.5, reps: 10, sets: 3, targetRir: 0 },
      }),
    ).toBe("hold");
  });
});

describe("formatWork", () => {
  it("formats external load and bodyweight variants", () => {
    expect(formatWork("external", { weight: 112.5, reps: 11, sets: 3 })).toBe(
      "112.5 lb × 11 × 3",
    );
    expect(formatWork("bodyweight_only", { weight: null, reps: 12, sets: 3 })).toBe(
      "bodyweight × 12 × 3",
    );
    expect(formatWork("bodyweight_loadable", { weight: 25, reps: 8, sets: 3 })).toBe(
      "+25 lb × 8 × 3",
    );
    expect(formatWork("bodyweight_assisted", { weight: 40, reps: 8, sets: 3 })).toBe(
      "−40 lb assist × 8 × 3",
    );
  });
});

describe("projectPrimaryReason", () => {
  it("reads a paced/stepped advance as completed prescribed work", () => {
    expect(projectPrimaryReason(hackSquatDecision)).toBe("completed_prescribed_work");
  });

  it("projects each not-earned predicate", () => {
    const reason = (predicate: string) =>
      projectPrimaryReason({
        ...hackSquatDecision,
        trace: [{ rule: "progression", detail: "", status: "not_earned", predicate }],
      });
    expect(reason("compliance")).toBe("target_not_met");
    expect(reason("pain")).toBe("joint_pain");
    expect(reason("workload")).toBe("high_workload");
    expect(reason("dampener")).toBe("rough_session");
    expect(reason("stale")).toBe("not_recently_trained");
    expect(reason("confidence")).toBe("low_confidence");
  });
});

describe("projectLoadReason", () => {
  it("gives the one approved load statement for a paced hold", () => {
    expect(projectLoadReason(hackSquatDecision)).toBe("ahead_of_planned_pace");
  });

  it("lets a feedback pain cap outrank the earn-gate echo", () => {
    expect(
      projectLoadReason({
        ...hackSquatDecision,
        trace: [
          { rule: "feedback", detail: "joint pain 2/3: load increase blocked" },
          { rule: "progression", detail: "", status: "not_earned", predicate: "pain" },
        ],
      }),
    ).toBe("capped_by_joint_pain");
  });

  it("is absent on a seed", () => {
    expect(
      projectLoadReason({ ...hackSquatDecision, kind: "seed", previous: null }),
    ).toBeUndefined();
  });
});

describe("projectProgramContext", () => {
  it("selects one template sentence per week character", () => {
    expect(projectProgramContext({ n: 5, of: 5, target_rir: 6, deload: true })).toContain(
      "deload",
    );
    expect(projectProgramContext({ n: 1, of: 5, target_rir: 3, deload: false })).toContain(
      "first week",
    );
    expect(projectProgramContext({ n: 4, of: 5, target_rir: 0, deload: false })).toContain(
      "peak week",
    );
    expect(projectProgramContext({ n: 5, of: 5, target_rir: 1, deload: false })).toContain(
      "final hard week",
    );
    expect(projectProgramContext({ n: 2, of: 5, target_rir: 2, deload: false })).toBeUndefined();
  });
});

describe("projectPaceStatus (§5.1)", () => {
  it("reads a rate-paced step as ahead of plan", () => {
    expect(projectPaceStatus(hackSquatDecision, hackSquatContext.trend)).toBe("ahead");
  });

  it("is insufficient_data without a progression step (pacer never evaluated)", () => {
    expect(
      projectPaceStatus(
        { ...hackSquatDecision, trace: [{ rule: "load", detail: "seed" }] },
        hackSquatContext.trend,
      ),
    ).toBe("insufficient_data");
  });

  it("compares the two gains for a non-paced step, model sees only the verdict", () => {
    const stepped: FactsDecision = {
      ...hackSquatDecision,
      trace: [{ rule: "progression", detail: "", status: "stepped" }],
    };
    expect(
      projectPaceStatus(stepped, {
        window_days: 90,
        measuredGainPctPer30d: 0.5,
        prescribedGainPctPer30d: 2.0,
        comparableSessions: 6,
        e1rmConfidence: "high",
        comparable: true,
      }),
    ).toBe("behind");
    expect(
      projectPaceStatus(stepped, {
        window_days: 90,
        measuredGainPctPer30d: 2.0,
        prescribedGainPctPer30d: 2.0,
        comparableSessions: 6,
        e1rmConfidence: "high",
        comparable: true,
      }),
    ).toBe("on");
  });
});

describe("projectTrendStatus (§5.1) — the strongest gate is absence", () => {
  it("emits plateau only for a flat, comparable, confident window", () => {
    expect(
      projectTrendStatus({
        window_days: 120,
        measuredGainPctPer30d: 0.1,
        prescribedGainPctPer30d: 1.5,
        comparableSessions: 5,
        e1rmConfidence: "moderate",
        comparable: true,
      }),
    ).toBe("plateau");
  });

  it("never plateaus a low-confidence window (the Bench Press failure)", () => {
    expect(
      projectTrendStatus({
        window_days: 120,
        measuredGainPctPer30d: 0.1,
        prescribedGainPctPer30d: 1.5,
        comparableSessions: 5,
        e1rmConfidence: "low",
        comparable: true,
      }),
    ).toBe("insufficient_data");
  });

  it("never plateaus with too few comparable sessions", () => {
    expect(
      projectTrendStatus({
        window_days: 60,
        measuredGainPctPer30d: 0.1,
        prescribedGainPctPer30d: 1.5,
        comparableSessions: 3,
        e1rmConfidence: "high",
        comparable: true,
      }),
    ).toBe("insufficient_data");
  });

  it("downgrades a non-comparable window to no_actionable_trend", () => {
    expect(
      projectTrendStatus({
        window_days: 120,
        measuredGainPctPer30d: 0.1,
        prescribedGainPctPer30d: 1.5,
        comparableSessions: 5,
        e1rmConfidence: "high",
        comparable: false,
      }),
    ).toBe("no_actionable_trend");
  });

  it("is insufficient_data with no trend at all", () => {
    expect(projectTrendStatus(null)).toBe("insufficient_data");
  });
});

describe("buildExplanationFacts — the §5 object", () => {
  it("projects the Hack Squat worked example exactly", () => {
    const facts = buildExplanationFacts(hackSquatDecision, hackSquatContext);
    expect(facts).toEqual({
      exercise: "Hack Squat",
      muscle_group: "quads",
      week: { n: 4, of: 5, target_rir: 0, deload: false },
      prescription_change: "reps_increased",
      previous_work: "112.5 lb × 10 × 3",
      next_work: "112.5 lb × 11 × 3",
      primary_reason: "completed_prescribed_work",
      program_context: "peak week; sets taken to failure",
      load_reason: "ahead_of_planned_pace",
      effort_status: "inferred",
      pace_status: "ahead",
      trend_status: "no_actionable_trend",
      pain: { recurring: false, last_report_sessions_ago: null },
      note: {
        source: "last_session",
        age_sessions: 1,
        text: "severe burning pump, quads aching",
      },
    });
  });

  it("never carries a raw trace string, governor, or a pair of rates", () => {
    const facts = buildExplanationFacts(hackSquatDecision, hackSquatContext);
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toContain("rate_pacer");
    expect(serialized).not.toContain("skipped by");
    expect(serialized).not.toMatch(/1\.8|1\.4/); // the two gains never surface
  });

  it("the Bench Press low-confidence case yields insufficient_data, not plateau", () => {
    const benchDecision: FactsDecision = {
      kind: "advance",
      isDeload: false,
      loadType: "external",
      ask: { weight: 185, reps: 5, sets: 3, targetRir: 2 },
      previous: { weight: 185, reps: 5, sets: 3, targetRir: 2 },
      trace: [{ rule: "progression", detail: "", status: "not_earned", predicate: "compliance" }],
    };
    const benchContext: FactsContext = {
      exerciseName: "Bench Press",
      muscleGroup: "chest",
      weekNumber: 3,
      mesoWeeks: 5,
      effortObserved: null,
      pain: null,
      trend: {
        window_days: 120,
        measuredGainPctPer30d: 0.0,
        prescribedGainPctPer30d: 1.5,
        comparableSessions: 5,
        e1rmConfidence: "low", // high-rep bench ⇒ weak e1RM estimate
        comparable: true,
      },
    };
    const facts = buildExplanationFacts(benchDecision, benchContext);
    expect(facts.trend_status).toBe("insufficient_data");
    expect(facts.effort_status).toBe("unknown");
    expect(facts.pain.recurring).toBe(false);
  });

  it("takes a pinned note over a session note, aged 0", () => {
    const facts = buildExplanationFacts(hackSquatDecision, {
      ...hackSquatContext,
      pinnedNote: "keep the seat one notch higher",
    });
    expect(facts.note).toEqual({
      source: "pinned",
      age_sessions: 0,
      text: "keep the seat one notch higher",
    });
  });
});

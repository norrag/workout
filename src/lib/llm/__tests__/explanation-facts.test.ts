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
  formatMacroTarget,
  formatWork,
  projectChange,
  projectMacro,
  projectNote,
  projectSourceSession,
  projectLoadReason,
  projectPaceStatus,
  projectPrimaryReason,
  projectProgramContext,
  projectTrendStatus,
  type FactsContext,
  type FactsDecision,
} from "../explanation-facts";

// --- Hack Squat: the §5 worked example -------------------------------------
// week 4 of 5, target RIR 0, load holds, reps 10 → 11, earned step paced. The
// SOURCE session (§5.2) was week 3 at 1 RIR — the previous tuple carries its ask.
const hackSquatDecision: FactsDecision = {
  kind: "advance",
  isDeload: false,
  loadType: "external",
  ask: { weight: 112.5, reps: 11, sets: 3, targetRir: 0 },
  previous: { weight: 112.5, reps: 10, sets: 3, targetRir: 1 },
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
  // §5.2 — the note was written in the SOURCE session (week 3, 1 RIR), not in
  // the peak week being prescribed
  sourceSession: { weekNumber: 3, targetRir: 1, deload: false },
  lastSessionNoteFromSource: true,
  lastSessionNote: "severe burning pump, quads aching",
  lastSessionNoteAgeSessions: 1,
  macro: {
    goalType: "hypertrophy",
    blockPosition: 2,
    blockCount: 4,
    phase: "intensification",
    goalNotes: "add size on the quads before spring",
    target: {
      low: 6,
      high: 9,
      unit: "%",
      direction: "gain",
      durationMonths: 4,
    },
  },
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

  it("is a hold when nothing moved — the RIR target included", () => {
    expect(
      projectChange({
        ...hackSquatDecision,
        ask: { weight: 112.5, reps: 10, sets: 3, targetRir: 1 },
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

  it("tells the four paced governors apart — only the rate pacer is 'ahead of plan' (N63)", () => {
    const paced = (governor?: string) =>
      projectLoadReason({
        ...hackSquatDecision,
        trace: [
          {
            rule: "progression",
            detail: "earned; held",
            status: "paced",
            ...(governor ? { governor } : {}),
          },
        ],
      });
    expect(paced("rate_pacer")).toBe("ahead_of_planned_pace");
    expect(paced("cadence")).toBe("already_stepped_this_week");
    expect(paced("miss_throttle")).toBe("recent_increases_not_holding");
    expect(paced("peak_week")).toBe("increases_paused_at_peak_week");
    // an unnamed governor states the hold, never a cause it cannot support
    expect(paced()).toBe("held_this_session");
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
      source_session: { week_n: 3, target_rir: 1, deload: false },
      macro: {
        goal: "hypertrophy",
        block: { n: 2, of: 4 },
        phase: "intensification",
        target: "gain 6–9% over 4 months (an estimate)",
        goal_notes: "add size on the quads before spring",
      },
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
        source: "source_session",
        age_sessions: 1,
        text: "severe burning pump, quads aching",
        session: { week_n: 3, target_rir: 1, deload: false },
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

/**
 * N62 / §5.2 — `week` is the UPCOMING prescription; the session that produced
 * `previous_work` gets its own block, and the note names which session wrote it.
 * Without the split a note left at 1 RIR read as if it happened in the 0 RIR
 * peak week being prescribed.
 */
describe("projectSourceSession (§5.2)", () => {
  it("reports the source session's own week, RIR, and deload flag", () => {
    expect(projectSourceSession(hackSquatDecision, hackSquatContext)).toEqual({
      week_n: 3,
      target_rir: 1,
      deload: false,
    });
  });

  it("still reports the source session's RIR when its week can't be resolved", () => {
    expect(
      projectSourceSession(hackSquatDecision, { ...hackSquatContext, sourceSession: null }),
    ).toEqual({ target_rir: 1, deload: false });
  });

  it("prefers the decision's own previous RIR over the coarser microcycle target", () => {
    expect(
      projectSourceSession(
        {
          ...hackSquatDecision,
          previous: { weight: 112.5, reps: 10, sets: 3, targetRir: 2 },
        },
        hackSquatContext,
      ),
    ).toEqual({ week_n: 3, target_rir: 2, deload: false });
  });

  it("marks a deload source session", () => {
    expect(
      projectSourceSession(
        {
          ...hackSquatDecision,
          previous: { weight: 90, reps: 8, sets: 2, targetRir: 6 },
        },
        {
          ...hackSquatContext,
          sourceSession: { weekNumber: 5, targetRir: 6, deload: true },
        },
      ),
    ).toEqual({ week_n: 5, target_rir: 6, deload: true });
  });

  it("is absent for a seed — there is no earlier session to disambiguate", () => {
    expect(
      projectSourceSession({ ...hackSquatDecision, previous: null }, hackSquatContext),
    ).toBeUndefined();
  });

  it("the upcoming week and the source session never collapse into one", () => {
    const facts = buildExplanationFacts(hackSquatDecision, hackSquatContext);
    expect(facts.week?.target_rir).toBe(0); // peak week, sets to failure
    expect(facts.source_session?.target_rir).toBe(1); // the note's session
    expect(facts.note?.session).toEqual(facts.source_session);
  });
});

describe("projectNote provenance (§5.2)", () => {
  const source = { week_n: 3, target_rir: 1, deload: false };

  it("labels a note from the source session and repeats that session's conditions", () => {
    expect(projectNote(hackSquatContext, source)).toMatchObject({
      source: "source_session",
      age_sessions: 1,
      session: source,
    });
  });

  it("labels a merely recent note as such, with no session block to borrow", () => {
    const note = projectNote(
      { ...hackSquatContext, lastSessionNoteFromSource: false, lastSessionNoteAgeSessions: 2 },
      source,
    );
    expect(note).toMatchObject({ source: "recent_session", age_sessions: 2 });
    expect(note?.session).toBeUndefined();
  });

  it("a pinned note stays pinned — it belongs to no session", () => {
    const note = projectNote({ ...hackSquatContext, pinnedNote: "seat one notch higher" }, source);
    expect(note).toMatchObject({ source: "pinned", age_sessions: 0 });
    expect(note?.session).toBeUndefined();
  });
});

/** N62 / §5.3 — the macro goal layer: context for coaching, never a rate. */
describe("projectMacro + formatMacroTarget (§5.3)", () => {
  it("formats a mass target as one estimate sentence", () => {
    expect(
      formatMacroTarget({
        low: 8,
        high: 12,
        unit: "lb",
        direction: "loss",
        durationMonths: 4,
      }),
    ).toBe("lose 8–12 lb over 4 months (an estimate)");
  });

  it("formats a strength target in percent, and a single-value band without a range", () => {
    expect(
      formatMacroTarget({ low: 6, high: 6, unit: "%", direction: "gain", durationMonths: 3 }),
    ).toBe("gain 6% over 3 months (an estimate)");
  });

  it("omits a target with no direction or no numbers — absence over an empty claim", () => {
    expect(
      formatMacroTarget({ low: 5, high: 8, unit: "lb", direction: "none", durationMonths: 4 }),
    ).toBeUndefined();
    expect(
      formatMacroTarget({ low: null, high: null, unit: "lb", direction: "gain", durationMonths: 4 }),
    ).toBeUndefined();
    expect(formatMacroTarget(null)).toBeUndefined();
  });

  it("omits block placement until the meso is actually placed in the arc", () => {
    expect(
      projectMacro({
        ...hackSquatContext,
        macro: { goalType: "strength", blockPosition: null, blockCount: null },
      }),
    ).toEqual({ goal: "strength" });
  });

  it("truncates a long goal note — standing intent, not a second story", () => {
    const macro = projectMacro({
      ...hackSquatContext,
      macro: { goalType: "hypertrophy", goalNotes: "a".repeat(300) },
    });
    expect(macro?.goal_notes?.length).toBeLessThanOrEqual(140);
  });

  it("is absent for a standalone meso", () => {
    expect(projectMacro({ ...hackSquatContext, macro: null })).toBeUndefined();
  });
});

/**
 * doc 19 §6.1 deterministic trigger scoring. The load-bearing assertion is the
 * NEGATIVE one: a routine paced progression with no note, no pain, no unusual
 * modulation, mid-block, produces NO trigger — so it never reaches the API
 * (coaching is a minority of decisions). The positive gates mirror the §6.1
 * table.
 */
import { describe, expect, it } from "vitest";
import type { ExplanationFacts } from "../explanation-facts";
import { scoreTriggers, shouldGenerate } from "../coaching-triggers";

/** A routine mid-block paced advance with nothing else going on. */
const routineFacts: ExplanationFacts = {
  exercise: "Hack Squat",
  muscle_group: "quads",
  week: { n: 2, of: 5, target_rir: 2, deload: false },
  prescription_change: "reps_increased",
  previous_work: "112.5 lb × 10 × 3",
  next_work: "112.5 lb × 11 × 3",
  primary_reason: "completed_prescribed_work",
  load_reason: "ahead_of_planned_pace",
  effort_status: "inferred",
  pace_status: "ahead",
  trend_status: "no_actionable_trend",
  pain: { recurring: false, last_report_sessions_ago: null },
};

const routineSignals = { trace: [{ rule: "progression", detail: "", status: "paced" }] };

describe("scoreTriggers — the silent majority", () => {
  it("routine progression, no signals ⇒ NO trigger, no API call", () => {
    expect(scoreTriggers(routineFacts, routineSignals)).toEqual([]);
    expect(shouldGenerate(routineFacts, routineSignals)).toBe(false);
  });

  it("a normal deload with no other signal still fires block_intent, nothing else", () => {
    const deload: ExplanationFacts = {
      ...routineFacts,
      week: { n: 5, of: 5, target_rir: 6, deload: true },
      prescription_change: "deload",
    };
    expect(scoreTriggers(deload, { trace: [{ rule: "deload", detail: "deload week" }] })).toEqual([
      "block_intent",
    ]);
  });
});

describe("scoreTriggers — the §6.1 gates", () => {
  it("pain: recurring joint pain fires", () => {
    expect(
      scoreTriggers(
        { ...routineFacts, pain: { recurring: true, last_report_sessions_ago: 4 } },
        routineSignals,
      ),
    ).toContain("pain");
  });

  it("pain: a recent report fires; an aged, non-recurring one has decayed", () => {
    expect(
      scoreTriggers(
        { ...routineFacts, pain: { recurring: false, last_report_sessions_ago: 1 } },
        routineSignals,
      ),
    ).toContain("pain");
    expect(
      scoreTriggers(
        { ...routineFacts, pain: { recurring: false, last_report_sessions_ago: 5 } },
        routineSignals,
      ),
    ).not.toContain("pain");
  });

  it("pain: a fresh session note that reads as pain fires both pain and note", () => {
    const triggers = scoreTriggers(
      {
        ...routineFacts,
        note: { source: "source_session", age_sessions: 1, text: "left knee aching on the descent" },
      },
      routineSignals,
    );
    expect(triggers).toContain("pain");
    expect(triggers).toContain("note");
  });

  it("note: a pinned note fires note but not pain when it isn't about pain", () => {
    const triggers = scoreTriggers(
      { ...routineFacts, note: { source: "pinned", age_sessions: 0, text: "seat one notch higher" } },
      routineSignals,
    );
    expect(triggers).toEqual(["note"]);
  });

  it("note: a stale session note (older than ~3 exposures) does not fire", () => {
    expect(
      scoreTriggers(
        { ...routineFacts, note: { source: "source_session", age_sessions: 5, text: "felt strong" } },
        routineSignals,
      ),
    ).not.toContain("note");
  });

  it("plateau: fires on a gated plateau verdict", () => {
    expect(
      scoreTriggers({ ...routineFacts, trend_status: "plateau" }, routineSignals),
    ).toContain("plateau");
  });

  it("completion_pattern: ≥2 consecutive earned misses, or repeated later-set shortfall", () => {
    expect(
      scoreTriggers(routineFacts, { ...routineSignals, consecutiveEarnedMisses: 2 }),
    ).toContain("completion_pattern");
    expect(
      scoreTriggers(routineFacts, { ...routineSignals, repeatedLaterSetShortfall: true }),
    ).toContain("completion_pattern");
    expect(
      scoreTriggers(routineFacts, { ...routineSignals, consecutiveEarnedMisses: 1 }),
    ).not.toContain("completion_pattern");
  });

  it("block_intent: first week and peak week (RIR 0) both fire", () => {
    expect(
      scoreTriggers({ ...routineFacts, week: { n: 1, of: 5, target_rir: 3, deload: false } }, routineSignals),
    ).toContain("block_intent");
    expect(
      scoreTriggers({ ...routineFacts, week: { n: 4, of: 5, target_rir: 0, deload: false } }, routineSignals),
    ).toContain("block_intent");
  });

  it("unusual_prescription: any fired feedback modulation, or a repeated deviation", () => {
    expect(
      scoreTriggers(routineFacts, {
        trace: [{ rule: "feedback", detail: "workload 9/10 past just right: set removed" }],
      }),
    ).toContain("unusual_prescription");
    expect(
      scoreTriggers(routineFacts, { ...routineSignals, outOfBandRepeated: true }),
    ).toContain("unusual_prescription");
  });

  it("increment_coarse: the smallest step exceeds the paced budget (N56)", () => {
    expect(
      scoreTriggers(routineFacts, { ...routineSignals, incrementCoarse: true }),
    ).toContain("increment_coarse");
  });

  it("stacks multiple triggers when several gates hold", () => {
    const triggers = scoreTriggers(
      {
        ...routineFacts,
        week: { n: 1, of: 5, target_rir: 3, deload: false },
        pain: { recurring: true, last_report_sessions_ago: 1 },
      },
      { trace: [{ rule: "feedback", detail: "joint pain 2/3: load increase blocked" }] },
    );
    expect(triggers).toEqual(
      expect.arrayContaining(["pain", "block_intent", "unusual_prescription"]),
    );
    expect(shouldGenerate(routineFacts, { ...routineSignals, incrementCoarse: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// doc 21 §8 — an authored effort level is worth a coaching pass
// ---------------------------------------------------------------------------

describe("effort_assignment trigger", () => {
  const assigned = {
    target_rir: 4,
    week_target_rir: 1,
    backed_off: true,
    measured: true,
    reason: "nerve flare",
  };

  it("does not fire on a routine, unassigned decision", () => {
    expect(scoreTriggers(routineFacts, { trace: [] })).not.toContain(
      "effort_assignment",
    );
  });

  it("fires whenever a person assigned this exercise's effort", () => {
    expect(
      scoreTriggers(
        { ...routineFacts, effort_assignment: assigned },
        { trace: [] },
      ),
    ).toContain("effort_assignment");
  });

  it("is enough on its own to route the decision to the model", () => {
    expect(
      shouldGenerate({ ...routineFacts, effort_assignment: assigned }, { trace: [] }),
    ).toBe(true);
  });
});

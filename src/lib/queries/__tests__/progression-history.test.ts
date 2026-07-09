/**
 * doc 16 §8.2 — the caller-side `progressionHistory` derivation over recorded
 * engine decisions, and §8.3 (Phase 4) — the audit aggregate behind the admin
 * `get_progression_history` tool (pure transforms; the I/O wrappers are thin).
 */
import { describe, expect, it } from "vitest";
import {
  aggregateProgressionEvents,
  deriveProgressionHistory,
  toProgressionAuditEvent,
  toProgressionEvent,
  type ProgressionAuditEvent,
  type ProgressionAuditStep,
  type ProgressionDecisionEvent,
} from "../progression";
import { V20_PARAMS } from "@/lib/engine/__tests__/helpers";

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 6, 9);

function event(
  daysAgo: number,
  overrides: Partial<ProgressionDecisionEvent> = {},
): ProgressionDecisionEvent {
  return {
    createdAtMs: NOW - daysAgo * DAY_MS,
    microcycleId: "micro-1",
    isDeload: false,
    prescribedE1rm: 200,
    step: null,
    ...overrides,
  };
}

const OPTS = { targetMicrocycleId: "micro-2", missRearmSessions: 2, nowMs: NOW };

describe("deriveProgressionHistory", () => {
  it("empty history is permissive", () => {
    expect(deriveProgressionHistory([], OPTS)).toEqual({
      earnedThisMicrocycle: false,
      trailing30dPrescribedGainPct: null,
      consecutiveMissedEarns: 0,
    });
  });

  it("cadence: only a `stepped` decision targeting the SAME microcycle counts", () => {
    const base = [
      event(3, { microcycleId: "micro-2", step: { status: "vanished" } }),
      event(2, { microcycleId: "micro-1", step: { status: "stepped" } }),
    ];
    expect(deriveProgressionHistory(base, OPTS).earnedThisMicrocycle).toBe(false);
    const withStep = [
      ...base,
      event(1, { microcycleId: "micro-2", step: { status: "stepped" } }),
    ];
    expect(deriveProgressionHistory(withStep, OPTS).earnedThisMicrocycle).toBe(
      true,
    );
  });

  it("trailing rate: gain between oldest and newest in the lookback, normalized to %/30d", () => {
    // +3% over 15 days ⇒ 6%/30d
    const events = [
      event(15, { prescribedE1rm: 200 }),
      event(0, { prescribedE1rm: 206 }),
    ];
    expect(
      deriveProgressionHistory(events, OPTS).trailing30dPrescribedGainPct,
    ).toBe(6);
  });

  it("trailing rate: a short span is floored at 7 days (lattice-noise damping)", () => {
    // +3% over 1 day would read 90%/30d; the floor caps it at 3 × 30/7
    const events = [
      event(1, { prescribedE1rm: 200 }),
      event(0, { prescribedE1rm: 206 }),
    ];
    expect(
      deriveProgressionHistory(events, OPTS).trailing30dPrescribedGainPct,
    ).toBeCloseTo(3 * (30 / 7), 1);
  });

  it("trailing rate: deload decisions and rows outside the lookback are excluded", () => {
    const events = [
      event(120, { prescribedE1rm: 100 }), // outside the 90-day lookback
      event(30, { prescribedE1rm: 200 }),
      event(15, { prescribedE1rm: 150, isDeload: true }), // deload junk skipped
      event(0, { prescribedE1rm: 206 }),
    ];
    expect(
      deriveProgressionHistory(events, OPTS).trailing30dPrescribedGainPct,
    ).toBe(3);
  });

  it("trailing rate: fewer than two usable points ⇒ null", () => {
    expect(
      deriveProgressionHistory([event(3)], OPTS).trailing30dPrescribedGainPct,
    ).toBeNull();
    expect(
      deriveProgressionHistory(
        [event(3, { prescribedE1rm: null }), event(1)],
        OPTS,
      ).trailing30dPrescribedGainPct,
    ).toBeNull();
  });

  it("miss throttle: an earned-then-missed cycle counts once, two in a row throttle", () => {
    const oneMiss = [
      event(10, { step: { status: "stepped" } }),
      event(7, { step: { status: "not_earned", predicate: "compliance" } }),
    ];
    expect(deriveProgressionHistory(oneMiss, OPTS).consecutiveMissedEarns).toBe(1);

    const twoMisses = [
      ...oneMiss,
      event(5, { step: { status: "stepped" } }),
      event(3, { step: { status: "not_earned", predicate: "compliance" } }),
    ];
    expect(deriveProgressionHistory(twoMisses, OPTS).consecutiveMissedEarns).toBe(
      2,
    );
  });

  it("miss throttle: a PERFORMED step breaks the run", () => {
    const events = [
      event(12, { step: { status: "stepped" } }),
      event(10, { step: { status: "not_earned", predicate: "compliance" } }),
      event(8, { step: { status: "stepped" } }),
      // this decision's source session complied (it stepped again) — the ask
      // was answered, so the earlier miss does not chain
      event(6, { step: { status: "stepped" } }),
      event(4, { step: { status: "not_earned", predicate: "compliance" } }),
    ];
    expect(deriveProgressionHistory(events, OPTS).consecutiveMissedEarns).toBe(1);
  });

  it("miss throttle: compliant sessions since the last miss re-arm the count", () => {
    const throttled = [
      event(10, { step: { status: "stepped" } }),
      event(8, { step: { status: "not_earned", predicate: "compliance" } }),
      event(6, { step: { status: "stepped" } }),
      event(4, { step: { status: "not_earned", predicate: "compliance" } }),
    ];
    expect(
      deriveProgressionHistory(throttled, OPTS).consecutiveMissedEarns,
    ).toBe(2);
    // one recorded compliant session (paced ⇒ earn gate passed) + the current
    // session's own in-engine compliance = miss_rearm_sessions ⇒ reported 0
    const reArmed = [
      ...throttled,
      event(2, { step: { status: "paced", predicate: undefined } }),
    ];
    expect(deriveProgressionHistory(reArmed, OPTS).consecutiveMissedEarns).toBe(0);
  });

  it("miss throttle: a non-compliance predicate is not a miss (compliance is checked first)", () => {
    const events = [
      event(10, { step: { status: "stepped" } }),
      event(8, { step: { status: "not_earned", predicate: "pain" } }),
    ];
    expect(deriveProgressionHistory(events, OPTS).consecutiveMissedEarns).toBe(0);
  });

  it("pre-v20 decisions (no trace step) neither miss nor re-arm", () => {
    const events = [
      event(10, { step: { status: "stepped" } }),
      event(8, { step: null }),
      event(6, { step: { status: "not_earned", predicate: "compliance" } }),
    ];
    // the stepless decision is unknown — the miss at day 6 answers... nothing
    // asked at day 8, so no earned-then-missed cycle is counted
    expect(deriveProgressionHistory(events, OPTS).consecutiveMissedEarns).toBe(0);
  });
});

describe("toProgressionEvent", () => {
  it("scores the recorded prescription through the shared curve", () => {
    const e = toProgressionEvent(
      {
        microcycle_id: "m1",
        created_at: new Date(NOW).toISOString(),
        inputs: { week: { isDeload: false }, exercise: { loadType: "external" } },
        output: {
          weight: 145,
          reps: 9,
          targetRir: 2,
          trace: [
            { rule: "load", detail: "..." },
            { rule: "progression", status: "stepped", predicate: undefined },
          ],
        },
      },
      V20_PARAMS,
    );
    expect(e.prescribedE1rm).toBe(198.2); // 145 × k(11), the doc-16 fixture
    expect(e.step).toEqual({ status: "stepped", predicate: undefined });
    expect(e.isDeload).toBe(false);
  });

  it("resolves bodyweight prescriptions on EFFECTIVE load and tolerates pre-v20 rows", () => {
    const e = toProgressionEvent(
      {
        microcycle_id: null,
        created_at: new Date(NOW).toISOString(),
        inputs: {
          week: { isDeload: true },
          exercise: { loadType: "bodyweight_loadable" },
          bodyweight: 180,
        },
        output: { weight: 20, reps: 10, targetRir: 6 },
      },
      V20_PARAMS,
    );
    expect(e.isDeload).toBe(true);
    expect(e.step).toBeNull();
    // effective 200 lb × k(10 + 6) — just assert it priced off 200, not 20
    expect(e.prescribedE1rm!).toBeGreaterThan(200);
  });
});

// --- §8.3 (Phase 4): the audit aggregate -------------------------------------

describe("toProgressionAuditEvent", () => {
  const row = {
    id: "dec-1",
    kind: "advance",
    workout_id: "w-1",
    microcycle_id: "m1",
    created_at: new Date(NOW).toISOString(),
    inputs: {
      week: { isDeload: false },
      exercise: { loadType: "external" },
      strengthAnchor: { value: 198.2, confidence: "moderate" },
    },
    output: {
      weight: 150,
      reps: 9,
      targetRir: 2,
      trace: [
        { rule: "load", detail: "..." },
        {
          rule: "progression",
          status: "stepped",
          deltaTarget: 4.8,
          deltaRealized: 6.8,
          targetAnchor: 203,
          detail: "earned overload: targeting e1RM 203.0",
        },
      ],
    },
  };

  it("widens the derivation event with the full step + measured anchor", () => {
    const e = toProgressionAuditEvent(row, V20_PARAMS);
    expect(e.decisionId).toBe("dec-1");
    expect(e.kind).toBe("advance");
    expect(e.workoutId).toBe("w-1");
    expect(e.createdAt).toBe(row.created_at);
    expect(e.measuredAnchor).toBe(198.2);
    expect(e.anchorConfidence).toBe("moderate");
    expect(e.auditStep).toEqual({
      status: "stepped",
      governor: undefined,
      predicate: undefined,
      deltaTarget: 4.8,
      deltaRealized: 6.8,
      targetAnchor: 203,
      detail: "earned overload: targeting e1RM 203.0",
    });
    // the §8.2 base fields ride along unchanged
    expect(e.step).toEqual({ status: "stepped", predicate: undefined });
    expect(e.prescribedE1rm).toBeGreaterThan(198.2);
  });

  it("tolerates pre-v20 rows (no step, no anchor)", () => {
    const e = toProgressionAuditEvent(
      {
        ...row,
        inputs: { week: { isDeload: false }, exercise: { loadType: "external" } },
        output: { weight: 145, reps: 9, targetRir: 2 },
      },
      V20_PARAMS,
    );
    expect(e.auditStep).toBeNull();
    expect(e.measuredAnchor).toBeNull();
    expect(e.anchorConfidence).toBeNull();
  });
});

describe("aggregateProgressionEvents", () => {
  function auditEvent(
    daysAgo: number,
    auditStep: ProgressionAuditStep | null,
    overrides: Partial<ProgressionAuditEvent> = {},
  ): ProgressionAuditEvent {
    return {
      createdAtMs: NOW - daysAgo * DAY_MS,
      microcycleId: "micro-1",
      isDeload: false,
      prescribedE1rm: 200,
      // keep the §8.2 `step` view in lockstep, as toProgressionAuditEvent does
      step: auditStep
        ? { status: auditStep.status, predicate: auditStep.predicate }
        : null,
      decisionId: `d-${daysAgo}`,
      kind: "advance",
      workoutId: null,
      createdAt: new Date(NOW - daysAgo * DAY_MS).toISOString(),
      measuredAnchor: 198,
      anchorConfidence: "moderate",
      auditStep,
      ...overrides,
    };
  }

  it("empty history aggregates to zeros and nulls", () => {
    const s = aggregateProgressionEvents([]);
    expect(s.decisions).toBe(0);
    expect(s.statusCounts).toEqual({ stepped: 0, vanished: 0, paced: 0, not_earned: 0 });
    expect(s.governorFirings).toEqual({});
    expect(s.gateFailures).toEqual({});
    expect(s.vanishedShare).toBeNull();
    expect(s.openAsk).toBe(false);
    expect(s.prescribedGain).toBeNull();
    expect(s.measuredGain).toBeNull();
  });

  it("counts the status mix, governor firings, and gate-failure reasons", () => {
    const s = aggregateProgressionEvents([
      auditEvent(10, { status: "not_earned", predicate: "compliance" }),
      auditEvent(9, { status: "not_earned", predicate: "pain" }),
      auditEvent(8, { status: "paced", governor: "cadence" }),
      auditEvent(7, { status: "paced", governor: "rate_pacer" }),
      auditEvent(6, { status: "paced", governor: "rate_pacer" }),
      auditEvent(5, { status: "stepped" }),
      auditEvent(4, { status: "vanished" }),
      auditEvent(3, null), // stepless row contributes nothing
    ]);
    expect(s.decisions).toBe(7);
    expect(s.statusCounts).toEqual({ stepped: 1, vanished: 1, paced: 3, not_earned: 2 });
    expect(s.governorFirings).toEqual({ cadence: 1, rate_pacer: 2 });
    expect(s.gateFailures).toEqual({ compliance: 1, pain: 1 });
    // vanished / (stepped + vanished) — the increment-sizing signal
    expect(s.vanishedShare).toBe(0.5);
  });

  it("pairs each stepped ask with the NEXT decision's source compliance", () => {
    const s = aggregateProgressionEvents([
      auditEvent(12, { status: "stepped" }),
      // answered: this decision's source session complied (it stepped again)
      auditEvent(10, { status: "stepped" }),
      // missed: compliance is the named failing predicate
      auditEvent(8, { status: "not_earned", predicate: "compliance" }),
      auditEvent(6, { status: "stepped" }),
      // unanswered: a stepless follow-up row says nothing about the ask
      auditEvent(4, null),
      // the newest decision asks again — still awaiting its session
      auditEvent(2, { status: "stepped" }),
    ]);
    expect(s.earnedThenMet).toBe(1);
    expect(s.earnedThenMissed).toBe(1);
    expect(s.earnedUnanswered).toBe(1);
    expect(s.openAsk).toBe(true);
  });

  it("a non-compliance gate failure answers the ask as PERFORMED (met)", () => {
    const s = aggregateProgressionEvents([
      auditEvent(6, { status: "stepped" }),
      // pain gated ⇒ compliance passed first — the ask itself was performed
      auditEvent(4, { status: "not_earned", predicate: "pain" }),
    ]);
    expect(s.earnedThenMet).toBe(1);
    expect(s.earnedThenMissed).toBe(0);
    expect(s.openAsk).toBe(false);
  });

  it("prescribed vs measured gain: first→last, %/30d-normalized, deloads excluded", () => {
    const s = aggregateProgressionEvents([
      auditEvent(15, null, { prescribedE1rm: 200, measuredAnchor: 198 }),
      // deload junk never pollutes either series
      auditEvent(7, null, { prescribedE1rm: 150, measuredAnchor: 100, isDeload: true }),
      auditEvent(0, null, { prescribedE1rm: 206, measuredAnchor: 200.97 }),
    ]);
    expect(s.prescribedGain).toEqual({
      first: 200,
      last: 206,
      gainPct: 3,
      gainPctPer30d: 6, // +3% over 15 days
      spanDays: 15,
      points: 2,
    });
    expect(s.measuredGain!.gainPct).toBe(1.5);
    expect(s.measuredGain!.gainPctPer30d).toBe(3);
    // the demand leading the measurement is the §8.3 comparison working
    expect(s.prescribedGain!.gainPct).toBeGreaterThan(s.measuredGain!.gainPct);
  });

  it("gain needs two usable points and a positive span", () => {
    expect(aggregateProgressionEvents([auditEvent(3, null)]).prescribedGain).toBeNull();
    const s = aggregateProgressionEvents([
      auditEvent(5, null, { measuredAnchor: null }),
      auditEvent(3, null, { measuredAnchor: null }),
    ]);
    expect(s.measuredGain).toBeNull();
    expect(s.prescribedGain).not.toBeNull();
  });

  it("a short gain span is floored at 7 days like the pacer's trailing rate", () => {
    const s = aggregateProgressionEvents([
      auditEvent(1, null, { prescribedE1rm: 200 }),
      auditEvent(0, null, { prescribedE1rm: 206 }),
    ]);
    expect(s.prescribedGain!.gainPctPer30d).toBeCloseTo(3 * (30 / 7), 1);
  });
});

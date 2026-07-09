/**
 * doc 16 §8.2 — the caller-side `progressionHistory` derivation over recorded
 * engine decisions (pure transforms; the I/O wrapper is thin).
 */
import { describe, expect, it } from "vitest";
import {
  deriveProgressionHistory,
  toProgressionEvent,
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

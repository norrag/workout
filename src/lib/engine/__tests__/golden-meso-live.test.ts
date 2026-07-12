/**
 * Golden test under the LIVE production params shape (R21): the v18 row —
 * v10 defaults + every gated behavior on (`seed_from_anchor`,
 * `hold_rep_consistent`, `climb_on_performed_reps`, `bound_to_target_window`,
 * `deload_anchor_rir`, `bodyweight_model`, `pain_cut_gate`, I14 dampen
 * thresholds). The original golden (`golden-meso.test.ts`) pins the no-anchor
 * v10 hold path; this one pins the anchored interaction the app actually runs:
 * a lifter with real history whose logged sets feed `recencyWeightedE1rm`
 * week to week.
 *
 * Every expected number below is derivable by hand (Brzycki ≤ 10 effective
 * reps / Epley above, session_best anchor, 5 lb rounding) — see the inline
 * notes. If a params change moves these rows, that is a behavior change and
 * needs its own review, not a silent re-pin.
 */
import { describe, expect, it } from "vitest";
import { prescribe, rirRamp, seedMeso } from "../index";
import { recencyWeightedE1rm, type E1rmSample } from "../reps";
import { effectiveLoad } from "../load";
import type { EngineInputs, Prescription } from "../types";
import { V18_PARAMS } from "./helpers";

const params = V18_PARAMS;
const user = { experienceLevel: "intermediate" as const };

/** The lifter performs every prescribed set exactly as written. */
function simulateCleanWeek(prev: Prescription): EngineInputs["actualSets"] {
  return Array.from({ length: prev.sets }, (_, i) => ({
    setNumber: i + 1,
    weight: prev.weight!,
    reps: prev.reps!,
    rirReported: prev.targetRir,
    isWarmup: false,
  }));
}

/** Benign session feedback on the unified 0–10 scale (v18 thresholds: fatigue
 *  dampens at ≥ 8, performance at ≤ 3 — these values trip neither). */
const benignWorkoutFeedback = {
  overallFatigue: 3,
  effortRating: 5,
  performanceRating: 7,
};

type Session = {
  /** day performed, relative to the meso seed (day 0); negative = prior meso */
  day: number;
  key: string;
  sets: { weight: number; reps: number; rir: number }[];
};

function anchorAt(history: Session[], nowDay: number, toEffective?: (w: number) => number) {
  const samples: E1rmSample[] = history.flatMap((h) =>
    h.sets.map((s) => ({
      weight: toEffective ? toEffective(s.weight) : s.weight,
      reps: s.reps,
      targetRir: s.rir,
      ageDays: nowDay - h.day,
      sessionKey: h.key,
    })),
  );
  return recencyWeightedE1rm(samples, params);
}

describe("golden meso (live v18 params): anchored lifter, intermediate gain, 5 weeks + deload", () => {
  const ramp = rirRamp(5, true, 3, 0, params);

  it("external barbell: seeds from the anchor, climbs reps down the ramp bounded to the window, deloads off the anchor", () => {
    const exercise = { equipmentType: "barbell" as const, loadType: "external" as const };
    // Prior-meso bench history (days −21/−14/−7). Best session (100×9@1RIR →
    // 10 effective reps → Brzycki 133; session-mates 133/129) folds to the
    // session_best anchor ≈ 132 lb e1RM at seed time.
    const history: Session[] = [
      { day: -21, key: "p1", sets: [{ weight: 95, reps: 8, rir: 3 }, { weight: 95, reps: 8, rir: 3 }, { weight: 95, reps: 8, rir: 3 }] },
      { day: -14, key: "p2", sets: [{ weight: 100, reps: 8, rir: 2 }, { weight: 100, reps: 8, rir: 2 }, { weight: 100, reps: 8, rir: 2 }] },
      { day: -7, key: "p3", sets: [{ weight: 100, reps: 9, rir: 1 }, { weight: 100, reps: 9, rir: 1 }, { weight: 100, reps: 8, rir: 1 }] },
    ];

    const prescriptions: Prescription[] = [];
    let anchor = anchorAt(history, 0);
    expect(anchor).toEqual({
      value: 132,
      confidence: "moderate",
      // N45: the anchor names its winning set — the day −7 session's 100×9
      source: { weight: 100, reps: 9, ageDays: 7, sessionKey: "p3" },
    });

    // seed_from_anchor: weight for window-low reps (8) at start RIR 3 off
    // e1RM 132 → 96.6 lb → rounds to 95 on the 5 lb barbell step.
    let prev = seedMeso(null, null, exercise, user, ramp[0].targetRir, params, {
      goalType: "gain",
      anchor,
    });
    prescriptions.push(prev);

    for (const week of ramp.slice(1)) {
      const nowDay = 7 * (week.weekNumber - 1);
      // last week's clean performance posts to history and feeds the anchor
      history.push({
        day: 7 * (week.weekNumber - 2),
        key: `w${week.weekNumber - 1}`,
        sets: simulateCleanWeek(prev).map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rirReported! })),
      });
      anchor = anchorAt(history, nowDay);
      const peak = prescriptions.reduce((a, b) => ((b.weight ?? 0) > (a.weight ?? 0) ? b : a));
      const next = prescribe(
        {
          exercise,
          user,
          goalType: "gain",
          week: { targetRir: week.targetRir, isDeload: week.isDeload },
          previous: prev,
          actualSets: simulateCleanWeek(prev),
          exerciseFeedback: { jointPain: 0, pump: 6, workload: 5 },
          workoutFeedback: benignWorkoutFeedback,
          muscleGroupWeeklySets: 12,
          weekPeak: { weight: peak.weight, reps: peak.reps, sets: peak.sets, targetRir: peak.targetRir },
          initial: null,
          strengthAnchor: anchor,
          bodyweight: null,
        },
        params,
      );
      prescriptions.push(next);
      prev = next;
    }

    // Clean performance keeps the anchor ≈ stable (133), so the load HOLDS at
    // 95 and the prescribed reps climb with the tightening RIR
    // (climb_on_performed_reps), capped at the gain window's 12
    // (bound_to_target_window). The deload reprices off the anchor at the
    // recovery RIR 6 (deload_anchor_rir; NOT the legacy 55%-of-peak) with
    // sets halved to the min_sets floor.
    expect(
      prescriptions.map((p) => ({ weight: p.weight, reps: p.reps, rir: p.targetRir, sets: p.sets })),
    ).toEqual([
      { weight: 95, reps: 9, rir: 3, sets: 2 },
      { weight: 95, reps: 10, rir: 2, sets: 2 },
      { weight: 95, reps: 11, rir: 1, sets: 2 },
      { weight: 95, reps: 12, rir: 0, sets: 2 },
      { weight: 85, reps: 11, rir: 6, sets: 2 },
    ]);

    expect(prescriptions[0].rationale).toMatch(/seeded from strength anchor/i);
    expect(prescriptions[4].rationale).toMatch(/deload off strength anchor/i);
    for (const p of prescriptions) {
      expect(p.rationale.length).toBeGreaterThan(10);
      expect(p.trace.length).toBeGreaterThan(0);
    }
  });

  it("bodyweight_loadable dips (bodyweight 180): prices in effective-load space, prescribes the added weight, deloads to bodyweight", () => {
    const exercise = { equipmentType: "bodyweight" as const, loadType: "bodyweight_loadable" as const };
    const BW = 180;
    const toEffective = (added: number) => effectiveLoad("bodyweight_loadable", added, BW)!;

    // Prior history at +25 lb added (effective 205). Best session
    // (205×9@1RIR → Brzycki 273; mates 264/264) → anchor ≈ 268 effective e1RM.
    const history: Session[] = [
      { day: -14, key: "p1", sets: [{ weight: 25, reps: 8, rir: 2 }, { weight: 25, reps: 8, rir: 2 }, { weight: 25, reps: 7, rir: 2 }] },
      { day: -7, key: "p2", sets: [{ weight: 25, reps: 9, rir: 1 }, { weight: 25, reps: 8, rir: 1 }, { weight: 25, reps: 8, rir: 1 }] },
    ];

    const prescriptions: Prescription[] = [];
    let anchor = anchorAt(history, 0, toEffective);
    expect(anchor?.confidence).toBe("moderate");
    expect(anchor?.value).toBeCloseTo(267.8, 1);

    // Effective load for 8 reps @ 3 RIR off e1RM 268 ≈ 196 → added = 196 − 180
    // = 16 → rounds to 15 (rounding applies to the ENTERED added value).
    let prev = seedMeso(null, null, exercise, user, ramp[0].targetRir, params, {
      goalType: "gain",
      anchor,
      bodyweight: BW,
    });
    prescriptions.push(prev);

    for (const week of ramp.slice(1)) {
      const nowDay = 7 * (week.weekNumber - 1);
      history.push({
        day: 7 * (week.weekNumber - 2),
        key: `w${week.weekNumber - 1}`,
        sets: simulateCleanWeek(prev).map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rirReported! })),
      });
      anchor = anchorAt(history, nowDay, toEffective);
      const peak = prescriptions.reduce((a, b) => ((b.weight ?? 0) > (a.weight ?? 0) ? b : a));
      const next = prescribe(
        {
          exercise,
          user,
          goalType: "gain",
          week: { targetRir: week.targetRir, isDeload: week.isDeload },
          previous: prev,
          actualSets: simulateCleanWeek(prev),
          exerciseFeedback: { jointPain: 0, pump: 6, workload: 5 },
          workoutFeedback: benignWorkoutFeedback,
          muscleGroupWeeklySets: 12,
          weekPeak: { weight: peak.weight, reps: peak.reps, sets: peak.sets, targetRir: peak.targetRir },
          initial: null,
          strengthAnchor: anchor,
          bodyweight: BW,
        },
        params,
      );
      prescriptions.push(next);
      prev = next;
    }

    // `weight` is the ADDED load. It holds at 15 while reps climb down the
    // ramp; the deload drops the added weight to 0 (bodyweight only,
    // effective 180) at the recovery RIR.
    expect(
      prescriptions.map((p) => ({ weight: p.weight, reps: p.reps, rir: p.targetRir, sets: p.sets })),
    ).toEqual([
      { weight: 15, reps: 8, rir: 3, sets: 2 },
      { weight: 15, reps: 9, rir: 2, sets: 2 },
      { weight: 15, reps: 10, rir: 1, sets: 2 },
      { weight: 15, reps: 11, rir: 0, sets: 2 },
      { weight: 0, reps: 8, rir: 6, sets: 2 },
    ]);

    expect(prescriptions[0].rationale).toMatch(/effective 195 lb/i);
    expect(prescriptions[4].rationale).toMatch(/bodyweight deload/i);
  });
});

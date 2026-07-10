/**
 * doc 16 §5.3 — marker ⇄ earn-gate agreement fixture (Phase 3): the day view's
 * ▲/met/▼ markers and the engine's earn-gate compliance row must be the SAME
 * comparison, asserted once. For every scenario: the gate's "prescription
 * fully performed" row passes exactly when the marker sequence says it should
 * — count ≥ prescribed AND every working set over|met (an `under` or a
 * not-comparable null fails). One curve, one band, one comparison (§2.5).
 */
import { describe, expect, it } from "vitest";
import {
  assessProgression,
  complianceBand,
} from "@/lib/engine/rules/progression";
import type { EngineInputs } from "@/lib/engine/types";
import { V20_PARAMS, baseInputs } from "@/lib/engine/__tests__/helpers";
import { loggedSetMarker } from "../day-rules";

const PERMISSIVE_HISTORY = {
  earnedThisMicrocycle: false,
  trailing30dPrescribedGainPct: null,
  consecutiveMissedEarns: 0,
};

/** Clean inputs where ONLY the previous session's performance varies — every
 *  non-compliance gate predicate (pain, dampener, workload, deload, staleness,
 *  confidence, goal factor) is arranged to pass, so the gate outcome isolates
 *  the compliance row under test. */
function inputsFor(actualSets: EngineInputs["actualSets"]): EngineInputs {
  return baseInputs({
    goalType: "hypertrophy",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 100, reps: 8, sets: 3, targetRir: 3 },
    actualSets,
    exerciseFeedback: null,
    workoutFeedback: null,
    strengthAnchor: { value: 150, confidence: "moderate" },
    progressionHistory: PERMISSIVE_HISTORY,
    daysSincePreviousSession: 7,
  });
}

type ActualSet = EngineInputs["actualSets"][number];

function set(over: Partial<ActualSet> & { setNumber: number }): ActualSet {
  return { weight: 100, reps: 8, rirReported: null, isWarmup: false, ...over };
}

const band = complianceBand(V20_PARAMS);
const e1rmCfg = V20_PARAMS.e1rm;

/** The day view's per-set marker against the previous prescription — exactly
 *  the values the SetRow computes (external load: entered IS effective). */
function markersFor(sets: ActualSet[]): ("over" | "met" | "under" | null)[] {
  return sets
    .filter((s) => !s.isWarmup)
    .map((s) =>
      loggedSetMarker({
        prescribedEffectiveWeight: 100,
        prescribedReps: 8,
        loggedEffectiveWeight: s.weight,
        loggedReps: s.reps,
        loggedRir: s.rirReported,
        targetRir: 3,
        band,
        e1rmCfg,
      }),
    );
}

const scenarios: { name: string; sets: ActualSet[] }[] = [
  {
    name: "exact compliance, quick-logged (all met)",
    sets: [set({ setNumber: 1 }), set({ setNumber: 2 }), set({ setNumber: 3 })],
  },
  {
    name: "one set a rep short (under)",
    sets: [set({ setNumber: 1 }), set({ setNumber: 2, reps: 7 }), set({ setNumber: 3 })],
  },
  {
    name: "athlete-owned weight change UP meeting the target in e1RM terms",
    sets: [
      set({ setNumber: 1, weight: 105 }),
      set({ setNumber: 2, weight: 105 }),
      set({ setNumber: 3, weight: 105 }),
    ],
  },
  {
    name: "honestly reported grind (RIR 1 vs target 3) at prescribed load",
    sets: [
      set({ setNumber: 1, rirReported: 1 }),
      set({ setNumber: 2, rirReported: 1 }),
      set({ setNumber: 3, rirReported: 1 }),
    ],
  },
  {
    name: "reported RIR at the target (met, not under)",
    sets: [
      set({ setNumber: 1, rirReported: 3 }),
      set({ setNumber: 2, rirReported: 3 }),
      set({ setNumber: 3, rirReported: 3 }),
    ],
  },
  {
    name: "fewer working sets than prescribed",
    sets: [set({ setNumber: 1 }), set({ setNumber: 2 })],
  },
  {
    name: "a non-working (zero-load) set is not comparable",
    sets: [set({ setNumber: 1 }), set({ setNumber: 2, weight: 0 }), set({ setNumber: 3 })],
  },
  {
    name: "beat the ask on reps (over) — still compliant",
    sets: [
      set({ setNumber: 1, reps: 10 }),
      set({ setNumber: 2, reps: 10 }),
      set({ setNumber: 3, reps: 10 }),
    ],
  },
];

describe("marker ⇄ earn-gate agreement (doc 16 §5.3, one comparison)", () => {
  for (const { name, sets } of scenarios) {
    it(name, () => {
      const markers = markersFor(sets);
      const markersSayCompliant =
        markers.length >= 3 && markers.every((m) => m === "over" || m === "met");

      const gate = assessProgression(inputsFor(sets), V20_PARAMS, {
        weight: 100,
        reps: 8,
      });
      const gateSaysCompliant = !(
        gate.status === "not_earned" && gate.predicate === "compliance"
      );

      expect(gateSaysCompliant).toBe(markersSayCompliant);
    });
  }

  it("the compliant scenarios actually reach an offered/paced step (sanity)", () => {
    const gate = assessProgression(
      inputsFor([set({ setNumber: 1 }), set({ setNumber: 2 }), set({ setNumber: 3 })]),
      V20_PARAMS,
      { weight: 100, reps: 8 },
    );
    expect(gate.status).toBe("offered");
  });
});

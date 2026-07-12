/**
 * Envelope loop (doc 17 §7, N36): the demand-side band-position fold —
 * loop-off byte-identity (absent/disabled block ⇒ null position, and the
 * params block's mere presence never changes prescribe/seedMeso output),
 * the per-user data-sufficiency short-circuit (< min_history_mesos
 * qualifying mesos ⇒ the tunable default; auto-kick-in as history accrues),
 * bounded movement + dwell + clamp goldens, the worst-case floor/top pins,
 * and source-agnostic composition with the Phase-2 pacer (the derived
 * `inputs.bandPosition` lerps identically under `"band"` and `"plan"`,
 * overriding the fixed params `band_position` only when assembled).
 */
import { describe, expect, it } from "vitest";
import {
  boundaryStep,
  deriveBandPosition,
  envelopeActive,
  MAX_BOUNDARY_STEP,
  prescribe,
  seedMeso,
  type EnvelopeMesoOutcome,
  type EnvelopeParams,
} from "../index";
import type { EngineInputs, Prescription, DecisionTraceStep } from "../types";
import type { EngineParams } from "../params";
import { V19_PARAMS, V20_PARAMS, baseInputs } from "./helpers";

/** The provisional defaults exactly as the params schema ships them. */
const ENVELOPE: EnvelopeParams = {
  enabled: true,
  lookback_mesos: 3,
  max_age_days: 180,
  min_decisions: 8,
  min_history_mesos: 2,
  step: 0.1,
  dwell_mesos: 1,
  raise: { earn_rate: 0.7, max_miss_ratio: 0.2, pacer_trips: 2, over_share: 0.25 },
  lower: { miss_ratio: 0.5, throttle_trips: 2, workload_firings: 3 },
};

/** v20 + the envelope block on — the shape an activating params bump ships. */
const ENVELOPE_PARAMS: EngineParams = {
  ...V20_PARAMS,
  progression: { ...V20_PARAMS.progression!, envelope: ENVELOPE },
};

const envelopeAt = (over: Partial<EnvelopeParams>): EngineParams => ({
  ...V20_PARAMS,
  progression: {
    ...V20_PARAMS.progression!,
    envelope: { ...ENVELOPE, ...over },
  },
});

/** Sufficiency gate open at a single meso — isolates the per-boundary step
 *  semantics from the data-sufficiency short-circuit tested separately. */
const FOLD_PARAMS = envelopeAt({ min_history_mesos: 1 });

/** A meso that moves nothing: mid earn rate, no misses, no pressure. */
const outcome = (
  over: Partial<EnvelopeMesoOutcome> = {},
): EnvelopeMesoOutcome => ({
  decisions: 12,
  earned: 6,
  earnedThenMet: 5,
  earnedThenMissed: 0,
  throttleTrips: 0,
  pacerTrips: 0,
  workloadFirings: 0,
  overShare: 0,
  ...over,
});

/** Earning steadily, answering the asks, held back by the pacer ⇒ raise. */
const RAISE = outcome({ earned: 10, earnedThenMet: 6, pacerTrips: 2 });
/** Asks going unanswered ⇒ lower. */
const LOWER = outcome({ earnedThenMet: 2, earnedThenMissed: 3 });

describe("envelopeActive / loop-off", () => {
  it("absent block ⇒ inactive; null fold", () => {
    expect(envelopeActive(V20_PARAMS)).toBe(false);
    expect(envelopeActive(V19_PARAMS)).toBe(false);
    expect(deriveBandPosition([RAISE], V20_PARAMS)).toBeNull();
  });

  it("enabled: false ⇒ inactive (tunables stay visible, loop off)", () => {
    const off = envelopeAt({ enabled: false });
    expect(envelopeActive(off)).toBe(false);
    expect(deriveBandPosition([RAISE], off)).toBeNull();
  });

  it("progression mode off ⇒ inactive even with the block present", () => {
    const modeOff: EngineParams = {
      ...ENVELOPE_PARAMS,
      progression: { ...ENVELOPE_PARAMS.progression!, mode: "off" },
    };
    expect(envelopeActive(modeOff)).toBe(false);
  });

  it("the block's mere presence never changes engine output (assembly is the only path)", () => {
    // same inputs, no bandPosition assembled: v20 and v20+envelope agree byte-for-byte
    const inputs = baseInputs({
      goalType: "hypertrophy",
      previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
      actualSets: [
        { setNumber: 1, weight: 145, reps: 8, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 145, reps: 8, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 145, reps: 8, rirReported: null, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 198.2, confidence: "moderate" },
      progressionHistory: {
        earnedThisMicrocycle: false,
        trailing30dPrescribedGainPct: null,
        consecutiveMissedEarns: 0,
      },
      daysSincePreviousSession: 7,
    });
    expect(prescribe(inputs, ENVELOPE_PARAMS)).toEqual(
      prescribe(inputs, V20_PARAMS),
    );
    const seedOut = (params: EngineParams) =>
      seedMeso(
        null,
        null,
        { equipmentType: "barbell", loadType: "external" },
        { experienceLevel: "intermediate" },
        3,
        params,
        {
          goalType: "hypertrophy",
          anchor: { value: 198.2, confidence: "moderate" },
        },
      );
    expect(seedOut(ENVELOPE_PARAMS)).toEqual(seedOut(V20_PARAMS));
  });
});

describe("the fold: bounded movement, dwell, clamp", () => {
  it("no completed mesos ⇒ the params default (starting position)", () => {
    expect(deriveBandPosition([], ENVELOPE_PARAMS)).toBe(0.5);
  });

  it("a neutral meso steps nothing", () => {
    expect(deriveBandPosition([outcome()], FOLD_PARAMS)).toBe(0.5);
  });

  it("raise/lower move by one bounded step per boundary", () => {
    expect(deriveBandPosition([RAISE], FOLD_PARAMS)).toBe(0.6);
    expect(deriveBandPosition([LOWER], FOLD_PARAMS)).toBe(0.4);
    expect(deriveBandPosition([RAISE, LOWER], FOLD_PARAMS)).toBe(0.5);
  });

  it("a sparse meso (< min_decisions) is no evidence", () => {
    // paired with a qualifying neutral meso so the sufficiency gate is open:
    // the sparse boundary itself still steps nothing
    expect(
      deriveBandPosition(
        [outcome(), { ...RAISE, decisions: 5, earned: 5 }],
        FOLD_PARAMS,
      ),
    ).toBe(0.5);
  });

  it("down wins over up when both fire (conservative)", () => {
    const both = outcome({
      earned: 10,
      earnedThenMet: 2,
      earnedThenMissed: 3, // miss ratio 0.6 ≥ 0.5
      pacerTrips: 2,
    });
    expect(deriveBandPosition([both], FOLD_PARAMS)).toBe(0.4);
  });

  it("no answered asks: raise still needs real up-pressure", () => {
    // earning 10/12 with zero answered asks — pacer trips carry the raise
    const unanswered = outcome({ earned: 10, earnedThenMet: 0, pacerTrips: 2 });
    expect(deriveBandPosition([unanswered], FOLD_PARAMS)).toBe(0.6);
    // same earn rate but the pacer never bound and nothing was beaten:
    // a raise would be invisible — hold
    const noPressure = outcome({ earned: 10, earnedThenMet: 8, overShare: 0.1 });
    expect(deriveBandPosition([noPressure], FOLD_PARAMS)).toBe(0.5);
  });

  it("beat share is the alternate up-pressure signal", () => {
    const beats = outcome({ earned: 10, earnedThenMet: 8, overShare: 0.3 });
    expect(deriveBandPosition([beats], FOLD_PARAMS)).toBe(0.6);
  });

  it("dwell: a new position holds dwell_mesos boundaries before the next move", () => {
    const dwell2 = envelopeAt({ dwell_mesos: 2 });
    // step at boundary 1, dwell through boundary 2, step at boundary 3
    expect(deriveBandPosition([RAISE, RAISE, RAISE], dwell2)).toBe(0.7);
    // default dwell 1 = held exactly one meso ⇒ free at every boundary
    expect(deriveBandPosition([RAISE, RAISE, RAISE], ENVELOPE_PARAMS)).toBe(0.8);
  });

  it("lookback bounds the window: older boundaries age out", () => {
    const five = [RAISE, RAISE, RAISE, RAISE, RAISE];
    // lookback 3 ⇒ only the trailing three step: 0.5 + 0.3
    expect(deriveBandPosition(five, ENVELOPE_PARAMS)).toBe(0.8);
  });

  it("worst case: a broken outer loop pins the band floor/top — and no further", () => {
    const max = envelopeAt({ step: 0.25 });
    // three raises at the binding step: 0.5 → 0.75 → 1 → clamp holds 1
    expect(deriveBandPosition([RAISE, RAISE, RAISE], max)).toBe(1);
    // three lowers: 0.5 → 0.25 → 0 → clamp holds 0
    expect(deriveBandPosition([LOWER, LOWER, LOWER], max)).toBe(0);
  });

  it("|Δ| ≤ 0.25 binds over any tuned step", () => {
    const oversized = { ...ENVELOPE, step: 0.4 }; // schema forbids; belt anyway
    expect(boundaryStep(RAISE, oversized)).toBe(MAX_BOUNDARY_STEP);
    expect(boundaryStep(LOWER, oversized)).toBe(-MAX_BOUNDARY_STEP);
  });
});

describe("per-user data-sufficiency short-circuit (doc 17 §7 self-gating)", () => {
  it("below min_history_mesos ⇒ the tunable default, however loud the evidence", () => {
    // one qualifying meso is not enough history at the shipped default (2)
    expect(deriveBandPosition([RAISE], ENVELOPE_PARAMS)).toBe(0.5);
    expect(deriveBandPosition([LOWER], ENVELOPE_PARAMS)).toBe(0.5);
  });

  it("kicks in automatically once the user's history reaches the minimum", () => {
    expect(deriveBandPosition([outcome(), RAISE], ENVELOPE_PARAMS)).toBe(0.6);
  });

  it("sparse mesos (< min_decisions) do not count toward the minimum", () => {
    expect(
      deriveBandPosition([{ ...outcome(), decisions: 5 }, RAISE], ENVELOPE_PARAMS),
    ).toBe(0.5);
  });

  it("the short-circuited position IS the tunable params band_position", () => {
    const lowDefault: EngineParams = {
      ...ENVELOPE_PARAMS,
      progression: { ...ENVELOPE_PARAMS.progression!, band_position: 0.3 },
    };
    expect(deriveBandPosition([RAISE], lowDefault)).toBe(0.3);
  });

  it("re-engages when qualifying history falls out of the lookback window", () => {
    const sparse = { ...outcome(), decisions: 2 };
    // an older qualifying meso outside the window is not sufficiency
    expect(
      deriveBandPosition(
        [outcome(), RAISE, sparse, sparse],
        envelopeAt({ lookback_mesos: 2 }),
      ),
    ).toBe(0.5);
  });
});

describe("pacer composition (source-agnostic, doc 17 §7)", () => {
  const PERMISSIVE = {
    earnedThisMicrocycle: false,
    trailing30dPrescribedGainPct: null,
    consecutiveMissedEarns: 0,
  };
  const earnedInputs = (over: Partial<EngineInputs> = {}) =>
    baseInputs({
      goalType: "hypertrophy",
      week: { targetRir: 2, isDeload: false },
      previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
      actualSets: [
        { setNumber: 1, weight: 145, reps: 8, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 145, reps: 8, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 145, reps: 8, rirReported: null, isWarmup: false },
      ],
      exerciseFeedback: null,
      workoutFeedback: null,
      strengthAnchor: { value: 198.2, confidence: "moderate" },
      progressionHistory: { ...PERMISSIVE, trailing30dPrescribedGainPct: 2.0 },
      daysSincePreviousSession: 7,
      ...over,
    });
  const steps = (p: Prescription): DecisionTraceStep[] =>
    p.trace.filter((s) => s.rule === "progression");

  it("the derived position overrides the fixed params band_position", () => {
    // intermediate band [1.5, 3], hypertrophy factor 0.75; trailing 2.0.
    // params position 0.5 ⇒ target 1.6875 ⇒ paced …
    const fixed = prescribe(earnedInputs(), ENVELOPE_PARAMS);
    expect(steps(fixed)[0].governor).toBe("rate_pacer");
    // … but the derived position 1.0 ⇒ target 2.25 ⇒ the step flows
    const top = prescribe(earnedInputs({ bandPosition: 1.0 }), ENVELOPE_PARAMS);
    expect(steps(top)[0].status).toBe("stepped");
    // and the derived floor pins the target down ⇒ paced
    const floor = prescribe(earnedInputs({ bandPosition: 0.0 }), ENVELOPE_PARAMS);
    expect(steps(floor)[0].governor).toBe("rate_pacer");
  });

  it("null bandPosition ≡ absent ≡ the params value (byte-identical)", () => {
    const absent = prescribe(earnedInputs(), ENVELOPE_PARAMS);
    const asNull = prescribe(earnedInputs({ bandPosition: null }), ENVELOPE_PARAMS);
    const atParams = prescribe(earnedInputs({ bandPosition: 0.5 }), ENVELOPE_PARAMS);
    expect(asNull).toEqual(absent);
    expect(atParams).toEqual(absent);
  });

  it("composes identically under rate_source 'plan' (the lerp is source-agnostic)", () => {
    const plan: EngineParams = {
      ...ENVELOPE_PARAMS,
      progression: { ...ENVELOPE_PARAMS.progression!, rate_source: "plan" },
    };
    const rate = { low: 4, high: 8 }; // ⇒ targets 3 / 6 at positions 0 / 1 (× 0.75)
    const floor = prescribe(
      earnedInputs({
        planStrengthRate: rate,
        bandPosition: 0.0,
        progressionHistory: { ...PERMISSIVE, trailing30dPrescribedGainPct: 3.1 },
      }),
      plan,
    );
    expect(steps(floor)[0].governor).toBe("rate_pacer");
    const top = prescribe(
      earnedInputs({
        planStrengthRate: rate,
        bandPosition: 1.0,
        progressionHistory: { ...PERMISSIVE, trailing30dPrescribedGainPct: 5.9 },
      }),
      plan,
    );
    expect(steps(top)[0].status).toBe("stepped");
  });

  it("the seed route threads the position through the same gate", () => {
    const seedAt = (bandPosition: number) =>
      seedMeso(
        null,
        null,
        { equipmentType: "barbell", loadType: "external" },
        { experienceLevel: "intermediate" },
        3,
        ENVELOPE_PARAMS,
        {
          goalType: "hypertrophy",
          anchor: { value: 198.2, confidence: "moderate" },
          earn: {
            previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
            actualSets: [
              { setNumber: 1, weight: 145, reps: 8, rirReported: null, isWarmup: false },
              { setNumber: 2, weight: 145, reps: 8, rirReported: null, isWarmup: false },
              { setNumber: 3, weight: 145, reps: 8, rirReported: null, isWarmup: false },
            ],
            exerciseFeedback: null,
            workoutFeedback: null,
          },
          daysSincePreviousSession: 7,
          progressionHistory: { ...PERMISSIVE, trailing30dPrescribedGainPct: 2.0 },
          bandPosition,
        },
      );
    expect(
      seedAt(0).trace.find((s) => s.rule === "progression")?.governor,
    ).toBe("rate_pacer");
    expect(
      seedAt(1).trace.find((s) => s.rule === "progression")?.status,
    ).toBe("stepped");
  });
});

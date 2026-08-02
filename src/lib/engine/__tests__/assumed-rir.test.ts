/**
 * doc 21 §2 (N71/N38) — ONE RIR premise.
 *
 * Before this, two paths disagreed about what RIR a logged set was performed
 * at. The strength anchor honored the set's prescribed `target_rir`; the stored
 * per-set e1RM stamp keyed on `logged_sets.rir_reported`, which the app never
 * wrote — so `effectiveReps = reps + 0` and **every stats surface treated every
 * set as taken to failure**, while the engine's own anchor did not.
 *
 * The fix is one shared resolution, `assumedRir(reported, prescribed)`, used at
 * the stamp site, in the anchor, in the compliance marker, and in the restamp
 * backfill. These tests pin the rule itself and the parity it buys: on one
 * fixture, the stamp path and the anchor path must land on the same number.
 */
import { describe, expect, it } from "vitest";
import {
  assumedRir,
  estimateE1rm,
  recencyWeightedE1rm,
  DEFAULT_ENGINE_PARAMS,
  type E1rmSample,
} from "@/lib/engine";
import { estimateE1rm as estimateE1rmCore } from "@/lib/engine/predict";
import { setComplianceMarker, complianceBand } from "@/lib/engine/rules/progression";
import { planRestamps } from "@/lib/queries/e1rm-restamp";

const PARAMS = DEFAULT_ENGINE_PARAMS;
const CFG = PARAMS.e1rm;

describe("assumedRir — the shared resolution rule", () => {
  it("the athlete's report wins over the prescription", () => {
    expect(assumedRir(0, 3)).toBe(0);
    expect(assumedRir(5, 1)).toBe(5);
  });

  it("falls back to the prescription where nothing was reported", () => {
    expect(assumedRir(null, 3)).toBe(3);
    expect(assumedRir(undefined, 3)).toBe(3);
  });

  // the N11 guard, stated at the rule level: absence resolves to the ASK, never
  // to zero. A set exactly as prescribed must not read as taken to failure.
  it("never resolves an absent report to 0", () => {
    expect(assumedRir(null, 6)).not.toBe(0);
    expect(assumedRir(null, 6)).toBe(6);
  });

  it("a reported 0 is a value, not an absence", () => {
    expect(assumedRir(0, 6)).toBe(0);
  });

  it("stays null when there is no report AND no prescription", () => {
    expect(assumedRir(null, null)).toBeNull();
    expect(assumedRir(undefined, undefined)).toBeNull();
  });
});

describe("stamp ⇄ anchor parity on one fixture (N71 closes by construction)", () => {
  // one session, one exercise: 225 × 8, unreported RIR, prescribed at 2 RIR
  const WEIGHT = 225;
  const REPS = 8;
  const PRESCRIBED_RIR = 2;
  const REPORTED_RIR = null;

  const resolved = assumedRir(REPORTED_RIR, PRESCRIBED_RIR);

  /** what `computeSetE1rm` (the log/amend stamp site) now stores */
  const stamped = estimateE1rm(WEIGHT, REPS, resolved, PARAMS);

  /** what `getExerciseE1rmAnchors` folds through `recencyWeightedE1rm` */
  const sample: E1rmSample = {
    weight: WEIGHT,
    reps: REPS,
    targetRir: resolved,
    ageDays: 0,
    sessionKey: "we-1",
  };
  const anchor = recencyWeightedE1rm([sample], PARAMS);

  it("the stored stamp and the strength anchor agree", () => {
    expect(stamped).not.toBeNull();
    expect(anchor).not.toBeNull();
    expect(stamped!.value).toBeCloseTo(anchor!.value, 6);
  });

  it("the restamp backfill reproduces the same number", () => {
    const plan = planRestamps(
      [
        {
          id: "s1",
          workout_exercise_id: "we-1",
          weight: WEIGHT,
          reps: REPS,
          rir_reported: REPORTED_RIR,
          e1rm: null,
          e1rm_confidence: null,
        },
      ],
      CFG,
      new Map([["we-1", PRESCRIBED_RIR]]),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].e1rm).toBeCloseTo(stamped!.value, 6);
  });

  // the divergence this closes: before doc 21 the stamp resolved to `reps + 0`
  it("the pre-doc-21 stamp was strictly lower than the anchor said", () => {
    const asFailure = estimateE1rmCore(WEIGHT, REPS, REPORTED_RIR, CFG);
    expect(asFailure!.value).toBeLessThan(anchor!.value);
  });

  it("the compliance marker scores that set as met, not under", () => {
    expect(
      setComplianceMarker({
        prescribedEffectiveWeight: WEIGHT,
        prescribedReps: REPS,
        loggedEffectiveWeight: WEIGHT,
        loggedReps: REPS,
        loggedRir: REPORTED_RIR,
        targetRir: PRESCRIBED_RIR,
        band: complianceBand(PARAMS),
        e1rmCfg: CFG,
      }),
    ).toBe("met");
  });
});

describe("the re-levelling this causes is one-time and upward", () => {
  // doc 21 §2 blast radius: a set prescribed at RIR 2 gains 2 effective reps,
  // so PRs / best_e1rm / key lifts / the strength trend all step up once.
  it("every unreported historical set re-levels upward, never down", () => {
    for (const prescribed of [1, 2, 3, 4, 6]) {
      const before = estimateE1rmCore(200, 8, null, CFG)!.value;
      const after = estimateE1rmCore(200, 8, assumedRir(null, prescribed), CFG)!
        .value;
      expect(after).toBeGreaterThan(before);
    }
  });

  it("a set that DID report its RIR is untouched by the change", () => {
    const before = estimateE1rmCore(200, 8, 3, CFG)!.value;
    const after = estimateE1rmCore(200, 8, assumedRir(3, 6), CFG)!.value;
    expect(after).toBe(before);
  });
});

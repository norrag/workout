/**
 * The measuring band (doc 21 §6.1, Phase 2b) — the guard that makes §4.3's
 * unbounded prescription RIR safe.
 *
 * Past `e1rm.max_measuring_rir` a set is priced and performed normally but is
 * NOT treated as a measurement: no stored e1RM, confidence `none`, dropped from
 * the anchor and every strength surface, kept in volume.
 */
import { describe, expect, it } from "vitest";
import {
  estimateE1rm,
  isMeasuringRir,
  stampE1rm,
  NON_MEASURING_CONFIDENCE,
} from "../predict";
import { recencyWeightedE1rm, type E1rmSample } from "../reps";
import { V20_PARAMS, V24_PARAMS } from "./helpers";

const BAND = V24_PARAMS.e1rm; // max_measuring_rir: 8
const NO_BAND = V20_PARAMS.e1rm; // the key is absent

describe("isMeasuringRir — the boundary (§6.1)", () => {
  it("RIR 8 measures and RIR 9 does not, at the default", () => {
    expect(isMeasuringRir(8, BAND)).toBe(true);
    expect(isMeasuringRir(9, BAND)).toBe(false);
  });

  it("everything up to the old target_rir ceiling still measures", () => {
    for (const rir of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(isMeasuringRir(rir, BAND), `rir ${rir}`).toBe(true);
    }
  });

  it("an ABSENT param is today's behavior — nothing is ever non-measuring", () => {
    for (const rir of [0, 8, 9, 21, 30]) {
      expect(isMeasuringRir(rir, NO_BAND), `rir ${rir}`).toBe(true);
    }
  });

  it("an unknown RIR stays measuring (it is already `low` confidence)", () => {
    expect(isMeasuringRir(null, BAND)).toBe(true);
  });
});

describe("stampE1rm (§6.1)", () => {
  it("inside the band it is exactly estimateE1rm", () => {
    const est = estimateE1rm(200, 8, 2, BAND)!;
    expect(stampE1rm(200, 8, 2, BAND)).toEqual({
      e1rm: est.value,
      e1rm_confidence: est.confidence,
    });
  });

  it("past the band the value is null and the label is `none`", () => {
    expect(stampE1rm(200, 9, 21, BAND)).toEqual({
      e1rm: null,
      e1rm_confidence: NON_MEASURING_CONFIDENCE,
    });
  });

  it("`none` is distinguishable from a non-working set, which stamps null/null", () => {
    expect(stampE1rm(0, 9, 21, BAND)).toEqual({
      e1rm: null,
      e1rm_confidence: null,
    });
    expect(stampE1rm(200, 0, 21, BAND)).toEqual({
      e1rm: null,
      e1rm_confidence: null,
    });
  });

  it("the boundary: 8 stamps a value, 9 stamps `none`", () => {
    expect(stampE1rm(200, 9, 8, BAND).e1rm).not.toBeNull();
    expect(stampE1rm(200, 9, 9, BAND).e1rm).toBeNull();
  });

  it("absent param ⇒ byte-identical stamps at every RIR", () => {
    for (const rir of [0, 8, 9, 21, 30]) {
      const est = estimateE1rm(200, 9, rir, NO_BAND)!;
      expect(stampE1rm(200, 9, rir, NO_BAND), `rir ${rir}`).toEqual({
        e1rm: est.value,
        e1rm_confidence: est.confidence,
      });
    }
  });

  it("gates on the ASSUMED RIR, not on effective reps — honest high-rep work is kept", () => {
    // 15 reps at RIR 1 is 15 reps of OBSERVATION: low confidence, still measured
    const honestHighRep = stampE1rm(100, 15, 1, BAND);
    expect(honestHighRep.e1rm).not.toBeNull();
    expect(honestHighRep.e1rm_confidence).toBe("low");
    // 9 reps at RIR 21 is 9 observed and 21 asserted — fewer effective reps
    // would not save it
    expect(stampE1rm(100, 1, 21, BAND).e1rm).toBeNull();
  });
});

describe("anchor freeze under a deep back-off (§6.1)", () => {
  // the anchor query drops non-measuring samples before folding
  // (`queries/anchors.ts`); this reproduces that filter over the pure fold.
  function anchorOf(samples: E1rmSample[], cfg: typeof BAND) {
    return recencyWeightedE1rm(
      samples.filter((s) => isMeasuringRir(s.targetRir, cfg)),
      { ...V24_PARAMS, e1rm: cfg },
    );
  }

  const measured: E1rmSample[] = [
    { weight: 265, reps: 9, targetRir: 0, ageDays: 21, sessionKey: "w1" },
    { weight: 265, reps: 9, targetRir: 0, ageDays: 21, sessionKey: "w1" },
  ];
  // a rehab block at RIR 21: real work, freshly performed, but no measurement
  const backedOff: E1rmSample[] = [
    { weight: 170, reps: 9, targetRir: 21, ageDays: 0, sessionKey: "w2" },
    { weight: 170, reps: 9, targetRir: 21, ageDays: 0, sessionKey: "w2" },
  ];

  it("freezes at the last measured value instead of drifting on fiction", () => {
    const before = anchorOf(measured, BAND);
    const after = anchorOf([...measured, ...backedOff], BAND);
    expect(after!.value).toBe(before!.value);
  });

  it("without the band the same block MOVES the anchor — the failure it prevents", () => {
    const before = anchorOf(measured, NO_BAND);
    const after = anchorOf([...measured, ...backedOff], NO_BAND);
    expect(after!.value).not.toBe(before!.value);
  });

  it("a backed-off set INSIDE the band still anchors (it is RIR-adjusted, so comparable)", () => {
    const inBand: E1rmSample[] = [
      { weight: 220, reps: 9, targetRir: 8, ageDays: 0, sessionKey: "w3" },
      { weight: 220, reps: 9, targetRir: 8, ageDays: 0, sessionKey: "w3" },
    ];
    const before = anchorOf(measured, BAND);
    const after = anchorOf([...measured, ...inBand], BAND);
    expect(after!.value).not.toBe(before!.value);
  });
});

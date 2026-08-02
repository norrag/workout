import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../params";
import { resolveEffectiveParams } from "../effective-params";
import { roundToStep, latticeOrigin } from "../rules/rounding";
import { prescribe, seedMeso } from "../index";
import type { EngineInputs } from "../types";

/**
 * N67 — "when an exercise increment is set, it should index from the last weight
 * the user entered": with a 10 lb increment and an entered 88, the next stop up
 * is 98 and the next down is 78, not 90 / 80.
 */

const P = DEFAULT_ENGINE_PARAMS as EngineParams;

/** the owner's case: a machine lift the user set a 10 lb increment on */
const EFF = resolveEffectiveParams(P, { weightIncrement: 10 }, "machine");

function inputsAt(lastEntered: number): EngineInputs {
  return {
    exercise: { equipmentType: "machine", loadType: "external" },
    user: { experienceLevel: "intermediate" },
    goalType: "hypertrophy",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: lastEntered, reps: 9, sets: 3, targetRir: 2 },
    actualSets: [
      {
        setNumber: 1,
        weight: lastEntered,
        reps: 9,
        rirReported: null,
        isWarmup: false,
      },
      {
        setNumber: 2,
        weight: lastEntered,
        reps: 9,
        rirReported: null,
        isWarmup: false,
      },
    ],
    exerciseFeedback: null,
    workoutFeedback: null,
    muscleGroupWeeklySets: null,
    weekPeak: null,
    strengthAnchor: { value: 130, confidence: "high" },
    initial: null,
    bodyweight: null,
  };
}

describe("roundToStep — lattice phase (N67)", () => {
  it("keeps the absolute grid with no origin (pre-N67 behavior, byte-identical)", () => {
    expect(roundToStep(88, "machine", EFF)).toBe(90);
    expect(roundToStep(88, "machine", EFF, null)).toBe(90);
    expect(roundToStep(97, "machine", EFF)).toBe(100);
  });

  it("phases the stops on the origin: 88 steps to 98 up and 78 down", () => {
    // anything strictly inside ±half a step of the entered weight holds it
    expect(roundToStep(88, "machine", EFF, 88)).toBe(88);
    expect(roundToStep(92, "machine", EFF, 88)).toBe(88);
    expect(roundToStep(84, "machine", EFF, 88)).toBe(88);
    // one step up / down lands exactly on the entered weight ± the increment
    expect(roundToStep(88 + 10, "machine", EFF, 88)).toBe(98);
    expect(roundToStep(88 - 10, "machine", EFF, 88)).toBe(78);
    expect(roundToStep(95, "machine", EFF, 88)).toBe(98);
    expect(roundToStep(81, "machine", EFF, 88)).toBe(78);
  });

  it("still rounds to 2dp on a fractional step", () => {
    const eff = resolveEffectiveParams(P, { weightIncrement: 2.5 }, "machine");
    expect(roundToStep(88 + 2.5, "machine", eff, 88)).toBe(90.5);
    expect(roundToStep(88 - 2.5, "machine", eff, 88)).toBe(85.5);
  });
});

describe("latticeOrigin", () => {
  it("is null unless the effective params ask for it", () => {
    expect(latticeOrigin(inputsAt(88), P)).toBeNull();
    expect(latticeOrigin(inputsAt(88), EFF)).toBe(88);
  });

  it("prefers the last logged working set over the prescription", () => {
    const inputs = {
      ...inputsAt(90),
      // the lifter actually put 88 on the machine for the LAST set
      actualSets: [
        { setNumber: 1, weight: 90, reps: 9, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 88, reps: 8, rirReported: null, isWarmup: false },
      ],
    };
    expect(latticeOrigin(inputs, EFF)).toBe(88);
  });

  it("ignores warmups and zero-load rows", () => {
    const inputs = {
      ...inputsAt(88),
      actualSets: [
        { setNumber: 1, weight: 88, reps: 9, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 45, reps: 12, rirReported: null, isWarmup: true },
        { setNumber: 3, weight: 0, reps: 10, rirReported: null, isWarmup: false },
      ],
    };
    expect(latticeOrigin(inputs, EFF)).toBe(88);
  });

  it("falls back through previous → peak → plan default", () => {
    const noSets = { ...inputsAt(88), actualSets: [] };
    expect(latticeOrigin(noSets, EFF)).toBe(88); // previous
    expect(
      latticeOrigin({ ...noSets, previous: null, weekPeak: { weight: 105 } }, EFF),
    ).toBe(105);
    expect(
      latticeOrigin(
        { ...noSets, previous: null, weekPeak: null, initial: { weight: 72 } },
        EFF,
      ),
    ).toBe(72);
    // a genuinely cold slot has nothing to index off — the absolute grid stands
    expect(
      latticeOrigin(
        { ...noSets, previous: null, weekPeak: null, initial: null },
        EFF,
      ),
    ).toBeNull();
  });
});

describe("prescribe / seedMeso on the phased lattice (N67)", () => {
  it("prescribes loads on the entered weight's lattice, not absolute multiples", () => {
    const out = prescribe(inputsAt(88), EFF);
    expect(out.weight).not.toBeNull();
    // every reachable stop is 88 ± k × 10
    expect(Math.abs(out.weight! - 88) % 10).toBe(0);
  });

  it("holds the entered weight rather than snapping it to the grid", () => {
    // the same inputs on the absolute lattice cannot return 88 — it isn't a stop
    const phased = prescribe(inputsAt(88), EFF);
    const absolute = prescribe(inputsAt(88), {
      ...EFF,
      rounding_origin: "absolute",
    });
    expect(absolute.weight! % 10).toBe(0);
    expect(Math.abs(phased.weight! - 88) % 10).toBe(0);
  });

  it("carries the phase across a meso boundary through the seed's earn context", () => {
    const out = seedMeso(
      { weight: 88, reps: 9, sets: 3 },
      null,
      { equipmentType: "machine", loadType: "external" },
      { experienceLevel: "intermediate" },
      3,
      { ...EFF, seed_from_anchor: true },
      { anchor: { value: 130, confidence: "high" } },
    );
    expect(out.weight).not.toBeNull();
    expect(Math.abs(out.weight! - 88) % 10).toBe(0);
  });

  it("leaves an exercise WITHOUT an override on the absolute grid", () => {
    // no override ⇒ no `rounding_origin` ⇒ the pre-N67 path, unchanged
    const out = prescribe(inputsAt(88), P);
    expect(out.weight! % (P.rounding.machine ?? 5)).toBe(0);
  });
});

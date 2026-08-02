/**
 * The set lever + the rep position — doc 21 Phase 4 (A4 and §4.2's demoted
 * centering rule).
 *
 * Both are optional per-slot knobs, so the matrix is the same as Phase 2's:
 *   (a) unset ⇒ byte-identical output and trace;
 *   (b) the cap CLAMPS DOWN and never up, on every prescription route;
 *   (c) the cap is ABSOLUTE — an authored 1 wins over `params.min_sets`;
 *   (d) a rep position prices the load at that point in the window instead of
 *       following the climb schedule, in both directions;
 *   (e) an explicit rep count is clamped to the window's HARD bounds.
 */
import { describe, expect, it } from "vitest";
import { prescribe, seedMeso } from "../index";
import type { EngineInputs, Prescription } from "../types";
import { V19_PARAMS, baseInputs } from "./helpers";

const ANCHOR = 342.6;

/** The Phase-2 owner case: 265 × 9 @ 0 RIR, hypertrophy window 8–12. */
function slotCase(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return baseInputs({
    goalType: "hypertrophy",
    week: { targetRir: 1, isDeload: false },
    previous: { weight: 265, reps: 9, sets: 4, targetRir: 1 },
    actualSets: [1, 2, 3, 4].map((n) => ({
      setNumber: n,
      weight: 265,
      reps: 9,
      rirReported: 1,
      isWarmup: false,
    })),
    strengthAnchor: { value: ANCHOR, confidence: "high" },
    ...overrides,
  });
}

function rule(p: Prescription, name: string): string | null {
  return p.trace.find((s) => s.rule === name)?.detail ?? null;
}

// ---------------------------------------------------------------------------
// (a) unset ⇒ nothing observable changed
// ---------------------------------------------------------------------------

describe("unassigned levers are byte-identical (§7.1)", () => {
  it("omitting the keys and passing null produce the same prescription", () => {
    const withoutKeys = prescribe(slotCase(), V19_PARAMS);
    expect(
      prescribe(
        slotCase({ exerciseSetCap: null, exerciseRepPosition: null }),
        V19_PARAMS,
      ),
    ).toEqual(withoutKeys);
  });

  it("a cap the prescription already respects changes nothing at all", () => {
    const base = prescribe(slotCase(), V19_PARAMS);
    const capped = prescribe(
      slotCase({ exerciseSetCap: base.sets + 1 }),
      V19_PARAMS,
    );
    expect(capped).toEqual(base);
    expect(rule(capped, "set_cap")).toBeNull();
  });

  it("the seed route is byte-identical without the keys too", () => {
    const args = [
      null,
      { weight: 100, reps: 8, sets: 4 },
      { equipmentType: "barbell" as const, loadType: "external" as const },
      { experienceLevel: "intermediate" as const },
      2,
      V19_PARAMS,
    ] as const;
    const bare = seedMeso(...args, { goalType: "hypertrophy" });
    const explicitNulls = seedMeso(...args, {
      goalType: "hypertrophy",
      exerciseSetCap: null,
      exerciseRepPosition: null,
    });
    expect(explicitNulls).toEqual(bare);
  });
});

// ---------------------------------------------------------------------------
// (b) + (c) the cap
// ---------------------------------------------------------------------------

describe("the working-set cap is a ceiling (A4)", () => {
  it("clamps the prescribed sets down and says so in the trace", () => {
    const base = prescribe(slotCase(), V19_PARAMS);
    expect(base.sets).toBeGreaterThan(2);
    const capped = prescribe(slotCase({ exerciseSetCap: 2 }), V19_PARAMS);
    expect(capped.sets).toBe(2);
    expect(rule(capped, "set_cap")).toMatch(/working-set cap: \d+ → 2 sets/);
    expect(capped.rationale).toMatch(/Working-set cap/);
    // and nothing else about the prescription moved — a cap is a statement
    // about volume, not about load
    expect(capped.weight).toBe(base.weight);
    expect(capped.reps).toBe(base.reps);
    expect(capped.targetRir).toBe(base.targetRir);
  });

  it("never RAISES the set count — that is the plan's job", () => {
    const base = prescribe(slotCase(), V19_PARAMS);
    const capped = prescribe(slotCase({ exerciseSetCap: 20 }), V19_PARAMS);
    expect(capped.sets).toBe(base.sets);
  });

  it("is absolute: an authored 1 wins over params.min_sets", () => {
    expect(V19_PARAMS.min_sets).toBeGreaterThan(1);
    const capped = prescribe(slotCase({ exerciseSetCap: 1 }), V19_PARAMS);
    expect(capped.sets).toBe(1);
  });

  it("applies on the deload route as well", () => {
    const deload = slotCase({
      week: { targetRir: 6, isDeload: true },
      weekPeak: { weight: 265, reps: 9, sets: 5, targetRir: 1 },
    });
    const base = prescribe(deload, V19_PARAMS);
    const capped = prescribe(
      { ...deload, exerciseSetCap: 1 },
      V19_PARAMS,
    );
    expect(capped.sets).toBe(1);
    expect(capped.sets).toBeLessThan(base.sets);
    expect(capped.weight).toBe(base.weight);
  });

  it("applies on the seed route", () => {
    const args = [
      null,
      { weight: 100, reps: 8, sets: 4 },
      { equipmentType: "barbell" as const, loadType: "external" as const },
      { experienceLevel: "intermediate" as const },
      2,
      V19_PARAMS,
    ] as const;
    const bare = seedMeso(...args, { goalType: "hypertrophy" });
    expect(bare.sets).toBe(4);
    const capped = seedMeso(...args, {
      goalType: "hypertrophy",
      exerciseSetCap: 2,
    });
    expect(capped.sets).toBe(2);
    expect(capped.weight).toBe(bare.weight);
  });
});

// ---------------------------------------------------------------------------
// (d) + (e) the rep position
// ---------------------------------------------------------------------------

describe("the rep position prices where the coach asks (§4.2)", () => {
  it("top of the window prices LIGHTER than bottom, at the same RIR", () => {
    const top = prescribe(
      slotCase({ exerciseRepPosition: "top" }),
      V19_PARAMS,
    );
    const bottom = prescribe(
      slotCase({ exerciseRepPosition: "bottom" }),
      V19_PARAMS,
    );
    expect(top.weight!).toBeLessThan(bottom.weight!);
    expect(top.reps!).toBeGreaterThan(bottom.reps!);
    // the effort asked for is unchanged — this is a rep-position knob, not an
    // intensity one (that is what `set_exercise_rir` is for)
    expect(top.targetRir).toBe(bottom.targetRir);
  });

  it("center lands between the two", () => {
    const [bottom, center, top] = (["bottom", "center", "top"] as const).map(
      (p) => prescribe(slotCase({ exerciseRepPosition: p }), V19_PARAMS),
    );
    expect(center.weight!).toBeLessThanOrEqual(bottom.weight!);
    expect(center.weight!).toBeGreaterThanOrEqual(top.weight!);
  });

  it("replaces the climb schedule and records that in the trace", () => {
    const positioned = prescribe(
      slotCase({ exerciseRepPosition: "top" }),
      V19_PARAMS,
    );
    expect(rule(positioned, "rep_position")).toMatch(
      /rep position top — priced for 12 reps instead of the climb schedule/,
    );
  });

  it("an explicit rep count is honored, clamped to the window's hard bounds", () => {
    const win = V19_PARAMS.rep_window.hypertrophy!;
    const inside = prescribe(
      slotCase({ exerciseRepPosition: win.target_high }),
      V19_PARAMS,
    );
    expect(rule(inside, "rep_position")).toMatch(
      new RegExp(`priced for ${win.target_high} reps`),
    );
    // past the hard max ⇒ clamped, never escapes the goal's window
    const beyond = prescribe(
      slotCase({ exerciseRepPosition: 50 }),
      V19_PARAMS,
    );
    expect(rule(beyond, "rep_position")).toMatch(
      new RegExp(`priced for ${win.max} reps`),
    );
  });

  it("prices the seed route too", () => {
    const args = [
      null,
      { weight: 100, reps: 8, sets: 3 },
      { equipmentType: "barbell" as const, loadType: "external" as const },
      { experienceLevel: "intermediate" as const },
      2,
      { ...V19_PARAMS, seed_from_anchor: true },
    ] as const;
    const anchor = { value: ANCHOR, confidence: "high" as const };
    const bottom = seedMeso(...args, { goalType: "hypertrophy", anchor });
    const top = seedMeso(...args, {
      goalType: "hypertrophy",
      anchor,
      exerciseRepPosition: "top",
    });
    expect(top.weight!).toBeLessThan(bottom.weight!);
  });

  it("composes with an exercise-level RIR — both levers at once", () => {
    const both = prescribe(
      slotCase({
        exerciseRir: 4,
        exerciseRepPosition: "top",
        exerciseSetCap: 2,
      }),
      V19_PARAMS,
    );
    const rirOnly = prescribe(slotCase({ exerciseRir: 4 }), V19_PARAMS);
    expect(both.targetRir).toBe(4);
    expect(both.sets).toBe(2);
    // the rep position deepens the cut the RIR assignment already made
    expect(both.weight!).toBeLessThan(rirOnly.weight!);
  });
});

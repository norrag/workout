import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENGINE_PARAMS,
  prescribe,
  seedMeso,
  type E1rmAnchor,
  type EngineInputs,
  type EngineParams,
} from "@/lib/engine";
import { recomputeRow, type RecomputeArgs } from "../regeneration";
import { buildConfigInputs, buildSeedInputs, type ConfigInputs } from "../fingerprint";

const PARAMS = DEFAULT_ENGINE_PARAMS as EngineParams;

// a minimal valid EngineInputs (the immutable derived history a decision stored)
function sampleInputs(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    exercise: { equipmentType: "barbell" },
    user: { experienceLevel: "intermediate", units: "lb" },
    goalType: "hypertrophy",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 185, reps: 8, sets: 3, targetRir: 2 },
    actualSets: [
      { setNumber: 1, weight: 185, reps: 8, rirReported: 2, isWarmup: false },
      { setNumber: 2, weight: 185, reps: 8, rirReported: 2, isWarmup: false },
    ],
    exerciseFeedback: { jointPain: null, pump: null, workload: null },
    workoutFeedback: null,
    muscleGroupWeeklySets: null,
    weekPeak: null,
    initial: null,
    strengthAnchor: null,
    ...over,
  };
}

/** the config inputs that match `sampleInputs()`, optionally overridden */
function sampleConfig(over: Partial<Parameters<typeof buildConfigInputs>[0]> = {}): ConfigInputs {
  return buildConfigInputs({
    equipmentType: "barbell",
    profile: { experience_level: "intermediate", units: "lb" },
    goal: "hypertrophy",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 185, reps: 8, sets: 3, targetRir: 2 },
    initial: null,
    ...over,
  });
}

function args(over: Partial<RecomputeArgs> = {}): RecomputeArgs {
  const storedInputs = sampleInputs();
  const output = prescribe(storedInputs as unknown as EngineInputs, PARAMS);
  return {
    kind: "advance",
    storedInputs,
    liveConfig: sampleConfig(),
    anchor: null,
    currentOutput: output,
    ...over,
  };
}

describe("recomputeRow", () => {
  it("reports unchanged when the live config reproduces the stored prescription", () => {
    // liveConfig equals the stored config and the stored output is the engine's →
    // recompute yields the same numbers
    const res = recomputeRow(args(), PARAMS);
    expect(res.status).toBe("unchanged");
    expect(res.output).toBeDefined();
  });

  it("reports changed when the stored prescription is stale", () => {
    const res = recomputeRow(
      args({ currentOutput: { weight: 999, reps: 8, sets: 3, targetRir: 2 } }),
      PARAMS,
    );
    expect(res.status).toBe("changed");
    expect(res.output!.weight).not.toBe(999);
  });

  it("overlays the live config so a config change takes effect (doc 14 §6.1)", () => {
    // the stored inputs targeted RIR 2; the live week now targets RIR 0. The
    // recompute must reflect the LIVE config, not replay the stale stored one.
    const res = recomputeRow(
      args({ liveConfig: sampleConfig({ week: { targetRir: 0, isDeload: false } }) }),
      PARAMS,
    );
    expect(res.status).toBe("changed");
    expect(res.output!.targetRir).toBe(0);
  });

  it("classifies a corrupt stored decision as invalid_source (self-heal path)", () => {
    // the live config is always validly built; only corruption in the row's stored
    // DERIVED history (here actualSets) makes the rebuilt inputs un-replayable, and
    // the reconcile then self-heals by stamping the fingerprint (doc 14 §6.3).
    const res = recomputeRow(
      { ...args(), storedInputs: sampleInputs({ actualSets: "corrupt-not-an-array" }) },
      PARAMS,
    );
    expect(res.status).toBe("invalid_source");
    expect(res.output).toBeUndefined();
  });

  it("engages the rep-window path once a strength anchor is overlaid (doc 13)", () => {
    // a hypertrophy lift logged above its window: anchor-less it takes the legacy
    // increment branch; overlaying a fresh anchor flips it to the rep-window path
    const storedInputs = sampleInputs({
      exercise: { equipmentType: "dumbbell" },
      goalType: "hypertrophy",
      week: { targetRir: 0, isDeload: false },
      previous: { weight: 25, reps: 11, sets: 3, targetRir: 1 },
      actualSets: [
        { setNumber: 1, weight: 25, reps: 15, rirReported: null, isWarmup: false },
        { setNumber: 2, weight: 25, reps: 15, rirReported: null, isWarmup: false },
        { setNumber: 3, weight: 25, reps: 15, rirReported: null, isWarmup: false },
      ],
      exerciseFeedback: { jointPain: 0, pump: 8, workload: 6 },
      muscleGroupWeeklySets: 9,
    });
    const liveConfig = sampleConfig({
      equipmentType: "dumbbell",
      week: { targetRir: 0, isDeload: false },
      previous: { weight: 25, reps: 11, sets: 3, targetRir: 1 },
    });
    const legacyOut = prescribe(storedInputs as unknown as EngineInputs, PARAMS);

    // anchor-less recompute reproduces the legacy prescription → unchanged
    const before = recomputeRow(
      { kind: "advance", storedInputs, liveConfig, anchor: null, currentOutput: legacyOut },
      PARAMS,
    );
    expect(before.status).toBe("unchanged");

    // overlay a high-confidence anchor → rep-window path engages and diverges
    const anchor: E1rmAnchor = { value: 40, confidence: "high" };
    const after = recomputeRow(
      { kind: "advance", storedInputs, liveConfig, anchor, currentOutput: legacyOut },
      PARAMS,
    );
    expect(after.status).toBe("changed");
    const win = PARAMS.rep_window.hypertrophy!;
    expect(after.output!.reps).toBeGreaterThanOrEqual(win.min);
    expect(after.output!.reps).toBeLessThanOrEqual(win.max);
  });
});

describe("recomputeRow — seed (doc 14 §6.2)", () => {
  const profile = { experience_level: "intermediate" as const, units: "lb" as const };
  const peak = { weight: 200, reps: 5, sets: 3 };
  const initial = { weight: 100, reps: 8, sets: 3 };

  /** a stored seed decision (its inputs + the seedMeso output it produced) */
  function storedSeed(
    priorPeak: { weight: number | null; reps: number | null; sets: number } | null,
    init: { weight: number | null; reps: number | null; sets: number } | null,
    startRir = 3,
  ) {
    const stored = buildSeedInputs({
      equipmentType: "barbell",
      profile,
      goal: "hypertrophy",
      startRir,
      isDeload: false,
      initial: init,
      priorPeak,
    });
    const output = seedMeso(
      priorPeak,
      init,
      { equipmentType: "barbell" },
      { experienceLevel: "intermediate", units: "lb" },
      startRir,
      DEFAULT_ENGINE_PARAMS as EngineParams,
    );
    return { stored: stored as unknown as Record<string, unknown>, output };
  }

  function liveCfg(over: Partial<Parameters<typeof buildConfigInputs>[0]> = {}): ConfigInputs {
    return buildConfigInputs({
      equipmentType: "barbell",
      profile,
      goal: "hypertrophy",
      week: { targetRir: 3, isDeload: false },
      previous: null,
      initial,
      ...over,
    });
  }

  it("replays through seedMeso and reports unchanged when nothing changed", () => {
    const { stored, output } = storedSeed(peak, initial);
    const res = recomputeRow(
      { kind: "seed", storedInputs: stored, liveConfig: liveCfg(), anchor: null, currentOutput: output },
      PARAMS,
    );
    expect(res.status).toBe("unchanged");
    expect(res.output!.weight).toBe(output.weight);
  });

  it("overlays a live week-RIR change → changed (new targetRir)", () => {
    const { stored, output } = storedSeed(peak, initial);
    const res = recomputeRow(
      {
        kind: "seed",
        storedInputs: stored,
        liveConfig: liveCfg({ week: { targetRir: 1, isDeload: false } }),
        anchor: null,
        currentOutput: output,
      },
      PARAMS,
    );
    expect(res.status).toBe("changed");
    expect(res.output!.targetRir).toBe(1);
  });

  it("backs off the FROZEN prior peak, so a changed plan initial does not move it", () => {
    // a meso seed with a prior peak: seedMeso uses the peak branch, ignoring
    // `initial`, so bumping the live initial recomputes but yields the same number.
    const { stored, output } = storedSeed(peak, initial);
    const res = recomputeRow(
      {
        kind: "seed",
        storedInputs: stored,
        liveConfig: liveCfg({ initial: { weight: 999, reps: 8, sets: 3 } }),
        anchor: null,
        currentOutput: output,
      },
      PARAMS,
    );
    expect(res.status).toBe("unchanged");
    expect(res.output!.weight).toBe(output.weight);
  });

  it("seeds from the live plan initial when there is no prior peak (user-add shape)", () => {
    // priorPeak null ⇒ seedMeso uses `initial`; a live initial change takes effect
    const noPeak = storedSeed(null, { weight: 150, reps: 8, sets: 3 });
    const res = recomputeRow(
      {
        kind: "seed",
        storedInputs: noPeak.stored,
        liveConfig: liveCfg({ initial: { weight: 160, reps: 8, sets: 3 } }),
        anchor: null,
        currentOutput: noPeak.output,
      },
      PARAMS,
    );
    expect(res.status).toBe("changed");
    expect(res.output!.weight).not.toBe(noPeak.output.weight);
    expect(res.output!.weight).toBe(
      seedMeso(
        null,
        { weight: 160, reps: 8, sets: 3 },
        { equipmentType: "barbell" },
        { experienceLevel: "intermediate", units: "lb" },
        3,
        PARAMS,
      ).weight,
    );
  });

  it("ignores the strength anchor on the seed path (cold start has no anchor)", () => {
    // an anchor is an advance-only input; passing one must not change a seed
    const { stored, output } = storedSeed(peak, initial);
    const res = recomputeRow(
      {
        kind: "seed",
        storedInputs: stored,
        liveConfig: liveCfg(),
        anchor: { value: 500, confidence: "high" },
        currentOutput: output,
      },
      PARAMS,
    );
    expect(res.status).toBe("unchanged");
    expect(res.output!.weight).toBe(output.weight);
  });
});

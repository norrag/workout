import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENGINE_PARAMS,
  prescribe,
  seedMeso,
  type E1rmAnchor,
  type EngineInputs,
  type EngineParams,
} from "@/lib/engine";
import {
  recomputeRow,
  advanceSourceKey,
  advanceSourceKeys,
  dropForeignDecisions,
  latestDecisionsByRow,
  liveWeekRirUpdates,
  type RecomputeArgs,
} from "../regeneration";
import { V15_PARAMS } from "@/lib/engine/__tests__/helpers";
import {
  buildConfigInputs,
  buildSeedInputs,
  computeDepFingerprint,
  configProjection,
  paramsTokenFor,
  seedEngineInputs,
  type ConfigInputs,
} from "../fingerprint";

const PARAMS = DEFAULT_ENGINE_PARAMS as EngineParams;

// a minimal valid EngineInputs (the immutable derived history a decision stored)
function sampleInputs(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    exercise: { equipmentType: "barbell", loadType: "external" },
    user: { experienceLevel: "intermediate" },
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
    bodyweight: null,
    ...over,
  };
}

/** the config inputs that match `sampleInputs()`, optionally overridden */
function sampleConfig(over: Partial<Parameters<typeof buildConfigInputs>[0]> = {}): ConfigInputs {
  return buildConfigInputs({
    equipmentType: "barbell",
    profile: { experience_level: "intermediate" },
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
    bodyweight: null,
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

  it("overlays a live macro-goal change so a re-goaled meso reprices the row (doc 14 phase 4)", () => {
    // macro goal flows into the engine as `goalType`; with a strength anchor present
    // the engine prices reps into the goal's rep window (doc 13), so re-goaling a
    // meso hypertrophy→strength produces a different prescription on its open rows.
    const anchor: E1rmAnchor = { value: 230, confidence: "high" };
    const hyper = recomputeRow(
      { ...args({ anchor }), liveConfig: sampleConfig({ goal: "hypertrophy" }) },
      PARAMS,
    );
    const strength = recomputeRow(
      { ...args({ anchor }), liveConfig: sampleConfig({ goal: "strength" }) },
      PARAMS,
    );
    expect(hyper.output).toBeDefined();
    expect(strength.output).toBeDefined();
    // the goal moved the prescription into a different rep window
    expect(strength.output!.reps).not.toBe(hyper.output!.reps);
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
      exercise: { equipmentType: "dumbbell", loadType: "external" },
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
      { kind: "advance", storedInputs, liveConfig, anchor: null, bodyweight: null, currentOutput: legacyOut },
      PARAMS,
    );
    expect(before.status).toBe("unchanged");

    // overlay a high-confidence anchor → rep-window path engages and diverges
    const anchor: E1rmAnchor = { value: 40, confidence: "high" };
    const after = recomputeRow(
      { kind: "advance", storedInputs, liveConfig, anchor, bodyweight: null, currentOutput: legacyOut },
      PARAMS,
    );
    expect(after.status).toBe("changed");
    const win = PARAMS.rep_window.hypertrophy!;
    expect(after.output!.reps).toBeGreaterThanOrEqual(win.min);
    expect(after.output!.reps).toBeLessThanOrEqual(win.max);
  });
});

describe("recomputeRow — seed (doc 14 §6.2)", () => {
  const profile = { experience_level: "intermediate" as const };
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
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
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
      { kind: "seed", storedInputs: stored, liveConfig: liveCfg(), anchor: null, bodyweight: null, currentOutput: output },
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
        bodyweight: null,
        currentOutput: output,
      },
      PARAMS,
    );
    expect(res.status).toBe("changed");
    expect(res.output!.targetRir).toBe(1);
  });

  it("a changed plan initial moves the seed even with a prior peak (T-I4: peak retired)", () => {
    // T-I4 retired the prior-peak seed: precedence is anchor → plan initial →
    // unseeded, so the peak no longer freezes the seed — the live initial drives it.
    const { stored, output } = storedSeed(peak, initial);
    const res = recomputeRow(
      {
        kind: "seed",
        storedInputs: stored,
        liveConfig: liveCfg({ initial: { weight: 999, reps: 8, sets: 3 } }),
        anchor: null,
        bodyweight: null,
        currentOutput: output,
      },
      PARAMS,
    );
    expect(res.status).toBe("changed");
    expect(res.output!.weight).not.toBe(output.weight);
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
        bodyweight: null,
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
        { equipmentType: "barbell", loadType: "external" },
        { experienceLevel: "intermediate" },
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
        bodyweight: null,
        currentOutput: output,
      },
      PARAMS,
    );
    expect(res.status).toBe("unchanged");
    expect(res.output!.weight).toBe(output.weight);
  });
});

// A decision-less open row (a pre-phase-2 seed, or one whose best-effort decision
// write failed) used to be skipped by the reconcile FOREVER, so a bypassed
// un-logged planned day could never be brought current by any input change. The
// reconcile now backfills it as a seed reconstructed from the LIVE plan defaults +
// the user's prior peak — exactly what generation seeds from. These tests model
// that reconstruction at the pure level (the reconcile's I/O resolves the same
// values from `meso_exercises` + `v_exercise_prs`).
describe("reconcile backfill — decision-less open rows (doc 14 §6.2/§6.3)", () => {
  const profile = { experience_level: "intermediate" as const };
  const equipmentType = "barbell";
  const goal = "hypertrophy" as const;
  const week = { targetRir: 1, isDeload: false };
  // the plan's cold-start defaults (meso_exercises.initial_*)
  const planInitial = { weight: 135, reps: 8, sets: 3 };
  // the user's prior peak (v_exercise_prs), with `sets` taken from the plan
  const pr = { best_weight: 315, best_reps: 5 };

  /** the inputs the reconcile reconstructs for a decision-less row */
  function reconstruct() {
    const liveConfig = buildConfigInputs({
      equipmentType,
      profile,
      goal,
      week,
      previous: null, // a seed has no upstream week
      initial: planInitial,
    });
    const priorPeak = {
      weight: pr.best_weight,
      reps: pr.best_reps,
      sets: planInitial.sets,
    };
    const storedInputs = seedEngineInputs(liveConfig, priorPeak) as unknown as Record<
      string,
      unknown
    >;
    return { liveConfig, priorPeak, storedInputs };
  }

  it("recomputes a stale decision-less row to the correct seed number", () => {
    const { liveConfig, priorPeak, storedInputs } = reconstruct();
    // the row carries some old, now-wrong prescribed value (null fingerprint)
    const staleOutput = { weight: 999, reps: 8, sets: 3, targetRir: 3 };
    const res = recomputeRow(
      { kind: "seed", storedInputs, liveConfig, anchor: null, bodyweight: null, currentOutput: staleOutput },
      PARAMS,
    );
    expect(res.status).toBe("changed");
    // it matches exactly what generation's seedMeso would have produced
    const expected = seedMeso(
      priorPeak,
      planInitial,
      { equipmentType, loadType: "external" },
      { experienceLevel: "intermediate" },
      week.targetRir,
      PARAMS,
    );
    expect(res.output!.weight).toBe(expected.weight);
    expect(res.output!.targetRir).toBe(week.targetRir);
  });

  it("stamps a fingerprint that matches generation's, so the backfilled row is then stable", () => {
    // write/check parity: the fingerprint the reconcile stamps for the backfilled
    // row must equal the one generation would have stamped, so the very next read
    // short-circuits instead of recomputing again.
    const { liveConfig } = reconstruct();
    const token = paramsTokenFor(9);
    const reconcileFp = computeDepFingerprint(liveConfig, token);

    const generationInputs = buildSeedInputs({
      equipmentType,
      profile,
      goal,
      startRir: week.targetRir,
      isDeload: week.isDeload,
      initial: planInitial,
      priorPeak: { weight: pr.best_weight, reps: pr.best_reps, sets: planInitial.sets },
    });
    const generationFp = computeDepFingerprint(
      configProjection(generationInputs),
      token,
    );
    expect(reconcileFp).toBe(generationFp);
  });
});

// Regression (doc 14 §7c): a decision-less open row in week N>1 whose prior-week
// same-day counterpart is completed must advance from that counterpart, not seed
// from the prior-meso peak. The W3·D4 bug was an imported planned day stuck in
// the middle of imported history: the generation gap-heal skipped it (the day
// existed) and the reconcile re-seeded it (decision-less), discarding the in-meso
// progression. `advanceSourceKey` is the boundary that routes such a row to the
// advance path; week 1 stays a genuine cold start.
describe("advanceSourceKey (decision-less backfill routing)", () => {
  it("returns null in week 1 (cold start → seed)", () => {
    expect(advanceSourceKey(1, 4, "ex-1")).toBeNull();
  });

  it("points a week-N row at its week-(N-1) same-day, same-exercise source", () => {
    // the W3·D4 shape: a week-3 day-4 row advances from the completed week-2 day-4
    expect(advanceSourceKey(3, 4, "ex-deadlift")).toBe("2:4:ex-deadlift");
    expect(advanceSourceKey(4, 1, "ex-bench")).toBe("3:1:ex-bench");
  });

  it("keys by day and exercise so a different slot is not mistaken for the source", () => {
    expect(advanceSourceKey(3, 4, "ex-a")).not.toBe(advanceSourceKey(3, 2, "ex-a"));
    expect(advanceSourceKey(3, 4, "ex-a")).not.toBe(advanceSourceKey(3, 4, "ex-b"));
  });
});

describe("advanceSourceKeys (N33 §9 lookback)", () => {
  it("lists candidates nearest week first, down to the lookback bound", () => {
    expect(advanceSourceKeys(4, 2, "ex-a")).toEqual([
      { offset: 1, key: "3:2:ex-a" },
      { offset: 2, key: "2:2:ex-a" },
    ]);
  });

  it("floors at week 1 (a week-2 row has only its week-1 candidate)", () => {
    expect(advanceSourceKeys(2, 4, "ex-a")).toEqual([
      { offset: 1, key: "1:4:ex-a" },
    ]);
    expect(advanceSourceKeys(1, 4, "ex-a")).toEqual([]);
  });
});

describe("dropForeignDecisions (N33 S2 — swapped slots never replay a foreign decision)", () => {
  const decision = (exerciseId: string | null) => ({
    id: "d1",
    kind: "advance" as const,
    sourceWorkoutExerciseId: null,
    exerciseId,
    inputs: {},
  });

  it("drops a decision computed for a different exercise than the row now holds", () => {
    const latest = new Map([["we1", decision("ex-old")]]);
    dropForeignDecisions(latest, new Map([["we1", "ex-new"]]));
    expect(latest.has("we1")).toBe(false);
  });

  it("keeps a matching decision, and legacy decisions with no recorded exercise", () => {
    const latest = new Map([
      ["we1", decision("ex-a")],
      ["we2", decision(null)],
    ]);
    dropForeignDecisions(
      latest,
      new Map([
        ["we1", "ex-a"],
        ["we2", "ex-b"],
      ]),
    );
    expect(latest.has("we1")).toBe(true);
    expect(latest.has("we2")).toBe(true);
  });
});

describe("liveWeekRirUpdates", () => {
  // a 5-week meso with a deload (ramp 3→0 across weeks 1–4, deload week 5)
  const meso = { weeks: 5, includes_deload: true, rir_start: 3, rir_end: 0 };
  const micros = [
    { id: "w1", week_number: 1, target_rir: 3 },
    { id: "w2", week_number: 2, target_rir: 2 },
    { id: "w3", week_number: 3, target_rir: 1 },
    { id: "w4", week_number: 4, target_rir: 0 },
    { id: "w5", week_number: 5, target_rir: 4 }, // deload, frozen at the old RIR 4
  ];

  it("refreshes an unlogged deload week to the active params' deload RIR", () => {
    // only week 1 started; weeks 2–5 are still planned
    const started = new Set(["w1"]);
    const updates = liveWeekRirUpdates(micros, started, meso, V15_PARAMS);
    // v15 deload RIR is 6; the working weeks are unchanged (ramp from rir_start/end)
    expect(updates).toEqual([{ id: "w5", target_rir: 6 }]);
  });

  it("never touches a started/logged week, even if its stored RIR drifted", () => {
    // pretend the deload week has been started — it must stay as trained
    const started = new Set(["w1", "w5"]);
    const updates = liveWeekRirUpdates(micros, started, meso, V15_PARAMS);
    expect(updates).toEqual([]);
  });

  it("is a no-op under the active (v14-equivalent) deload RIR of 4", () => {
    const started = new Set(["w1"]);
    // DEFAULT deload RIR is 4, matching the stored value → nothing to update
    const updates = liveWeekRirUpdates(micros, started, meso, DEFAULT_ENGINE_PARAMS);
    expect(updates).toEqual([]);
  });

  it("degrades gracefully (no updates) on an out-of-range meso instead of throwing", () => {
    const bad = { weeks: 99, includes_deload: true, rir_start: 3, rir_end: 0 };
    expect(liveWeekRirUpdates(micros, new Set(), bad, V15_PARAMS)).toEqual([]);
  });

  it("N18-B: a per-week schedule refreshes exactly the unstarted weeks that drifted", () => {
    // doc 14's literal worked example: re-tune week 2's RIR (2 → 3); only the
    // week-2 row moves, started weeks stay
    const scheduled = { ...meso, rir_schedule: [3, 3, 1, 0] };
    const started = new Set(["w1"]);
    const updates = liveWeekRirUpdates(
      micros,
      started,
      scheduled,
      DEFAULT_ENGINE_PARAMS, // deload RIR 4 matches the stored value
    );
    expect(updates).toEqual([{ id: "w2", target_rir: 3 }]);
  });

  it("N18-B: a length-mismatched (orphaned) schedule degrades gracefully", () => {
    const orphaned = { ...meso, rir_schedule: [3, 2] };
    expect(
      liveWeekRirUpdates(micros, new Set(), orphaned, DEFAULT_ENGINE_PARAMS),
    ).toEqual([]);
  });
});

describe("latestDecisionsByRow (R11)", () => {
  // page rows in the stable (created_at desc, id desc) order the fetch uses
  const row = (id: string, we: string | null): import("../regeneration").DecisionPageRow => ({
    id,
    workout_exercise_id: we,
    source_workout_exercise_id: null,
    exercise_id: null,
    kind: "advance",
    inputs: {},
  });

  /** fake page source over a fixed newest-first array, counting calls */
  function pageSource(all: ReturnType<typeof row>[]) {
    const calls: [number, number][] = [];
    return {
      calls,
      fetch: async (from: number, to: number) => {
        calls.push([from, to]);
        return all.slice(from, to + 1);
      },
    };
  }

  it("keeps the NEWEST decision per row (first occurrence in page order)", async () => {
    const src = pageSource([row("d3", "we1"), row("d2", "we1"), row("d1", "we2")]);
    const latest = await latestDecisionsByRow(src.fetch, ["we1", "we2"], 10);
    expect(latest.get("we1")!.id).toBe("d3");
    expect(latest.get("we2")!.id).toBe("d1");
  });

  it("resolves a row whose ONLY decision sits beyond the first page (the truncation regression)", async () => {
    // 5 newer decisions for we1 push we2's single old decision onto page 2 —
    // the old unbounded fetch dropped it and we2 was re-seeded off the prior peak
    const src = pageSource([
      ...["d9", "d8", "d7", "d6", "d5"].map((id) => row(id, "we1")),
      row("d1", "we2"),
    ]);
    const latest = await latestDecisionsByRow(src.fetch, ["we1", "we2"], 5);
    expect(latest.get("we1")!.id).toBe("d9");
    expect(latest.get("we2")!.id).toBe("d1");
    expect(src.calls.length).toBe(2);
  });

  it("stops paging early once every open row is resolved", async () => {
    const src = pageSource([
      row("d4", "we1"),
      row("d3", "we2"),
      ...Array.from({ length: 20 }, (_, i) => row(`old${i}`, "we1")),
    ]);
    const latest = await latestDecisionsByRow(src.fetch, ["we1", "we2"], 2);
    expect(latest.size).toBe(2);
    expect(src.calls).toEqual([[0, 1]]); // both resolved on page 1 → no page 2
  });

  it("exhausts the set and leaves decision-less rows absent (seed-backfill input)", async () => {
    const src = pageSource([row("d2", "we1"), row("d1", "we1")]);
    const latest = await latestDecisionsByRow(src.fetch, ["we1", "we-none"], 2);
    expect(latest.size).toBe(1);
    expect(latest.has("we-none")).toBe(false);
    // page 1 was full so it fetched one more (short) page, then stopped
    expect(src.calls).toEqual([[0, 1], [2, 3]]);
  });

  it("ignores decisions for rows outside the requested set", async () => {
    const src = pageSource([row("d2", "other"), row("d1", "we1"), row("d0", null)]);
    const latest = await latestDecisionsByRow(src.fetch, ["we1"], 10);
    expect([...latest.keys()]).toEqual(["we1"]);
  });
});

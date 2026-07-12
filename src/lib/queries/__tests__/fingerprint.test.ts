import { describe, it, expect } from "vitest";
import type {
  ExerciseFeedbackRow,
  WorkoutExerciseRow,
  WorkoutFeedbackRow,
} from "@/lib/types/database";
import {
  buildConfigInputs,
  buildSeedInputs,
  computeDepFingerprint,
  configProjection,
  paramsTokenFor,
  DERIVED_INPUT_KEYS,
  type ConfigInputArgs,
} from "../fingerprint";
import { buildEngineInputs } from "../progression";

// a full set of buildEngineInputs args, with non-trivial derived history so the
// projection has something to strip
function engineArgs() {
  return {
    we: {
      prescribed_weight: 185,
      prescribed_reps: 8,
      prescribed_sets: 3,
      target_rir: 2,
    } as WorkoutExerciseRow,
    sets: [
      {
        set_number: 1,
        weight: 185,
        reps: 8,
        rir_reported: 2,
        is_warmup: false,
        id: "s1",
      },
      {
        set_number: 2,
        weight: 185,
        reps: 8,
        rir_reported: 1,
        is_warmup: false,
        id: "s2",
      },
    ] as unknown as Parameters<typeof buildEngineInputs>[0]["sets"],
    feedback: {
      joint_pain: 1,
      pump: 7,
      workload: 6,
    } as ExerciseFeedbackRow,
    groupFeedback: { pump: 7, workload: 6 },
    workoutFeedback: {
      overall_fatigue: 2,
      effort_rating: 3,
      performance_rating: 3,
    } as WorkoutFeedbackRow,
    microTargetRir: 2,
    nextWeek: { targetRir: 1, isDeload: false },
    goal: "hypertrophy" as const,
    equipmentType: "barbell",
    profile: { experience_level: "intermediate" as const },
    muscleGroupWeeklySets: 12,
    weekPeak: null,
    strengthAnchor: { value: 230, confidence: "high" as const },
    bodyweight: null,
  };
}

/** the config-input args that correspond to the engineArgs above */
function configArgs(a = engineArgs()): ConfigInputArgs {
  return {
    equipmentType: a.equipmentType,
    profile: a.profile,
    goal: a.goal,
    week: a.nextWeek,
    previous: {
      weight: a.we.prescribed_weight,
      reps: a.we.prescribed_reps,
      sets: a.we.prescribed_sets ?? 1,
      targetRir: a.we.target_rir ?? a.microTargetRir,
    },
    initial: null,
  };
}

describe("configProjection", () => {
  it("strips every derived field and keeps the config ones", () => {
    const inputs = buildEngineInputs(engineArgs());
    const projected = configProjection(inputs) as unknown as Record<string, unknown>;
    for (const key of DERIVED_INPUT_KEYS) {
      expect(projected[key], key).toBeUndefined();
    }
    // config keys survive
    for (const key of ["exercise", "user", "goalType", "week", "previous", "initial"]) {
      expect(projected[key], key).toBeDefined();
    }
  });
});

describe("write/check equivalence (doc 14 §3 golden)", () => {
  it("configProjection(buildEngineInputs(x)) === buildConfigInputs(configArgsOf(x))", () => {
    // the only correctness requirement of the framework: the config projection is
    // built the SAME way at write (generation) and at check (the reconcile)
    const projected = configProjection(buildEngineInputs(engineArgs()));
    const direct = buildConfigInputs(configArgs());
    expect(projected).toEqual(direct);
  });
});

describe("computeDepFingerprint", () => {
  const token = { version: 9 };

  it("is stable for the same config + token", () => {
    const c = buildConfigInputs(configArgs());
    expect(computeDepFingerprint(c, token)).toBe(computeDepFingerprint(c, token));
  });

  it("changes when the params token changes", () => {
    const c = buildConfigInputs(configArgs());
    expect(computeDepFingerprint(c, { version: 9 })).not.toBe(
      computeDepFingerprint(c, { version: 10 }),
    );
  });

  it.each([
    ["goal", { goal: "strength" as const }],
    ["week", { week: { targetRir: 0, isDeload: true } }],
    ["previous", { previous: { weight: 999, reps: 8, sets: 3, targetRir: 2 } }],
    ["equipment", { equipmentType: "dumbbell", loadType: "external" }],
    ["initial", { initial: { weight: 45, reps: 10, sets: 3 } }],
  ])("changes when the %s config dimension changes", (_label, over) => {
    const base = computeDepFingerprint(buildConfigInputs(configArgs()), token);
    const changed = computeDepFingerprint(
      buildConfigInputs({ ...configArgs(), ...over }),
      token,
    );
    expect(changed).not.toBe(base);
  });

  it("changes when the user profile changes", () => {
    const base = computeDepFingerprint(buildConfigInputs(configArgs()), token);
    const changed = computeDepFingerprint(
      buildConfigInputs({
        ...configArgs(),
        profile: { experience_level: "advanced" },
      }),
      token,
    );
    expect(changed).not.toBe(base);
  });

  it("is INVARIANT to derived (history) inputs (doc 14 §6.4)", () => {
    // two engine inputs that differ only in derived history (sets/feedback/anchor)
    // must hash the same — derived inputs are excluded from the signature
    const a = buildEngineInputs(engineArgs());
    const noisy = engineArgs();
    noisy.sets = [
      { set_number: 1, weight: 999, reps: 20, rir_reported: 0, is_warmup: false, id: "x" },
    ] as unknown as typeof noisy.sets;
    noisy.strengthAnchor = {
      value: 1,
      confidence: "low" as "high",
      // N45: the anchor's provenance rides inside the denylisted anchor — the
      // widened shape must stay fingerprint-neutral
      source: {
        weight: 115,
        reps: 11,
        ageDays: 3,
        sessionKey: "we-1",
        performedAt: "2026-07-08T10:00:00Z",
      },
    } as typeof noisy.strengthAnchor;
    noisy.muscleGroupWeeklySets = 99;
    const b = buildEngineInputs(noisy);
    expect(computeDepFingerprint(configProjection(a), token)).toBe(
      computeDepFingerprint(configProjection(b), token),
    );
  });

  it("is INVARIANT to planStrengthRate (doc 17 §3 / doc 14 §3 denylist)", () => {
    // the pacer's plan rate derives from bodyweight/bf%/age — not config
    // dimensions — so its presence, absence, or value must never move the
    // fingerprint (a routine bodyweight edit must not churn open rows), while
    // write/check parity with the bare config resolver still holds.
    const bare = buildEngineInputs(engineArgs());
    const withRate = buildEngineInputs({
      ...engineArgs(),
      planStrengthRate: { low: 2.1, high: 4.2 },
    });
    const withNull = buildEngineInputs({
      ...engineArgs(),
      planStrengthRate: null,
    });
    expect(configProjection(withRate)).toEqual(configProjection(bare));
    expect(computeDepFingerprint(configProjection(withRate), token)).toBe(
      computeDepFingerprint(configProjection(bare), token),
    );
    expect(computeDepFingerprint(configProjection(withNull), token)).toBe(
      computeDepFingerprint(configProjection(bare), token),
    );
    expect(configProjection(withRate)).toEqual(
      buildConfigInputs(configArgs()),
    );
    // ...and the derived field actually rode along for replay/recording
    expect(withRate.planStrengthRate).toEqual({ low: 2.1, high: 4.2 });
  });

  it("is INVARIANT to bandPosition (doc 17 §7 / doc 14 §3 denylist)", () => {
    // the envelope position derives from recorded decisions (logged history);
    // a boundary that moves it must never stale open rows — presence, absence,
    // or value never moves the fingerprint, while write/check parity holds.
    const bare = buildEngineInputs(engineArgs());
    const withPosition = buildEngineInputs({
      ...engineArgs(),
      bandPosition: 0.7,
    });
    expect(configProjection(withPosition)).toEqual(configProjection(bare));
    expect(computeDepFingerprint(configProjection(withPosition), token)).toBe(
      computeDepFingerprint(configProjection(bare), token),
    );
    expect(configProjection(withPosition)).toEqual(
      buildConfigInputs(configArgs()),
    );
    // ...and the derived field actually rode along for replay/recording
    expect(withPosition.bandPosition).toBe(0.7);
    // the seed construction path carries it under the same contract
    const seed = buildSeedInputs({
      equipmentType: "barbell",
      profile: { experience_level: "intermediate" },
      goal: "hypertrophy",
      startRir: 3,
      isDeload: false,
      initial: null,
      priorPeak: null,
      progression: { bandPosition: 0.7 },
    });
    expect(seed.bandPosition).toBe(0.7);
    expect(configProjection(seed)).toEqual(
      configProjection(
        buildSeedInputs({
          equipmentType: "barbell",
          profile: { experience_level: "intermediate" },
          goal: "hypertrophy",
          startRir: 3,
          isDeload: false,
          initial: null,
          priorPeak: null,
        }),
      ),
    );
  });
});

describe("paramsTokenFor — increment override (doc 14 phase 3)", () => {
  const c = buildConfigInputs(configArgs());

  it("no override ⇒ token is byte-identical to the bare { version } (no churn)", () => {
    // the central guarantee: adding the override surface must not move the
    // fingerprint of the (vast) majority of rows that have no override.
    expect(paramsTokenFor(9)).toEqual({ version: 9 });
    expect(paramsTokenFor(9, null)).toEqual({ version: 9 });
    expect(paramsTokenFor(9, undefined)).toEqual({ version: 9 });
    expect(computeDepFingerprint(c, paramsTokenFor(9, null))).toBe(
      computeDepFingerprint(c, { version: 9 }),
    );
  });

  it("an override moves the fingerprint, and a different override moves it again", () => {
    const base = computeDepFingerprint(c, paramsTokenFor(9, null));
    const o5 = computeDepFingerprint(c, paramsTokenFor(9, 5));
    const o10 = computeDepFingerprint(c, paramsTokenFor(9, 10));
    expect(o5).not.toBe(base);
    expect(o10).not.toBe(base);
    expect(o5).not.toBe(o10);
  });

  it("clearing an override (back to null) restores the original fingerprint", () => {
    const base = computeDepFingerprint(c, paramsTokenFor(9, null));
    const cleared = computeDepFingerprint(c, paramsTokenFor(9, null));
    expect(cleared).toBe(base);
  });

  it("scope falls out of the fingerprint: only the overridden exercise diverges (doc 14 §7)", () => {
    // model the reconcile's per-row check: two open rows for two exercises, both
    // stamped under no override. Editing exercise A's increment moves ONLY A's
    // expected fingerprint; B (no override) still matches its stamp and is skipped.
    const version = 9;
    const configA = buildConfigInputs({ ...configArgs(), equipmentType: "barbell" });
    const configB = buildConfigInputs({ ...configArgs(), equipmentType: "dumbbell" });
    // stamped at generation, neither overridden
    const stampedA = computeDepFingerprint(configA, paramsTokenFor(version, null));
    const stampedB = computeDepFingerprint(configB, paramsTokenFor(version, null));

    // user sets a +10 increment override on exercise A only
    const expectedA = computeDepFingerprint(configA, paramsTokenFor(version, 10));
    const expectedB = computeDepFingerprint(configB, paramsTokenFor(version, null));

    expect(expectedA).not.toBe(stampedA); // A diverges → recompute
    expect(expectedB).toBe(stampedB); // B unchanged → short-circuit
  });
});

describe("source scoping (doc 14 §7, phase 4) — a change recomputes the right rows and nothing else", () => {
  // Phase 4 backfills the already-flowing sources (profile / macro goal / meso
  // config) into the reusable contract. They need no new wiring: each is already a
  // resolved config dimension (`user.*`, `goalType`, `week.*`), so the fingerprint
  // already sees them. What phase 4 owns is the proof that "scope falls out of the
  // fingerprint" (§7) — that a change to one source moves the fingerprint of EXACTLY
  // the rows in its scope and is byte-identical for every row outside it. These
  // tests model the reconcile's per-row check (it resolves the profile once per
  // user, the goal once per meso, the week per microcycle, then hashes each open
  // row) the same way the increment-override scoping test above does.
  const token = paramsTokenFor(9);

  /** a row's stamped/expected fingerprint = hash of its resolved config + token */
  function fp(args: ConfigInputArgs): string {
    return computeDepFingerprint(buildConfigInputs(args), token);
  }

  const baseProfile = {
    experience_level: "intermediate" as const,
  };

  /** one open prescription's resolved config, varying the per-row dimensions */
  function row(over: Partial<ConfigInputArgs> = {}): ConfigInputArgs {
    return {
      equipmentType: "barbell",
      profile: baseProfile,
      goal: "hypertrophy",
      week: { targetRir: 2, isDeload: false },
      previous: { weight: 185, reps: 8, sets: 3, targetRir: 2 },
      initial: null,
      ...over,
    };
  }

  describe("profile (experience) → that user's open rows, all exercises (§7)", () => {
    it("an experience-level edit moves every one of the user's rows, across exercises / goals / weeks", () => {
      // the profile is resolved once per user and applied to every row, so it is a
      // UNIVERSAL config dimension: three rows that otherwise differ in the per-row
      // dimensions (a different exercise, a different meso goal, a different week)
      // all go stale together when experience changes.
      const rows = [
        row({ equipmentType: "barbell", loadType: "external" }),
        row({ equipmentType: "dumbbell", goal: "strength" }),
        row({ week: { targetRir: 0, isDeload: true } }),
      ];
      const edited = { experience_level: "advanced" as const };
      for (const r of rows) {
        expect(fp({ ...r, profile: edited }), `${r.equipmentType}/${r.goal}`).not.toBe(
          fp(r),
        );
      }
    });

    it("another user's rows do not collide — cross-user isolation (scope is the user)", () => {
      // the reconcile resolves the profile per `userId` and runs scoped to one
      // owner, so cross-user isolation is structural — user A's edit never even
      // visits user B's rows. The fingerprint reinforces it: a row resolved under a
      // different profile hashes differently, so there is no cross-user collision
      // that could let one user's edit be mistaken for fresh against another's stamp.
      const userBRow = row({ profile: { experience_level: "beginner" } });
      expect(fp(userBRow)).not.toBe(fp(row()));
    });
  });

  describe("macro goal → open rows under that macro's mesos, and no others (§7)", () => {
    it("changing a macro's goal moves only the rows whose goal resolves from it", () => {
      // model two mesos under two macros: meso A's rows resolve goal "hypertrophy"
      // (from macro A), meso B's rows resolve "strength" (from macro B). Editing
      // macro A hypertrophy → cut moves only the rows under macro A; macro B's rows
      // are byte-identical (their goal didn't change).
      const macroARow = row({ goal: "hypertrophy", equipmentType: "barbell" });
      const macroBRow = row({ goal: "strength", equipmentType: "barbell" });
      const stampedA = fp(macroARow);
      const stampedB = fp(macroBRow);

      const expectedA = fp({ ...macroARow, goal: "cut" }); // macro A re-goaled
      const expectedB = fp(macroBRow); // macro B untouched

      expect(expectedA).not.toBe(stampedA); // under macro A → recompute
      expect(expectedB).toBe(stampedB); // under macro B → short-circuit
    });

    it("every row under the re-goaled macro moves, regardless of exercise or week", () => {
      const rows = [
        row({ goal: "hypertrophy", equipmentType: "barbell" }),
        row({ goal: "hypertrophy", equipmentType: "dumbbell" }),
        row({ goal: "hypertrophy", week: { targetRir: 0, isDeload: true } }),
      ];
      for (const r of rows) {
        expect(fp({ ...r, goal: "maintain" })).not.toBe(fp(r));
      }
    });
  });

  describe("meso config (RIR ramp / deload) → that meso's open rows by week (§7)", () => {
    it("editing one week's target RIR moves only that week's rows", () => {
      // a 3-week ramp 3 → 2 → 1. The reconcile resolves `week.targetRir` per
      // microcycle, so each week's rows are tracked independently.
      const week1 = row({ week: { targetRir: 3, isDeload: false } });
      const week2 = row({ week: { targetRir: 2, isDeload: false } });
      const week3 = row({ week: { targetRir: 1, isDeload: false } });
      expect(new Set([fp(week1), fp(week2), fp(week3)]).size).toBe(3); // independent

      // the user re-tunes ONLY week 2, to RIR 1. Week 2's rows go stale (its
      // fingerprint moves); weeks 1 and 3 — whose microcycles weren't touched —
      // re-resolve to the exact config they were stamped under, so they short-circuit.
      const week2Edited = row({ week: { targetRir: 1, isDeload: false } });
      expect(fp(week2Edited)).not.toBe(fp(week2)); // week 2 → recompute
      // and the fingerprint is purely a function of resolved config: week 2 now at
      // RIR 1 aliases week 3 (same resolved week), proving no hidden week identity.
      expect(fp(week2Edited)).toBe(fp(week3));
    });

    it("toggling a week's deload flag moves that week's rows", () => {
      const before = row({ week: { targetRir: 1, isDeload: false } });
      const after = row({ week: { targetRir: 1, isDeload: true } });
      expect(fp(after)).not.toBe(fp(before));
    });

    it("another meso's rows do not collide — cross-meso isolation (scope is the meso)", () => {
      // the reconcile runs scoped to one `mesoId` and each meso owns its own
      // microcycles, so a RIR-ramp edit on one meso never visits another meso's
      // rows — cross-meso isolation is structural. A row at a different meso's week
      // also hashes differently, so there is no collision across mesos.
      const otherMesoRow = row({ week: { targetRir: 4, isDeload: false } });
      expect(fp(otherMesoRow)).not.toBe(fp(row()));
    });
  });
});

describe("seed inputs (doc 14 §6.2)", () => {
  const token = { version: 9 };
  const seedBase = {
    equipmentType: "barbell",
    profile: { experience_level: "intermediate" as const },
    goal: "hypertrophy" as const,
    startRir: 3,
    isDeload: false,
    initial: { weight: 100, reps: 8, sets: 3 },
    priorPeak: { weight: 200, reps: 5, sets: 3 },
  };

  it("write/check parity: configProjection(buildSeedInputs(x)) === buildConfigInputs(its config half)", () => {
    // a seed is stamped at write via configProjection(buildSeedInputs(...)) and
    // checked via buildConfigInputs(...) in the reconcile — they must agree
    const projected = configProjection(buildSeedInputs(seedBase));
    const direct = buildConfigInputs({
      equipmentType: seedBase.equipmentType,
      profile: seedBase.profile,
      goal: seedBase.goal,
      week: { targetRir: seedBase.startRir, isDeload: seedBase.isDeload },
      previous: null,
      initial: seedBase.initial,
    });
    expect(projected).toEqual(direct);
  });

  it("fingerprint is INVARIANT to the prior peak (a derived field, doc 14 §6.4)", () => {
    const withPeak = computeDepFingerprint(configProjection(buildSeedInputs(seedBase)), token);
    const noPeak = computeDepFingerprint(
      configProjection(buildSeedInputs({ ...seedBase, priorPeak: null })),
      token,
    );
    const otherPeak = computeDepFingerprint(
      configProjection(buildSeedInputs({ ...seedBase, priorPeak: { weight: 999, reps: 1, sets: 9 } })),
      token,
    );
    expect(withPeak).toBe(noPeak);
    expect(withPeak).toBe(otherPeak);
  });

  it.each([
    ["initial", { initial: { weight: 105, reps: 8, sets: 3 } }],
    ["startRir", { startRir: 1 }],
    ["goal", { goal: "strength" as const }],
    ["equipment", { equipmentType: "dumbbell", loadType: "external" }],
  ])("fingerprint changes when the %s config dimension changes", (_label, over) => {
    const a = computeDepFingerprint(configProjection(buildSeedInputs(seedBase)), token);
    const b = computeDepFingerprint(configProjection(buildSeedInputs({ ...seedBase, ...over })), token);
    expect(a).not.toBe(b);
  });

  it("fingerprint is INVARIANT to the seed's progression inputs (doc 16 §3.7 / doc 14 §3)", () => {
    // the earn context, governors' lookback, and staleness gap are all derived
    // (denylisted): a mode-active seed's fingerprint must be byte-identical to
    // an inactive one's, and write/check parity must still hold.
    const bare = buildSeedInputs(seedBase);
    const withProgression = buildSeedInputs({
      ...seedBase,
      progression: {
        seedEarn: {
          previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
          actualSets: [
            { setNumber: 1, weight: 145, reps: 8, rirReported: null, isWarmup: false },
          ],
          exerciseFeedback: { jointPain: 0, pump: 5, workload: 5 },
          workoutFeedback: null,
        },
        progressionHistory: {
          earnedThisMicrocycle: false,
          trailing30dPrescribedGainPct: 1.2,
          consecutiveMissedEarns: 0,
        },
        daysSincePreviousSession: 8,
        planStrengthRate: { low: 2.1, high: 4.2 },
      },
    });
    expect(configProjection(withProgression)).toEqual(configProjection(bare));
    expect(
      computeDepFingerprint(configProjection(withProgression), token),
    ).toBe(computeDepFingerprint(configProjection(bare), token));
    // ...and the derived fields actually rode along for replay
    expect(withProgression.seedEarn).not.toBeNull();
    expect(withProgression.progressionHistory).not.toBeNull();
    expect(withProgression.planStrengthRate).toEqual({ low: 2.1, high: 4.2 });
  });

  it("a seed (previous=null) is not confusable with an advance at the same scope", () => {
    const seed = computeDepFingerprint(configProjection(buildSeedInputs(seedBase)), token);
    const advance = computeDepFingerprint(
      buildConfigInputs({
        equipmentType: seedBase.equipmentType,
        profile: seedBase.profile,
        goal: seedBase.goal,
        week: { targetRir: seedBase.startRir, isDeload: seedBase.isDeload },
        previous: { weight: 185, reps: 5, sets: 3, targetRir: 3 },
        initial: seedBase.initial,
      }),
      token,
    );
    expect(seed).not.toBe(advance);
  });
});

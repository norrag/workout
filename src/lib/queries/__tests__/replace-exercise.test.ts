/**
 * Exercise swap / slot prescription (N33; PH38 history below).
 *
 * PH38 (original defect): swapping a movement carried the outgoing exercise's
 * per-set weight overrides (`set_weights`) onto the incoming one. Still covered
 * — the swap clears `set_weights`.
 *
 * N33 (2026-07-04 investigation): the swap wrote the incoming exercise's
 * all-time PR raw onto half the prescription tuple — no engine call, no
 * decision, no fingerprint restamp — so the audit surface went incoherent and
 * the freshness framework re-certified hand-written numbers. Both the swap and
 * the add path now flow through the slot-prescription resolver, which derives
 * the KIND from the data: an advance off the §9 lookback source when one
 * exists (a swap-out/swap-back round trip RESTORES the engine prescription),
 * else the doc 14 §6.2 cold seed. These tests exercise the pure core
 * (`computeSlotPrescription`, `chooseAdvanceSource`) and the logged-set guard.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WorkoutExerciseRow } from "@/lib/types/database";
import { replaceWorkoutExercise } from "../logging";
import {
  chooseAdvanceSource,
  computeSlotPrescription,
  type SlotComputationArgs,
} from "../slot-prescription";
import {
  computeDepFingerprint,
  configProjection,
  paramsTokenFor,
} from "../fingerprint";
import { V18_PARAMS } from "@/lib/engine/__tests__/helpers";
import type { LoggedSetRow } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// chooseAdvanceSource — the §9 lookback selection rule
// ---------------------------------------------------------------------------

describe("chooseAdvanceSource (N33 §9)", () => {
  it("picks the most recent candidate WITH logged working sets", () => {
    expect(
      chooseAdvanceSource([
        { offset: 1, hasSets: true, source: "w1" },
        { offset: 2, hasSets: true, source: "w2" },
      ]),
    ).toBe("w1");
  });

  it("skips a set-less week-(N-1) row when week-(N-2) was actually performed", () => {
    expect(
      chooseAdvanceSource([
        { offset: 1, hasSets: false, source: "w1-skipped" },
        { offset: 2, hasSets: true, source: "w2-performed" },
      ]),
    ).toBe("w2-performed");
  });

  it("falls back to the set-less week-(N-1) counterpart (generateDay parity)", () => {
    expect(
      chooseAdvanceSource([{ offset: 1, hasSets: false, source: "w1" }]),
    ).toBe("w1");
  });

  it("never advances off a set-less week-(N-2) row alone — cold seed instead", () => {
    expect(
      chooseAdvanceSource([{ offset: 2, hasSets: false, source: "w2" }]),
    ).toBeNull();
  });

  it("returns null with no candidates", () => {
    expect(chooseAdvanceSource([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeSlotPrescription — the pure per-slot compute
// ---------------------------------------------------------------------------

function sourceWe(over: Partial<WorkoutExerciseRow> = {}): WorkoutExerciseRow {
  return {
    id: "src-we",
    workout_id: "src-w",
    exercise_id: "deadlift",
    muscle_group_id: "glutes",
    position: 1,
    prescribed_weight: 245,
    prescribed_reps: 11,
    prescribed_sets: 2,
    target_rir: 0,
    status: "completed",
    notes: null,
    set_weights: {},
    skipped_set_numbers: [],
    dep_fingerprint: null,
    params_version: null,
    ...over,
  } as WorkoutExerciseRow;
}

function loggedSet(n: number, weight: number, reps: number): LoggedSetRow {
  return {
    // the engine schema validates loggedSetId as a uuid
    id: `00000000-0000-4000-8000-00000000000${n}`,
    set_number: n,
    weight,
    reps,
    rir_reported: null,
    is_warmup: false,
  } as LoggedSetRow;
}

function baseArgs(over: Partial<SlotComputationArgs> = {}): SlotComputationArgs {
  return {
    exerciseId: "deadlift",
    week: { targetRir: 6, isDeload: true },
    equipmentType: "barbell",
    loadType: "external",
    profile: { experience_level: "intermediate" },
    bodyweight: 159,
    goal: "hypertrophy",
    params: V18_PARAMS,
    paramsVersion: 18,
    override: null,
    anchor: { value: 331.9, confidence: "high" },
    pr: { best_weight: 245, best_reps: 15 },
    initialSets: 2,
    advance: null,
    ...over,
  };
}

describe("computeSlotPrescription (N33 S1)", () => {
  it("swap-back with a recent performed source ADVANCES and restores the engine deload — not the raw PR", () => {
    // the owner's exact W5·D2 scenario: swap deadlift out and back in during
    // the deload week; the W4·D2 source (245×15×2, anchor 331.9) must yield
    // the same deload the engine originally prescribed: 215 lb × 10 @ 6 RIR ×
    // 2 sets — not the 245×15 all-time-best write the old path did.
    const r = computeSlotPrescription(
      baseArgs({
        advance: {
          sourceWe: sourceWe(),
          sourceTargetRir: 0,
          sets: [loggedSet(1, 245, 15), loggedSet(2, 245, 15)],
          feedback: null,
          groupFeedback: { pump: 8, workload: 5 },
          workoutFeedback: null,
          muscleGroupWeeklySets: 4,
          weekPeak: { weight: 260, reps: 9, sets: 2, targetRir: 0 },
        },
      }),
    );
    expect(r.kind).toBe("advance");
    expect(r.sourceWorkoutExerciseId).toBe("src-we");
    expect(r.output.trace.some((s) => s.rule === "deload")).toBe(true);
    expect(r.output).toMatchObject({ weight: 215, reps: 10, sets: 2, targetRir: 6 });
    // the fingerprint is stamped from the SAME inputs the decision records, so
    // the read-path reconcile can verify the row (doc 14 §3 single resolver)
    expect(r.depFingerprint).toBe(
      computeDepFingerprint(configProjection(r.inputs), paramsTokenFor(18)),
    );
  });

  it("no in-meso source ⇒ cold seed (kind seed, no source), priced off the anchor — not the raw PR", () => {
    const r = computeSlotPrescription(baseArgs());
    expect(r.kind).toBe("seed");
    expect(r.sourceWorkoutExerciseId).toBeNull();
    // §S1 anchor seed at the week RIR — a 245×15 all-out PR is NOT a valid
    // prescription at 6 RIR; the anchor prices an on-model load instead
    expect(r.output.trace.some((s) => s.rule === "seed_anchor")).toBe(true);
    expect(r.output.reps).not.toBe(15);
    expect(r.output.targetRir).toBe(6);
    expect(r.depFingerprint).toBe(
      computeDepFingerprint(configProjection(r.inputs), paramsTokenFor(18)),
    );
  });

  it("no anchor + no source ⇒ seeds from the PR as the plan-default initial (add-path parity)", () => {
    const r = computeSlotPrescription(baseArgs({ anchor: null }));
    expect(r.kind).toBe("seed");
    expect(r.output.weight).toBe(245);
    expect(r.output.sets).toBe(2); // the slot's structural set count, not 3
  });

  it("no anchor, no source, no PR ⇒ unseeded (null weight — T-I5: never invent)", () => {
    const r = computeSlotPrescription(baseArgs({ anchor: null, pr: null }));
    expect(r.kind).toBe("seed");
    expect(r.output.weight).toBeNull();
  });

  it("falls back to the cold seed when the advance source is malformed (swap never fails)", () => {
    const r = computeSlotPrescription(
      baseArgs({
        advance: {
          sourceWe: sourceWe({ prescribed_weight: Number.NaN }),
          sourceTargetRir: 0,
          sets: [loggedSet(1, 245, 15)],
          feedback: null,
          groupFeedback: null,
          workoutFeedback: null,
          muscleGroupWeeklySets: null,
          weekPeak: null,
        },
      }),
    );
    expect(r.kind).toBe("seed");
    expect(r.output.weight).not.toBeNaN();
  });

  it("folds a per-exercise increment override into the fingerprint token (doc 14 phase 3)", () => {
    const r = computeSlotPrescription(
      baseArgs({
        override: { weightIncrement: 2.5 },
      }),
    );
    expect(r.depFingerprint).toBe(
      computeDepFingerprint(
        configProjection(r.inputs),
        paramsTokenFor(18, 2.5),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// replaceWorkoutExercise — the logged-set guard (unchanged contract)
// ---------------------------------------------------------------------------

/** Minimal fake: only the guard's logged_sets head-count is ever reached. */
function guardClient(loggedCount: number, onWrite: () => void): SupabaseClient<Database> {
  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {
      select() {
        return builder;
      },
      update() {
        onWrite();
        return builder;
      },
      eq() {
        if (table === "logged_sets") {
          return Promise.resolve({ count: loggedCount, error: null });
        }
        return builder;
      },
    };
    return builder;
  }
  return { from: (t: string) => makeBuilder(t) } as unknown as SupabaseClient<Database>;
}

describe("replaceWorkoutExercise guard", () => {
  it("refuses the swap (and writes nothing) once sets are logged on the slot", async () => {
    let wrote = false;
    const out = await replaceWorkoutExercise(
      guardClient(3, () => {
        wrote = true;
      }),
      "u1",
      "we1",
      "newEx",
    );
    expect(out.error).toMatch(/logged/i);
    expect(wrote).toBe(false);
  });
});

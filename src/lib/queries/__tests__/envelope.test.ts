/**
 * doc 17 §7 (N36) — the envelope loop's queries-layer assembly: per-meso
 * demand-side aggregation over recorded decisions (pure transforms; the I/O
 * wrapper is thin), boundary selection (completed mesos only, trailing
 * window), and replay determinism (a recorded seed position replays frozen
 * through the recompute).
 */
import { describe, expect, it } from "vitest";
import { seedMeso, type EngineParams } from "@/lib/engine";
import { V20_PARAMS } from "@/lib/engine/__tests__/helpers";
import {
  aggregateMesoOutcome,
  envelopeOutcomesFromRows,
  type EnvelopeDecisionRow,
} from "../envelope";
import { toProgressionAuditEvent, type ProgressionAuditEvent } from "../progression";
import { buildConfigInputs, seedEngineInputs } from "../fingerprint";
import { recomputeRow } from "../regeneration";

const ENVELOPE_PARAMS: EngineParams = {
  ...V20_PARAMS,
  progression: {
    ...V20_PARAMS.progression!,
    envelope: {
      enabled: true,
      lookback_mesos: 3,
      max_age_days: 180,
      min_decisions: 8,
      min_history_mesos: 2,
      step: 0.1,
      dwell_mesos: 1,
      raise: { earn_rate: 0.7, max_miss_ratio: 0.2, pacer_trips: 2, over_share: 0.25 },
      lower: { miss_ratio: 0.5, throttle_trips: 2, workload_firings: 3 },
    },
  },
};

/** A recorded decision row: previous prescription + performed sets + one
 *  status-coded progression step. Times spaced a day apart per index. */
function row(args: {
  mesoId: string;
  exerciseId: string;
  day: number;
  step?: { status: string; governor?: string; predicate?: string } | null;
  /** performed reps per set against previous 145×8@3 (defaults to met) */
  reps?: number[];
}): EnvelopeDecisionRow {
  const reps = args.reps ?? [8, 8, 8];
  return {
    id: `d-${args.mesoId}-${args.exerciseId}-${args.day}`,
    kind: "advance",
    workout_id: `w-${args.day}`,
    mesocycle_id: args.mesoId,
    microcycle_id: `m-${args.mesoId}-${Math.floor(args.day / 7)}`,
    exercise_id: args.exerciseId,
    created_at: new Date(Date.UTC(2026, 5, 1 + args.day)).toISOString(),
    inputs: {
      week: { targetRir: 2, isDeload: false },
      exercise: { loadType: "external" },
      bodyweight: null,
      previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
      actualSets: reps.map((r, i) => ({
        setNumber: i + 1,
        weight: 145,
        reps: r,
        rirReported: null,
        isWarmup: false,
      })),
      strengthAnchor: { value: 198.2, confidence: "moderate" },
    },
    output: {
      weight: 145,
      reps: 8,
      targetRir: 2,
      trace: args.step === null ? [] : [{ rule: "progression", ...args.step }],
    },
  };
}

function auditEvents(rows: EnvelopeDecisionRow[]): Map<string, ProgressionAuditEvent[]> {
  const byExercise = new Map<string, ProgressionAuditEvent[]>();
  for (const r of rows) {
    const cur = byExercise.get(r.exercise_id!) ?? [];
    cur.push(toProgressionAuditEvent(r, ENVELOPE_PARAMS));
    byExercise.set(r.exercise_id!, cur);
  }
  return byExercise;
}

describe("aggregateMesoOutcome", () => {
  it("sums the per-exercise §8.3 folds to meso grain", () => {
    const rows = [
      // exercise A: stepped ask answered compliant, then paced by the pacer
      row({ mesoId: "M1", exerciseId: "A", day: 0, step: { status: "stepped" } }),
      row({
        mesoId: "M1",
        exerciseId: "A",
        day: 7,
        step: { status: "paced", governor: "rate_pacer" },
      }),
      // exercise B: stepped ask answered with a compliance miss, then throttled
      row({ mesoId: "M1", exerciseId: "B", day: 1, step: { status: "stepped" } }),
      row({
        mesoId: "M1",
        exerciseId: "B",
        day: 8,
        step: { status: "not_earned", predicate: "compliance" },
        reps: [5, 5, 5],
      }),
      row({
        mesoId: "M1",
        exerciseId: "B",
        day: 15,
        step: { status: "paced", governor: "miss_throttle" },
      }),
      // exercise C: a workload gate firing
      row({
        mesoId: "M1",
        exerciseId: "C",
        day: 2,
        step: { status: "not_earned", predicate: "workload" },
      }),
    ];
    const out = aggregateMesoOutcome(auditEvents(rows), { over: 3, comparable: 12 });
    expect(out.decisions).toBe(6);
    // earned = stepped(2) + paced(2); the not_earned pair don't count
    expect(out.earned).toBe(4);
    expect(out.earnedThenMet).toBe(1); // A's ask answered by the paced (complied) row
    expect(out.earnedThenMissed).toBe(1); // B's ask answered by the compliance miss
    expect(out.throttleTrips).toBe(1);
    expect(out.pacerTrips).toBe(1);
    expect(out.workloadFirings).toBe(1);
    expect(out.overShare).toBe(0.25);
    // pairing is per exercise: A's ask must not be answered by B's miss
  });

  it("no comparable sets ⇒ overShare null", () => {
    const out = aggregateMesoOutcome(new Map(), { over: 0, comparable: 0 });
    expect(out.overShare).toBeNull();
  });
});

describe("envelopeOutcomesFromRows — boundary selection", () => {
  const stepped = (mesoId: string, day: number) =>
    row({ mesoId, exerciseId: "A", day, step: { status: "stepped" } });

  it("only COMPLETED mesos are boundaries; the active meso never moves its own position", () => {
    const rows = [stepped("M1", 0), stepped("M2", 30), stepped("M3", 60)];
    const outcomes = envelopeOutcomesFromRows(
      rows,
      new Set(["M1", "M2"]), // M3 is the active meso
      ENVELOPE_PARAMS,
      3,
    );
    expect(outcomes).toHaveLength(2);
  });

  it("abandoned blocks are not evidence (absent from the completed set)", () => {
    const rows = [stepped("M1", 0), stepped("M-abandoned", 30)];
    expect(
      envelopeOutcomesFromRows(rows, new Set(["M1"]), ENVELOPE_PARAMS, 3),
    ).toHaveLength(1);
  });

  it("the trailing window bounds by count, oldest boundaries aging out", () => {
    const rows = [
      stepped("M1", 0),
      stepped("M2", 30),
      stepped("M3", 60),
      stepped("M4", 90),
    ];
    const outcomes = envelopeOutcomesFromRows(
      rows,
      new Set(["M1", "M2", "M3", "M4"]),
      ENVELOPE_PARAMS,
      2,
    );
    expect(outcomes).toHaveLength(2);
  });

  it("beat share counts only step-bearing working decisions", () => {
    const rows = [
      // over-performance: 10 reps against the 8-rep prescription
      row({
        mesoId: "M1",
        exerciseId: "A",
        day: 0,
        step: { status: "stepped" },
        reps: [10, 10, 8],
      }),
      // a stepless (pre-v20-shaped) row must not count toward the share
      row({ mesoId: "M1", exerciseId: "A", day: 7, step: null, reps: [10, 10, 10] }),
    ];
    const [outcome] = envelopeOutcomesFromRows(
      rows,
      new Set(["M1"]),
      ENVELOPE_PARAMS,
      3,
    );
    expect(outcome.overShare).toBeCloseTo(0.67, 2);
  });
});

describe("replay determinism (doc 17 §7)", () => {
  it("a recorded seed position replays FROZEN through the recompute", () => {
    // a seed decision recorded under the envelope: earned, and the pacer's
    // verdict depends on the position — at the recorded floor (0) the step is
    // paced out; at the params default (0.5) it would flow. The recompute must
    // reproduce the RECORDED behavior, not re-derive a live position.
    const liveConfig = buildConfigInputs({
      equipmentType: "barbell",
      profile: { experience_level: "intermediate" },
      goal: "hypertrophy",
      week: { targetRir: 3, isDeload: false },
      previous: null,
      initial: null,
    });
    const anchor = { value: 198.2, confidence: "moderate" as const };
    const earn = {
      previous: { weight: 145, reps: 8, sets: 3, targetRir: 3 },
      actualSets: [1, 2, 3].map((n) => ({
        setNumber: n,
        weight: 145,
        reps: 8,
        rirReported: null,
        isWarmup: false,
      })),
      exerciseFeedback: null,
      workoutFeedback: null,
    };
    const progression = {
      seedEarn: earn,
      progressionHistory: {
        earnedThisMicrocycle: false,
        trailing30dPrescribedGainPct: 2.0,
        consecutiveMissedEarns: 0,
      },
      daysSincePreviousSession: 7,
      bandPosition: 0.0,
    };
    const storedInputs = seedEngineInputs(
      liveConfig,
      null,
      anchor,
      null,
      progression,
    ) as unknown as Record<string, unknown>;

    const expected = seedMeso(
      null,
      null,
      { equipmentType: "barbell", loadType: "external" },
      { experienceLevel: "intermediate" },
      3,
      ENVELOPE_PARAMS,
      {
        goalType: "hypertrophy",
        anchor,
        earn,
        daysSincePreviousSession: 7,
        progressionHistory: progression.progressionHistory,
        bandPosition: 0.0,
      },
    );
    // sanity: the recorded floor paces the earned step out …
    expect(
      expected.trace.find((s) => s.rule === "progression")?.governor,
    ).toBe("rate_pacer");

    const res = recomputeRow(
      {
        kind: "seed",
        storedInputs,
        liveConfig,
        anchor,
        bodyweight: null,
        currentOutput: {
          weight: expected.weight,
          reps: expected.reps,
          sets: expected.sets,
          targetRir: expected.targetRir,
        },
      },
      ENVELOPE_PARAMS,
    );
    // … and the recompute reproduces it exactly (unchanged), carrying the
    // recorded position forward in the rebuilt inputs
    expect(res.status).toBe("unchanged");
    expect((res.inputs as { bandPosition?: number }).bandPosition).toBe(0.0);
  });
});

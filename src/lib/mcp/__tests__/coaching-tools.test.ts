import { describe, it, expect } from "vitest";
import type { VMesoSummaryRow } from "@/lib/types/database";
import type { RecentSession, ExerciseAffinity, E1rmPoint } from "@/lib/queries/coaching";
import type { ExerciseOverview } from "@/lib/queries/exercises";
import type { MesoBalance } from "@/lib/queries/stats";
import {
  detectStall,
  formatTrainingOverview,
  formatRecentSessions,
  formatExerciseAnalysis,
  formatCompareMesos,
  formatMuscleBalance,
  formatAffinity,
  registerCoachingTools,
  GET_TRAINING_OVERVIEW,
  GET_RECENT_SESSIONS,
  ANALYZE_EXERCISE_PROGRESS,
  COMPARE_MESOCYCLES,
  GET_MUSCLE_BALANCE,
  GET_EXERCISE_AFFINITY,
} from "../tools/coaching";
import { captureServer, fakeExtra } from "./harness";

// --- detectStall -----------------------------------------------------------

describe("detectStall", () => {
  it("reports insufficient data for fewer than two points", () => {
    expect(detectStall([]).trend).toBe("insufficient_data");
    expect(detectStall([200]).trend).toBe("insufficient_data");
    expect(detectStall([null, null]).trend).toBe("insufficient_data");
  });

  it("flags a clean improving trend", () => {
    const out = detectStall([200, 205, 210, 220]);
    expect(out.trend).toBe("improving");
    expect(out.stalled).toBe(false);
    expect(out.first_e1rm).toBe(200);
    expect(out.best_e1rm).toBe(220);
    expect(out.latest_e1rm).toBe(220);
    expect(out.change_pct).toBeCloseTo(10, 1);
    expect(out.sessions_since_best).toBe(0);
  });

  it("flags a plateau when recent sessions set no new best", () => {
    const out = detectStall([200, 220, 220, 219, 220], { window: 3 });
    expect(out.trend).toBe("plateau");
    expect(out.stalled).toBe(true);
  });

  it("flags a decline when the latest drops below the best", () => {
    const out = detectStall([200, 230, 225, 205]);
    expect(out.trend).toBe("declining");
    expect(out.stalled).toBe(true);
    expect(out.sessions_since_best).toBeGreaterThan(0);
  });

  it("ignores nulls in the series", () => {
    const out = detectStall([200, null, 210, null, 220]);
    expect(out.sessions).toBe(3);
    expect(out.trend).toBe("improving");
  });
});

// --- formatTrainingOverview ------------------------------------------------

describe("formatTrainingOverview", () => {
  it("composes who / position / active meso / key lifts", () => {
    const out = formatTrainingOverview({
      profile: {
        display_name: "Garron",
        experience_level: "advanced",
        units: "lb",
        bodyweight: 198,
      } as never,
      currentState: { macrocycle: null, mesocycle: null, microcycle: null, nextWorkout: null },
      activeSummary: {
        name: "Block 1",
        workouts_completed: 8,
        workouts_total: 16,
        sessions_attended: 8,
        sessions_due: 9,
        avg_overall_fatigue: 2.1,
      } as VMesoSummaryRow,
      topLifts: [{ exercise_name: "Bench", change_pct: 4 }],
    });
    expect((out.who as Record<string, unknown>).display_name).toBe("Garron");
    expect((out.active_mesocycle as Record<string, unknown>).adherence_pct).toBe(
      Math.round((8 / 9) * 100),
    );
    expect(out.key_lift_trend).toHaveLength(1);
    expect(out.position).toBeDefined();
  });

  it("handles no active meso", () => {
    const out = formatTrainingOverview({
      profile: null,
      currentState: { macrocycle: null, mesocycle: null, microcycle: null, nextWorkout: null },
      activeSummary: null,
      topLifts: [],
    });
    expect(out.who).toBeNull();
    expect(out.active_mesocycle).toBeNull();
  });
});

// --- formatRecentSessions --------------------------------------------------

describe("formatRecentSessions", () => {
  it("shapes sessions with feedback", () => {
    const sessions: RecentSession[] = [
      {
        workout_id: "k1",
        performed_on: "2026-06-10",
        coordinate: "W2·D1",
        mesocycle_id: "m1",
        meso_name: "Block 1",
        is_deload: false,
        working_sets: 18,
        exercises_logged: 5,
        feedback: { overall_fatigue: 2, effort: 3, performance: 3 },
        notes: "felt strong",
      },
    ];
    const out = formatRecentSessions(sessions);
    expect(out.count).toBe(1);
    expect((out.sessions as Record<string, unknown>[])[0]).toMatchObject({
      coordinate: "W2·D1",
      working_sets: 18,
      notes: "felt strong",
    });
  });
});

// --- formatExerciseAnalysis ------------------------------------------------

describe("formatExerciseAnalysis", () => {
  it("attaches a stall analysis and a plateau hint", () => {
    const overview = {
      overview: {
        exercise_name: "Hack Squat",
        times_trained: 12,
        last_performed_at: "2026-06-10",
        weight_pr: 250,
        best_e1rm: 300,
      },
    } as unknown as ExerciseOverview;
    const series: E1rmPoint[] = [
      { performed_on: "1", e1rm: 280, top_weight: 230, working_sets: 3 },
      { performed_on: "2", e1rm: 300, top_weight: 250, working_sets: 3 },
      { performed_on: "3", e1rm: 300, top_weight: 250, working_sets: 3 },
      { performed_on: "4", e1rm: 299, top_weight: 250, working_sets: 3 },
      { performed_on: "5", e1rm: 300, top_weight: 250, working_sets: 3 },
    ];
    const out = formatExerciseAnalysis("e1", overview, series);
    expect(out.exercise_name).toBe("Hack Squat");
    expect((out.progress as Record<string, unknown>).trend).toBe("plateau");
    expect(out.note).toMatch(/new best/i);
  });
});

// --- formatCompareMesos ----------------------------------------------------

describe("formatCompareMesos", () => {
  it("shapes adherence per meso", () => {
    const rows = [
      {
        mesocycle_id: "m1",
        name: "Block 1",
        status: "completed",
        weeks: 5,
        includes_deload: true,
        workouts_completed: 16,
        working_sets: 200,
        working_reps: 2000,
        total_volume: 100000,
        best_e1rm: 300,
        sessions_attended: 15,
        sessions_due: 16,
        avg_overall_fatigue: 2,
        avg_performance: 3,
      },
    ] as unknown as VMesoSummaryRow[];
    const out = formatCompareMesos(rows);
    expect((out.mesocycles as Record<string, unknown>[])[0].adherence_pct).toBe(
      Math.round((15 / 16) * 100),
    );
  });

  it("normalizes totals per completed workout and warns on incomparable blocks", () => {
    const rows = [
      {
        mesocycle_id: "m1",
        name: "May",
        status: "completed",
        weeks: 4,
        includes_deload: false,
        workouts_completed: 16,
        working_sets: 320,
        working_reps: 3200,
        total_volume: 160000,
        best_e1rm: 300,
        sessions_attended: 13,
        sessions_due: 16,
        avg_overall_fatigue: 2,
        avg_performance: 3,
      },
      {
        mesocycle_id: "m2",
        name: "June",
        status: "active",
        weeks: 5,
        includes_deload: true,
        workouts_completed: 10,
        working_sets: 150,
        working_reps: 1500,
        total_volume: 90000,
        best_e1rm: 310,
        sessions_attended: 10,
        sessions_due: 10,
        avg_overall_fatigue: 2,
        avg_performance: 3,
      },
    ] as unknown as VMesoSummaryRow[];
    const out = formatCompareMesos(rows);
    expect(out.comparison_basis).toBe("completed_workouts");
    const warnings = out.warnings as string[];
    // active/incomplete + different durations + deload mismatch
    expect(warnings.length).toBe(3);
    const mesos = out.mesocycles as Record<string, unknown>[];
    expect(mesos[0].volume_per_workout).toBe(10000); // 160000 / 16
    expect(mesos[1].sets_per_workout).toBe(15); // 150 / 10
  });
});

// --- formatMuscleBalance ---------------------------------------------------

describe("formatMuscleBalance", () => {
  it("flags not-found", () => {
    expect(formatMuscleBalance("m1", null, null).found).toBe(false);
  });

  it("surfaces split, per-muscle sets, and an advisory note", () => {
    const balance: MesoBalance = {
      push: 40,
      pull: 38,
      legs: 50,
      bars: [{ name: "Chest", avg: 12 }],
      note: "Reasonably balanced.",
    };
    const out = formatMuscleBalance("m1", balance, "Week 3 of 5");
    expect(out.found).toBe(true);
    expect(out.split).toMatchObject({ push: 40, legs: 50 });
    expect((out.weekly_sets_per_muscle as Record<string, unknown>[])[0]).toMatchObject({
      muscle_group: "Chest",
      avg_weekly_sets: 12,
    });
    expect(out.note).toMatch(/advisory only/i);
  });
});

// --- formatAffinity --------------------------------------------------------

describe("formatAffinity", () => {
  it("shapes the selection profile with feedback", () => {
    const list: ExerciseAffinity[] = [
      {
        exercise_id: "e1",
        name: "Hack Squat",
        equipment_type: "machine",
        muscles: [{ name: "Quads", role: "primary" }],
        times_trained: 20,
        last_performed_at: "2026-06-10",
        best_weight: 300,
        best_e1rm_estimate: 360,
        total_volume: 50000,
        pinned_note: "feet low",
        feedback: { sessions: 18, avg_joint_pain: 0.5, avg_workload: 6, avg_pump: 7 },
      },
    ];
    const out = formatAffinity(list);
    expect(out.count).toBe(1);
    const ex = (out.exercises as Record<string, unknown>[])[0];
    expect(ex).toMatchObject({ name: "Hack Squat", pinned_note: "feet low" });
    expect((ex.feedback as Record<string, unknown>).avg_joint_pain).toBe(0.5);
  });
});

// --- registration ----------------------------------------------------------

describe("coaching-tool registration", () => {
  it("registers every coaching tool", () => {
    const { server, tools } = captureServer();
    registerCoachingTools(server);
    for (const name of [
      GET_TRAINING_OVERVIEW,
      GET_RECENT_SESSIONS,
      ANALYZE_EXERCISE_PROGRESS,
      COMPARE_MESOCYCLES,
      GET_MUSCLE_BALANCE,
      GET_EXERCISE_AFFINITY,
    ]) {
      expect(tools.has(name), name).toBe(true);
    }
  });

  it("no coaching tool takes a user_id argument (hard rule #5)", () => {
    const { server, tools } = captureServer();
    registerCoachingTools(server);
    for (const [, tool] of tools) {
      const schema = (tool.config.inputSchema ?? {}) as Record<string, unknown>;
      expect(Object.keys(schema)).not.toContain("user_id");
    }
  });

  it("rejects an unauthenticated call on a representative tool", async () => {
    const { server, tools } = captureServer();
    registerCoachingTools(server);
    const tool = tools.get(GET_TRAINING_OVERVIEW)!;
    await expect(tool.handler({}, fakeExtra(undefined))).rejects.toThrow(
      /authenticated session/i,
    );
  });
});

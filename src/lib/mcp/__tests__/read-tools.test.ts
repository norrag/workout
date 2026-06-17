import { describe, it, expect } from "vitest";
import type {
  ExerciseNoteRow,
  ProfileRow,
  TemplateRow,
  VMesoSummaryRow,
  VMesoWeekSetsRow,
} from "@/lib/types/database";
import type { CyclesOverview, MesoPlan } from "@/lib/queries/cycles";
import type { MacroOverview } from "@/lib/queries/macro";
import type { HistoryEntry } from "@/lib/queries/history";
import type {
  ExclusionWithExercise,
  ExerciseWithMuscles,
  PinnedNoteWithExercise,
} from "@/lib/queries/exercises";
import type { PrescriptionDecision } from "@/lib/queries/progression";
import {
  formatProfile,
  formatMacrocycles,
  formatMesoPlan,
  formatMesoSummary,
  formatMacroSummary,
  formatExerciseHistory,
  formatMuscleGroupVolume,
  formatExerciseSearch,
  formatTemplateSearch,
  formatPinnedNotes,
  formatExclusions,
  formatPrescriptionDecision,
  registerReadTools,
  GET_PROFILE,
  GET_MACROCYCLES,
  GET_MESOCYCLE,
  GET_MESO_SUMMARY,
  GET_MACRO_SUMMARY,
  GET_EXERCISE_HISTORY,
  GET_MUSCLE_GROUP_VOLUME,
  SEARCH_EXERCISES,
  SEARCH_TEMPLATES,
  GET_EXERCISE_NOTES,
  GET_EXCLUSIONS,
  EXPLAIN_PRESCRIPTION,
} from "../tools/read";
import { registerResources } from "../resources";
import { captureServer, fakeExtra } from "./harness";

// --- formatProfile ---------------------------------------------------------

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "u1",
    display_name: "Garron",
    age: 34,
    gender: "male",
    height_cm: 180,
    bodyweight: 198,
    bodyweight_updated_at: null,
    body_fat_pct: 15,
    training_since: null,
    experience_level: "advanced",
    preferred_equipment: ["barbell", "dumbbell"],
    units: "lb",
    week_starts_on: 1,
    auto_match_weights: false,
    role: "user",
    onboarded_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("formatProfile", () => {
  it("returns has_profile false when none exists", () => {
    const out = formatProfile(null);
    expect(out.has_profile).toBe(false);
  });

  it("shapes a profile and omits internal fields", () => {
    const out = formatProfile(profile());
    expect(out.has_profile).toBe(true);
    expect(out).toMatchObject({
      display_name: "Garron",
      bodyweight: 198,
      units: "lb",
      is_admin: false,
    });
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("role");
  });

  it("derives a training age from training_since", () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365.25 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const out = formatProfile(profile({ training_since: twoYearsAgo }));
    expect(out.training_age_years).toBeCloseTo(2, 0);
  });
});

// --- formatMacrocycles -----------------------------------------------------

describe("formatMacrocycles", () => {
  it("shapes macros with mesos and standalone mesos", () => {
    const meso = {
      id: "m1",
      name: "Block 1",
      position: 1,
      phase: "accumulation",
      weeks: 5,
      days_per_week: 4,
      includes_deload: true,
      rir_start: 3,
      rir_end: 0,
      status: "active",
    } as CyclesOverview["macros"][number]["mesos"][number];
    const overview: CyclesOverview = {
      macros: [
        {
          id: "M1",
          name: "Summer Bulk",
          goal_type: "hypertrophy",
          duration_months: 4,
          meso_length_weeks: 5,
          status: "active",
          start_date: "2026-06-01",
          mesos: [meso],
        } as CyclesOverview["macros"][number],
      ],
      standaloneMesos: [{ ...meso, id: "s1", position: null }],
    };
    const out = formatMacrocycles(overview) as Record<string, unknown[]>;
    expect(out.macrocycles).toHaveLength(1);
    const m0 = out.macrocycles[0] as Record<string, unknown>;
    expect(m0.name).toBe("Summer Bulk");
    expect((m0.mesocycles as unknown[])[0]).toMatchObject({
      name: "Block 1",
      rir_ramp: { start: 3, end: 0 },
    });
    expect(out.standalone_mesocycles).toHaveLength(1);
  });
});

// --- formatMesoPlan --------------------------------------------------------

describe("formatMesoPlan", () => {
  it("flags not-found", () => {
    expect(formatMesoPlan(null).found).toBe(false);
  });

  it("shapes days, groups, and slot fills", () => {
    const plan = {
      meso: {
        id: "m1",
        name: "Block 1",
        position: 1,
        phase: "accumulation",
        weeks: 5,
        days_per_week: 1,
        includes_deload: true,
        rir_start: 3,
        rir_end: 0,
        status: "active",
        start_date: "2026-06-01",
      },
      days: [
        {
          id: "day-1",
          day_number: 1,
          label: "Push",
          weekday: 1,
          groups: [
            {
              id: "grp-1",
              muscle_group_id: "mg-chest",
              muscle_group: "Chest",
              exercise_slots: 2,
              fills: [
                { id: "slot-1", exercise_id: "ex-bench", slot_number: 1, exercise_name: "Bench Press", initial_sets: 3 },
                { id: "slot-2", exercise_id: "ex-fly", slot_number: 2, exercise_name: "Fly", initial_sets: 2 },
              ],
            },
          ],
        },
      ],
    } as unknown as MesoPlan;
    const out = formatMesoPlan(plan) as Record<string, unknown>;
    expect(out.found).toBe(true);
    const days = out.days as Record<string, unknown>[];
    expect(days[0]).toMatchObject({ day_id: "day-1", planned_sets: 5 });
    const group = (days[0].groups as Record<string, unknown>[])[0];
    expect(group).toMatchObject({
      group_id: "grp-1",
      muscle_group_id: "mg-chest",
      muscle_group: "Chest",
      planned_sets: 5,
    });
    expect((group.exercises as Record<string, unknown>[])[0]).toMatchObject({
      slot_id: "slot-1",
      exercise_id: "ex-bench",
      exercise_name: "Bench Press",
      planned_sets: 3,
    });
    // meso-level total chains the plan into a weekly-volume comparison
    expect((out.mesocycle as Record<string, unknown>).planned_sets_per_week).toBe(5);
  });
});

// --- formatMesoSummary -----------------------------------------------------

function mesoSummaryRow(overrides: Partial<VMesoSummaryRow> = {}): VMesoSummaryRow {
  return {
    user_id: "u1",
    mesocycle_id: "m1",
    name: "Block 1",
    status: "completed",
    weeks: 5,
    days_per_week: 4,
    rir_start: 3,
    rir_end: 0,
    includes_deload: true,
    start_date: "2026-06-01",
    workouts_completed: 16,
    workouts_total: 16,
    working_sets: 240,
    total_volume: 120000,
    best_e1rm: 315,
    avg_joint_pain: 1.2,
    avg_pump: 6.5,
    avg_overall_fatigue: 2.1,
    avg_performance: 3.2,
    sessions_attended: 15,
    sessions_due: 16,
    working_reps: 2400,
    n_joint_pain: 60,
    n_pump: 60,
    n_overall_fatigue: 15,
    n_performance: 15,
    ...overrides,
  };
}

describe("formatMesoSummary", () => {
  it("flags not-found", () => {
    expect(formatMesoSummary(null, []).found).toBe(false);
  });

  it("computes adherence and surfaces estimate-labeled e1RM", () => {
    const out = formatMesoSummary(mesoSummaryRow(), [
      {
        exercise_id: "e1",
        exercise_name: "Bench Press",
        first_e1rm: 300,
        last_e1rm: 315,
        score_pct: 5,
      },
    ]);
    expect(out.adherence_pct).toBe(Math.round((15 / 16) * 100));
    expect(out.best_e1rm_estimate).toBe(315);
    expect(out.working_reps).toBe(2400);
    const scores = out.progress_scores as Record<string, unknown>[];
    expect(scores[0]).toMatchObject({ e1rm_change_pct: 5 });
  });

  it("exposes both adherence denominators (due vs full block)", () => {
    const out = formatMesoSummary(
      mesoSummaryRow({
        sessions_attended: 10,
        sessions_due: 10,
        workouts_completed: 10,
        workouts_total: 16,
      }),
      [],
    );
    const adherence = out.adherence as Record<string, unknown>;
    expect(adherence.adherence_pct).toBe(100); // 10/10 due
    expect(adherence.block_completion_pct).toBe(63); // 10/16 generated
    expect(adherence.total_due).toBe(10);
    expect(adherence.workouts_generated).toBe(16);
  });

  it("returns null adherence when nothing was due", () => {
    const out = formatMesoSummary(mesoSummaryRow({ sessions_due: 0 }), []);
    expect(out.adherence_pct).toBeNull();
  });
});

// --- formatMacroSummary ----------------------------------------------------

describe("formatMacroSummary", () => {
  it("flags not-found", () => {
    expect(formatMacroSummary(null).found).toBe(false);
  });

  it("surfaces an estimate-labeled target and timeline", () => {
    const overview = {
      macro: {
        id: "M1",
        name: "Summer Bulk",
        goal_type: "hypertrophy",
        duration_months: 4,
      },
      mesos: [
        { id: "m1", name: "Block 1", position: 1, phase: "accumulation", status: "active" },
      ],
      plan: {
        target: { low: 4, high: 8, unit: "lb", direction: "gain" },
        perMonthRate: { low: 1, high: 2, unit: "lb", direction: "gain" },
        recommendedDurationMonths: 4,
      },
      stats: {
        estStrengthPct: 6.2,
        totalVolume: 200000,
        sessionsLogged: 60,
        adherencePct: 92,
      },
    } as unknown as MacroOverview;
    const out = formatMacroSummary(overview) as Record<string, unknown>;
    expect(out.found).toBe(true);
    expect(out.target).toMatchObject({
      low: 4,
      high: 8,
      per_month_low: 1,
      per_month_high: 2,
      is_estimate: true,
    });
    expect((out.stats as Record<string, unknown>).est_strength_change_pct).toBe(6.2);
  });
});

// --- formatExerciseHistory -------------------------------------------------

describe("formatExerciseHistory", () => {
  it("carries both note kinds", () => {
    const sessions: HistoryEntry[] = [
      {
        mesocycle_id: "m1",
        meso_name: "Block 1",
        coordinate: "W2·D1",
        performed_on: "2026-06-10",
        top_weight: 225,
        reps: "8, 8",
        is_deload: false,
        session_note: "elbow cranky",
      },
    ];
    const pinned = { body: "wide grip" } as ExerciseNoteRow;
    const out = formatExerciseHistory("e1", sessions, pinned);
    expect(out.pinned_note).toBe("wide grip");
    expect(out.session_count).toBe(1);
    expect((out.sessions as Record<string, unknown>[])[0]).toMatchObject({
      reps_at_top: "8, 8",
      session_note: "elbow cranky",
    });
  });

  it("handles no pinned note", () => {
    const out = formatExerciseHistory("e1", [], null);
    expect(out.pinned_note).toBeNull();
    expect(out.session_count).toBe(0);
  });
});

// --- formatMuscleGroupVolume -----------------------------------------------

describe("formatMuscleGroupVolume", () => {
  it("groups by muscle and sorts weeks", () => {
    const rows: VMesoWeekSetsRow[] = [
      {
        user_id: "u1",
        mesocycle_id: "m1",
        week_number: 2,
        is_deload: false,
        muscle_group_id: "g1",
        muscle_group: "Chest",
        planned_sets: 12,
        logged_sets: 11,
      },
      {
        user_id: "u1",
        mesocycle_id: "m1",
        week_number: 1,
        is_deload: false,
        muscle_group_id: "g1",
        muscle_group: "Chest",
        planned_sets: 10,
        logged_sets: 10,
      },
    ];
    const out = formatMuscleGroupVolume("m1", rows) as Record<string, unknown>;
    const groups = out.groups as Record<string, unknown>[];
    expect(groups).toHaveLength(1);
    const weeks = groups[0].weeks as Record<string, unknown>[];
    expect(weeks.map((w) => w.week_number)).toEqual([1, 2]);
  });
});

// --- formatExerciseSearch / Templates / Notes / Exclusions -----------------

describe("formatExerciseSearch", () => {
  it("marks custom exercises and lists muscles", () => {
    const list = [
      {
        id: "e1",
        user_id: "u1",
        name: "My Curl",
        equipment_type: "dumbbell",
        muscles: [{ id: "g1", name: "Biceps", role: "primary" }],
      },
      {
        id: "e2",
        user_id: null,
        name: "Bench Press",
        equipment_type: "barbell",
        muscles: [],
      },
    ] as unknown as ExerciseWithMuscles[];
    const out = formatExerciseSearch(list) as Record<string, unknown>;
    expect(out.count).toBe(2);
    const ex = out.exercises as Record<string, unknown>[];
    expect(ex[0]).toMatchObject({ is_custom: true });
    expect(ex[1]).toMatchObject({ is_custom: false });
  });
});

describe("formatTemplateSearch", () => {
  it("shapes templates", () => {
    const list = [
      {
        id: "t1",
        user_id: null,
        name: "PPL",
        emphasis: "balanced",
        days_per_week: 6,
        description: null,
      },
    ] as unknown as TemplateRow[];
    const out = formatTemplateSearch(list) as Record<string, unknown>;
    expect((out.templates as Record<string, unknown>[])[0]).toMatchObject({
      name: "PPL",
      is_custom: false,
    });
  });
});

describe("formatPinnedNotes / formatExclusions", () => {
  it("shapes pinned notes", () => {
    const notes = [
      {
        exercise_id: "e1",
        exercise_name: "Bench",
        body: "wide grip",
        updated_at: "2026-06-01T00:00:00Z",
      },
    ] as unknown as PinnedNoteWithExercise[];
    const out = formatPinnedNotes(notes) as Record<string, unknown>;
    expect((out.notes as Record<string, unknown>[])[0]).toMatchObject({
      exercise_name: "Bench",
      note: "wide grip",
    });
  });

  it("shapes exclusions with reasons", () => {
    const list = [
      {
        exercise_id: "e1",
        exercise_name: "Back Squat",
        reason: "knee",
      },
    ] as unknown as ExclusionWithExercise[];
    const out = formatExclusions(list) as Record<string, unknown>;
    expect((out.exclusions as Record<string, unknown>[])[0]).toMatchObject({
      exercise_name: "Back Squat",
      reason: "knee",
    });
  });
});

// --- formatPrescriptionDecision --------------------------------------------

describe("formatPrescriptionDecision", () => {
  it("flags no decision", () => {
    const out = formatPrescriptionDecision("e1", null);
    expect(out.found).toBe(false);
  });

  it("surfaces inputs/output and the engine-owns-numbers note", () => {
    const decision: PrescriptionDecision = {
      exercise_id: "e1",
      exercise_name: "Hack Squat",
      workout_exercise_id: "we1",
      coordinate: "W3·D2",
      decided_at: "2026-06-15T00:00:00Z",
      params_version: 6,
      inputs: { lastTopWeight: 250 },
      output: { weight: 255, rationale: "+5 lb" },
    };
    const out = formatPrescriptionDecision("e1", decision);
    expect(out.found).toBe(true);
    expect(out.output).toMatchObject({ weight: 255 });
    expect(out.params_version).toBe(6);
  });
});

// --- registration + identity contract --------------------------------------

describe("read-tool registration", () => {
  it("registers every Slice 2a read tool", () => {
    const { server, tools } = captureServer();
    registerReadTools(server);
    for (const name of [
      GET_PROFILE,
      GET_MACROCYCLES,
      GET_MESOCYCLE,
      GET_MESO_SUMMARY,
      GET_MACRO_SUMMARY,
      GET_EXERCISE_HISTORY,
      GET_MUSCLE_GROUP_VOLUME,
      SEARCH_EXERCISES,
      SEARCH_TEMPLATES,
      GET_EXERCISE_NOTES,
      GET_EXCLUSIONS,
      EXPLAIN_PRESCRIPTION,
    ]) {
      expect(tools.has(name), name).toBe(true);
    }
  });

  it("no read tool takes a user_id argument (hard rule #5)", () => {
    const { server, tools } = captureServer();
    registerReadTools(server);
    for (const [, tool] of tools) {
      const schema = (tool.config.inputSchema ?? {}) as Record<string, unknown>;
      expect(Object.keys(schema)).not.toContain("user_id");
    }
  });

  it("registers the profile resource", () => {
    const { server, resources } = captureServer();
    registerResources(server);
    expect(resources.get("profile")?.uri).toBe("workout://profile");
  });

  it("rejects an unauthenticated call on a representative tool", async () => {
    const { server, tools } = captureServer();
    registerReadTools(server);
    const tool = tools.get(GET_PROFILE)!;
    await expect(tool.handler({}, fakeExtra(undefined))).rejects.toThrow(
      /authenticated session/i,
    );
  });
});

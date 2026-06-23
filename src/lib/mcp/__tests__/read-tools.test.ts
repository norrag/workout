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
import type {
  PrescriptionDecision,
  ProjectedPrescription,
} from "@/lib/queries/progression";
import {
  formatProfile,
  formatMacrocycles,
  formatMesoPlan,
  buildDayEmphasisList,
  type RolesByExercise,
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
    height_in: 71,
    bodyweight: 198,
    bodyweight_updated_at: null,
    body_fat_pct: 15,
    training_since: null,
    experience_level: "advanced",
    preferred_equipment: ["barbell", "dumbbell"],
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
    // no roles supplied → emphasis is present but unclassified (additive, safe)
    expect((days[0].emphasis as Record<string, unknown>).classification).toBe("unclassified");
  });

  it("derives a per-day emphasis from the exercises' muscle roles (12 §2)", () => {
    const plan = {
      meso: {
        id: "m1",
        name: "Block 1",
        position: 1,
        phase: "accumulation",
        weeks: 5,
        days_per_week: 2,
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
          label: "Upper",
          weekday: 1,
          groups: [
            {
              id: "grp-1",
              muscle_group_id: "mg-chest",
              muscle_group: "Chest",
              exercise_slots: 1,
              fills: [
                { id: "s1", exercise_id: "ex-bench", slot_number: 1, exercise_name: "Bench", initial_sets: 4 },
              ],
            },
          ],
        },
        {
          id: "day-2",
          day_number: 2,
          label: "Legs",
          weekday: 3,
          groups: [
            {
              id: "grp-2",
              muscle_group_id: "mg-quads",
              muscle_group: "Quads",
              exercise_slots: 1,
              fills: [
                { id: "s2", exercise_id: "ex-squat", slot_number: 1, exercise_name: "Squat", initial_sets: 3 },
              ],
            },
          ],
        },
      ],
    } as unknown as MesoPlan;
    const roles: RolesByExercise = new Map([
      ["ex-bench", [
        { name: "chest", role: "primary" },
        { name: "triceps", role: "secondary" },
      ]],
      ["ex-squat", [
        { name: "quads", role: "primary" },
        { name: "glutes", role: "secondary" },
      ]],
    ]);
    const out = formatMesoPlan(plan, roles) as Record<string, unknown>;
    const days = out.days as Record<string, unknown>[];
    expect((days[0].emphasis as Record<string, unknown>).classification).toBe("upper-push");
    expect((days[1].emphasis as Record<string, unknown>).classification).toBe("legs");
  });

  it("buildDayEmphasisList returns a compact per-day summary", () => {
    const plan = {
      meso: { id: "m1" },
      days: [
        {
          id: "day-1",
          day_number: 1,
          label: "Legs",
          weekday: 3,
          groups: [
            {
              id: "g",
              muscle_group_id: "mg",
              muscle_group: "Quads",
              exercise_slots: 1,
              fills: [
                { id: "s", exercise_id: "ex-squat", slot_number: 1, exercise_name: "Squat", initial_sets: 3 },
              ],
            },
          ],
        },
      ],
    } as unknown as MesoPlan;
    const roles: RolesByExercise = new Map([
      ["ex-squat", [{ name: "quads", role: "primary" }]],
    ]);
    const list = buildDayEmphasisList(plan, roles);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ day_number: 1, label: "Legs", planned_sets: 3 });
    expect(list[0].emphasis.classification).toBe("legs");
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

  it("rounds view floats and reconciles progress change with the rounded e1RM (§5.7)", () => {
    const out = formatMesoSummary(
      mesoSummaryRow({
        total_volume: 137773.123456,
        best_e1rm: 314.6666666,
        avg_pump: 6.512345,
        avg_overall_fatigue: 2.149999,
      }),
      [
        {
          exercise_id: "e1",
          exercise_name: "Dumbbell Curl",
          first_e1rm: 33.33333333,
          last_e1rm: 27.0,
          score_pct: -15.9, // raw-float pct that disagrees with the displayed values
        },
      ],
    );
    expect(out.total_volume).toBe(137773.1);
    expect(out.best_e1rm_estimate).toBe(314.7);
    const feedback = out.feedback as Record<string, unknown>;
    expect(feedback.avg_pump).toBe(6.5);
    expect(feedback.avg_overall_fatigue).toBe(2.1);
    const score = (out.progress_scores as Record<string, unknown>[])[0];
    expect(score.first_e1rm_estimate).toBe(33.3);
    expect(score.last_e1rm_estimate).toBe(27);
    // change is recomputed from the rounded e1RM shown, not the raw float:
    // (27 − 33.3) / 33.3 = −18.9%, so the payload reconciles with itself
    expect(score.e1rm_change_pct).toBe(-18.9);
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
        e1rm: 281.3,
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
      e1rm: 281.3,
      session_note: "elbow cranky",
    });
  });

  it("handles no pinned note", () => {
    const out = formatExerciseHistory("e1", [], null);
    expect(out.pinned_note).toBeNull();
    expect(out.session_count).toBe(0);
  });

  it("reports the lifetime total and flags a truncated window (§5.2)", () => {
    const sessions: HistoryEntry[] = [
      {
        mesocycle_id: "m1",
        meso_name: "Block 1",
        coordinate: "W2·D1",
        performed_on: "2026-06-10",
        top_weight: 225,
        reps: "8",
        e1rm: 281.3,
        is_deload: false,
        session_note: null,
      },
    ];
    const out = formatExerciseHistory("e1", sessions, null, 144);
    // session_count is the lifetime total (matches analyze_exercise_progress),
    // sessions_shown is the returned window
    expect(out.session_count).toBe(144);
    expect(out.sessions_shown).toBe(1);
    expect(out.truncated).toBe(true);
    expect(out.note).toMatch(/most recent/i);
  });

  it("does not flag truncation when the window covers all sessions", () => {
    const out = formatExerciseHistory("e1", [], null, 0);
    expect(out.session_count).toBe(0);
    expect(out.truncated).toBe(false);
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

  it("labels weeks past generation as not_yet_generated, not zero (§5.10)", () => {
    // a 5-week meso where only weeks 1–3 of chest have been generated
    const rows: VMesoWeekSetsRow[] = [1, 2, 3].map((week_number) => ({
      user_id: "u1",
      mesocycle_id: "m1",
      week_number,
      is_deload: false,
      muscle_group_id: "g1",
      muscle_group: "Chest",
      planned_sets: 10,
      logged_sets: week_number === 3 ? 0 : 10,
    }));
    const out = formatMuscleGroupVolume("m1", rows, 5) as Record<string, unknown>;
    expect(out.weeks_total).toBe(5);
    expect(out.weeks_generated).toEqual([1, 2, 3]);
    const weeks = (out.groups as Record<string, unknown>[])[0].weeks as Record<string, unknown>[];
    expect(weeks).toHaveLength(5);
    expect(weeks[0].status).toBe("logged"); // logged > 0
    expect(weeks[2].status).toBe("planned"); // generated, nothing logged yet
    expect(weeks[3]).toMatchObject({ status: "not_yet_generated", planned_sets: null, logged_sets: 0 });
    expect(weeks[4].status).toBe("not_yet_generated");
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
    // §5.9: the discovery path now points at its execution path
    expect(out.note).toContain("create_mesocycle");
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
  it("flags no decision and no projection", () => {
    const out = formatPrescriptionDecision("e1", null, null);
    expect(out.found).toBe(false);
  });

  it("surfaces a recorded decision's inputs/output and the engine-owns-numbers note", () => {
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
    expect(out.source).toBe("recorded");
    expect(out.output).toMatchObject({ weight: 255 });
    expect(out.params_version).toBe(6);
  });

  it("falls back to a projection when no decision is recorded (§5.5)", () => {
    const projected: ProjectedPrescription = {
      exercise_id: "e1",
      exercise_name: "Dumbbell Curl (2-Arm)",
      source_coordinate: "W3·D1",
      projected_for: { target_rir: 1, is_deload: false, basis: "next week W4 (target RIR 1)" },
      params_version: 8,
      inputs: { previous: { weight: 35 } },
      output: { weight: 35, sets: 3, rationale: "hold load; RIR drop is the progression" },
    };
    const out = formatPrescriptionDecision("e1", null, projected);
    expect(out.found).toBe(true);
    expect(out.source).toBe("projected");
    expect(out.source_coordinate).toBe("W3·D1");
    expect(out.projected_for).toMatchObject({ target_rir: 1 });
    expect(out.output).toMatchObject({ weight: 35 });
    expect(out.note).toMatch(/projection/i);
  });

  it("prefers the recorded decision over a projection when both are present", () => {
    const decision: PrescriptionDecision = {
      exercise_id: "e1",
      exercise_name: "Hack Squat",
      workout_exercise_id: "we1",
      coordinate: "W3·D2",
      decided_at: "2026-06-15T00:00:00Z",
      params_version: 6,
      inputs: {},
      output: { weight: 255 },
    };
    const projected: ProjectedPrescription = {
      exercise_id: "e1",
      exercise_name: "Hack Squat",
      source_coordinate: "W3·D2",
      projected_for: { target_rir: 0, is_deload: false, basis: "x" },
      params_version: 8,
      inputs: {},
      output: { weight: 999 },
    };
    const out = formatPrescriptionDecision("e1", decision, projected);
    expect(out.source).toBe("recorded");
    expect(out.output).toMatchObject({ weight: 255 });
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

  it("registers the coaching-guide resource and serves it without a session", async () => {
    const { server, resources } = captureServer();
    registerResources(server);
    const guide = resources.get("coaching-guide");
    expect(guide?.uri).toBe("workout://coaching-guide");
    // Static reference text — no auth context needed.
    const result = (await guide!.handler(
      new URL("workout://coaching-guide"),
      fakeExtra(undefined),
    )) as { contents: { mimeType: string; text: string }[] };
    const content = result.contents[0];
    expect(content.mimeType).toBe("text/markdown");
    // Grounded in the §9 guardrails, not a motivational-trainer voice.
    expect(content.text).toMatch(/honesty guardrails/i);
    expect(content.text).toMatch(/MEV/);
    expect(content.text).toMatch(/RIR ramp/i);
    expect(content.text).toMatch(/comparability/i);
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

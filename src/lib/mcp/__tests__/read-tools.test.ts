import { describe, it, expect } from "vitest";
import type {
  ExerciseNoteRow,
  ProfileRow,
  TemplateRow,
  VBodyCompHistoryRow,
  VMesoSummaryRow,
} from "@/lib/types/database";
import type { CyclesOverview, MesoPlan } from "@/lib/queries/cycles";
import type { WeightedWeekSets } from "@/lib/queries/volume-projection";
import type { MacroOverview } from "@/lib/queries/macro";
import type { MacroRetrospective } from "@/lib/queries/macro-retrospective";
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
  formatMacroRetrospective,
  formatExerciseHistory,
  formatMuscleGroupVolume,
  formatExerciseSearch,
  formatTemplateSearch,
  formatPinnedNotes,
  formatExclusions,
  formatPrescriptionDecision,
  formatBodyComposition,
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
  GET_BODY_COMPOSITION,
} from "../tools/read";
import { registerResources } from "../resources";
import { captureServer, fakeExtra } from "./harness";

// --- formatProfile ---------------------------------------------------------

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "u1",
    display_name: "Garron",
    age: 34,
    birthdate: null,
    gender: "male",
    height_in: 71,
    bodyweight: 198,
    bodyweight_updated_at: null,
    body_fat_pct: 15,
    body_fat_source: null,
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

  it("discloses an effort assignment on the slot that carries it (doc 21 §8)", () => {
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
                {
                  id: "slot-1",
                  exercise_id: "ex-bench",
                  slot_number: 1,
                  exercise_name: "Bench Press",
                  initial_sets: 3,
                  target_rir: null,
                  rir_schedule: [null, null, 4, 4],
                  set_cap: null,
                  set_cap_schedule: null,
                  effort_reason: "right elbow",
                },
                {
                  id: "slot-2",
                  exercise_id: "ex-fly",
                  slot_number: 2,
                  exercise_name: "Fly",
                  initial_sets: 2,
                  target_rir: null,
                  rir_schedule: null,
                  set_cap: null,
                  set_cap_schedule: null,
                  effort_reason: null,
                },
              ],
            },
          ],
        },
      ],
    } as unknown as MesoPlan;
    const exercises = ((formatMesoPlan(plan).days as Record<string, unknown>[])[0]
      .groups as Record<string, unknown>[])[0].exercises as Record<string, unknown>[];
    expect(exercises[0].effort).toMatchObject({
      rir_by_working_week: [null, null, 4, 4],
      reason: "right elbow",
    });
    expect(exercises[0].effort).not.toHaveProperty("target_rir");
    // an unassigned slot reads exactly as it did before the lever existed
    expect(exercises[1]).not.toHaveProperty("effort");
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
        baseline_e1rm: 300,
        current_e1rm: 315,
        score_pct: 5,
        sessions: 4,
        trend: "improving",
      },
    ]);
    expect(out.adherence_pct).toBe(Math.round((15 / 16) * 100));
    expect(out.best_e1rm_estimate).toBe(315);
    expect(out.working_reps).toBe(2400);
    const scores = out.progress_scores as Record<string, unknown>[];
    expect(scores[0]).toMatchObject({ e1rm_change_pct: 5, sessions: 4 });
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
          baseline_e1rm: 33.33333333,
          current_e1rm: 27.0,
          score_pct: -15.9, // raw-float pct that disagrees with the displayed values
          sessions: 3,
          trend: "declining",
        },
      ],
    );
    expect(out.total_volume).toBe(137773.1);
    expect(out.best_e1rm_estimate).toBe(314.7);
    const feedback = out.feedback as Record<string, unknown>;
    expect(feedback.avg_pump).toBe(6.5);
    expect(feedback.avg_overall_fatigue).toBe(2.1);
    const score = (out.progress_scores as Record<string, unknown>[])[0];
    expect(score.baseline_e1rm_estimate).toBe(33.3);
    expect(score.recent_e1rm_estimate).toBe(27);
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
    // no retrospective block on a live macro
    expect(out.retrospective).toBeUndefined();
  });
});

// --- formatMacroRetrospective (doc 17 §4.2 parity) ---------------------------

/** A completed-macro fold output, as `getMacroOverview` assembles it. */
const RETRO: MacroRetrospective = {
  strength: {
    estStrengthPct: 6.2,
    verdict: "within band",
    informational: false,
    band: { low: 4, high: 8 },
    muscles: [{ muscleGroup: "Chest", scorePct: 6.5, lifts: 2 }],
  },
  mass: null,
  demand: {
    decisions: 16,
    stepped: 7,
    vanished: 2,
    paced: 3,
    notEarned: 4,
    governorFirings: { rate_pacer: 3 },
    gateFailures: { compliance: 3 },
    vanishedShare: 0.22,
    earnedThenMet: 5,
    earnedThenMissed: 2,
  },
  adherence: { adherencePct: 92, sessionsLogged: 60, totalVolume: 200000 },
  blocks: { completed: 4, abandoned: 1, notBuilt: 2 },
  composition: null,
};

describe("formatMacroRetrospective", () => {
  it("is a pure renaming of the shared fold — values pass through unchanged (parity)", () => {
    const out = formatMacroRetrospective(RETRO);
    expect(out.strength).toMatchObject({
      est_strength_change_pct: 6.2,
      verdict: "within band",
      informational: false,
      contract_band: { low: 4, high: 8 },
      muscle_changes: [{ muscle_group: "Chest", e1rm_change_pct: 6.5, lifts: 2 }],
    });
    expect(out.demand).toMatchObject({
      decisions: 16,
      earned: 7,
      vanished: 2,
      paced: 3,
      not_earned: 4,
      governor_firings: { rate_pacer: 3 },
      vanished_share: 0.22,
      earned_then_met: 5,
      earned_then_missed: 2,
    });
    expect(out.adherence).toEqual({
      adherence_pct: 92,
      sessions_logged: 60,
      total_volume: 200000,
    });
    expect(out.blocks).toEqual({ completed: 4, abandoned: 1, not_built: 2 });
    expect(out.mass).toBeNull();
    expect(String(out.note)).toMatch(/contract/);
  });

  it("carries the unmeasured mass row verbatim", () => {
    const out = formatMacroRetrospective({
      ...RETRO,
      strength: { ...RETRO.strength, verdict: null, informational: true, band: null },
      mass: {
        measured: false,
        verdict: null,
        measuredDeltaLb: null,
        note: "not measured — a bodyweight series or DEXA scans bracketing this block would grade it",
      },
      demand: null,
    });
    expect(out.mass).toMatchObject({ measured: false, verdict: null });
    expect(out.demand).toBeNull();
    expect((out.strength as Record<string, unknown>).verdict).toBeNull();
  });

  it("carries the 5b composition block verbatim (and null when absent)", () => {
    expect(formatMacroRetrospective(RETRO).composition).toBeNull();
    const out = formatMacroRetrospective({
      ...RETRO,
      composition: {
        startScannedAt: "2026-03-01T10:00:00Z",
        endScannedAt: "2026-06-28T10:00:00Z",
        daysApart: 119,
        sameScanner: true,
        deltaLeanLb: 2.6,
        deltaFatLb: -0.4,
        deltaWeightLb: 2.1,
        deltaBodyFatPct: -0.6,
        leanWithinNoise: false,
        fatWithinNoise: true,
        note: "119 days between scans",
      },
    });
    expect(out.composition).toEqual({
      start_scanned_at: "2026-03-01T10:00:00Z",
      end_scanned_at: "2026-06-28T10:00:00Z",
      days_apart: 119,
      same_scanner: true,
      delta_lean_lb: 2.6,
      delta_fat_lb: -0.4,
      delta_weight_lb: 2.1,
      delta_body_fat_pct: -0.6,
      lean_within_noise: false,
      fat_within_noise: true,
      note: "119 days between scans",
    });
  });

  it("rides get_macrocycle_summary once the macro is completed", () => {
    const overview = {
      macro: {
        id: "M1",
        name: "Summer Bulk",
        goal_type: "strength",
        status: "completed",
        duration_months: 4,
      },
      mesos: [],
      plan: {
        target: { low: 4, high: 8, unit: "%", direction: "gain" },
        perMonthRate: { low: 1, high: 2, unit: "%", direction: "gain" },
        recommendedDurationMonths: 4,
      },
      stats: {
        estStrengthPct: 6.2,
        totalVolume: 200000,
        sessionsLogged: 60,
        adherencePct: 92,
      },
      retrospective: RETRO,
    } as unknown as MacroOverview;
    const out = formatMacroSummary(overview) as Record<string, unknown>;
    expect(out.status).toBe("completed");
    // the block IS the shared fold, snake_cased — parity by construction
    expect(out.retrospective).toEqual(formatMacroRetrospective(RETRO));
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
        effective_load: null,
        avg_rir: 2,
      rir_source: null,
      effective_reps: null,
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
      avg_rir: 2,
      rir_source: null,
      effective_reps: null,
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
        effective_load: null,
        avg_rir: null,
      rir_source: null,
      effective_reps: null,
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
    const rows: WeightedWeekSets[] = [
      {
        week_number: 2,
        is_deload: false,
        muscle_group_id: "g1",
        muscle_group: "Chest",
        planned_sets: 12,
        logged_sets: 11,
      },
      {
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
    const rows: WeightedWeekSets[] = [1, 2, 3].map((week_number) => ({
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

  it("shows projected sets for unmaterialized weeks when a projection is given (PH34)", () => {
    // weeks 1–3 generated; the projection supplies the unmaterialized 4–5.
    const rows: WeightedWeekSets[] = [1, 2, 3].map((week_number) => ({
      week_number,
      is_deload: false,
      muscle_group_id: "g1",
      muscle_group: "Chest",
      planned_sets: 10,
      logged_sets: week_number === 3 ? 0 : 10,
    }));
    const projected = [
      { week_number: 4, muscle_group_id: "g1", muscle_group: "Chest", projected_sets: 10, is_deload: false },
      { week_number: 5, muscle_group_id: "g1", muscle_group: "Chest", projected_sets: 5, is_deload: true },
    ];
    const out = formatMuscleGroupVolume("m1", rows, 5, projected) as Record<string, unknown>;
    const weeks = (out.groups as Record<string, unknown>[])[0].weeks as Record<string, unknown>[];
    expect(weeks[3]).toMatchObject({ status: "projected", planned_sets: 10, is_deload: false });
    expect(weeks[4]).toMatchObject({ status: "projected", planned_sets: 5, is_deload: true });
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
      decision_id: "d1",
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
    // doc 18 §6: no stored explanation ⇒ the field is absent, not null
    expect("explanation" in out).toBe(false);
  });

  it("attaches the stored LLM explanation when one is served (doc 18 §6)", () => {
    const decision: PrescriptionDecision = {
      decision_id: "d1",
      exercise_id: "e1",
      exercise_name: "Hack Squat",
      workout_exercise_id: "we1",
      coordinate: "W3·D2",
      decided_at: "2026-06-15T00:00:00Z",
      params_version: 6,
      inputs: {},
      output: { weight: 255 },
    };
    const out = formatPrescriptionDecision(
      "e1",
      decision,
      null,
      "You earned the step; the pacer is deferring it.",
    );
    expect(out.explanation).toBe(
      "You earned the step; the pacer is deferring it.",
    );
    // the engine-owns-numbers note stays regardless
    expect(out.note).toMatch(/engine/i);
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
      decision_id: "d1",
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

// --- formatBodyComposition ---------------------------------------------------

function compRow(
  overrides: Partial<VBodyCompHistoryRow> = {},
): VBodyCompHistoryRow {
  return {
    user_id: "u1",
    scan_id: "s1",
    provider: "bodyspec",
    scanned_at: "2026-07-08T17:00:00Z",
    scanner_model: "GE Lunar iDXA",
    weight_lb: 176.3,
    body_fat_pct: 18.2,
    lean_mass_lb: 137.4,
    fat_mass_lb: 32.1,
    almi_kg_m2: 9.13,
    prev_scanned_at: null,
    delta_weight_lb: null,
    delta_body_fat_pct: null,
    delta_lean_lb: null,
    delta_fat_lb: null,
    same_scanner_as_prev: null,
    ...overrides,
  };
}

describe("formatBodyComposition", () => {
  it("reports no scans with the connect pointer", () => {
    const out = formatBodyComposition([], null);
    expect(out.has_scans).toBe(false);
    expect(String(out.summary)).toMatch(/BodySpec/);
  });

  it("first scan carries no delta block; a comparable pair gets LSC noise flags", () => {
    const rows = [
      compRow(),
      compRow({
        scan_id: "s2",
        scanned_at: "2026-10-08T17:00:00Z",
        prev_scanned_at: "2026-07-08T17:00:00Z",
        delta_weight_lb: 1.1,
        delta_body_fat_pct: -0.4,
        delta_lean_lb: 1.4,
        delta_fat_lb: -2.3,
        same_scanner_as_prev: true,
      }),
    ];
    const out = formatBodyComposition(rows, null) as unknown as {
      scan_count: number;
      scans: { delta_vs_previous: Record<string, unknown> | null }[];
    };
    expect(out.scan_count).toBe(2);
    expect(out.scans[0].delta_vs_previous).toBeNull();
    // lean +1.4 sits inside the ~2 lb LSC (never a change); fat −2.3 is outside
    expect(out.scans[1].delta_vs_previous).toMatchObject({
      comparable: true,
      lean_within_noise: true,
      fat_within_noise: false,
      body_fat_within_noise: true,
    });
  });

  it("cross-scanner pairs are flagged not-comparable, no noise verdicts (doc 15 §6.2)", () => {
    const rows = [
      compRow(),
      compRow({
        scan_id: "s2",
        scanned_at: "2026-10-08T17:00:00Z",
        scanner_model: "GE Lunar Prodigy",
        prev_scanned_at: "2026-07-08T17:00:00Z",
        delta_lean_lb: 4.2,
        same_scanner_as_prev: false,
      }),
    ];
    const out = formatBodyComposition(rows, null) as unknown as {
      scans: { delta_vs_previous: Record<string, unknown> | null }[];
    };
    expect(out.scans[1].delta_vs_previous).toMatchObject({
      comparable: false,
      lean_within_noise: null,
      fat_within_noise: null,
    });
  });

  it("carries the newest scan's RMR (Cunningham = lean-mass based) and the guardrail block", () => {
    const out = formatBodyComposition([compRow()], {
      scanned_at: "2026-07-08T17:00:00Z",
      rmr_kcal_cunningham: 1798,
      rmr_kcal_mifflin: 1780,
    });
    expect(out.latest_rmr).toMatchObject({
      kcal_per_day_cunningham: 1798,
      kcal_per_day_mifflin: 1780,
    });
    expect(out.measurement_guardrails).toMatchObject({
      lean_fat_lsc_lb: 2,
      body_fat_pct_noise_band: 1,
    });
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
      GET_BODY_COMPOSITION,
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

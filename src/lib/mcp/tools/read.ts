import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  BodyScanRow,
  ExerciseNoteRow,
  ProfileRow,
  VBodyCompHistoryRow,
  VMesoSummaryRow,
} from "@/lib/types/database";
import { getProfile, profileAge } from "@/lib/queries/profiles";
import {
  getBodyCompHistory,
  LEAN_LSC_LB,
  FAT_LSC_LB,
  BF_PCT_NOISE_BAND,
} from "@/lib/queries/body-comp";
import { getNewestBodyScan } from "@/lib/queries/body-scans";
import {
  getCyclesOverview,
  getMesoPlan,
  resolveActiveMesocycle,
  type CyclesOverview,
  type MesoPlan,
} from "@/lib/queries/cycles";
import {
  getMesoProgressScores,
  getProgressScores,
  buildStrengthProgress,
  MIN_PROGRESS_SESSIONS,
  type ExerciseProgressScore,
  type MuscleGroupProgress,
  type StrengthProgress,
} from "@/lib/queries/stats";
import { getMacroOverview, type MacroOverview } from "@/lib/queries/macro";
import type { MacroRetrospective } from "@/lib/queries/macro-retrospective";
import { getActiveEngineParams } from "@/lib/queries/generation";
import {
  hasAssignment,
  type SlotEffortAssignment,
} from "@/lib/queries/slot-effort";
import {
  loadMesoSetProjection,
  type ProjectedCell,
  type WeightedWeekSets,
} from "@/lib/queries/volume-projection";
import { getExerciseHistory, type HistoryEntry } from "@/lib/queries/history";
import {
  listExercises,
  listExclusions,
  listPinnedNotes,
  listAllPinnedNotes,
  getMusclesForExercises,
  type ExerciseWithMuscles,
  type ExclusionWithExercise,
  type PinnedNoteWithExercise,
} from "@/lib/queries/exercises";
import { listTemplates } from "@/lib/queries/templates";
import {
  getLatestPrescriptionDecision,
  projectNextPrescription,
  type PrescriptionDecision,
  type ProjectedPrescription,
} from "@/lib/queries/progression";
import { ensureFreshPrescriptions } from "@/lib/queries/regeneration";
import { reportError } from "@/lib/observability/report";
import type { TemplateRow, EquipmentType } from "@/lib/types/database";
import { equipmentTypeValues } from "@/lib/types/equipment";
import { resolveSession, type McpExtra, type McpSession } from "../session";
import { llmExplanationsServe } from "@/lib/llm/config";
import { COACHING_SERVED_MIN_PROMPT_VERSION } from "@/lib/llm/coaching";
import {
  toolResult,
  feedbackCoverage,
  FEEDBACK_SCALES,
  round1,
  roundTo,
  type EnvelopeOpts,
} from "../envelope";
import {
  scoreProgress,
  classifyDayEmphasis,
  volumeCountingWeights,
  type MuscleRole,
} from "@/lib/engine";

/**
 * Slice 2 read/analysis tools (07 Phase 6). Thin, zod-validated wrappers over
 * the existing `src/lib/queries/` layer; every handler resolves identity from
 * the session (hard rule #5) and returns the same view-layer shapes the stats
 * screens use (05 §Data-shape contract). Pure shapers are exported for tests.
 * Every response is wrapped in the shared envelope (P1-4).
 */

function jsonResult(payload: Record<string, unknown>, opts: EnvelopeOpts = {}) {
  return toolResult(payload, opts);
}

// --- get_profile -----------------------------------------------------------

export function formatProfile(profile: ProfileRow | null): Record<string, unknown> {
  if (!profile) {
    return { has_profile: false, summary: "No profile yet — the user hasn't onboarded." };
  }
  const trainingYears =
    profile.training_since != null
      ? Math.round(
          ((Date.now() - new Date(profile.training_since).getTime()) /
            (365.25 * 24 * 3600 * 1000)) *
            10,
        ) / 10
      : null;
  return {
    has_profile: true,
    display_name: profile.display_name,
    // derived from birthdate when present, legacy static int otherwise
    age: profileAge(profile),
    gender: profile.gender,
    height_in: profile.height_in,
    bodyweight: profile.bodyweight,
    body_fat_pct: profile.body_fat_pct,
    // 5c: 'dexa' = measured (applied from a scan), 'estimate' = self-reported,
    // null = legacy/unset — read it before treating the % as ground truth
    body_fat_source: profile.body_fat_source,
    experience_level: profile.experience_level,
    training_since: profile.training_since,
    training_age_years: trainingYears,
    preferred_equipment: profile.preferred_equipment,
    is_admin: profile.role === "admin",
  };
}

export const GET_PROFILE = "get_profile";
function registerGetProfile(server: McpServer) {
  server.registerTool(
    GET_PROFILE,
    {
      title: "Get profile",
      description:
        "The user's profile: name, age, sex, height, bodyweight, body-fat, " +
        "experience level, training age, and preferred equipment. " +
        "Weights are in pounds. Use it to personalize coaching. Takes no arguments.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const profile = await getProfile(client, userId);
      return jsonResult(formatProfile(profile));
    },
  );
}

// --- get_macrocycles -------------------------------------------------------

export function formatMacrocycles(overview: CyclesOverview): Record<string, unknown> {
  const shapeMeso = (m: CyclesOverview["macros"][number]["mesos"][number]) => ({
    id: m.id,
    name: m.name,
    position: m.position,
    phase: m.phase,
    weeks: m.weeks,
    days_per_week: m.days_per_week,
    includes_deload: m.includes_deload,
    rir_ramp: {
      start: m.rir_start,
      end: m.rir_end,
      // N18-B: explicit per-working-week override; null = the linear ramp
      schedule: m.rir_schedule,
    },
    status: m.status,
  });
  return {
    macrocycles: overview.macros.map((macro) => ({
      id: macro.id,
      name: macro.name,
      goal_type: macro.goal_type,
      duration_months: macro.duration_months,
      meso_length_weeks: macro.meso_length_weeks,
      status: macro.status,
      start_date: macro.start_date,
      mesocycles: macro.mesos.map(shapeMeso),
    })),
    standalone_mesocycles: overview.standaloneMesos.map(shapeMeso),
  };
}

export const GET_MACROCYCLES = "get_macrocycles";
function registerGetMacrocycles(server: McpServer) {
  server.registerTool(
    GET_MACROCYCLES,
    {
      title: "Get macrocycles",
      description:
        "All the user's macrocycles with their ordered mesocycles (goal, phase, " +
        "RIR ramp, status), plus standalone mesocycles. The structural map of " +
        "their training. Takes no arguments.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      return jsonResult(formatMacrocycles(await getCyclesOverview(client, userId)));
    },
  );
}

// --- get_mesocycle ---------------------------------------------------------

/** Map = exercise_id → its muscle roles (for fractional PPL classification). */
export type RolesByExercise = Map<string, MuscleRole[]>;

/**
 * Derived per-day emphasis (12 §2): fractional 1.0/0.5 volume across each
 * exercise's own muscle roles, mapped to push/pull/legs and labelled by the
 * dominant category. Context to prevent the "low-set leg day = under-trained"
 * misread, never a verdict. Pure given the roles map.
 */
export function dayEmphasis(
  day: MesoPlan["days"][number],
  rolesByExercise: RolesByExercise,
) {
  const slots = day.groups.flatMap((g) =>
    g.fills.map((f) => ({
      sets: f.initial_sets ?? 0,
      muscles: rolesByExercise.get(f.exercise_id) ?? [],
    })),
  );
  return classifyDayEmphasis(slots);
}

/** Compact per-day emphasis list (day → planned sets + PPL classification),
 *  shared by get_mesocycle and get_muscle_balance. Pure given the roles map. */
export function buildDayEmphasisList(plan: MesoPlan, rolesByExercise: RolesByExercise) {
  return plan.days.map((d) => ({
    day_number: d.day_number,
    label: d.label,
    weekday: d.weekday,
    planned_sets: d.groups.reduce(
      (n, g) => n + g.fills.reduce((s, f) => s + (f.initial_sets ?? 0), 0),
      0,
    ),
    emphasis: dayEmphasis(d, rolesByExercise),
  }));
}

/**
 * doc 21 §8 — the plan-level shape of one slot's effort assignment. Only the
 * assigned lever(s) appear, plus the reason (A7) and one line of semantics, so
 * the model can never read a null as "assigned to nothing".
 */
export function formatSlotEffort(
  a: SlotEffortAssignment,
): Record<string, unknown> {
  return {
    ...(a.target_rir != null ? { target_rir: a.target_rir } : {}),
    ...(a.rir_schedule != null ? { rir_by_working_week: a.rir_schedule } : {}),
    ...(a.set_cap != null ? { set_cap: a.set_cap } : {}),
    ...(a.set_cap_schedule != null
      ? { set_cap_by_working_week: a.set_cap_schedule }
      : {}),
    ...(a.rep_position != null ? { rep_position: a.rep_position } : {}),
    reason: a.effort_reason,
    note:
      "an exercise-level assignment is ABSOLUTE — where set it replaces this " +
      "week's target RIR for this slot only (a flat value covers the deload " +
      "week too), and the engine reprices the load to meet it. Clearing it " +
      "hands the slot straight back to the mesocycle's RIR ramp. No " +
      "progression is earned while a slot runs easier than its week. " +
      "set_cap is a CEILING on this slot's working sets — it only ever lowers " +
      "the engine's own count. rep_position (bottom|center|top or an explicit " +
      "rep count) prices the load at that point in the goal rep window instead " +
      "of following the climb schedule.",
  };
}

export function formatMesoPlan(
  plan: MesoPlan | null,
  rolesByExercise: RolesByExercise = new Map(),
): Record<string, unknown> {
  if (!plan) {
    return { found: false, summary: "No mesocycle with that id is visible to the user." };
  }
  const { meso, days } = plan;
  // every level carries the id that chains into the next tool (P1-2):
  // muscle_group_id → get_muscle_group_volume, exercise_id → get_exercise_history
  // / explain_prescription, day_id / slot_id for precise addressing. Plus planned-
  // set totals (the initial, week-1 prescription) per slot, group, day, and meso.
  let mesoPlannedSets = 0;
  const shapedDays = days.map((day) => {
    let dayPlannedSets = 0;
    const groups = day.groups.map((g) => {
      let groupPlannedSets = 0;
      const exercises = g.fills.map((f) => {
        const sets = f.initial_sets ?? 0;
        groupPlannedSets += sets;
        return {
          slot_id: f.id,
          slot_number: f.slot_number,
          exercise_id: f.exercise_id,
          exercise_name: f.exercise_name,
          planned_sets: f.initial_sets,
          // doc 21 §8: an effort assignment is disclosed on the slot that
          // carries it — and ONLY there, so an unassigned plan (every plan
          // without one) reads exactly as it did before the lever existed.
          ...(hasAssignment(f) ? { effort: formatSlotEffort(f) } : {}),
        };
      });
      dayPlannedSets += groupPlannedSets;
      return {
        group_id: g.id,
        muscle_group_id: g.muscle_group_id,
        muscle_group: g.muscle_group,
        exercise_slots: g.exercise_slots,
        planned_sets: groupPlannedSets,
        exercises,
      };
    });
    mesoPlannedSets += dayPlannedSets;
    return {
      day_id: day.id,
      day_number: day.day_number,
      label: day.label,
      weekday: day.weekday,
      planned_sets: dayPlannedSets,
      // derived session emphasis (12 §2): fractional-volume PPL label so a low-
      // set leg day reads as "legs by design", not as an under-trained day.
      emphasis: dayEmphasis(day, rolesByExercise),
      groups,
    };
  });
  return {
    found: true,
    mesocycle: {
      id: meso.id,
      name: meso.name,
      position: meso.position,
      phase: meso.phase,
      weeks: meso.weeks,
      days_per_week: meso.days_per_week,
      includes_deload: meso.includes_deload,
      rir_ramp: {
        start: meso.rir_start,
        end: meso.rir_end,
        // N18-B: explicit per-working-week override; null = the linear ramp
        schedule: meso.rir_schedule,
      },
      status: meso.status,
      start_date: meso.start_date,
      planned_sets_per_week: mesoPlannedSets,
    },
    days: shapedDays,
    note:
      "planned_sets are the week-1 prescription; the engine autoregulates per " +
      "week from there — use get_muscle_group_volume for planned-vs-logged by week. " +
      "emphasis is a derived push/pull/legs label (fractional 1.0/0.5 volume) — " +
      "context to read a day's set count fairly (a leg day is meant to be lower-set), not a verdict.",
  };
}

export const GET_MESOCYCLE = "get_mesocycle";
function registerGetMesocycle(server: McpServer) {
  server.registerTool(
    GET_MESOCYCLE,
    {
      title: "Get mesocycle plan",
      description:
        "The groups-first plan for one mesocycle: its days (weekday + label), " +
        "the muscle-group blocks on each day, the exercises filling each slot " +
        "with planned set counts, and a derived per-day emphasis label " +
        "(push/pull/legs by fractional volume) so a day's set count reads fairly. " +
        "Use get_mesocycle_summary for performance.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client } = resolveSession(extra);
      const plan = await getMesoPlan(client, mesocycle_id);
      if (!plan) return jsonResult(formatMesoPlan(null));
      const exerciseIds = plan.days.flatMap((d) =>
        d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id)),
      );
      const roles = await getMusclesForExercises(client, exerciseIds);
      return jsonResult(formatMesoPlan(plan, roles));
    },
  );
}

// --- get_mesocycle_summary -------------------------------------------------

export function formatMesoSummary(
  row: VMesoSummaryRow | null,
  scores: ExerciseProgressScore[],
  muscleProgress: MuscleGroupProgress[] = [],
  /** doc 21 §6.2 — the strength block's comparability sentence, when the block
   *  set any session aside as backed off. Null on every plan without an
   *  effort assignment, which is where the added key stays absent entirely. */
  comparability: string | null = null,
): Record<string, unknown> {
  if (!row) {
    return { found: false, summary: "No mesocycle summary is visible for that id." };
  }
  const adherence_pct =
    row.sessions_due > 0
      ? Math.round((row.sessions_attended / row.sessions_due) * 100)
      : null;
  const block_completion_pct =
    row.workouts_total > 0
      ? Math.round((row.workouts_completed / row.workouts_total) * 100)
      : null;
  return {
    found: true,
    mesocycle_id: row.mesocycle_id,
    name: row.name,
    status: row.status,
    weeks: row.weeks,
    days_per_week: row.days_per_week,
    rir_ramp: { start: row.rir_start, end: row.rir_end },
    includes_deload: row.includes_deload,
    workouts_completed: row.workouts_completed,
    workouts_total: row.workouts_total,
    working_sets: row.working_sets,
    working_reps: row.working_reps,
    // round view-sourced floats so the rollup doesn't leak noise (§5.7)
    total_volume: round1(row.total_volume),
    best_e1rm_estimate: round1(row.best_e1rm),
    adherence_pct,
    // adherence_pct = attended/due over working (non-deload) weeks; block
    // completion = completed sessions over every session generated so far. The
    // two denominators differ, so both are surfaced rather than inferred.
    adherence: {
      attended_due: row.sessions_attended,
      total_due: row.sessions_due,
      adherence_pct,
      workouts_completed: row.workouts_completed,
      workouts_generated: row.workouts_total,
      block_completion_pct,
    },
    feedback: {
      // each average carries the count of observations behind it (P1-4): a
      // single grumpy session and twenty honest ones no longer read the same.
      // means rounded to 1 dp so they don't print SQL float noise (§5.7)
      avg_joint_pain: round1(row.avg_joint_pain),
      n_joint_pain: row.n_joint_pain,
      avg_pump: round1(row.avg_pump),
      n_pump: row.n_pump,
      avg_overall_fatigue: round1(row.avg_overall_fatigue),
      n_overall_fatigue: row.n_overall_fatigue,
      avg_performance: round1(row.avg_performance),
      n_performance: row.n_performance,
      scales: FEEDBACK_SCALES,
    },
    // doc 21 §6.2: working sets logged on a slot assigned above its week's RIR.
    // They count toward working_sets / volume / adherence above and are kept
    // out of best_e1rm_estimate and the progress scores — a block run partly
    // backed off is not comparable with one that wasn't, and this is the number
    // that says so.
    backed_off_sets: row.backed_off_sets,
    ...(comparability ? { comparability } : {}),
    progress_scores: scores.map((s) => {
      // round the e1RM estimates for display and recompute the change from the
      // *rounded* values so the percent reconciles with the numbers shown
      // (the §5.2 self-consistency fix, applied here too) (§5.7)
      const baseline = round1(s.baseline_e1rm);
      const recent = round1(s.current_e1rm);
      return {
        exercise_id: s.exercise_id,
        exercise_name: s.exercise_name,
        baseline_e1rm_estimate: baseline,
        recent_e1rm_estimate: recent,
        e1rm_change_pct: scoreProgress(baseline, recent),
        trend: s.trend,
        sessions: s.sessions,
      };
    }),
    // PH37: role-weighted rollup of the qualifying (≥3-session) scores —
    // matches the in-app STRENGTH BY MUSCLE GROUP section
    muscle_group_progress: muscleProgress.map((m) => ({
      muscle_group: m.muscle_group,
      e1rm_change_pct: m.score_pct,
      lifts: m.lifts,
    })),
    // name the window so this metric is not confused with the lifetime change on
    // analyze_exercise_progress (§5.2)
    metric_definitions: {
      e1rm_change_pct:
        "recent best vs starting best (10 §6): (best session e1RM over the most-recent ~3 sessions − best over the earliest ~3) / the earliest, within this mesocycle only. A rolling window, so a fresh block's light opening session can't crater the number. Deloads excluded (T-A2).",
      trend: "improving / holding / declining, with a small dead-band so noise reads as holding",
      window: "this mesocycle",
      sessions: "non-deload sessions with an e1RM — the trend's data points",
      backed_off_sets:
        "working sets logged on a day-slot assigned a target RIR above its week's (doc 21 §6.2) — deliberately easier work. Excluded from best_e1rm_estimate and progress_scores; counted in working_sets, volume and adherence",
      muscle_group_progress: `role-weighted mean (primary 1.0 / secondary 0.5, engine_params.volume) of e1rm_change_pct over exercises with ≥${MIN_PROGRESS_SESSIONS} sessions — the in-app display applies the same ≥${MIN_PROGRESS_SESSIONS}-session rule (I11)`,
    },
    note: "e1RM values are estimates; adherence counts decided days over working (non-deload) weeks. Deload sessions are excluded from progress_scores but still count toward volume and PRs. For the lifetime trend of one exercise use analyze_exercise_progress.",
  };
}

export const GET_MESO_SUMMARY = "get_mesocycle_summary";
function registerGetMesoSummary(server: McpServer) {
  server.registerTool(
    GET_MESO_SUMMARY,
    {
      title: "Get mesocycle summary",
      description:
        "Performance rollup for one mesocycle: adherence, volume, estimated " +
        "strength, feedback patterns (joint pain / pump / fatigue / performance), " +
        "and per-exercise e1RM progress. Numbers match the in-app meso stats.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const [{ data: row, error }, scores, { params }] = await Promise.all([
        client
          .from("v_meso_summary")
          .select("*")
          .eq("user_id", userId)
          .eq("mesocycle_id", mesocycle_id)
          .maybeSingle(),
        getMesoProgressScores(client, userId, mesocycle_id),
        getActiveEngineParams(client),
      ]);
      if (error) throw error;
      // PH37: muscle rollup on the same counting weights as the app
      const strength = await buildStrengthProgress(
        client,
        scores,
        volumeCountingWeights(params),
      );
      const dataQuality = row
        ? feedbackCoverage(
            {
              joint_pain: row.n_joint_pain,
              pump: row.n_pump,
              overall_fatigue: row.n_overall_fatigue,
              performance: row.n_performance,
            },
            row.sessions_due,
          )
        : null;
      return jsonResult(
        formatMesoSummary(row, scores, strength.muscles, strength.comparability),
        { dataQuality },
      );
    },
  );
}

// --- get_macrocycle_summary ------------------------------------------------

/**
 * doc 17 §4.2 — the retrospective block, a pure renaming of the SAME
 * `macroRetrospective` fold the completed-macro Overview renders (parity is a
 * tested invariant: values pass through unchanged, keys go snake_case).
 */
export function formatMacroRetrospective(
  r: MacroRetrospective,
): Record<string, unknown> {
  return {
    strength: {
      est_strength_change_pct: r.strength.estStrengthPct,
      // fixed vocabulary: within band / above band / below band /
      // insufficient data; null on mass-goal macros (informational row)
      verdict: r.strength.verdict,
      informational: r.strength.informational,
      contract_band: r.strength.band,
      muscle_changes: r.strength.muscles.map((m) => ({
        muscle_group: m.muscleGroup,
        e1rm_change_pct: m.scorePct,
        lifts: m.lifts,
      })),
    },
    mass: r.mass
      ? {
          measured: r.mass.measured,
          verdict: r.mass.verdict,
          measured_delta_lb: r.mass.measuredDeltaLb,
          note: r.mass.note,
        }
      : null,
    // 5b: ≥ 2 DEXA scans bracketing the span — informational on every goal
    // (never graded against the contract); sub-LSC deltas carry within_noise
    // flags and a cross-scanner bracket is flagged, never compared (15 §6.2)
    composition: r.composition
      ? {
          start_scanned_at: r.composition.startScannedAt,
          end_scanned_at: r.composition.endScannedAt,
          days_apart: r.composition.daysApart,
          same_scanner: r.composition.sameScanner,
          delta_lean_lb: r.composition.deltaLeanLb,
          delta_fat_lb: r.composition.deltaFatLb,
          delta_weight_lb: r.composition.deltaWeightLb,
          delta_body_fat_pct: r.composition.deltaBodyFatPct,
          lean_within_noise: r.composition.leanWithinNoise,
          fat_within_noise: r.composition.fatWithinNoise,
          note: r.composition.note,
        }
      : null,
    demand: r.demand
      ? {
          decisions: r.demand.decisions,
          earned: r.demand.stepped,
          vanished: r.demand.vanished,
          paced: r.demand.paced,
          not_earned: r.demand.notEarned,
          governor_firings: r.demand.governorFirings,
          gate_failures: r.demand.gateFailures,
          vanished_share: r.demand.vanishedShare,
          earned_then_met: r.demand.earnedThenMet,
          earned_then_missed: r.demand.earnedThenMissed,
        }
      : null,
    adherence: {
      adherence_pct: r.adherence.adherencePct,
      sessions_logged: r.adherence.sessionsLogged,
      total_volume: r.adherence.totalVolume,
    },
    blocks: {
      completed: r.blocks.completed,
      abandoned: r.blocks.abandoned,
      not_built: r.blocks.notBuilt,
    },
    note:
      "graded against the goal contract stored at create/goals-edit (target_*), " +
      "never a live recompute; est. strength is an estimate-vs-estimate " +
      "comparison (10 §9). Mass outcomes grade only against measured body data " +
      "and read 'not measured' otherwise.",
  };
}

export function formatMacroSummary(
  overview: MacroOverview | null,
  strength: StrengthProgress | null = null,
): Record<string, unknown> {
  if (!overview) {
    return { found: false, summary: "No macrocycle with that id is visible to the user." };
  }
  const { macro, mesos, plan, stats } = overview;
  return {
    found: true,
    macrocycle_id: macro.id,
    name: macro.name,
    goal_type: macro.goal_type,
    status: macro.status,
    duration_months: macro.duration_months,
    target: {
      low: plan.target.low,
      high: plan.target.high,
      unit: plan.target.unit,
      direction: plan.target.direction,
      per_month_low: plan.perMonthRate.low,
      per_month_high: plan.perMonthRate.high,
      is_estimate: true,
    },
    recommended_duration_months: plan.recommendedDurationMonths,
    mesocycle_timeline: mesos.map((m) => ({
      id: m.id,
      name: m.name,
      position: m.position,
      phase: m.phase,
      status: m.status,
    })),
    stats: {
      est_strength_change_pct: stats.estStrengthPct,
      total_volume: stats.totalVolume,
      sessions_logged: stats.sessionsLogged,
      adherence_pct: stats.adherencePct,
    },
    // doc 17 §4.2: present once the macro is completed — the same fold the
    // in-app Overview renders (one definition of the verdict)
    ...(overview.retrospective
      ? { retrospective: formatMacroRetrospective(overview.retrospective) }
      : {}),
    // I11/PH37 at macro scope — same rules as get_mesocycle_summary, window =
    // the whole macrocycle. Matches the in-app macro Performance tab (M8).
    ...(strength
      ? {
          progress_scores: strength.exercises.map((s) => {
            const baseline = round1(s.baseline_e1rm);
            const recent = round1(s.current_e1rm);
            return {
              exercise_id: s.exercise_id,
              exercise_name: s.exercise_name,
              baseline_e1rm_estimate: baseline,
              recent_e1rm_estimate: recent,
              e1rm_change_pct: scoreProgress(baseline, recent),
              trend: s.trend,
              sessions: s.sessions,
            };
          }),
          muscle_group_progress: strength.muscles.map((m) => ({
            muscle_group: m.muscle_group,
            e1rm_change_pct: m.score_pct,
            lifts: m.lifts,
          })),
          // doc 21 §6.2 — present only when the macro contains backed-off work
          ...(strength.comparability
            ? { comparability: strength.comparability }
            : {}),
          metric_definitions: {
            e1rm_change_pct: `recent best vs starting best (10 §6): best session e1RM over the most-recent ~3 sessions vs best over the earliest ~3, across this macrocycle; only exercises with ≥${MIN_PROGRESS_SESSIONS} non-deload sessions are listed (I11)`,
            est_strength_change_pct:
              "volume-weighted mean of muscle_group_progress, weighted by each muscle's fractional set volume — the same number the app's EST. STRENGTH tile shows (N16)",
            muscle_group_progress:
              "role-weighted mean (primary 1.0 / secondary 0.5, engine_params.volume) of the listed exercises' e1rm_change_pct (PH37)",
          },
        }
      : {}),
    note: "Targets and strength change are estimates personalized to the profile.",
  };
}

export const GET_MACRO_SUMMARY = "get_macrocycle_summary";
function registerGetMacroSummary(server: McpServer) {
  server.registerTool(
    GET_MACRO_SUMMARY,
    {
      title: "Get macrocycle summary",
      description:
        "Goal-arc rollup for one macrocycle (fig 2.2): the realistic target range " +
        "+ per-month rate (profile-personalized estimate), the mesocycle timeline " +
        "with phases/status, and macro stats (volume, sessions, adherence, est. " +
        "strength trend).",
      inputSchema: { macrocycle_id: z.string().uuid() },
    },
    async ({ macrocycle_id }: { macrocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const profile = await getProfile(client, userId);
      if (!profile) return jsonResult(formatMacroSummary(null));
      const { params } = await getActiveEngineParams(client);
      const overview = await getMacroOverview(
        client,
        userId,
        macrocycle_id,
        profile,
        params,
      );
      let strength: StrengthProgress | null = null;
      if (overview) {
        const scores = await getProgressScores(
          client,
          userId,
          overview.mesos.map((m) => m.id),
        );
        strength = await buildStrengthProgress(
          client,
          scores,
          volumeCountingWeights(params),
        );
      }
      return jsonResult(formatMacroSummary(overview, strength));
    },
  );
}

// --- get_exercise_history --------------------------------------------------

export function formatExerciseHistory(
  exerciseId: string,
  sessions: HistoryEntry[],
  pinnedNote: ExerciseNoteRow | null,
  totalSessions: number | null = null,
): Record<string, unknown> {
  const shown = sessions.length;
  // session_count is the lifetime total (matching analyze_exercise_progress
  // .times_trained); the returned list is the most-recent window, which is
  // capped, so the two must not be conflated (§5.2).
  const count = totalSessions ?? shown;
  const truncated = totalSessions != null && totalSessions > shown;
  return {
    exercise_id: exerciseId,
    pinned_note: pinnedNote?.body ?? null,
    session_count: count,
    sessions_shown: shown,
    truncated,
    sessions: sessions.map((s) => ({
      performed_on: s.performed_on,
      mesocycle_id: s.mesocycle_id,
      meso_name: s.meso_name,
      coordinate: s.coordinate,
      is_deload: s.is_deload,
      // doc 21 §6.2: the slot was assigned an RIR above the week's, so this
      // session was deliberately easier — read it like a deload, never as a
      // decline, and don't compare it with the sessions around it.
      backed_off: s.backed_off,
      top_weight: s.top_weight,
      reps_at_top: s.reps,
      // engine per-set e1RM (PH31), averaged across the session's working sets
      // (N2 — the session average, not the single best set). Averaged
      // Epley/Brzycki over effective reps = reps + RIR·offset, so it already
      // accounts for how far from failure the sets were. Null on bodyweight
      // sessions. The engine's value, distinct from the raw-Epley v_exercise_*.
      e1rm: s.e1rm,
      // doc 21 §2: the session's average ASSUMED RIR — the effort context
      // behind e1rm, resolved as `rir_reported ?? the slot's prescribed
      // target_rir`. `rir_source` says whether that was observed or assumed;
      // never report an assumed value as the athlete's own.
      avg_rir: s.avg_rir,
      rir_source: s.rir_source,
      // the effective reps the estimate is computed over (reps + RIR·offset)
      effective_reps: s.effective_reps,
      session_note: s.session_note,
    })),
    note: truncated
      ? `Showing the ${shown} most recent of ${count} lifetime sessions (the list is capped). session_count is the lifetime total. Pinned note = durable context; session notes = day-to-day observations.`
      : "session_count is the lifetime total. Pinned note = durable context for the movement; session notes = day-to-day observations.",
  };
}

export const GET_EXERCISE_HISTORY = "get_exercise_history";
function registerGetExerciseHistory(server: McpServer) {
  server.registerTool(
    GET_EXERCISE_HISTORY,
    {
      title: "Get exercise history",
      description:
        "Session-by-session history for one exercise (newest first): top weight " +
        "with reps, the session's best engine e1RM estimate, the W·D coordinate " +
        "and mesocycle, deload flags, plus both note kinds — the exercise's " +
        "pinned note and per-session log notes.",
      inputSchema: { exercise_id: z.string().uuid() },
    },
    async ({ exercise_id }: { exercise_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const [historyPage, pinned, overview] = await Promise.all([
        getExerciseHistory(client, userId, exercise_id),
        listPinnedNotes(client, userId, [exercise_id]),
        client
          .from("v_exercise_overview")
          .select("times_trained")
          .eq("user_id", userId)
          .eq("exercise_id", exercise_id)
          .maybeSingle(),
      ]);
      if (overview.error) throw overview.error;
      return jsonResult(
        formatExerciseHistory(
          exercise_id,
          historyPage.entries,
          pinned[0] ?? null,
          overview.data?.times_trained ?? null,
        ),
        {
          dataQuality: {
            samples: {
              sessions_shown: historyPage.entries.length,
              lifetime_sessions: overview.data?.times_trained ?? null,
            },
            estimates:
              "top_weight × reps are logged actuals; e1rm is the engine's per-set estimate (averaged Epley/Brzycki over effective reps = reps + RIR·offset), averaged across the session's working sets (N2) — an estimate/trend, not a tested 1RM. avg_rir is the session's average ASSUMED RIR — the effort folded into e1rm, resolved as the athlete's reported RIR where they gave one and the slot's prescribed target RIR otherwise (doc 21 §2); rir_source says which (reported / assumed / mixed), so never present an assumed value as something the athlete told you. effective_reps is reps + RIR·offset, the quantity e1rm is computed over. Null e1rm on bodyweight sessions.",
          },
        },
      );
    },
  );
}

// --- get_muscle_group_volume -----------------------------------------------

export function formatMuscleGroupVolume(
  mesocycleId: string,
  rows: WeightedWeekSets[],
  weeksTotal: number | null = null,
  projected: ProjectedCell[] = [],
): Record<string, unknown> {
  const byGroup = new Map<
    string,
    {
      name: string;
      weeks: Map<
        number,
        {
          planned_sets: number | null;
          logged_sets: number;
          /** doc 21 §6.2 disclosure — kept in logged_sets, reported beside it */
          backed_off_sets: number;
          is_deload: boolean;
        }
      >;
    }
  >();
  // weeks that actually have a generated workout (any group) — the engine
  // autoregulates forward, so later weeks may not exist yet (§5.10)
  const generatedWeeks = new Set<number>();
  for (const r of rows) {
    generatedWeeks.add(r.week_number);
    const key = r.muscle_group_id ?? "unassigned";
    const name = r.muscle_group ?? "Unassigned";
    const entry = byGroup.get(key) ?? { name, weeks: new Map() };
    entry.weeks.set(r.week_number, {
      planned_sets: r.planned_sets,
      logged_sets: r.logged_sets,
      backed_off_sets: r.backed_off_sets,
      is_deload: r.is_deload,
    });
    byGroup.set(key, entry);
  }
  // projected (unmaterialized) future weeks per group → looked up where a real
  // row is absent (PH34). Ensure groups that exist only in the projection (a
  // meso that hasn't materialized any week) still appear.
  const projectedByKey = new Map<
    string,
    Map<number, { projected_sets: number; is_deload: boolean }>
  >();
  for (const c of projected) {
    const key = c.muscle_group_id ?? "unassigned";
    if (!byGroup.has(key)) byGroup.set(key, { name: c.muscle_group, weeks: new Map() });
    let m = projectedByKey.get(key);
    if (!m) {
      m = new Map();
      projectedByKey.set(key, m);
    }
    m.set(c.week_number, { projected_sets: c.projected_sets, is_deload: c.is_deload });
  }
  const maxGenerated = generatedWeeks.size > 0 ? Math.max(...generatedWeeks) : 0;
  // the week span to report: the meso's full planned length when known, else
  // however far generation has reached
  const span = Math.max(weeksTotal ?? 0, maxGenerated);

  return {
    mesocycle_id: mesocycleId,
    weeks_total: weeksTotal,
    weeks_generated: [...generatedWeeks].sort((a, b) => a - b),
    groups: [...byGroup.entries()]
      .map(([key, g]) => ({
        muscle_group: g.name,
        weeks: Array.from({ length: span }, (_, i) => i + 1).map((week_number) => {
          const cell = g.weeks.get(week_number);
          if (!cell) {
            // no materialized row — fall back to the engine's set-count
            // projection (PH34) for unmaterialized future weeks; only when even
            // the projection has nothing does it read "not built yet" (§5.10).
            const proj = projectedByKey.get(key)?.get(week_number);
            if (proj) {
              return {
                week_number,
                planned_sets: proj.projected_sets,
                logged_sets: 0,
                is_deload: proj.is_deload,
                status: "projected" as const,
              };
            }
            return {
              week_number,
              planned_sets: null,
              logged_sets: 0,
              is_deload: false,
              status: "not_yet_generated" as const,
            };
          }
          return {
            week_number,
            planned_sets: cell.planned_sets,
            logged_sets: cell.logged_sets,
            // doc 21 §6.2: only when there is something to disclose, so a plan
            // with no effort assignments reads exactly as it did before
            ...(cell.backed_off_sets > 0
              ? { backed_off_sets: cell.backed_off_sets }
              : {}),
            is_deload: cell.is_deload,
            status: cell.logged_sets > 0 ? ("logged" as const) : ("planned" as const),
          };
        }),
      }))
      .sort((a, b) => a.muscle_group.localeCompare(b.muscle_group)),
    note:
      "Counts are fractional direct-equivalent sets (doc 10 §2): 1.0 per primary + 0.5 per secondary muscle of each exercise; logged_sets counts hard sets only (non-warmup, RIR ≤ 4 or unreported). backed_off_sets (present only where non-zero) discloses fractional sets logged on a slot assigned above its week's RIR (doc 21 §6.2): they stay inside the volume picture — the work consumed recovery budget — but they are not a subset of the hard-set count, so a week can show fewer logged_sets than backed_off_sets when the back-off was reported past RIR 4. Materialized weeks (status logged/planned) come from generated workouts. Weeks past weeks_generated show status projected: the engine's set-count projection — the last materialized week's autoregulated count carried forward, deload-scaled. It's a projection under neutral feedback (no forward set ramp), not a materialized plan; null/not_yet_generated only when even a projection has no basis.",
  };
}

export const GET_MUSCLE_GROUP_VOLUME = "get_muscle_group_volume";
function registerGetMuscleGroupVolume(server: McpServer) {
  server.registerTool(
    GET_MUSCLE_GROUP_VOLUME,
    {
      title: "Get muscle-group volume",
      description:
        "Weekly hard sets per muscle group for a mesocycle — planned (from the " +
        "autoregulated plan) vs actually logged, per week, with deload weeks " +
        "flagged. Fractional counting (doc 10 §2): 1.0 per primary + 0.5 per " +
        "secondary muscle; logged counts hard sets only (RIR ≤ 4 or unreported). " +
        "Weeks the engine hasn't generated yet show status projected " +
        "(the last materialized week's count carried forward, deload-scaled). " +
        "The volume picture behind the meso.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      // the projection loader also folds the role-grain view into fractional
      // per-(week, muscle) numbers (R14) — one query path, one definition
      const [{ data: meso, error: mesoError }, { projected, weighted }] =
        await Promise.all([
          client
            .from("mesocycles")
            .select("weeks")
            .eq("id", mesocycle_id)
            .eq("user_id", userId)
            .maybeSingle(),
          loadMesoSetProjection(client, userId, mesocycle_id),
        ]);
      if (mesoError) throw mesoError;
      return jsonResult(
        formatMuscleGroupVolume(mesocycle_id, weighted, meso?.weeks ?? null, projected),
      );
    },
  );
}

// --- search_exercises ------------------------------------------------------

export function formatExerciseSearch(list: ExerciseWithMuscles[]): Record<string, unknown> {
  return {
    count: list.length,
    exercises: list.map((e) => ({
      id: e.id,
      name: e.name,
      equipment_type: e.equipment_type,
      is_custom: e.user_id != null,
      muscles: e.muscles.map((m) => ({ name: m.name, role: m.role })),
    })),
  };
}

export const SEARCH_EXERCISES = "search_exercises";
function registerSearchExercises(server: McpServer) {
  server.registerTool(
    SEARCH_EXERCISES,
    {
      title: "Search exercises",
      description:
        "Search the exercise library (stock + the user's custom), optionally " +
        "filtered by name and equipment type, with each exercise's muscle " +
        "groups. Same library the in-app pickers use.",
      inputSchema: {
        search: z.string().optional(),
        equipment: z
          .enum(equipmentTypeValues)
          .optional()
          .describe(
            "stored equipment type to filter by — the library uses the finer " +
              "bodyweight labels ('bodyweight only', 'bodyweight loadable', " +
              "'machine assistance'), not bare 'bodyweight'",
          ),
        muscle_group: z
          .string()
          .optional()
          .describe("case-insensitive muscle-group name to filter by"),
      },
    },
    async (
      args: { search?: string; equipment?: EquipmentType; muscle_group?: string },
      extra: McpExtra,
    ) => {
      const { client } = resolveSession(extra);
      let list = await listExercises(client, {
        search: args.search,
        equipment: args.equipment,
      });
      if (args.muscle_group) {
        const needle = args.muscle_group.toLowerCase();
        list = list.filter((e) =>
          e.muscles.some((m) => m.name.toLowerCase().includes(needle)),
        );
      }
      return jsonResult(formatExerciseSearch(list.slice(0, 100)));
    },
  );
}

// --- search_templates ------------------------------------------------------

export function formatTemplateSearch(list: TemplateRow[]): Record<string, unknown> {
  return {
    count: list.length,
    templates: list.map((t) => ({
      id: t.id,
      name: t.name,
      emphasis: t.emphasis,
      days_per_week: t.days_per_week,
      description: t.description,
      is_custom: t.user_id != null,
    })),
    note: "To use one, call create_mesocycle with its id as template_id — that drafts a planned meso from the template's structure for in-app review.",
  };
}

export const SEARCH_TEMPLATES = "search_templates";
function registerSearchTemplates(server: McpServer) {
  server.registerTool(
    SEARCH_TEMPLATES,
    {
      title: "Search templates",
      description:
        "Search reusable mesocycle templates (stock + the user's own) by name, " +
        "with emphasis and days-per-week. Pass a template id to create_mesocycle " +
        "(its template_id argument) to start a planned meso from it.",
      inputSchema: { search: z.string().optional() },
    },
    async ({ search }: { search?: string }, extra: McpExtra) => {
      const { client } = resolveSession(extra);
      return jsonResult(formatTemplateSearch(await listTemplates(client, { search })));
    },
  );
}

// --- get_exercise_notes ----------------------------------------------------

export function formatPinnedNotes(notes: PinnedNoteWithExercise[]): Record<string, unknown> {
  return {
    count: notes.length,
    notes: notes.map((n) => ({
      exercise_id: n.exercise_id,
      exercise_name: n.exercise_name,
      note: n.body,
      updated_at: n.updated_at,
    })),
    note: "Pinned notes are durable, cross-workout context (grip, setup, a nagging caveat).",
  };
}

export const GET_EXERCISE_NOTES = "get_exercise_notes";
function registerGetExerciseNotes(server: McpServer) {
  server.registerTool(
    GET_EXERCISE_NOTES,
    {
      title: "Get pinned exercise notes",
      description:
        "Every pinned note the user keeps across the exercise library — durable " +
        "context about how they run each movement. Takes no arguments.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      return jsonResult(formatPinnedNotes(await listAllPinnedNotes(client, userId)));
    },
  );
}

// --- get_exclusions --------------------------------------------------------

export function formatExclusions(list: ExclusionWithExercise[]): Record<string, unknown> {
  return {
    count: list.length,
    exclusions: list.map((x) => ({
      exercise_id: x.exercise_id,
      exercise_name: x.exercise_name,
      reason: x.reason,
    })),
    note: "Excluded exercises never appear in pickers — do not recommend them.",
  };
}

export const GET_EXCLUSIONS = "get_exclusions";
function registerGetExclusions(server: McpServer) {
  server.registerTool(
    GET_EXCLUSIONS,
    {
      title: "Get excluded exercises",
      description:
        "Movements the user has excluded (with reasons). Never recommend or plan " +
        "these. Takes no arguments.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      return jsonResult(formatExclusions(await listExclusions(client, userId)));
    },
  );
}

// --- explain_prescription --------------------------------------------------

export function formatPrescriptionDecision(
  exerciseId: string,
  decision: PrescriptionDecision | null,
  projected: ProjectedPrescription | null = null,
  explanation: string | null = null,
): Record<string, unknown> {
  if (decision) {
    return {
      found: true,
      source: "recorded",
      exercise_id: decision.exercise_id,
      exercise_name: decision.exercise_name,
      coordinate: decision.coordinate,
      decided_at: decision.decided_at,
      params_version: decision.params_version,
      inputs: decision.inputs,
      output: decision.output,
      // N58 / doc 18 §6: the stored LLM explanation of this decision — the
      // same sentence the app's quick-read strip shows (one definition of the
      // story, like one definition of the numbers). Absent unless serving.
      ...(explanation != null ? { explanation } : {}),
      note: "Recorded engine decision. The engine — not the model — computes every prescribed load, rep, and set; this surfaces its recorded rationale.",
    };
  }
  // §5.5: no decision was recorded (the engine only writes one when a week is
  // generated, and this exercise may not be in the latest generated day). Fall
  // back to a read-only projection recomputed from the last completed session
  // with the same pure engine, clearly labeled as a projection.
  if (projected) {
    return {
      found: true,
      source: "projected",
      exercise_id: projected.exercise_id,
      exercise_name: projected.exercise_name,
      source_coordinate: projected.source_coordinate,
      projected_for: projected.projected_for,
      params_version: projected.params_version,
      inputs: projected.inputs,
      output: projected.output,
      note: "No engine decision is recorded for this exercise yet (one is written only when a week is generated, and it may not be in the latest generated day). This is a read-only projection: the same engine recomputed against the last completed session — what it WOULD prescribe next. It is not yet a committed prescription.",
    };
  }
  return {
    found: false,
    exercise_id: exerciseId,
    summary:
      "No recorded or projectable prescription for this exercise — the engine " +
      "has never prescribed it and there is no completed session to project from.",
  };
}

/**
 * Doc 14 §5 parity (N56): the read-path freshness reconcile runs on EVERY
 * surface that displays prescriptions — this tool included, so the decision it
 * reports can never disagree with what the app shows for the same row. Brings
 * the caller's active meso in line with the live inputs (params, profile,
 * macro goal, meso config, overrides) before the decision read; a no-op behind
 * the reconcile gate when nothing changed. Degrades loudly-but-safely
 * (mirrors `ensureFreshPrescriptions`' own contract): a freshness hiccup must
 * surface the stored numbers, never fail the tool call.
 */
export async function freshenActivePrescriptions(
  client: McpSession["client"],
  userId: string,
): Promise<void> {
  try {
    // N79: the current block among possibly several live ones — same
    // most-recently-logged resolution as every other surface.
    const activeMeso = await resolveActiveMesocycle(client, userId);
    if (!activeMeso) return;
    await ensureFreshPrescriptions(
      userId,
      activeMeso.id,
      await getActiveEngineParams(client),
    );
  } catch (error) {
    await reportError("mcp:explain-prescription-freshness", error, { userId });
  }
}

export const EXPLAIN_PRESCRIPTION = "explain_prescription";
function registerExplainPrescription(server: McpServer) {
  server.registerTool(
    EXPLAIN_PRESCRIPTION,
    {
      title: "Explain a prescription",
      description:
        "Surface the engine's decision for an exercise's prescription: the inputs " +
        "it saw, the output (load / reps / sets), and its rationale. Prefers the " +
        "recorded decision; if none exists yet, returns a read-only projection " +
        "recomputed from the last completed session (source: 'projected'). Use it " +
        "to explain why a number changed or what the engine will do next.",
      inputSchema: { exercise_id: z.string().uuid() },
    },
    async ({ exercise_id }: { exercise_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      // doc 14 §5: reconcile the active meso's open rows before reading, so
      // this tool and the app screens report one prescription (N56)
      await freshenActivePrescriptions(client, userId);
      const decision = await getLatestPrescriptionDecision(client, userId, exercise_id);
      // only pay for the projection assembly when there's no recorded decision
      const projected = decision
        ? null
        : await projectNextPrescription(client, userId, exercise_id);
      // doc 19 §3: attach the stored LLM coaching line when the feature serves
      // — the connector coach reads the same line the app shows. The serving cut
      // (prompt_version >= the v3 floor) is the seam-inversion gate: v1–v2
      // whole-blob rows are never served (they age out as decisions recompute);
      // editable DB prompts (version ≥ 4) always clear it.
      let explanation: string | null = null;
      if (decision && llmExplanationsServe()) {
        const { data: stored, error: explanationError } = await client
          .from("decision_explanations")
          .select("body")
          .eq("decision_id", decision.decision_id)
          .eq("user_id", userId)
          .gte("prompt_version", COACHING_SERVED_MIN_PROMPT_VERSION)
          .maybeSingle();
        if (explanationError) throw explanationError;
        explanation = stored?.body ?? null;
      }
      return jsonResult(
        formatPrescriptionDecision(exercise_id, decision, projected, explanation),
      );
    },
  );
}

// --- get_body_composition ---------------------------------------------------

/**
 * The doc 15 §6 measurement guardrails, stated as data so a consumer can apply
 * them without reading the spec — the same LSC constants every screen reads
 * (`queries/body-comp.ts`, one definition).
 */
export const BODY_COMP_GUARDRAILS = {
  lean_fat_lsc_lb: LEAN_LSC_LB,
  body_fat_pct_noise_band: BF_PCT_NOISE_BAND,
  notes: [
    `Scan-to-scan lean or fat changes under ~${LEAN_LSC_LB} lb, and body-fat moves under ±${BF_PCT_NOISE_BAND} point, sit inside DEXA measurement noise — never present them as change.`,
    "Only same-scanner-model pairs are comparable; a delta flagged comparable:false is context, never a trend or a verdict.",
    "DEXA reads quarterly-plus: scans closer than ~2 months apart are a hint, not a trend; verdict-grade claims want ≥2 same-machine scans bracketing the block.",
    "Scans inform targets and verdicts, never prescriptions (doc 15 §3.3).",
  ],
} as const;

/** One scan row + its guarded delta block, from the shared view. Pure. */
export function formatBodyComposition(
  rows: VBodyCompHistoryRow[],
  newestScan: Pick<
    BodyScanRow,
    "scanned_at" | "rmr_kcal_cunningham" | "rmr_kcal_mifflin"
  > | null,
): Record<string, unknown> {
  if (rows.length === 0) {
    return {
      has_scans: false,
      summary:
        "No body scans imported. The user can connect a BodySpec account " +
        "(More → BodySpec DEXA) to bring their DEXA history in.",
    };
  }
  // numeric view columns arrive as raw floats — coerce + round once here so
  // the tool never disagrees with a screen on the same number (§5.7)
  const num = (v: number | null): number | null => (v == null ? null : Number(v));
  const scans = rows.map((r) => {
    const deltaLean = round1(num(r.delta_lean_lb));
    const deltaFat = round1(num(r.delta_fat_lb));
    const deltaBf = round1(num(r.delta_body_fat_pct));
    const comparable = r.same_scanner_as_prev === true;
    return {
      scanned_at: r.scanned_at,
      scanner_model: r.scanner_model,
      weight_lb: round1(num(r.weight_lb)),
      body_fat_pct: round1(num(r.body_fat_pct)),
      lean_mass_lb: round1(num(r.lean_mass_lb)),
      fat_mass_lb: round1(num(r.fat_mass_lb)),
      almi_kg_m2: roundTo(num(r.almi_kg_m2), 2),
      // null on the first scan; within-noise flags only exist where the pair
      // is comparable (cross-scanner deltas are flagged context, never graded)
      delta_vs_previous:
        r.prev_scanned_at == null
          ? null
          : {
              prev_scanned_at: r.prev_scanned_at,
              weight_lb: round1(num(r.delta_weight_lb)),
              body_fat_pct: deltaBf,
              lean_mass_lb: deltaLean,
              fat_mass_lb: deltaFat,
              comparable,
              lean_within_noise:
                comparable && deltaLean != null
                  ? Math.abs(deltaLean) < LEAN_LSC_LB
                  : null,
              fat_within_noise:
                comparable && deltaFat != null
                  ? Math.abs(deltaFat) < FAT_LSC_LB
                  : null,
              body_fat_within_noise:
                comparable && deltaBf != null
                  ? Math.abs(deltaBf) < BF_PCT_NOISE_BAND
                  : null,
            },
    };
  });
  const rmr =
    newestScan &&
    (newestScan.rmr_kcal_cunningham != null ||
      newestScan.rmr_kcal_mifflin != null)
      ? {
          scanned_at: newestScan.scanned_at,
          // Cunningham is FFM-based (genuinely DEXA-informed); Mifflin is
          // height/weight arithmetic, included for reference only
          kcal_per_day_cunningham: newestScan.rmr_kcal_cunningham,
          kcal_per_day_mifflin: newestScan.rmr_kcal_mifflin,
          note: "Resting metabolic rate — display context only; prescriptions, targets, and nutrition scope never build on it.",
        }
      : null;
  return {
    has_scans: true,
    scan_count: rows.length,
    scans,
    latest_rmr: rmr,
    measurement_guardrails: BODY_COMP_GUARDRAILS,
  };
}

export const GET_BODY_COMPOSITION = "get_body_composition";
function registerGetBodyComposition(server: McpServer) {
  server.registerTool(
    GET_BODY_COMPOSITION,
    {
      title: "Get body composition",
      description:
        "DEXA body-composition history from the user's connected BodySpec " +
        "account: per-scan weight, body-fat %, lean/fat mass, ALMI, plus " +
        "deltas vs the previous scan with comparability flags, and the newest " +
        "scan's measured RMR. Honesty rules ride along: lean/fat changes " +
        "under ~2 lb (or ±1 body-fat point) are inside measurement noise, and " +
        "cross-scanner deltas are never comparable — read the " +
        "measurement_guardrails block before making any claim. Weights are in " +
        "pounds. Takes no arguments.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const rows = await getBodyCompHistory(client, userId);
      const newest =
        rows.length > 0 ? await getNewestBodyScan(client, userId) : null;
      return jsonResult(formatBodyComposition(rows, newest), {
        dataQuality: {
          source:
            "v_body_comp_history — the same view every in-app scan surface reads (one definition of the deltas and comparability flags)",
        },
      });
    },
  );
}

// --- registry --------------------------------------------------------------

export function registerReadTools(server: McpServer) {
  registerGetProfile(server);
  registerGetMacrocycles(server);
  registerGetMesocycle(server);
  registerGetMesoSummary(server);
  registerGetMacroSummary(server);
  registerGetExerciseHistory(server);
  registerGetMuscleGroupVolume(server);
  registerSearchExercises(server);
  registerSearchTemplates(server);
  registerGetExerciseNotes(server);
  registerGetExclusions(server);
  registerExplainPrescription(server);
  registerGetBodyComposition(server);
}

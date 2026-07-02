import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ExerciseNoteRow,
  ProfileRow,
  VMesoSummaryRow,
} from "@/lib/types/database";
import { getProfile } from "@/lib/queries/profiles";
import { getCyclesOverview, getMesoPlan, type CyclesOverview, type MesoPlan } from "@/lib/queries/cycles";
import { getMesoProgressScores, type ExerciseProgressScore } from "@/lib/queries/stats";
import { getMacroOverview, type MacroOverview } from "@/lib/queries/macro";
import { getActiveEngineParams } from "@/lib/queries/generation";
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
import type { TemplateRow, EquipmentType } from "@/lib/types/database";
import { resolveSession, type McpExtra } from "../session";
import {
  toolResult,
  feedbackCoverage,
  FEEDBACK_SCALES,
  round1,
  type EnvelopeOpts,
} from "../envelope";
import { scoreProgress, classifyDayEmphasis, type MuscleRole } from "@/lib/engine";

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
    age: profile.age,
    gender: profile.gender,
    height_in: profile.height_in,
    bodyweight: profile.bodyweight,
    body_fat_pct: profile.body_fat_pct,
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
    rir_ramp: { start: m.rir_start, end: m.rir_end },
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
      rir_ramp: { start: meso.rir_start, end: meso.rir_end },
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
    progress_scores: scores.map((s) => {
      // round the e1RM estimates for display and recompute the change from the
      // *rounded* values so the percent reconciles with the numbers shown
      // (the §5.2 self-consistency fix, applied here too) (§5.7)
      const first = round1(s.first_e1rm);
      const last = round1(s.last_e1rm);
      return {
        exercise_id: s.exercise_id,
        exercise_name: s.exercise_name,
        first_e1rm_estimate: first,
        last_e1rm_estimate: last,
        e1rm_change_pct: scoreProgress(first, last),
      };
    }),
    // name the window so this metric is not confused with the lifetime change on
    // analyze_exercise_progress (§5.2)
    metric_definitions: {
      e1rm_change_pct:
        "(last e1RM − first e1RM) / first e1RM, within this mesocycle only (first → last non-deload session of the block; deload sessions are recovery, not signal — T-A2)",
      window: "this mesocycle",
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
      const [{ data: row, error }, scores] = await Promise.all([
        client
          .from("v_meso_summary")
          .select("*")
          .eq("user_id", userId)
          .eq("mesocycle_id", mesocycle_id)
          .maybeSingle(),
        getMesoProgressScores(client, userId, mesocycle_id),
      ]);
      if (error) throw error;
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
      return jsonResult(formatMesoSummary(row, scores), {
        dataQuality,
      });
    },
  );
}

// --- get_macrocycle_summary ------------------------------------------------

export function formatMacroSummary(overview: MacroOverview | null): Record<string, unknown> {
  if (!overview) {
    return { found: false, summary: "No macrocycle with that id is visible to the user." };
  }
  const { macro, mesos, plan, stats } = overview;
  return {
    found: true,
    macrocycle_id: macro.id,
    name: macro.name,
    goal_type: macro.goal_type,
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
      return jsonResult(formatMacroSummary(overview));
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
      top_weight: s.top_weight,
      reps_at_top: s.reps,
      // engine per-set e1RM (PH31): the session's best stored estimate (averaged
      // Epley/Brzycki over effective reps). Null on bodyweight sessions. This is
      // the engine's value, distinct from the raw-Epley e1RM in v_exercise_*.
      e1rm: s.e1rm,
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
      const [sessions, pinned, overview] = await Promise.all([
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
          sessions,
          pinned[0] ?? null,
          overview.data?.times_trained ?? null,
        ),
        {
          dataQuality: {
            samples: {
              sessions_shown: sessions.length,
              lifetime_sessions: overview.data?.times_trained ?? null,
            },
            estimates:
              "top_weight × reps are logged actuals; e1rm is the engine's per-set estimate (averaged Epley/Brzycki over effective reps = reps + RIR·offset), the session's best — an estimate/trend, not a tested 1RM. Null on bodyweight sessions. Differs from the raw-Epley e1RM in the stats views (v_exercise_*).",
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
      weeks: Map<number, { planned_sets: number | null; logged_sets: number; is_deload: boolean }>;
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
            is_deload: cell.is_deload,
            status: cell.logged_sets > 0 ? ("logged" as const) : ("planned" as const),
          };
        }),
      }))
      .sort((a, b) => a.muscle_group.localeCompare(b.muscle_group)),
    note:
      "Counts are fractional direct-equivalent sets (doc 10 §2): 1.0 per primary + 0.5 per secondary muscle of each exercise; logged_sets counts hard sets only (non-warmup, RIR ≤ 4 or unreported). Materialized weeks (status logged/planned) come from generated workouts. Weeks past weeks_generated show status projected: the engine's set-count projection — the last materialized week's autoregulated count carried forward, deload-scaled. It's a projection under neutral feedback (no forward set ramp), not a materialized plan; null/not_yet_generated only when even a projection has no basis.",
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
          .string()
          .optional()
          .describe(
            "equipment type to filter by (e.g. barbell, dumbbell, machine, cable, kettlebell, bodyweight)",
          ),
        muscle_group: z
          .string()
          .optional()
          .describe("case-insensitive muscle-group name to filter by"),
      },
    },
    async (
      args: { search?: string; equipment?: string; muscle_group?: string },
      extra: McpExtra,
    ) => {
      const { client } = resolveSession(extra);
      let list = await listExercises(client, {
        search: args.search,
        equipment: args.equipment as EquipmentType | undefined,
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
      const decision = await getLatestPrescriptionDecision(client, userId, exercise_id);
      // only pay for the projection assembly when there's no recorded decision
      const projected = decision
        ? null
        : await projectNextPrescription(client, userId, exercise_id);
      return jsonResult(
        formatPrescriptionDecision(exercise_id, decision, projected),
      );
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
}

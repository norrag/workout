import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ExerciseNoteRow,
  ProfileRow,
  VMesoSummaryRow,
  VMesoWeekSetsRow,
} from "@/lib/types/database";
import { getProfile } from "@/lib/queries/profiles";
import { getCyclesOverview, getMesoPlan, type CyclesOverview, type MesoPlan } from "@/lib/queries/cycles";
import { getMesoProgressScores, type ExerciseProgressScore } from "@/lib/queries/stats";
import { getMacroOverview, type MacroOverview } from "@/lib/queries/macro";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { getExerciseHistory, type HistoryEntry } from "@/lib/queries/history";
import {
  listExercises,
  listExclusions,
  listPinnedNotes,
  listAllPinnedNotes,
  type ExerciseWithMuscles,
  type ExclusionWithExercise,
  type PinnedNoteWithExercise,
} from "@/lib/queries/exercises";
import { listTemplates } from "@/lib/queries/templates";
import {
  getLatestPrescriptionDecision,
  type PrescriptionDecision,
} from "@/lib/queries/progression";
import type { TemplateRow, EquipmentType } from "@/lib/types/database";
import { resolveSession, type McpExtra } from "../session";
import {
  toolResult,
  feedbackCoverage,
  FEEDBACK_SCALES,
  type EnvelopeOpts,
} from "../envelope";

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
    height_cm: profile.height_cm,
    bodyweight: profile.bodyweight,
    bodyweight_unit: profile.units,
    body_fat_pct: profile.body_fat_pct,
    experience_level: profile.experience_level,
    training_since: profile.training_since,
    training_age_years: trainingYears,
    preferred_equipment: profile.preferred_equipment,
    units: profile.units,
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
        "experience level, training age, preferred equipment, and units. " +
        "Use it to personalize coaching. Takes no arguments.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const profile = await getProfile(client, userId);
      return jsonResult(formatProfile(profile), { units: profile?.units ?? null });
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

export function formatMesoPlan(plan: MesoPlan | null): Record<string, unknown> {
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
      "week from there — use get_muscle_group_volume for planned-vs-logged by week.",
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
        "the muscle-group blocks on each day, and the exercises filling each " +
        "slot with planned set counts. Use get_mesocycle_summary for performance.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client } = resolveSession(extra);
      return jsonResult(formatMesoPlan(await getMesoPlan(client, mesocycle_id)));
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
    total_volume: row.total_volume,
    best_e1rm_estimate: row.best_e1rm,
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
      // single grumpy session and twenty honest ones no longer read the same
      avg_joint_pain: row.avg_joint_pain,
      n_joint_pain: row.n_joint_pain,
      avg_pump: row.avg_pump,
      n_pump: row.n_pump,
      avg_overall_fatigue: row.avg_overall_fatigue,
      n_overall_fatigue: row.n_overall_fatigue,
      avg_performance: row.avg_performance,
      n_performance: row.n_performance,
      scales: FEEDBACK_SCALES,
    },
    progress_scores: scores.map((s) => ({
      exercise_id: s.exercise_id,
      exercise_name: s.exercise_name,
      first_e1rm_estimate: s.first_e1rm,
      last_e1rm_estimate: s.last_e1rm,
      e1rm_change_pct: s.score_pct,
    })),
    // name the window so this metric is not confused with the lifetime change on
    // analyze_exercise_progress (§5.2)
    metric_definitions: {
      e1rm_change_pct:
        "(last e1RM − first e1RM) / first e1RM, within this mesocycle only (first → last logged session of the block)",
      window: "this mesocycle",
    },
    note: "e1RM values are estimates; adherence counts decided days over working (non-deload) weeks. For the lifetime trend of one exercise use analyze_exercise_progress.",
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
      const [{ data: row, error }, scores, profile] = await Promise.all([
        client
          .from("v_meso_summary")
          .select("*")
          .eq("user_id", userId)
          .eq("mesocycle_id", mesocycle_id)
          .maybeSingle(),
        getMesoProgressScores(client, userId, mesocycle_id),
        getProfile(client, userId),
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
        units: profile?.units ?? null,
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
        "with reps, the W·D coordinate and mesocycle, deload flags, plus both " +
        "note kinds — the exercise's pinned note and per-session log notes.",
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
      );
    },
  );
}

// --- get_muscle_group_volume -----------------------------------------------

export function formatMuscleGroupVolume(
  mesocycleId: string,
  rows: VMesoWeekSetsRow[],
): Record<string, unknown> {
  const byGroup = new Map<
    string,
    { name: string; weeks: { week_number: number; planned_sets: number | null; logged_sets: number; is_deload: boolean }[] }
  >();
  for (const r of rows) {
    const key = r.muscle_group_id ?? "unassigned";
    const name = r.muscle_group ?? "Unassigned";
    const entry = byGroup.get(key) ?? { name, weeks: [] };
    entry.weeks.push({
      week_number: r.week_number,
      planned_sets: r.planned_sets,
      logged_sets: r.logged_sets,
      is_deload: r.is_deload,
    });
    byGroup.set(key, entry);
  }
  return {
    mesocycle_id: mesocycleId,
    groups: [...byGroup.values()]
      .map((g) => ({
        muscle_group: g.name,
        weeks: g.weeks.sort((a, b) => a.week_number - b.week_number),
      }))
      .sort((a, b) => a.muscle_group.localeCompare(b.muscle_group)),
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
        "flagged. The volume picture behind the meso.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const { data, error } = await client
        .from("v_meso_week_sets")
        .select("*")
        .eq("user_id", userId)
        .eq("mesocycle_id", mesocycle_id);
      if (error) throw error;
      return jsonResult(formatMuscleGroupVolume(mesocycle_id, data ?? []));
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
        "with emphasis and days-per-week. Use a template id to start a meso from it.",
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
): Record<string, unknown> {
  if (!decision) {
    return {
      found: false,
      exercise_id: exerciseId,
      summary:
        "The engine has no recorded prescription for this exercise yet (it is " +
        "written when a new week is generated).",
    };
  }
  return {
    found: true,
    exercise_id: decision.exercise_id,
    exercise_name: decision.exercise_name,
    coordinate: decision.coordinate,
    decided_at: decision.decided_at,
    params_version: decision.params_version,
    inputs: decision.inputs,
    output: decision.output,
    note: "The engine — not the model — computes every prescribed load, rep, and set. This surfaces its recorded rationale.",
  };
}

export const EXPLAIN_PRESCRIPTION = "explain_prescription";
function registerExplainPrescription(server: McpServer) {
  server.registerTool(
    EXPLAIN_PRESCRIPTION,
    {
      title: "Explain a prescription",
      description:
        "Surface the engine's recorded decision for the most recent prescription " +
        "of an exercise: the inputs it saw, the output (load / reps / sets), and " +
        "its rationale. Use it to explain why a number changed.",
      inputSchema: { exercise_id: z.string().uuid() },
    },
    async ({ exercise_id }: { exercise_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const decision = await getLatestPrescriptionDecision(client, userId, exercise_id);
      return jsonResult(formatPrescriptionDecision(exercise_id, decision));
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

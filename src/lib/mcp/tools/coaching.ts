import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProfileRow, VMesoSummaryRow } from "@/lib/types/database";
import { getProfile } from "@/lib/queries/profiles";
import { getCurrentState } from "@/lib/queries/cycles";
import { getMesoProgressScores, getMesoStats, type MesoBalance } from "@/lib/queries/stats";
import { getExerciseOverview, type ExerciseOverview } from "@/lib/queries/exercises";
import {
  getRecentSessions,
  getExerciseAffinity,
  getExerciseE1rmSeries,
  type RecentSession,
  type ExerciseAffinity,
  type E1rmPoint,
} from "@/lib/queries/coaching";
import { resolveSession, type McpExtra } from "../session";
import { formatCurrentState } from "./get-current-state";

/**
 * Slice 2 coaching/analysis tools (05 §Coaching & analysis). Read-only views
 * built on the shared views + the pure engine, so the model can act as a
 * grounded trainer. Honesty guardrails (10 §9): e1RM is an estimate, balance is
 * advisory-only, pump/soreness are secondary signals. Pure shapers/analysers
 * are exported for tests.
 */

function jsonResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

// --- stall / plateau detection (pure) --------------------------------------

export interface ProgressAnalysis {
  sessions: number;
  first_e1rm: number | null;
  best_e1rm: number | null;
  latest_e1rm: number | null;
  change_pct: number | null;
  sessions_since_best: number | null;
  trend: "improving" | "plateau" | "declining" | "insufficient_data";
  stalled: boolean;
}

/**
 * Classify an e1RM time series (oldest → newest). A plateau is the recent
 * window failing to set a new best; declining is the latest meaningfully below
 * the best. Tolerance keeps noise from reading as progress. Pure.
 */
export function detectStall(
  series: (number | null)[],
  opts: { window?: number; tolerancePct?: number } = {},
): ProgressAnalysis {
  const window = opts.window ?? 3;
  const tol = opts.tolerancePct ?? 1.5;
  const points = series.filter((v): v is number => v != null);
  if (points.length < 2) {
    return {
      sessions: points.length,
      first_e1rm: points[0] ?? null,
      best_e1rm: points[0] ?? null,
      latest_e1rm: points[points.length - 1] ?? null,
      change_pct: null,
      sessions_since_best: points.length > 0 ? 0 : null,
      trend: "insufficient_data",
      stalled: false,
    };
  }

  const first = points[0];
  const latest = points[points.length - 1];
  const best = Math.max(...points);
  // sessions since the best was *first* reached — conveys how long it has held
  const firstBestIdx = points.findIndex((v) => v === best);
  const sessionsSinceBest = points.length - 1 - firstBestIdx;
  const changePct = first > 0 ? Math.round(((latest - first) / first) * 1000) / 10 : null;

  // compare the recent window's best against everything before it: a new best
  // over the prior portion is real progress; matching it is a plateau.
  const splitAt = Math.max(0, points.length - window);
  const prior = points.slice(0, splitAt);
  const recent = points.slice(splitAt);
  const priorBest = prior.length > 0 ? Math.max(...prior) : null;
  const recentBest = Math.max(...recent);
  const tolFactor = 1 + tol / 100;

  let trend: ProgressAnalysis["trend"];
  if (latest < best * (1 - tol / 100)) trend = "declining";
  else if (priorBest != null && recentBest <= priorBest * tolFactor) trend = "plateau";
  else trend = "improving";

  return {
    sessions: points.length,
    first_e1rm: Math.round(first),
    best_e1rm: Math.round(best),
    latest_e1rm: Math.round(latest),
    change_pct: changePct,
    sessions_since_best: sessionsSinceBest,
    trend,
    stalled: trend === "plateau" || trend === "declining",
  };
}

// --- get_training_overview -------------------------------------------------

export interface TrainingOverviewParts {
  profile: ProfileRow | null;
  currentState: Parameters<typeof formatCurrentState>[0];
  activeSummary: VMesoSummaryRow | null;
  topLifts: { exercise_name: string; change_pct: number | null }[];
}

export function formatTrainingOverview(parts: TrainingOverviewParts): Record<string, unknown> {
  const { profile, currentState, activeSummary, topLifts } = parts;
  const adherence =
    activeSummary && activeSummary.sessions_due > 0
      ? Math.round((activeSummary.sessions_attended / activeSummary.sessions_due) * 100)
      : null;
  return {
    who: profile
      ? {
          display_name: profile.display_name,
          experience_level: profile.experience_level,
          units: profile.units,
          bodyweight: profile.bodyweight,
        }
      : null,
    position: formatCurrentState(currentState),
    active_mesocycle: activeSummary
      ? {
          name: activeSummary.name,
          workouts_completed: activeSummary.workouts_completed,
          workouts_total: activeSummary.workouts_total,
          adherence_pct: adherence,
          avg_overall_fatigue: activeSummary.avg_overall_fatigue,
        }
      : null,
    key_lift_trend: topLifts,
    note: "One-call grounding snapshot. e1RM changes are estimates; call the focused tools for detail.",
  };
}

export const GET_TRAINING_OVERVIEW = "get_training_overview";
function registerGetTrainingOverview(server: McpServer) {
  server.registerTool(
    GET_TRAINING_OVERVIEW,
    {
      title: "Get training overview",
      description:
        "One-call grounding snapshot for coaching: who the user is, their current " +
        "position (macro → meso → next workout + target RIR), the active meso's " +
        "adherence and fatigue, and the e1RM trend on their key lifts. Start here.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const [profile, currentState] = await Promise.all([
        getProfile(client, userId),
        getCurrentState(client, userId),
      ]);

      let activeSummary: VMesoSummaryRow | null = null;
      let topLifts: { exercise_name: string; change_pct: number | null }[] = [];
      const activeMesoId = currentState.mesocycle?.id;
      if (activeMesoId) {
        const [{ data: summary, error }, scores] = await Promise.all([
          client
            .from("v_meso_summary")
            .select("*")
            .eq("user_id", userId)
            .eq("mesocycle_id", activeMesoId)
            .maybeSingle(),
          getMesoProgressScores(client, userId, activeMesoId),
        ]);
        if (error) throw error;
        activeSummary = summary;
        topLifts = scores
          .slice(0, 3)
          .map((s) => ({ exercise_name: s.exercise_name, change_pct: s.score_pct }));
      }

      return jsonResult(
        formatTrainingOverview({ profile, currentState, activeSummary, topLifts }),
      );
    },
  );
}

// --- get_recent_sessions ---------------------------------------------------

export function formatRecentSessions(sessions: RecentSession[]): Record<string, unknown> {
  return {
    count: sessions.length,
    sessions: sessions.map((s) => ({
      performed_on: s.performed_on,
      coordinate: s.coordinate,
      meso_name: s.meso_name,
      is_deload: s.is_deload,
      working_sets: s.working_sets,
      exercises_logged: s.exercises_logged,
      session_feedback: s.feedback,
      notes: s.notes,
    })),
    note: "Feedback ratings are the user's own 0–4 session ratings (fatigue / effort / performance).",
  };
}

export const GET_RECENT_SESSIONS = "get_recent_sessions";
function registerGetRecentSessions(server: McpServer) {
  server.registerTool(
    GET_RECENT_SESSIONS,
    {
      title: "Get recent sessions",
      description:
        "The user's most recently completed workouts (newest first) with their " +
        "session feedback (fatigue / effort / performance) and workout notes — " +
        "recovery and adherence signal. Defaults to the last 10.",
      inputSchema: { limit: z.number().int().min(1).max(30).optional() },
    },
    async ({ limit }: { limit?: number }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      return jsonResult(
        formatRecentSessions(await getRecentSessions(client, userId, limit ?? 10)),
      );
    },
  );
}

// --- analyze_exercise_progress ---------------------------------------------

export function formatExerciseAnalysis(
  exerciseId: string,
  overview: ExerciseOverview,
  series: E1rmPoint[],
): Record<string, unknown> {
  const analysis = detectStall(series.map((p) => p.e1rm));
  const ov = overview.overview;
  return {
    exercise_id: exerciseId,
    exercise_name: ov?.exercise_name ?? null,
    times_trained: ov?.times_trained ?? 0,
    last_performed_at: ov?.last_performed_at ?? null,
    weight_pr: ov?.weight_pr ?? null,
    best_e1rm_estimate: ov?.best_e1rm ?? null,
    progress: analysis,
    note:
      analysis.stalled && analysis.trend === "plateau"
        ? "e1RM has not set a new best recently — consider a load/technique check or a deload (estimates)."
        : "e1RM values are estimates; weigh them with the user's session notes and feedback.",
  };
}

export const ANALYZE_EXERCISE_PROGRESS = "analyze_exercise_progress";
function registerAnalyzeExerciseProgress(server: McpServer) {
  server.registerTool(
    ANALYZE_EXERCISE_PROGRESS,
    {
      title: "Analyze exercise progress",
      description:
        "e1RM trend, PRs, and stall/plateau detection for one exercise over its " +
        "whole logged history. Flags when estimated strength has stopped " +
        "progressing. e1RM is an estimate — read it alongside notes and feedback.",
      inputSchema: { exercise_id: z.string().uuid() },
    },
    async ({ exercise_id }: { exercise_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const [overview, series] = await Promise.all([
        getExerciseOverview(client, userId, exercise_id),
        getExerciseE1rmSeries(client, userId, exercise_id),
      ]);
      return jsonResult(formatExerciseAnalysis(exercise_id, overview, series));
    },
  );
}

// --- compare_mesocycles ----------------------------------------------------

export function formatCompareMesos(rows: VMesoSummaryRow[]): Record<string, unknown> {
  return {
    count: rows.length,
    mesocycles: rows.map((r) => ({
      mesocycle_id: r.mesocycle_id,
      name: r.name,
      status: r.status,
      weeks: r.weeks,
      working_sets: r.working_sets,
      total_volume: r.total_volume,
      best_e1rm_estimate: r.best_e1rm,
      adherence_pct:
        r.sessions_due > 0
          ? Math.round((r.sessions_attended / r.sessions_due) * 100)
          : null,
      avg_overall_fatigue: r.avg_overall_fatigue,
      avg_performance: r.avg_performance,
    })),
    note: "Side-by-side rollups from the shared meso-summary view; e1RM is an estimate.",
  };
}

export const COMPARE_MESOCYCLES = "compare_mesocycles";
function registerCompareMesocycles(server: McpServer) {
  server.registerTool(
    COMPARE_MESOCYCLES,
    {
      title: "Compare mesocycles",
      description:
        "Side-by-side rollups for two or more of the user's mesocycles: volume, " +
        "estimated strength, adherence, and session feedback. Pass their ids.",
      inputSchema: {
        mesocycle_ids: z.array(z.string().uuid()).min(2).max(6),
      },
    },
    async ({ mesocycle_ids }: { mesocycle_ids: string[] }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const { data, error } = await client
        .from("v_meso_summary")
        .select("*")
        .eq("user_id", userId)
        .in("mesocycle_id", mesocycle_ids);
      if (error) throw error;
      // preserve the caller's order
      const byId = new Map((data ?? []).map((r) => [r.mesocycle_id, r]));
      const ordered = mesocycle_ids
        .map((id) => byId.get(id))
        .filter((r): r is VMesoSummaryRow => r != null);
      return jsonResult(formatCompareMesos(ordered));
    },
  );
}

// --- get_muscle_balance ----------------------------------------------------

export function formatMuscleBalance(
  mesocycleId: string,
  balance: MesoBalance | null,
  contextLine: string | null,
): Record<string, unknown> {
  if (!balance) {
    return { found: false, mesocycle_id: mesocycleId, summary: "No meso visible for that id." };
  }
  return {
    found: true,
    mesocycle_id: mesocycleId,
    context: contextLine,
    split: { push: balance.push, pull: balance.pull, legs: balance.legs },
    weekly_sets_per_muscle: balance.bars.map((b) => ({
      muscle_group: b.name,
      avg_weekly_sets: b.avg,
    })),
    advisory: balance.note,
    note: "Advisory only (10 §9): push/pull/legs balance is a guide, not a rule. MEV/MAV/MRV landmarks are not yet parameterized, so no per-muscle threshold is asserted.",
  };
}

export const GET_MUSCLE_BALANCE = "get_muscle_balance";
function registerGetMuscleBalance(server: McpServer) {
  server.registerTool(
    GET_MUSCLE_BALANCE,
    {
      title: "Get muscle balance",
      description:
        "Weekly sets per muscle group and the push/pull/legs split for a " +
        "mesocycle, with the in-app balance callout. Advisory only — a guide to " +
        "weak points, not a hard prescription.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const stats = await getMesoStats(client, userId, mesocycle_id);
      return jsonResult(
        formatMuscleBalance(
          mesocycle_id,
          stats?.balance ?? null,
          stats?.contextLine ?? null,
        ),
      );
    },
  );
}

// --- get_exercise_affinity -------------------------------------------------

export function formatAffinity(list: ExerciseAffinity[]): Record<string, unknown> {
  return {
    count: list.length,
    exercises: list.map((a) => ({
      exercise_id: a.exercise_id,
      name: a.name,
      equipment_type: a.equipment_type,
      muscles: a.muscles,
      times_trained: a.times_trained,
      last_performed_at: a.last_performed_at,
      best_weight: a.best_weight,
      best_e1rm_estimate: a.best_e1rm_estimate,
      total_volume: a.total_volume,
      pinned_note: a.pinned_note,
      feedback: a.feedback,
    })),
    note: "Exercise-selection profile: favor proven, well-tolerated movements (high frequency, good loads, low joint pain, no flagging notes); be cautious with rarely-picked or flagged ones. Excluded movements are omitted.",
  };
}

export const GET_EXERCISE_AFFINITY = "get_exercise_affinity";
function registerGetExerciseAffinity(server: McpServer) {
  server.registerTool(
    GET_EXERCISE_AFFINITY,
    {
      title: "Get exercise affinity",
      description:
        "The user's exercise-selection profile: which movements they actually " +
        "train (frequency, recency, loads, volume), each with its pinned note and " +
        "aggregated feedback (mean joint pain / workload / pump). Use it to " +
        "recommend proven, well-tolerated exercises and avoid flagged ones. " +
        "Optionally filter by muscle group id or equipment type.",
      inputSchema: {
        muscle_group_id: z.string().uuid().optional(),
        equipment: z.string().optional(),
      },
    },
    async (
      args: { muscle_group_id?: string; equipment?: string },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      const list = await getExerciseAffinity(client, userId, {
        muscleGroupId: args.muscle_group_id,
        equipment: args.equipment,
      });
      return jsonResult(formatAffinity(list.slice(0, 60)));
    },
  );
}

// --- registry --------------------------------------------------------------

export function registerCoachingTools(server: McpServer) {
  registerGetTrainingOverview(server);
  registerGetRecentSessions(server);
  registerAnalyzeExerciseProgress(server);
  registerCompareMesocycles(server);
  registerGetMuscleBalance(server);
  registerGetExerciseAffinity(server);
}

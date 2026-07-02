import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProfileRow, VMesoSummaryRow } from "@/lib/types/database";
import { assessMuscleVolume, type EngineParams, type ExperienceLevel } from "@/lib/engine";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { getProfile } from "@/lib/queries/profiles";
import { getCurrentState, getCyclesOverview } from "@/lib/queries/cycles";
import { planForMacro } from "@/lib/queries/macro";
import { getMesoProgressScores, getMesoStats, type MesoBalance } from "@/lib/queries/stats";
import {
  getExerciseOverview,
  getMusclesForExercises,
  type ExerciseOverview,
} from "@/lib/queries/exercises";
import { getMesoPlan } from "@/lib/queries/cycles";
import {
  getRecentSessions,
  getExerciseAffinity,
  getExerciseSessions,
  type RecentSession,
  type ExerciseAffinity,
} from "@/lib/queries/coaching";
import {
  analyzeComparableProgress,
  segmentPhases,
  matchedRirComparison,
  analyzeByDaySlot,
  fatiguePosition,
  phaseGoals,
  type ExerciseSession,
} from "@/lib/analysis/comparability";
import { resolveSession, type McpExtra } from "../session";
import {
  toolResult,
  scaleLegend,
  round1,
  E1RM_ESTIMATE_NOTE,
  FEEDBACK_HISTORY_NOTE,
  type EnvelopeOpts,
} from "../envelope";
import { formatCurrentState } from "./get-current-state";
import { buildDayEmphasisList } from "./read";

/**
 * Slice 2 coaching/analysis tools (05 §Coaching & analysis). Read-only views
 * built on the shared views + the pure engine, so the model can act as a
 * grounded trainer. Honesty guardrails (10 §9): e1RM is an estimate, balance is
 * advisory-only, pump/soreness are secondary signals. Pure shapers/analysers
 * are exported for tests.
 */

function jsonResult(payload: Record<string, unknown>, opts: EnvelopeOpts = {}) {
  return toolResult(payload, opts);
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
  // e1RM is reported as a whole-number estimate; compute the percent change from
  // those same rounded values so change_pct reconciles with the first/latest the
  // payload shows (§5.2 — previously it used the raw floats and disagreed).
  const firstRounded = Math.round(first);
  const latestRounded = Math.round(latest);
  // sessions since the best was *first* reached — conveys how long it has held
  const firstBestIdx = points.findIndex((v) => v === best);
  const sessionsSinceBest = points.length - 1 - firstBestIdx;
  const changePct =
    firstRounded > 0
      ? Math.round(((latestRounded - firstRounded) / firstRounded) * 1000) / 10
      : null;

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
    first_e1rm: firstRounded,
    best_e1rm: Math.round(best),
    latest_e1rm: latestRounded,
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
        {
          dataQuality: {
            scales: scaleLegend("overall_fatigue", "rir"),
            samples: { active_meso_fatigue_sessions: activeSummary?.n_overall_fatigue ?? 0 },
            estimates: E1RM_ESTIMATE_NOTE,
            note: "key_lift_trend change_pct is the within-active-mesocycle e1RM change (deload sessions excluded from the trend). " + FEEDBACK_HISTORY_NOTE,
          },
        },
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
    note: "Feedback ratings are the user's own 0–10 session ratings (fatigue / effort / performance; unified scale since I14).",
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
      const sessions = await getRecentSessions(client, userId, limit ?? 10);
      const withFeedback = sessions.filter((s) => s.feedback != null).length;
      return jsonResult(formatRecentSessions(sessions), {
        dataQuality: {
          scales: scaleLegend("overall_fatigue", "effort_rating", "performance_rating"),
          samples: {
            sessions_returned: sessions.length,
            sessions_with_feedback: withFeedback,
          },
          note: FEEDBACK_HISTORY_NOTE,
        },
      });
    },
  );
}

// --- analyze_exercise_progress ---------------------------------------------

export function formatExerciseAnalysis(
  exerciseId: string,
  overview: ExerciseOverview,
  sessions: ExerciseSession[],
): Record<string, unknown> {
  const ov = overview.overview;
  // headline = the current phase only (12 §Stage 3 #1/#2): rolling + phase +
  // confidence, so a single light-slot session no longer reads as a decline and
  // a cut→bulk transition is segmented, not alarmed.
  const progress = analyzeComparableProgress(sessions);
  const phases = segmentPhases(sessions);
  const matched = matchedRirComparison(sessions);
  const goals = phaseGoals(sessions.filter((s) => s.e1rm != null));
  // Stage 5 — split the movement's two day-slots so a pooled sawtooth (the curl
  // on Day 1 at 25 lb vs Day 3 at 20 lb) reads as two clean series, and surface
  // where in the session it sits so a late-position dip isn't read as a decline.
  const daySlots = analyzeByDaySlot(sessions);
  const multiSlot = daySlots.length > 1;
  const fatigue = fatiguePosition(sessions);
  // lifetime raw change is only honest *within* a phase; flag when it crosses one
  const crossesPhase = goals.length > 1;
  const estimable = sessions.filter((s) => s.e1rm != null);
  const lifetimeFirst = estimable[0]?.e1rm ?? null;
  const lifetimeLatest = estimable[estimable.length - 1]?.e1rm ?? null;

  return {
    exercise_id: exerciseId,
    exercise_name: ov?.exercise_name ?? null,
    // lifetime distinct training sessions (sessions with a logged working set);
    // matches get_exercise_history.session_count and get_exercise_affinity.
    times_trained: ov?.times_trained ?? 0,
    last_performed_at: ov?.last_performed_at ?? null,
    weight_pr: ov?.weight_pr ?? null,
    // overview best is the Epley-only lifetime peak (v_exercise_overview); the
    // RIR-folded, confidence-weighted current-phase best lives on `progress`.
    best_e1rm_estimate: ov?.best_e1rm ?? null,
    progress,
    // raw lifetime endpoints, explicitly caveated when they span phases (12 §"Why")
    lifetime: {
      sessions: estimable.length,
      first_e1rm: lifetimeFirst != null ? Math.round(lifetimeFirst) : null,
      latest_e1rm: lifetimeLatest != null ? Math.round(lifetimeLatest) : null,
      goal_types: goals,
      crosses_phase: crossesPhase,
    },
    // per-block (goal_type) segments so each phase reads on its own terms
    phases,
    // current vs previous meso at matched prescribed RIR (decision #2) — the
    // like-with-like cross-meso read; cross_phase flags a cut↔bulk crossing.
    matched_rir: matched,
    // Stage 5 — per-day-slot series (only when the lift pools across ≥2 slots)
    // and the session-order / fatigue-position summary.
    day_slots: multiSlot ? daySlots : [],
    fatigue_position: fatigue,
    metric_definitions: {
      change_pct:
        "(rolling e1RM − first e1RM) / first e1RM, within the current phase only (RIR-folded Epley·Brzycki e1RM, whole-number estimates)",
      rolling_e1rm:
        "confidence-weighted max over the last 3 comparable sessions — replaces the single latest read so an alternating day-slot or one light session doesn't read as a decline",
      best_e1rm: "phase best, high/moderate-confidence preferred over low-confidence points",
      phase: "a contiguous run of sessions sharing the macro goal_type (bulk/cut/…)",
      matched_rir: "current vs previous meso compared at the same prescribed target RIR",
      day_slots:
        "the same movement analysed separately per meso day-slot (workouts.day_number) when it occupies more than one — each slot is a like-with-like series instead of a pooled sawtooth",
      fatigue_position:
        "where in the session the movement is trained (1 = first); avg/min/max ordinal and avg session size. varies=true means it sits at a variable depth, so a later-position dip may be fatigue, not regression",
    },
    note: progressNote(progress, crossesPhase, multiSlot, fatigue),
  };
}

function progressNote(
  progress: ReturnType<typeof analyzeComparableProgress>,
  crossesPhase: boolean,
  multiSlot: boolean,
  fatigue: ReturnType<typeof fatiguePosition>,
): string {
  const parts: string[] = [];
  if (progress.trend === "plateau") {
    parts.push(
      "Current-phase e1RM has not set a new best recently — consider a load/technique check or a deload (estimates).",
    );
  } else if (progress.trend === "declining") {
    parts.push(
      "Current-phase e1RM is trending down across recent comparable sessions, not just one light read — worth a closer look (estimates).",
    );
  } else {
    parts.push("e1RM values are estimates; weigh them with the user's session notes and feedback.");
  }
  if (crossesPhase) {
    parts.push(
      "This lift's history spans more than one phase (e.g. cut and bulk); compare within a phase or use matched_rir — a raw lifetime change mixes intents and is not like-with-like.",
    );
  }
  if (multiSlot) {
    parts.push(
      "This movement is trained in more than one day-slot at different loads; read day_slots for the per-slot trend rather than the pooled series — the slots alternate and look like a sawtooth together.",
    );
  }
  if (fatigue.varies) {
    parts.push(
      "It sits at a variable point in the session across weeks (see fatigue_position); a lower e1RM on a later-position week may be pre-fatigue, not a regression.",
    );
  }
  if (progress.confidence_mix.low > 0 && progress.confidence_mix.high + progress.confidence_mix.moderate === 0) {
    parts.push(
      "Every current-phase estimate is low-confidence (high-rep / far-from-failure sets) — read these as a band, not a precise number.",
    );
  }
  return parts.join(" ");
}

export const ANALYZE_EXERCISE_PROGRESS = "analyze_exercise_progress";
function registerAnalyzeExerciseProgress(server: McpServer) {
  server.registerTool(
    ANALYZE_EXERCISE_PROGRESS,
    {
      title: "Analyze exercise progress",
      description:
        "e1RM trend, PRs, and stall/plateau detection for one exercise — compared " +
        "like with like: the headline trend is the current training phase only " +
        "(bulk/cut/…), driven by a rolling window over recent sessions (not a " +
        "single latest read) and down-weighting low-confidence estimates. Returns " +
        "per-phase segments, a matched-prescribed-RIR comparison vs the prior " +
        "block, per-day-slot series when the lift is trained on more than one day, " +
        "and a fatigue-position summary (where in the session it sits). e1RM is an " +
        "estimate — read it alongside notes and feedback.",
      inputSchema: { exercise_id: z.string().uuid() },
    },
    async ({ exercise_id }: { exercise_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const { params } = await getActiveEngineParams(client);
      const [overview, sessions] = await Promise.all([
        getExerciseOverview(client, userId, exercise_id),
        getExerciseSessions(client, userId, exercise_id, params),
      ]);
      const estimable = sessions.filter((s) => s.e1rm != null);
      return jsonResult(formatExerciseAnalysis(exercise_id, overview, sessions), {
        dataQuality: {
          scales: scaleLegend("rir"),
          samples: {
            e1rm_sessions: estimable.length,
            confidence_mix: {
              high: estimable.filter((s) => s.confidence === "high").length,
              moderate: estimable.filter((s) => s.confidence === "moderate").length,
              low: estimable.filter((s) => s.confidence === "low").length,
            },
          },
          estimates: E1RM_ESTIMATE_NOTE,
          comparability:
            "Trend is the current phase only; cross-phase and cross-meso reads are segmented (phases) or matched on prescribed RIR (matched_rir). A lift trained on more than one day-slot is also split per slot (day_slots), and session order is surfaced (fatigue_position) so a later-position dip isn't misread. e1RM folds RIR into effective reps and carries a confidence band ([10] §1).",
        },
      });
    },
  );
}

// --- compare_mesocycles ----------------------------------------------------

export function formatCompareMesos(rows: VMesoSummaryRow[]): Record<string, unknown> {
  // raw block totals aren't directly comparable when the blocks differ in
  // length, deload structure, or completion, so we expose per-completed-workout
  // rates alongside the totals and flag what makes a naïve comparison unsafe.
  const warnings: string[] = [];
  if (rows.some((r) => r.status === "active")) {
    warnings.push(
      "One or more blocks are active/incomplete — totals reflect work logged so far, not a full block. Compare the per-workout rates instead.",
    );
  }
  if (new Set(rows.map((r) => r.weeks)).size > 1) {
    warnings.push("Blocks have different planned durations (weeks).");
  }
  if (new Set(rows.map((r) => r.includes_deload)).size > 1) {
    warnings.push("Blocks differ in deload structure.");
  }
  return {
    count: rows.length,
    comparison_basis: "completed_workouts",
    warnings,
    mesocycles: rows.map((r) => {
      const completed = r.workouts_completed ?? 0;
      const perWorkout = completed > 0;
      return {
        mesocycle_id: r.mesocycle_id,
        name: r.name,
        status: r.status,
        weeks: r.weeks,
        workouts_completed: completed,
        includes_deload: r.includes_deload,
        working_sets: r.working_sets,
        working_reps: r.working_reps,
        // round view-sourced floats so totals/means don't leak noise (§5.7)
        total_volume: round1(r.total_volume),
        // normalized so blocks of different length / completion are comparable
        sets_per_workout: perWorkout ? round1(r.working_sets / completed) : null,
        volume_per_workout:
          perWorkout && r.total_volume != null ? round1(r.total_volume / completed) : null,
        best_e1rm_estimate: round1(r.best_e1rm),
        adherence_pct:
          r.sessions_due > 0
            ? Math.round((r.sessions_attended / r.sessions_due) * 100)
            : null,
        avg_overall_fatigue: round1(r.avg_overall_fatigue),
        avg_performance: round1(r.avg_performance),
      };
    }),
    note: "Side-by-side rollups from the shared meso-summary view. Prefer the per-workout rates over raw totals when blocks differ; e1RM is an estimate.",
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
      return jsonResult(formatCompareMesos(ordered), {
        dataQuality: {
          scales: scaleLegend("overall_fatigue", "performance_rating"),
          // feedback sample sizes vary per block — surface them so a low-n
          // average isn't read as authoritative (§5.3)
          per_block_feedback_samples: ordered.map((r) => ({
            mesocycle_id: r.mesocycle_id,
            n_overall_fatigue: r.n_overall_fatigue,
            n_performance: r.n_performance,
          })),
          estimates: E1RM_ESTIMATE_NOTE,
          note: FEEDBACK_HISTORY_NOTE,
        },
      });
    },
  );
}

// --- get_muscle_balance ----------------------------------------------------

export function formatMuscleBalance(
  mesocycleId: string,
  balance: MesoBalance | null,
  contextLine: string | null,
  params: EngineParams,
  experience: ExperienceLevel,
  days: ReturnType<typeof buildDayEmphasisList> = [],
): Record<string, unknown> {
  if (!balance) {
    return { found: false, mesocycle_id: mesocycleId, summary: "No meso visible for that id." };
  }

  // §5.4: assert each muscle against its experience-scaled MEV/MAV/MRV band so
  // the tool can say a muscle is *below maintenance volume*, not only flag
  // relative imbalance. Heuristic + advisory (10 §9).
  const perMuscle = balance.bars.map((b) => {
    const lm = assessMuscleVolume(params, b.name, b.avg, experience);
    return {
      muscle_group: b.name,
      avg_weekly_sets: b.avg,
      landmark: lm
        ? {
            mev: lm.mev,
            mav: lm.mav,
            mrv: lm.mrv,
            zone: lm.zone,
            note: lm.note,
          }
        : null,
    };
  });

  const belowMev = perMuscle
    .filter((m) => m.landmark?.zone === "below_mev")
    .map((m) => m.muscle_group);
  const aboveMrv = perMuscle
    .filter((m) => m.landmark?.zone === "above_mrv")
    .map((m) => m.muscle_group);

  // append the absolute-threshold read to the relative-balance advisory
  const advisoryParts = [balance.note];
  if (belowMev.length > 0)
    advisoryParts.push(`Below MEV (likely under-stimulated): ${belowMev.join(", ")}.`);
  if (aboveMrv.length > 0)
    advisoryParts.push(`Above MRV (likely beyond recovery): ${aboveMrv.join(", ")}.`);

  return {
    found: true,
    mesocycle_id: mesocycleId,
    context: contextLine,
    experience_level: experience,
    split: { push: balance.push, pull: balance.pull, legs: balance.legs },
    // per-day emphasis (12 §2): so "is my volume uneven?" distinguishes a
    // lower-set leg day (legs by design) from a genuine deficit. Context.
    days,
    weekly_sets_per_muscle: perMuscle,
    advisory: advisoryParts.join(" "),
    landmarks_legend: {
      basis: `weekly direct-equivalent sets (fractional 1.0/0.5 counting, hard sets only — doc 10 §2) vs MEV/MAV/MRV, scaled for an ${experience} lifter`,
      mev: "minimum effective volume (productive floor)",
      mav: "maximum adaptive volume (top of the productive work zone)",
      mrv: "maximum recoverable volume (ceiling)",
    },
    note: "Advisory only (10 §9): push/pull/legs balance and MEV/MAV/MRV landmarks are heuristic, tunable starting points with large individual variance — a guide to weak points, not a hard prescription.",
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
        "mesocycle, with the in-app balance callout and a per-day emphasis " +
        "breakdown (so a lower-set leg day isn't misread as under-trained). " +
        "Advisory only — a guide to weak points, not a hard prescription.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const [stats, profile, { params }, plan] = await Promise.all([
        getMesoStats(client, userId, mesocycle_id),
        getProfile(client, userId),
        getActiveEngineParams(client),
        getMesoPlan(client, mesocycle_id),
      ]);
      const experience = (profile?.experience_level ??
        "intermediate") as ExperienceLevel;
      let days: ReturnType<typeof buildDayEmphasisList> = [];
      if (plan) {
        const exerciseIds = plan.days.flatMap((d) =>
          d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id)),
        );
        const roles = await getMusclesForExercises(client, exerciseIds);
        days = buildDayEmphasisList(plan, roles);
      }
      return jsonResult(
        formatMuscleBalance(
          mesocycle_id,
          stats?.balance ?? null,
          stats?.contextLine ?? null,
          params,
          experience,
          days,
        ),
        {
          dataQuality: {
            basis: "avg weekly working sets per muscle across the meso's non-deload weeks (planned where a week isn't generated yet)",
            landmarks:
              "MEV/MAV/MRV are heuristic RP/Israetel starting points, scaled by experience and tunable via engine_params.volume — advisory, large individual variance (10 §9)",
            experience_level: experience,
          },
        },
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
      // round e1RM/volume so the affinity profile matches the precision the
      // other tools report (§5.7); feedback means are already 1-dp from mean()
      best_e1rm_estimate: round1(a.best_e1rm_estimate),
      total_volume: round1(a.total_volume),
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
      return jsonResult(formatAffinity(list.slice(0, 60)), {
        dataQuality: {
          scales: scaleLegend("joint_pain", "workload", "pump"),
          // each exercise's feedback means are over its own feedback.sessions
          // (0 = none captured) — sample size is per-row, not global (§5.3)
          feedback_basis:
            "per-exercise feedback means cover only that exercise's sessions logged WITH feedback (see each row's feedback.sessions); 0 = none captured",
          estimates: E1RM_ESTIMATE_NOTE,
          note: FEEDBACK_HISTORY_NOTE,
        },
      });
    },
  );
}

// --- check_data_hygiene (§5.12) --------------------------------------------

export interface HygieneFlag {
  kind:
    | "macro_duration_mismatch"
    | "duplicate_meso_names"
    | "unplanned_days_per_week_default";
  severity: "warning" | "info";
  subject_id: string | null;
  subject: string;
  detail: string;
}

export interface HygieneMacroInput {
  id: string;
  name: string;
  duration_months: number | null;
  /** the engine's recommended duration for this macro's goal + profile */
  recommended_duration_months: number | null;
  mesos: { id: string; name: string; status: string; days_per_week: number | null }[];
}

/**
 * Detect the data-shape anomalies the connector faithfully returns without
 * comment (review §5.12): a macro whose stored duration differs from what the
 * engine would recommend, duplicate mesocycle names within a macro, and
 * unplanned placeholders still reporting the `days_per_week = 1` storage
 * default. Advisory, not errors — a coaching layer should gently surface them.
 * Pure. (The "all feedback = 2" heuristic is intentionally omitted: feedback
 * before 2026-06-15 was migrated without it, so equal early values are expected
 * — the report's editor note — and flagging them would be noise.)
 */
export function detectDataHygiene(macros: HygieneMacroInput[]): HygieneFlag[] {
  const flags: HygieneFlag[] = [];
  for (const m of macros) {
    if (
      m.duration_months != null &&
      m.recommended_duration_months != null &&
      m.duration_months !== m.recommended_duration_months
    ) {
      flags.push({
        kind: "macro_duration_mismatch",
        severity: "info",
        subject_id: m.id,
        subject: m.name,
        detail: `duration is ${m.duration_months} month(s); the engine recommends ${m.recommended_duration_months} for this goal and profile.`,
      });
    }

    const counts = new Map<string, { name: string; n: number }>();
    for (const meso of m.mesos) {
      const key = meso.name.trim().toLowerCase();
      const cur = counts.get(key) ?? { name: meso.name, n: 0 };
      cur.n += 1;
      counts.set(key, cur);
    }
    for (const { name, n } of counts.values()) {
      if (n > 1)
        flags.push({
          kind: "duplicate_meso_names",
          severity: "warning",
          subject_id: m.id,
          subject: m.name,
          detail: `${n} mesocycles in this macrocycle share the name "${name}".`,
        });
    }

    const placeholders = m.mesos.filter(
      (x) => x.status === "unplanned" && x.days_per_week === 1,
    );
    if (placeholders.length > 0)
      flags.push({
        kind: "unplanned_days_per_week_default",
        severity: "info",
        subject_id: m.id,
        subject: m.name,
        detail: `${placeholders.length} unplanned placeholder meso(s) report days_per_week = 1, a storage default until they are planned.`,
      });
  }
  return flags;
}

export function formatDataHygiene(flags: HygieneFlag[]): Record<string, unknown> {
  return {
    count: flags.length,
    flags,
    note:
      flags.length === 0
        ? "No structural data-shape anomalies detected in the user's cycles."
        : "Advisory only — these are data-shape anomalies (naming / duration / placeholder defaults), not errors. Surface them gently; never silently 'correct' the user's data.",
  };
}

export const CHECK_DATA_HYGIENE = "check_data_hygiene";
function registerCheckDataHygiene(server: McpServer) {
  server.registerTool(
    CHECK_DATA_HYGIENE,
    {
      title: "Check data hygiene",
      description:
        "Flag structural data-shape anomalies in the user's cycles a coaching " +
        "layer should gently surface: a macrocycle whose duration differs from the " +
        "engine's recommendation, duplicate mesocycle names within a macro, and " +
        "unplanned placeholders still on the days_per_week=1 default. Advisory, not " +
        "errors. Takes no arguments.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const [overview, profile, { params }] = await Promise.all([
        getCyclesOverview(client, userId),
        getProfile(client, userId),
        getActiveEngineParams(client),
      ]);
      const macros: HygieneMacroInput[] = overview.macros.map((macro) => ({
        id: macro.id,
        name: macro.name,
        duration_months: macro.duration_months,
        recommended_duration_months: profile
          ? planForMacro(macro, profile, params).recommendedDurationMonths
          : null,
        mesos: macro.mesos.map((m) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          days_per_week: m.days_per_week,
        })),
      }));
      return jsonResult(formatDataHygiene(detectDataHygiene(macros)));
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
  registerCheckDataHygiene(server);
}

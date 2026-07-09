import type { SupabaseClient } from "@supabase/supabase-js";
import {
  progressionActive,
  type EngineParams,
  type SeedEarnContext,
} from "@/lib/engine";
import type {
  Database,
  ExerciseFeedbackRow,
  LoggedSetRow,
  WorkoutExerciseRow,
  WorkoutFeedbackRow,
} from "@/lib/types/database";
import type { EngineGoal } from "./engine-goal";
import { daysSincePerformed } from "./progression-history";

/**
 * doc 16 §3.7 — the seed route's earned-at-close derivation: per exercise, the
 * athlete's most recent COMPLETED WORKING session (deload weeks excluded —
 * they neither earn nor take steps), assembled into the same shape the advance
 * chain feeds the earn gate (`previous` = that session's prescription,
 * `actualSets` = what was logged against it, its joint-pain + group-closing
 * pump/workload + session feedback), plus the staleness gap. `seedMeso` then
 * evaluates it through the SAME gate + governors as the advance chain, so an
 * earn at meso close carries across the deload boundary into the next seed.
 *
 * Doc 14 treatment: a DERIVED input — recomputed here on the write path,
 * excluded from the freshness fingerprint (`seedEarn` is denylisted), recorded
 * in the seed decision for replay.
 *
 * Cross-meso by design (§4): "the prior meso's final working session" IS the
 * exercise's most recent completed working instance at activation time, and
 * the same lookup serves standalone-to-standalone transitions. The staleness
 * gate (`max_gap_days`, evaluated in-engine) is what decides whether a carry
 * is still honest — after a long layoff the athlete re-measures first.
 *
 * A LEAF module (engine + progression-history only): `generation.ts` imports
 * it, and generation cannot reach through `progression.ts` (import cycle).
 */

type Client = SupabaseClient<Database>;

/** Bounded lookback for the source-session fetch. Wider than any sane
 *  `max_gap_days` so a lapsed exercise still surfaces an honest `stale`
 *  predicate (instead of silently reading as "no previous session"); the
 *  in-engine staleness gate is what actually disarms old earns. */
const SEED_EARN_LOOKBACK_DAYS = 90;

export interface SeedEarnBundle {
  earn: SeedEarnContext;
  daysSincePreviousSession: number | null;
}

/** Pure (exported for unit tests): pick the earn source per exercise — the
 *  most recently performed completed WORKING (non-deload) instance. */
export function chooseEarnSources<T>(
  candidates: {
    exerciseId: string;
    performedAtMs: number;
    isDeload: boolean;
    source: T;
  }[],
): Map<string, T> {
  const out = new Map<string, T>();
  const best = new Map<string, number>();
  for (const c of candidates) {
    if (c.isDeload) continue;
    if (!best.has(c.exerciseId) || c.performedAtMs > best.get(c.exerciseId)!) {
      best.set(c.exerciseId, c.performedAtMs);
      out.set(c.exerciseId, c.source);
    }
  }
  return out;
}

/**
 * Assemble the seed-route earn context per exercise. Returns null while the
 * progression mode is inactive for this goal (block absent / mode off / goal
 * factor 0) — the caller then omits every derived progression input, keeping
 * seeds byte-identical to today (§2.7). Runs on the caller's own client
 * (everything read is the user's own RLS-scoped history).
 */
export async function getSeedEarnContexts(
  client: Client,
  userId: string,
  exerciseIds: string[],
  goal: EngineGoal,
  params: EngineParams,
): Promise<Map<string, SeedEarnBundle> | null> {
  if (!progressionActive({ goalType: goal }, params)) return null;
  const out = new Map<string, SeedEarnBundle>();
  if (exerciseIds.length === 0) return out;

  // recent completed sessions, newest first, + their weeks (deload / RIR)
  const sinceIso = new Date(
    Date.now() - SEED_EARN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: workouts, error: wErr } = await client
    .from("workouts")
    .select("id, microcycle_id, performed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("performed_at", sinceIso)
    .order("performed_at", { ascending: false })
    .limit(200);
  if (wErr) throw wErr;
  if (!workouts || workouts.length === 0) return out;
  const workoutById = new Map(workouts.map((w) => [w.id, w]));

  const microIds = [...new Set(workouts.map((w) => w.microcycle_id))];
  const { data: micros, error: mErr } = await client
    .from("microcycles")
    .select("id, target_rir, is_deload")
    .in("id", microIds)
    .eq("user_id", userId);
  if (mErr) throw mErr;
  const microById = new Map((micros ?? []).map((m) => [m.id, m]));

  // candidate instances of the seeded exercises in those sessions
  const { data: candWes, error: weErr } = await client
    .from("workout_exercises")
    .select("*")
    .in("workout_id", workouts.map((w) => w.id))
    .in("exercise_id", exerciseIds);
  if (weErr) throw weErr;
  if (!candWes || candWes.length === 0) return out;

  const chosen = chooseEarnSources(
    (candWes as WorkoutExerciseRow[])
      .map((we) => {
        const w = workoutById.get(we.workout_id);
        const m = w ? microById.get(w.microcycle_id) : undefined;
        return w && m && w.performed_at
          ? {
              exerciseId: we.exercise_id,
              performedAtMs: new Date(w.performed_at).getTime(),
              isDeload: m.is_deload,
              source: we,
            }
          : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null),
  );
  if (chosen.size === 0) return out;

  // derived history of the chosen sessions, assembled generateDay-style: the
  // logged sets, the exercise's own joint pain + the group-closing
  // pump/workload (any exercise in the session may have closed the group), and
  // the session feedback.
  const chosenWorkoutIds = [
    ...new Set([...chosen.values()].map((we) => we.workout_id)),
  ];
  const { data: sessionWes, error: swErr } = await client
    .from("workout_exercises")
    .select("id, workout_id")
    .in("workout_id", chosenWorkoutIds);
  if (swErr) throw swErr;
  const sessionWeIds = (sessionWes ?? []).map((we) => we.id);
  const chosenWeIds = new Set([...chosen.values()].map((we) => we.id));

  const [
    { data: sets, error: setsErr },
    { data: feedback, error: fbErr },
    { data: workoutFeedback, error: wfErr },
  ] = await Promise.all([
    client
      .from("logged_sets")
      .select("*")
      .in("workout_exercise_id", [...chosenWeIds])
      .eq("user_id", userId)
      .order("set_number"),
    sessionWeIds.length > 0
      ? client
          .from("exercise_feedback")
          .select("*")
          .in("workout_exercise_id", sessionWeIds)
          .eq("user_id", userId)
      : Promise.resolve({ data: [] as ExerciseFeedbackRow[], error: null }),
    client
      .from("workout_feedback")
      .select("*")
      .in("workout_id", chosenWorkoutIds)
      .eq("user_id", userId),
  ]);
  if (setsErr) throw setsErr;
  if (fbErr) throw fbErr;
  if (wfErr) throw wfErr;

  const setsByWe = new Map<string, LoggedSetRow[]>();
  for (const s of (sets ?? []) as LoggedSetRow[]) {
    const cur = setsByWe.get(s.workout_exercise_id) ?? [];
    cur.push(s);
    setsByWe.set(s.workout_exercise_id, cur);
  }
  const weWorkoutById = new Map(
    (sessionWes ?? []).map((we) => [we.id, we.workout_id]),
  );
  const fbByWe = new Map<string, ExerciseFeedbackRow>();
  // group-scoped pump/workload lives on whichever exercise closed the group,
  // resolved per source workout (mirrors generateDay / the §7c backfill)
  const groupFbByWorkout = new Map<
    string,
    Map<string, { pump: number | null; workload: number | null }>
  >();
  for (const f of (feedback ?? []) as ExerciseFeedbackRow[]) {
    fbByWe.set(f.workout_exercise_id, f);
    const workoutId = weWorkoutById.get(f.workout_exercise_id);
    if (workoutId && f.muscle_group_id && (f.pump != null || f.workload != null)) {
      const m = groupFbByWorkout.get(workoutId) ?? new Map();
      m.set(f.muscle_group_id, { pump: f.pump, workload: f.workload });
      groupFbByWorkout.set(workoutId, m);
    }
  }
  const wfByWorkout = new Map(
    ((workoutFeedback ?? []) as WorkoutFeedbackRow[]).map((f) => [
      f.workout_id,
      f,
    ]),
  );

  for (const [exerciseId, we] of chosen) {
    const workout = workoutById.get(we.workout_id)!;
    const micro = microById.get(workout.microcycle_id)!;
    const fb = fbByWe.get(we.id) ?? null;
    const groupFb = we.muscle_group_id
      ? (groupFbByWorkout.get(we.workout_id)?.get(we.muscle_group_id) ?? null)
      : null;
    const wf = wfByWorkout.get(we.workout_id) ?? null;
    out.set(exerciseId, {
      earn: {
        previous: {
          weight: we.prescribed_weight,
          reps: we.prescribed_reps,
          sets: we.prescribed_sets ?? 1,
          targetRir: we.target_rir ?? micro.target_rir,
        },
        actualSets: (setsByWe.get(we.id) ?? []).map((s, index) => ({
          setNumber: s.set_number,
          weight: s.weight,
          reps: s.reps,
          rirReported: s.rir_reported,
          isWarmup: s.is_warmup,
          loggedSetId: s.id,
          sequenceIndex: index,
        })),
        exerciseFeedback: {
          jointPain: fb?.joint_pain ?? null,
          pump: groupFb?.pump ?? null,
          workload: groupFb?.workload ?? null,
        },
        workoutFeedback: wf
          ? {
              overallFatigue: wf.overall_fatigue,
              effortRating: wf.effort_rating,
              performanceRating: wf.performance_rating,
            }
          : null,
      },
      daysSincePreviousSession: daysSincePerformed(workout.performed_at),
    });
  }
  return out;
}

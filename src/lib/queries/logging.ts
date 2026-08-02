import type { SupabaseClient } from "@supabase/supabase-js";
import { endWorkoutStatus, isRemainingWorkout } from "@/lib/logging/end";
import type {
  Database,
  ExerciseFeedbackRow,
  ExerciseNoteRow,
  LoggedSetRow,
  MesocycleRow,
  MicrocycleRow,
  SetType,
  WorkoutExerciseRow,
  WorkoutRow,
} from "@/lib/types/database";
import { PROGRESSION_RULE } from "@/lib/engine";
import { getActiveEngineParams } from "./generation";
import { getExerciseE1rmAnchors } from "./anchors";
import { getMuscleGroupsCached } from "./reference";
import { computeSlotPrescriptions } from "./slot-prescription";
import { reorderToMatch } from "./plan-order";
import { recordSeedDecisions, type SeededDecision } from "./seed-decisions";
import {
  isTerminalMacroStatus,
  maybeCompleteMacroAfterMeso,
  planEndMacrocycle,
} from "./macro-close";

type Client = SupabaseClient<Database>;

// The recency-weighted strength-anchor query now lives in the leaf `anchors.ts`
// (so `generation.ts`'s seed can use it without a generation ↔ logging cycle);
// re-exported here for the existing importers.
export { getExerciseE1rmAnchors } from "./anchors";
// `reorderToMatch` moved to the leaf `plan-order.ts` for the same reason (both
// directions of the plan ⇄ session order sync share it); re-exported here.
export { reorderToMatch };

// ---------------------------------------------------------------------------
// day view detail (fig 1.1) — everything the logger needs in one shape
// ---------------------------------------------------------------------------

export interface LoggedExercise extends WorkoutExerciseRow {
  exercise_name: string;
  equipment_type: string;
  /** T-I2: how the entered weight maps to effective load (external | bodyweight_*) */
  load_type: string;
  muscle_group: string;
  sets: LoggedSetRow[];
  pinned_note: ExerciseNoteRow | null;
  feedback: ExerciseFeedbackRow | null;
  /** recency-weighted strength anchor for the live reps predictor (doc 11) */
  e1rm_anchor: number | null;
  /** N45: the winning set the anchor keyed on — its weight × reps and date —
   *  surfaced in the prescription detail sheet as the anchor's coordinate.
   *  Null when there's no anchor (or a shape that predates provenance). */
  e1rm_anchor_source: {
    weight: number;
    reps: number;
    performed_at: string | null;
  } | null;
  /** doc 16 §5.2: the prescription-basis anchor — the target `A* = A + δ`
   *  recorded by the `stepped` progression step of the decision that priced
   *  this row, or null when the row wasn't stepped (hold / pre-v20 / no
   *  decision). The live reps predictor prices off this so an athlete-owned
   *  weight edit re-derives reps faithful to the prescribed target including
   *  the lead; null falls back to `e1rm_anchor` (today's behavior). The
   *  measured anchor stays the basis everywhere else (stats, PRs, sampling,
   *  confidence, grading). */
  prescription_anchor: number | null;
  /** T-I2: the lifter's current bodyweight (lb), the effective-load base for a
   *  bodyweight movement; null when the profile has none. Same value across the
   *  day's exercises (read from the profile), shown by the editable BW chip. */
  bodyweight: number | null;
}

/** A programmed day in the navigator (fig 1.1 expanded header). */
export interface NavDay {
  dayNumber: number;
  label: string | null;
  /** the generated workout, or null for not-yet-generated future days */
  workoutId: string | null;
  status: "completed" | "active" | "current" | "skipped" | "planned";
}

/** A week in the navigator: the week selector + its nested day chips. */
export interface NavWeek {
  weekNumber: number;
  isDeload: boolean;
  targetRir: number;
  status: MicrocycleRow["status"];
  days: NavDay[];
}

export interface WorkoutDetail {
  workout: WorkoutRow;
  microcycle: MicrocycleRow;
  mesocycle: MesocycleRow;
  /** all weeks of the meso, for the week track */
  microcycles: MicrocycleRow[];
  dayLabel: string | null;
  /** caption under the week track (fig 1.1): "MESO 2 OF 4 · MACRO 26-1" */
  contextLabel: string;
  /** all workouts of this week, for the 1.5 next-workout button */
  siblingWorkouts: WorkoutRow[];
  /** the week→day navigator grid (fig 1.1 expanded header) */
  navWeeks: NavWeek[];
  exercises: LoggedExercise[];
}

/**
 * doc 16 §5.2 — the recorded target anchor per workout exercise: `A*` from the
 * status-`stepped` progression step of the LATEST decision that priced each
 * row. Only the newest decision counts — every reprice (advance, seed,
 * freshness recompute) records a fresh decision, so a superseded step can
 * never leak a stale lead. Rows whose newest decision held (`not_earned` /
 * `paced` / `vanished`), pre-v20 rows, and decision-less rows are simply
 * absent from the map: the day view falls back to the measured anchor. Read
 * unconditionally (not gated on the mode) so the coupling stays honest in the
 * deactivation window, when a stored prescription priced off `A*` hasn't been
 * pulled through the doc-14 recompute yet.
 */
async function getRecordedTargetAnchors(
  supabase: Client,
  weIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (weIds.length === 0) return out;
  const { data, error } = await supabase
    .from("engine_decisions")
    .select("workout_exercise_id, created_at, output")
    .in("workout_exercise_id", weIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const weId = row.workout_exercise_id;
    if (!weId || seen.has(weId)) continue;
    seen.add(weId);
    const output = row.output as {
      trace?: { rule?: string; status?: string; targetAnchor?: number }[];
    } | null;
    const step = output?.trace?.find((s) => s.rule === PROGRESSION_RULE);
    if (step?.status === "stepped" && typeof step.targetAnchor === "number") {
      out.set(weId, step.targetAnchor);
    }
  }
  return out;
}

export async function getWorkoutDetail(
  supabase: Client,
  userId: string,
  workoutId: string,
): Promise<WorkoutDetail | null> {
  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", workoutId)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout) return null;

  const { data: microcycle, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("id", workout.microcycle_id)
    .single();
  if (microError) throw microError;

  const [
    { data: mesocycle, error: mesoError },
    { data: microcycles, error: microsError },
    { data: workoutExercises, error: weError },
    { data: day, error: dayError },
    { data: siblings, error: siblingError },
  ] = await Promise.all([
    supabase
      .from("mesocycles")
      .select("*")
      .eq("id", microcycle.mesocycle_id)
      .single(),
    supabase
      .from("microcycles")
      .select("*")
      .eq("mesocycle_id", microcycle.mesocycle_id)
      .order("week_number"),
    supabase
      .from("workout_exercises")
      .select("*")
      .eq("workout_id", workoutId)
      .order("position"),
    supabase
      .from("meso_days")
      .select("label")
      .eq("mesocycle_id", microcycle.mesocycle_id)
      .eq("day_number", workout.day_number)
      .maybeSingle(),
    supabase
      .from("workouts")
      .select("*")
      .eq("microcycle_id", workout.microcycle_id)
      .order("day_number"),
  ]);
  if (mesoError) throw mesoError;
  if (microsError) throw microsError;
  if (weError) throw weError;
  if (dayError) throw dayError;
  if (siblingError) throw siblingError;

  const wes = workoutExercises ?? [];
  const weIds = wes.map((we) => we.id);
  const exerciseIds = [...new Set(wes.map((we) => we.exercise_id))];

  const [
    { data: exercises, error: exError },
    { data: sets, error: setsError },
    { data: notes, error: notesError },
    { data: feedback, error: fbError },
    muscleGroups,
  ] = await Promise.all([
    exerciseIds.length > 0
      ? supabase
          .from("exercises")
          .select("id, name, equipment_type, load_type")
          .in("id", exerciseIds)
      : Promise.resolve({ data: [], error: null }),
    weIds.length > 0
      ? supabase
          .from("logged_sets")
          .select("*")
          .in("workout_exercise_id", weIds)
          .order("set_number")
      : Promise.resolve({ data: [], error: null }),
    exerciseIds.length > 0
      ? supabase
          .from("exercise_notes")
          .select("*")
          .eq("user_id", userId)
          .eq("is_pinned", true)
          .in("exercise_id", exerciseIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    weIds.length > 0
      ? supabase
          .from("exercise_feedback")
          .select("*")
          .in("workout_exercise_id", weIds)
      : Promise.resolve({ data: [], error: null }),
    getMuscleGroupsCached(),
  ]);
  if (exError) throw exError;
  if (setsError) throw setsError;
  if (notesError) throw notesError;
  if (fbError) throw fbError;

  const exerciseById = new Map((exercises ?? []).map((e) => [e.id, e]));
  const mgNameById = new Map(muscleGroups.map((g) => [g.id, g.name]));
  const noteByExercise = new Map<string, ExerciseNoteRow>();
  for (const note of notes ?? []) {
    if (!noteByExercise.has(note.exercise_id))
      noteByExercise.set(note.exercise_id, note);
  }
  const feedbackByWe = new Map(
    (feedback ?? []).map((f) => [f.workout_exercise_id, f]),
  );

  // navigator grid (fig 1.1 expanded header): every week of the meso with its
  // programmed days. Generated days carry their workout id (for navigation)
  // and completion state; future weeks fall back to the planned day list.
  const microById = new Map((microcycles ?? []).map((m) => [m.id, m]));
  const microIds = (microcycles ?? []).map((m) => m.id);
  const [
    { data: mesoWorkouts, error: mwError },
    { data: mesoDays, error: mdError },
  ] = await Promise.all([
    microIds.length > 0
      ? supabase
          .from("workouts")
          .select("id, microcycle_id, day_number, status")
          .in("microcycle_id", microIds)
          .order("day_number")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("meso_days")
      .select("day_number, label")
      .eq("mesocycle_id", microcycle.mesocycle_id)
      .order("day_number"),
  ]);
  if (mwError) throw mwError;
  if (mdError) throw mdError;

  const dayLabelByNumber = new Map(
    (mesoDays ?? []).map((d) => [d.day_number, d.label]),
  );
  const plannedDayNumbers = (mesoDays ?? []).map((d) => d.day_number);

  // the meso's resume point: earliest (week, day) workout still open
  const ordered = [...(mesoWorkouts ?? [])].sort((a, b) => {
    const wa = microById.get(a.microcycle_id)?.week_number ?? 0;
    const wb = microById.get(b.microcycle_id)?.week_number ?? 0;
    return wa - wb || a.day_number - b.day_number;
  });
  const currentWorkoutId =
    ordered.find((w) => w.status === "planned" || w.status === "in_progress")
      ?.id ?? null;

  const navWeeks: NavWeek[] = (microcycles ?? []).map((m) => {
    const weekWorkouts = (mesoWorkouts ?? []).filter(
      (w) => w.microcycle_id === m.id,
    );
    // every programmed day shows for every week — generated days carry their
    // workout id + status; not-yet-generated days are plain placeholders (the
    // progression job builds next week one day at a time, so a partially
    // generated future week must still list its full planned day set). The
    // union also tolerates a plan edit that added/removed a day mid-meso.
    const dayNumbers = [
      ...new Set([...plannedDayNumbers, ...weekWorkouts.map((w) => w.day_number)]),
    ].sort((a, b) => a - b);
    const days: NavDay[] = dayNumbers.map((dayNumber) => {
      const w = weekWorkouts.find((x) => x.day_number === dayNumber);
      let status: NavDay["status"] = "planned";
      if (w?.status === "completed") status = "completed";
      else if (w?.status === "skipped") status = "skipped";
      else if (w && w.id === currentWorkoutId) status = "current";
      else if (w?.status === "in_progress") status = "active";
      return {
        dayNumber,
        label: dayLabelByNumber.get(dayNumber) ?? null,
        workoutId: w?.id ?? null,
        status,
      };
    });
    return {
      weekNumber: m.week_number,
      isDeload: m.is_deload,
      targetRir: m.target_rir,
      status: m.status,
      days,
    };
  });

  // recency-weighted strength anchors for the live reps predictor (doc 11) +
  // the recorded prescription-basis target anchors (doc 16 §5.2)
  const { params } = await getActiveEngineParams(supabase);
  const [e1rmAnchors, targetAnchors] = await Promise.all([
    getExerciseE1rmAnchors(supabase, userId, exerciseIds, params),
    getRecordedTargetAnchors(supabase, weIds),
  ]);
  // T-I2: the lifter's current bodyweight — the effective-load base for bodyweight
  // movements (the day-view chip + the live effective-load prediction/marker).
  const { data: bwProfile } = await supabase
    .from("profiles")
    .select("bodyweight")
    .eq("id", userId)
    .maybeSingle();
  const userBodyweight = bwProfile?.bodyweight ?? null;

  // macro context caption (fig 1.1)
  let contextLabel = "STANDALONE MESO";
  if (mesocycle.macrocycle_id) {
    const [{ data: macro, error: macroError }, { data: siblings, error: sibError }] =
      await Promise.all([
        supabase
          .from("macrocycles")
          .select("name")
          .eq("id", mesocycle.macrocycle_id)
          .single(),
        supabase
          .from("mesocycles")
          .select("id, position")
          .eq("macrocycle_id", mesocycle.macrocycle_id)
          .order("position", { ascending: true, nullsFirst: false }),
      ]);
    if (macroError) throw macroError;
    if (sibError) throw sibError;
    const total = (siblings ?? []).length;
    contextLabel = mesocycle.position
      ? `MESO ${mesocycle.position} OF ${total} · ${macro.name.toUpperCase()}`
      : `MACRO ${macro.name.toUpperCase()}`;
  }

  return {
    workout,
    microcycle,
    mesocycle,
    microcycles: microcycles ?? [],
    dayLabel: day?.label ?? null,
    contextLabel,
    siblingWorkouts: siblings ?? [],
    navWeeks,
    exercises: wes.map((we) => ({
      ...we,
      exercise_name: exerciseById.get(we.exercise_id)?.name ?? "",
      equipment_type: exerciseById.get(we.exercise_id)?.equipment_type ?? "",
      load_type: exerciseById.get(we.exercise_id)?.load_type ?? "external",
      muscle_group: we.muscle_group_id
        ? (mgNameById.get(we.muscle_group_id) ?? "")
        : "",
      sets: (sets ?? []).filter((s) => s.workout_exercise_id === we.id),
      pinned_note: noteByExercise.get(we.exercise_id) ?? null,
      feedback: feedbackByWe.get(we.id) ?? null,
      e1rm_anchor: e1rmAnchors.get(we.exercise_id)?.value ?? null,
      e1rm_anchor_source: (() => {
        const src = e1rmAnchors.get(we.exercise_id)?.source;
        return src
          ? {
              weight: src.weight,
              reps: src.reps,
              performed_at: src.performedAt ?? null,
            }
          : null;
      })(),
      prescription_anchor: targetAnchors.get(we.id) ?? null,
      bodyweight: userBodyweight,
    })),
  };
}

// ---------------------------------------------------------------------------
// set logging — append-only (no client deletes of logged history)
// ---------------------------------------------------------------------------

export async function logSet(
  supabase: Client,
  userId: string,
  input: {
    workout_exercise_id: string;
    set_number: number;
    weight: number;
    reps: number;
    rir_reported: number | null;
    set_type: SetType;
    /** engine per-set e1RM (PH31), computed by the caller from active params */
    e1rm: number | null;
    /** the e1RM's confidence band (high/moderate/low), stamped with it */
    e1rm_confidence: string | null;
    /** T-I2/#4: the lifter's bodyweight at log time — the effective-load base for
     *  bodyweight movements. Captured here, locked once the workout completes (amend
     *  never rewrites it). Null when the profile has no bodyweight set. */
    bodyweight: number | null;
    /** R6: the client-local calendar day (YYYY-MM-DD) the set was performed.
     *  Day-grain reads (history/PRs/rollups) bucket on this; absent/null falls
     *  back to the server's UTC day (the pre-R6 behavior). */
    performed_on?: string | null;
  },
): Promise<LoggedSetRow> {
  // denormalized cycle stamps come from the workout chain, read as ONE embedded
  // select (N12): this used to be 4 serial round-trips (WE → workout → micro →
  // meso) in front of every single set write — the bulk of the logging latency.
  // PostgREST resolves the FK chain server-side; the hand-authored DB types have
  // no relationship metadata, so the embed shape is typed via the cast below.
  const { data: weData, error: weError } = await supabase
    .from("workout_exercises")
    .select(
      "id, workout_id, exercise_id, workout:workouts(id, microcycle_id, status, microcycle:microcycles(id, mesocycle_id, mesocycle:mesocycles(id, macrocycle_id)))",
    )
    .eq("id", input.workout_exercise_id)
    .single();
  if (weError) throw weError;
  const we = weData as unknown as {
    id: string;
    workout_id: string;
    exercise_id: string;
    workout: {
      id: string;
      microcycle_id: string;
      status: WorkoutRow["status"];
      microcycle: {
        id: string;
        mesocycle_id: string;
        mesocycle: { id: string; macrocycle_id: string | null };
      };
    } | null;
  };
  const workout = we.workout;
  const micro = workout?.microcycle;
  const meso = micro?.mesocycle;
  // the FK chain is NOT NULL end to end, so a missing embed means the parent row
  // is gone (or RLS-hidden) — same failure the old serial .single()s threw on
  if (!workout || !micro || !meso)
    throw new Error("logSet: workout chain not found for workout_exercise");

  // R3: upsert on (workout_exercise_id, set_number) — a retried/double-tapped
  // log converges onto ONE row (the newest values win) instead of inserting a
  // blind duplicate that double-counts volume and PRs.
  const { data, error } = await supabase
    .from("logged_sets")
    .upsert(
      {
        workout_exercise_id: we.id,
        user_id: userId,
        exercise_id: we.exercise_id,
        macrocycle_id: meso.macrocycle_id,
        mesocycle_id: meso.id,
        microcycle_id: micro.id,
        workout_id: workout.id,
        performed_at: new Date().toISOString(),
        performed_on:
          input.performed_on ?? new Date().toISOString().slice(0, 10),
        set_number: input.set_number,
        weight: input.weight,
        reps: input.reps,
        set_type: input.set_type,
        rir_reported: input.rir_reported,
        e1rm: input.e1rm,
        e1rm_confidence: input.e1rm_confidence,
        bodyweight: input.bodyweight,
        is_warmup: false,
        notes: null,
      },
      { onConflict: "workout_exercise_id,set_number" },
    )
    .select()
    .single();
  if (error) throw error;

  // first set flips the workout in progress. R4: surfaced, not swallowed — a
  // silently-planned workout with logged sets used to be deletable by plan
  // regeneration (that path now also checks for sets, but the flip must not
  // fail silently: the client retries the log, and the upsert makes that safe).
  // N12: skipped entirely once past `planned` (every set after the first) — the
  // status read rode along on the stamp select. The `.eq status` guard keeps a
  // concurrent first-set race idempotent.
  if (workout.status === "planned") {
    const { error: flipError } = await supabase
      .from("workouts")
      .update({ status: "in_progress" })
      .eq("id", workout.id)
      .eq("status", "planned");
    if (flipError) throw flipError;
  }

  return data;
}

/**
 * Delete a logged set while the workout is `in_progress` (fig 1.3). Allowed
 * because completion locks the session (RLS gates the delete on the parent
 * workout's status). Renumbers the surviving sets to stay contiguous and
 * trims one prescribed slot so the row leaves the grid.
 */
export async function deleteLoggedSet(
  supabase: Client,
  userId: string,
  setId: string,
): Promise<void> {
  const { data: target, error: targetError } = await supabase
    .from("logged_sets")
    .select("id, set_number, workout_exercise_id")
    .eq("id", setId)
    .eq("user_id", userId)
    .single();
  if (targetError) throw targetError;

  const { error: delError } = await supabase
    .from("logged_sets")
    .delete()
    .eq("id", setId)
    .eq("user_id", userId);
  if (delError) throw delError;

  // pull later sets of this exercise down by one to close the gap
  const { data: remaining, error: remError } = await supabase
    .from("logged_sets")
    .select("id, set_number")
    .eq("workout_exercise_id", target.workout_exercise_id)
    .gt("set_number", target.set_number)
    .order("set_number");
  if (remError) throw remError;
  for (const s of remaining ?? []) {
    const { error } = await supabase
      .from("logged_sets")
      .update({ set_number: s.set_number - 1 })
      .eq("id", s.id);
    if (error) throw error;
  }

  // shrink the planned count so the freed slot doesn't reappear as "next"
  const { data: we, error: weError } = await supabase
    .from("workout_exercises")
    .select("prescribed_sets")
    .eq("id", target.workout_exercise_id)
    .single();
  if (weError) throw weError;
  const { error: updError } = await supabase
    .from("workout_exercises")
    .update({ prescribed_sets: Math.max(1, (we.prescribed_sets ?? 1) - 1) })
    .eq("id", target.workout_exercise_id);
  if (updError) throw updError;
}

/**
 * Uncheck a logged set (fig 1.1) — remove the logged row but keep its planned
 * slot, so it re-opens as the next editable set. Unlike `deleteLoggedSet` this
 * does not renumber or shrink the prescription. Allowed only while the workout
 * is `in_progress` (RLS-enforced).
 */
export async function unlogSet(
  supabase: Client,
  userId: string,
  setId: string,
): Promise<void> {
  const { error } = await supabase
    .from("logged_sets")
    .delete()
    .eq("id", setId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Toggle an individual set's skipped state (fig 1.3) — greyed but kept. */
export async function setSetSkipped(
  supabase: Client,
  workoutExerciseId: string,
  setNumber: number,
  skipped: boolean,
): Promise<void> {
  const { data: we, error: weError } = await supabase
    .from("workout_exercises")
    .select("skipped_set_numbers")
    .eq("id", workoutExerciseId)
    .single();
  if (weError) throw weError;
  const current = new Set(we.skipped_set_numbers ?? []);
  if (skipped) current.add(setNumber);
  else current.delete(setNumber);
  const { error } = await supabase
    .from("workout_exercises")
    .update({ skipped_set_numbers: [...current].sort((a, b) => a - b) })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/**
 * Skip every still-uncompleted set of an exercise (fig 1.2 menu). Leaves the
 * logged sets and the exercise itself untouched — only the unlogged planned
 * slots are greyed. Reversible per-set via {@link setSetSkipped}.
 */
export async function skipRemainingSets(
  supabase: Client,
  workoutExerciseId: string,
): Promise<void> {
  const { data: we, error: weError } = await supabase
    .from("workout_exercises")
    .select("prescribed_sets, skipped_set_numbers")
    .eq("id", workoutExerciseId)
    .single();
  if (weError) throw weError;
  const { data: sets, error: setsError } = await supabase
    .from("logged_sets")
    .select("set_number")
    .eq("workout_exercise_id", workoutExerciseId);
  if (setsError) throw setsError;

  const logged = new Set((sets ?? []).map((s) => s.set_number));
  const maxLogged = logged.size > 0 ? Math.max(...logged) : 0;
  const planned = Math.max(we.prescribed_sets ?? 1, maxLogged);
  const skipped = new Set(we.skipped_set_numbers ?? []);
  for (let n = 1; n <= planned; n += 1) {
    if (!logged.has(n)) skipped.add(n);
  }
  const { error } = await supabase
    .from("workout_exercises")
    .update({ skipped_set_numbers: [...skipped].sort((a, b) => a - b) })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/** Clear every skipped set on an exercise (fig 1.2 "Unskip all sets"). */
export async function clearSkippedSets(
  supabase: Client,
  workoutExerciseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("workout_exercises")
    .update({ skipped_set_numbers: [] })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/**
 * doc 21 §2 — the FALLBACK half of `assumedRir` at the per-set e1RM stamp site:
 * the target RIR the slot's prescription asked for. Null when the slot carries
 * none (a cold/unprescribed row), in which case an unreported set stays
 * unreported and stamps at `low` confidence exactly as before.
 */
export async function getSlotTargetRir(
  supabase: Client,
  workoutExerciseId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("target_rir")
    .eq("id", workoutExerciseId)
    .maybeSingle();
  if (error) throw error;
  return data?.target_rir ?? null;
}

/** Same fallback, reached from a logged set id (the amend path). */
export async function getSetSlotTargetRir(
  supabase: Client,
  userId: string,
  setId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("logged_sets")
    .select("workout_exercise:workout_exercises(target_rir)")
    .eq("id", setId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as {
    workout_exercise: { target_rir: number | null } | null;
  } | null;
  return row?.workout_exercise?.target_rir ?? null;
}

/** Amend a logged set (history is append-only; corrections are updates). */
export async function amendSet(
  supabase: Client,
  userId: string,
  setId: string,
  patch: Partial<
    Pick<
      LoggedSetRow,
      | "weight"
      | "reps"
      | "rir_reported"
      | "set_type"
      | "e1rm"
      | "e1rm_confidence"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("logged_sets")
    .update(patch)
    .eq("id", setId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// exercise menu ops (fig 1.2)
// ---------------------------------------------------------------------------

export async function adjustPrescribedSets(
  supabase: Client,
  workoutExerciseId: string,
  delta: number,
): Promise<void> {
  const { data: we, error: weError } = await supabase
    .from("workout_exercises")
    .select("prescribed_sets")
    .eq("id", workoutExerciseId)
    .single();
  if (weError) throw weError;
  const next = Math.max(1, (we.prescribed_sets ?? 1) + delta);
  const { error } = await supabase
    .from("workout_exercises")
    .update({ prescribed_sets: next })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/**
 * Persist a planned weight for an upcoming (unlogged) set (doc 11). With
 * `matchAll` (the auto-match setting), the weight is written to *every*
 * still-unlogged set of the exercise; otherwise only to `setNumber`. Logged
 * sets are never touched — actuals live in `logged_sets`; this only seeds the
 * weight shown before a set is logged. Stored as a `set_number → weight` map in
 * `workout_exercises.set_weights`.
 */
export async function setPlannedSetWeight(
  supabase: Client,
  workoutExerciseId: string,
  setNumber: number,
  weight: number,
  matchAll: boolean,
): Promise<void> {
  const { data: we, error: weError } = await supabase
    .from("workout_exercises")
    .select("prescribed_sets, set_weights")
    .eq("id", workoutExerciseId)
    .maybeSingle();
  if (weError) throw weError;
  // Row absent or RLS-hidden: nothing to seed a planned weight onto. No-op
  // rather than throw, so auto-match never escalates a benign miss to a crash.
  if (!we) return;

  const next: Record<string, number> = { ...(we.set_weights ?? {}) };

  if (matchAll) {
    const { data: sets, error: setsError } = await supabase
      .from("logged_sets")
      .select("set_number")
      .eq("workout_exercise_id", workoutExerciseId);
    if (setsError) throw setsError;
    const logged = new Set((sets ?? []).map((s) => s.set_number));
    const planned = Math.max(we.prescribed_sets ?? 1, setNumber);
    for (let n = 1; n <= planned; n += 1) {
      if (!logged.has(n)) next[String(n)] = weight;
    }
  } else {
    next[String(setNumber)] = weight;
  }

  const { error } = await supabase
    .from("workout_exercises")
    .update({ set_weights: next })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/**
 * Reset an exercise to its engine prescription (doc 13 §4.4): clear the
 * `set_weights` overrides so every unlogged set falls back to `prescribed_weight`
 * (and its predicted reps). Logged sets live in `logged_sets` and are untouched —
 * this only drops the per-set planned-weight map (hard rule #5, append-only).
 */
export async function clearPlannedSetWeights(
  supabase: Client,
  workoutExerciseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("workout_exercises")
    .update({ set_weights: {} })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/** Remove an exercise from the day — only while nothing is logged on it
 * (deleting the row would cascade logged history otherwise). */
export async function removeWorkoutExercise(
  supabase: Client,
  workoutExerciseId: string,
): Promise<{ error: string | null }> {
  const { count, error: countError } = await supabase
    .from("logged_sets")
    .select("*", { count: "exact", head: true })
    .eq("workout_exercise_id", workoutExerciseId);
  if (countError) throw countError;
  if ((count ?? 0) > 0)
    return { error: "Sets are logged on this exercise. Skip it instead." };
  const { error } = await supabase
    .from("workout_exercises")
    .delete()
    .eq("id", workoutExerciseId);
  if (error) throw error;
  return { error: null };
}

/**
 * Replace the movement behind an unstarted workout exercise (fig 1.2 menu).
 * Blocked once sets exist — logged history stays attached to what was done.
 *
 * N33: the prescription is computed by the ENGINE, never written raw. The
 * slot-prescription resolver derives the kind from the data — an advance off
 * the incoming exercise's recent same-slot instance when one exists (§9
 * lookback; a swap-out/swap-back round trip restores the engine numbers), else
 * the doc 14 §6.2 cold seed. The full tuple is written, the dep_fingerprint +
 * params_version are stamped, and a decision is recorded — so the audit
 * surface (prescription detail sheet) stays coherent and the freshness
 * framework can replay the row.
 */
export async function replaceWorkoutExercise(
  supabase: Client,
  userId: string,
  workoutExerciseId: string,
  newExerciseId: string,
): Promise<{ error: string | null }> {
  const { count, error: countError } = await supabase
    .from("logged_sets")
    .select("*", { count: "exact", head: true })
    .eq("workout_exercise_id", workoutExerciseId);
  if (countError) throw countError;
  if ((count ?? 0) > 0)
    return { error: "Sets are logged on this exercise. Skip it instead." };

  const { data: slot, error: slotError } = await supabase
    .from("workout_exercises")
    .select("id, workout_id, prescribed_sets")
    .eq("id", workoutExerciseId)
    .maybeSingle();
  if (slotError) throw slotError;
  if (!slot) return { error: "Exercise not found." };

  const { results, paramsVersion, params, coords } = await computeSlotPrescriptions(
    supabase,
    userId,
    slot.workout_id,
    [newExerciseId],
    {
      // a swap keeps the slot's structural set count as the cold-start basis
      // (an advance derives its own from the source + autoregulation)
      initialSetsByExercise: new Map([
        [newExerciseId, slot.prescribed_sets ?? 3],
      ]),
    },
  );
  const r = results.get(newExerciseId);
  if (!r) return { error: "Could not compute a prescription for the swap." };

  const { error } = await supabase
    .from("workout_exercises")
    .update({
      exercise_id: newExerciseId,
      prescribed_weight: r.output.weight,
      prescribed_reps: r.output.reps,
      prescribed_sets: r.output.sets,
      target_rir: r.output.targetRir,
      // Clear any per-set weight overrides left on the slot by the outgoing
      // exercise — otherwise the first set shows the old movement's planned
      // weight (and reps predicted off it) until the user hits "reset to
      // prescription" (PH38). The incoming exercise starts from its own
      // engine-computed prescription.
      set_weights: {},
      // one provenance string: the engine rationale (same field the reconcile
      // writes), not bespoke swap copy
      notes: r.output.rationale,
      dep_fingerprint: r.depFingerprint,
      params_version: paramsVersion,
    })
    .eq("id", workoutExerciseId);
  if (error) throw error;

  // record the decision (service-role, best-effort — doc 14 §6.2)
  await recordSeedDecisions(
    userId,
    [
      {
        workoutExerciseId,
        exerciseId: newExerciseId,
        inputs: r.inputs,
        output: r.output,
        kind: r.kind,
        sourceWorkoutExerciseId: r.sourceWorkoutExerciseId,
      },
    ],
    coords,
    params,
    paramsVersion,
  );
  return { error: null };
}

// ---------------------------------------------------------------------------
// propagation to future same-day workouts (workout-page editing). A reorder or
// substitution made on a live workout carries forward to the same training day
// in later, not-yet-started weeks of the same mesocycle (incomplete only).
// Logged history is never touched (replaceWorkoutExercise no-ops once sets
// exist). New weeks generate from the prior week's workout, so this only has to
// reach weeks that were already materialised before the edit.
// ---------------------------------------------------------------------------

/** Workout ids of the same training day in later (incomplete) weeks of the
 *  same mesocycle — the targets a reorder/substitution propagates to. */
export async function getFutureSiblingWorkoutIds(
  supabase: Client,
  userId: string,
  workoutId: string,
): Promise<string[]> {
  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .select("id, microcycle_id, day_number")
    .eq("id", workoutId)
    .maybeSingle();
  if (wErr) throw wErr;
  if (!workout) return [];

  const { data: micro, error: mErr } = await supabase
    .from("microcycles")
    .select("id, mesocycle_id, week_number")
    .eq("id", workout.microcycle_id)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!micro) return [];

  const { data: laterMicros, error: lmErr } = await supabase
    .from("microcycles")
    .select("id")
    .eq("mesocycle_id", micro.mesocycle_id)
    .gt("week_number", micro.week_number);
  if (lmErr) throw lmErr;
  const laterIds = (laterMicros ?? []).map((m) => m.id);
  if (laterIds.length === 0) return [];

  const { data: workouts, error: wsErr } = await supabase
    .from("workouts")
    .select("id")
    .eq("user_id", userId)
    .eq("day_number", workout.day_number)
    .in("microcycle_id", laterIds)
    .in("status", ["planned", "in_progress"]);
  if (wsErr) throw wsErr;
  return (workouts ?? []).map((w) => w.id);
}

/** Reorder each target workout's exercises to match the source order (by
 *  exercise_id). Exercises not present in the source keep their relative order
 *  at the end. */
export async function propagateExerciseOrder(
  supabase: Client,
  sourceWorkoutId: string,
  targetWorkoutIds: string[],
): Promise<void> {
  if (targetWorkoutIds.length === 0) return;
  const { data: sourceWes, error: sErr } = await supabase
    .from("workout_exercises")
    .select("exercise_id, position")
    .eq("workout_id", sourceWorkoutId)
    .order("position");
  if (sErr) throw sErr;
  const sourceOrder = (sourceWes ?? []).map((we) => we.exercise_id);

  for (const targetId of targetWorkoutIds) {
    const { data: targetWes, error: tErr } = await supabase
      .from("workout_exercises")
      .select("id, exercise_id, position")
      .eq("workout_id", targetId)
      .order("position");
    if (tErr) throw tErr;
    const ranked = reorderToMatch(targetWes ?? [], sourceOrder);
    for (let i = 0; i < ranked.length; i++) {
      if (ranked[i].position === i + 1) continue; // no unique constraint on position
      const { error } = await supabase
        .from("workout_exercises")
        .update({ position: i + 1 })
        .eq("id", ranked[i].id);
      if (error) throw error;
    }
  }
}

/** Substitute oldExerciseId → newExerciseId on each target workout's matching
 *  unstarted slot. Skips a workout that already has the new exercise; the
 *  underlying replace no-ops where sets are logged. */
export async function propagateSubstitution(
  supabase: Client,
  userId: string,
  targetWorkoutIds: string[],
  oldExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  if (targetWorkoutIds.length === 0 || oldExerciseId === newExerciseId) return;
  for (const targetId of targetWorkoutIds) {
    const { data: wes, error } = await supabase
      .from("workout_exercises")
      .select("id, exercise_id")
      .eq("workout_id", targetId);
    if (error) throw error;
    const list = wes ?? [];
    if (list.some((w) => w.exercise_id === newExerciseId)) continue;
    const target = list.find((w) => w.exercise_id === oldExerciseId);
    if (!target) continue;
    await replaceWorkoutExercise(supabase, userId, target.id, newExerciseId);
  }
}

/** Add exercises to a live workout (workout-page editing). Each lands at the
 *  bottom of the list (max position + 1), tagged with its primary muscle group
 *  — the user reorders as normal. Logged history is untouched (these are new
 *  pending slots).
 *
 *  N33: the prescription comes from the shared slot resolver — an ADVANCE off
 *  the exercise's recent same-slot instance when one exists (§9 lookback: an
 *  exercise removed and later re-added progresses instead of reseeding), else
 *  the doc 14 §6.2 cold seed (§S1 anchor pricing, the user's best as the
 *  cold-start `initial`). Either way the `dep_fingerprint` is stamped and a
 *  decision of the matching kind is recorded, so the read-path reconcile keeps
 *  the row fresh when any input changes. */
export async function addWorkoutExercises(
  supabase: Client,
  userId: string,
  workoutId: string,
  exerciseIds: string[],
): Promise<void> {
  if (exerciseIds.length === 0) return;

  const { data: maxRow, error: maxErr } = await supabase
    .from("workout_exercises")
    .select("position")
    .eq("workout_id", workoutId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  let pos = maxRow?.position ?? 0;

  const { results, paramsVersion, params, coords } =
    await computeSlotPrescriptions(supabase, userId, workoutId, exerciseIds);

  const rows = exerciseIds
    .map((id) => results.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => ({
      result: r,
      row: {
        workout_id: workoutId,
        exercise_id: r.exerciseId,
        muscle_group_id: r.muscleGroupId,
        position: ++pos,
        prescribed_weight: r.output.weight,
        prescribed_reps: r.output.reps,
        prescribed_sets: r.output.sets,
        target_rir: r.output.targetRir,
        status: "pending" as const,
        notes: r.output.rationale,
        dep_fingerprint: r.depFingerprint,
        params_version: paramsVersion,
      },
    }));

  const { data: newWes, error } = await supabase
    .from("workout_exercises")
    .insert(rows.map((s) => s.row))
    .select("id, position");
  if (error) throw error;

  // record a decision per added slot (service-role; best-effort) so the row
  // participates in the freshness reconcile (doc 14 §6.2).
  const idByPosition = new Map((newWes ?? []).map((w) => [w.position, w.id]));
  const decisions: SeededDecision[] = rows
    .map((s): SeededDecision | null => {
      const id = idByPosition.get(s.row.position);
      return id
        ? {
            workoutExerciseId: id,
            exerciseId: s.result.exerciseId,
            inputs: s.result.inputs,
            output: s.result.output,
            kind: s.result.kind,
            sourceWorkoutExerciseId: s.result.sourceWorkoutExerciseId,
          }
        : null;
    })
    .filter((d): d is SeededDecision => d !== null);
  await recordSeedDecisions(userId, decisions, coords, params, paramsVersion);
}

/** Add the same exercises to each target workout's bottom (workout-page
 *  add-exercise propagation), skipping any a target already has. */
export async function propagateAddedExercises(
  supabase: Client,
  userId: string,
  targetWorkoutIds: string[],
  exerciseIds: string[],
): Promise<void> {
  if (targetWorkoutIds.length === 0 || exerciseIds.length === 0) return;
  for (const targetId of targetWorkoutIds) {
    const { data: existing, error } = await supabase
      .from("workout_exercises")
      .select("exercise_id")
      .eq("workout_id", targetId);
    if (error) throw error;
    const have = new Set((existing ?? []).map((e) => e.exercise_id));
    const toAdd = exerciseIds.filter((id) => !have.has(id));
    if (toAdd.length > 0)
      await addWorkoutExercises(supabase, userId, targetId, toAdd);
  }
}

export async function savePinnedNote(
  supabase: Client,
  userId: string,
  exerciseId: string,
  body: string,
): Promise<void> {
  // one pinned note per exercise: unpin previous, pin the new one
  const { error: unpinError } = await supabase
    .from("exercise_notes")
    .update({ is_pinned: false })
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_pinned", true);
  if (unpinError) throw unpinError;
  const { error } = await supabase.from("exercise_notes").insert({
    user_id: userId,
    exercise_id: exerciseId,
    body,
    is_pinned: true,
  });
  if (error) throw error;
}

/** Unpin the exercise's pinned note (used when a note moves to session-only,
 * or is cleared). The row is kept but no longer surfaces as the pinned note. */
export async function clearPinnedNote(
  supabase: Client,
  userId: string,
  exerciseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("exercise_notes")
    .update({ is_pinned: false })
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_pinned", true);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// feedback (fig 1.4): joint pain per exercise; pump/workload 0–10 scoped
// to the exercise's muscle group, stored on that exercise's feedback row
// ---------------------------------------------------------------------------

export async function saveExerciseFeedback(
  supabase: Client,
  userId: string,
  input: {
    workout_exercise_id: string;
    joint_pain: number | null;
    muscle_group_id: string | null;
    pump: number | null;
    workload: number | null;
    soreness: number | null;
    soreness_days: number | null;
  },
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("exercise_feedback")
    .select("id")
    .eq("workout_exercise_id", input.workout_exercise_id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("exercise_feedback")
      .update({
        joint_pain: input.joint_pain,
        muscle_group_id: input.muscle_group_id,
        pump: input.pump,
        workload: input.workload,
        soreness: input.soreness,
        soreness_days: input.soreness_days,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("exercise_feedback").insert({
      workout_exercise_id: input.workout_exercise_id,
      user_id: userId,
      joint_pain: input.joint_pain,
      muscle_group_id: input.muscle_group_id,
      pump: input.pump,
      workload: input.workload,
      soreness: input.soreness,
      soreness_days: input.soreness_days,
      notes: null,
    });
    if (error) throw error;
  }
}

/**
 * Attribute joint pain to a specific exercise in the muscle group without
 * disturbing its other feedback (pump / workload / soreness / notes). Backs the
 * fig 1.4 revision's "which exercise caused it?" multi-select: joint pain is
 * collected once the group closes but the lifter can pin it to the exercise(s)
 * that actually hurt, so the level lands on each selected exercise's row and
 * clears (null) on the deselected ones. Only the `joint_pain` (+ group id when
 * recording pain) columns are touched. Clearing an exercise that has no feedback
 * row is a no-op — no empty rows are created just to store "no pain".
 */
export async function setExerciseJointPain(
  supabase: Client,
  userId: string,
  input: {
    workout_exercise_id: string;
    joint_pain: number | null;
    muscle_group_id: string | null;
  },
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("exercise_feedback")
    .select("id")
    .eq("workout_exercise_id", input.workout_exercise_id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    // preserve everything else on the row; a clear touches only joint_pain
    const patch =
      input.joint_pain != null
        ? { joint_pain: input.joint_pain, muscle_group_id: input.muscle_group_id }
        : { joint_pain: null };
    const { error } = await supabase
      .from("exercise_feedback")
      .update(patch)
      .eq("id", existing.id);
    if (error) throw error;
  } else if (input.joint_pain != null) {
    const { error } = await supabase.from("exercise_feedback").insert({
      workout_exercise_id: input.workout_exercise_id,
      user_id: userId,
      joint_pain: input.joint_pain,
      muscle_group_id: input.muscle_group_id,
      pump: null,
      workload: null,
      soreness: null,
      soreness_days: null,
      notes: null,
    });
    if (error) throw error;
  }
}

/**
 * Session log note (09 session-5 §8) — a per-(workout_exercise) note saved with
 * that session's exercise log, distinct from the cross-workout pinned note. It
 * reuses `exercise_feedback.notes` (one row per workout_exercise): the
 * completion-lock RLS already gates update/delete to the active workout, so the
 * note is editable only in the live session and locks on completion. An empty
 * note clears the field (so the history note-icon disappears). Only the `notes`
 * column is touched — pump/workload/joint-pain are preserved.
 */
export async function saveSessionNote(
  supabase: Client,
  userId: string,
  workoutExerciseId: string,
  note: string | null,
): Promise<void> {
  const body = note?.trim() ? note.trim() : null;
  const { data: existing, error: existingError } = await supabase
    .from("exercise_feedback")
    .select("id")
    .eq("workout_exercise_id", workoutExerciseId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("exercise_feedback")
      .update({ notes: body })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("exercise_feedback").insert({
      workout_exercise_id: workoutExerciseId,
      user_id: userId,
      joint_pain: null,
      muscle_group_id: null,
      pump: null,
      workload: null,
      soreness: null,
      soreness_days: null,
      notes: body,
    });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// workout completion (fig 1.5)
// ---------------------------------------------------------------------------

/**
 * Session feedback (fig 1.5, redesigned per 09 2026-06-14 §1): overall
 * fatigue / effort / performance 0–10 (unified with the per-exercise sliders
 * since I14; pre-I14 0–4 rows were rescaled round(x × 2.5)). The engine uses
 * it as a session-level dampener (10 §3). Saved while the workout is still
 * `in_progress`, before completion flips the status, so the next-week job
 * can read it.
 */
export async function saveWorkoutFeedback(
  supabase: Client,
  userId: string,
  input: {
    workout_id: string;
    overall_fatigue: number | null;
    effort_rating: number | null;
    performance_rating: number | null;
  },
): Promise<void> {
  if (
    input.overall_fatigue == null &&
    input.effort_rating == null &&
    input.performance_rating == null
  ) {
    return;
  }
  const { data: existing, error: existingError } = await supabase
    .from("workout_feedback")
    .select("id")
    .eq("workout_id", input.workout_id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("workout_feedback")
      .update({
        overall_fatigue: input.overall_fatigue,
        effort_rating: input.effort_rating,
        performance_rating: input.performance_rating,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("workout_feedback").insert({
      workout_id: input.workout_id,
      user_id: userId,
      overall_fatigue: input.overall_fatigue,
      effort_rating: input.effort_rating,
      performance_rating: input.performance_rating,
      notes: null,
    });
    if (error) throw error;
  }
}

export async function completeWorkout(
  supabase: Client,
  userId: string,
  workoutId: string,
  notes: string | null,
): Promise<void> {
  // exercises with logged sets are completed; untouched ones are skipped
  const { data: wes, error: weError } = await supabase
    .from("workout_exercises")
    .select("id, status")
    .eq("workout_id", workoutId);
  if (weError) throw weError;
  const weIds = (wes ?? []).map((w) => w.id);
  let loggedWeIds = new Set<string>();
  if (weIds.length > 0) {
    const { data: sets, error: setsError } = await supabase
      .from("logged_sets")
      .select("workout_exercise_id")
      .in("workout_exercise_id", weIds);
    if (setsError) throw setsError;
    loggedWeIds = new Set((sets ?? []).map((s) => s.workout_exercise_id));
  }
  // R4: batched + surfaced (the per-row awaits silently discarded their
  // errors, so an exercise could stay `pending` under a completed workout —
  // and the engine reads these statuses as week-N history)
  const notSkipped = (wes ?? []).filter((w) => w.status !== "skipped");
  const completedIds = notSkipped
    .filter((w) => loggedWeIds.has(w.id))
    .map((w) => w.id);
  const skippedIds = notSkipped
    .filter((w) => !loggedWeIds.has(w.id))
    .map((w) => w.id);
  if (completedIds.length > 0) {
    const { error } = await supabase
      .from("workout_exercises")
      .update({ status: "completed" })
      .in("id", completedIds);
    if (error) throw error;
  }
  if (skippedIds.length > 0) {
    const { error } = await supabase
      .from("workout_exercises")
      .update({ status: "skipped" })
      .in("id", skippedIds);
    if (error) throw error;
  }

  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .update({
      status: "completed",
      performed_at: new Date().toISOString(),
      notes,
    })
    .eq("id", workoutId)
    .eq("user_id", userId)
    .select()
    .single();
  if (workoutError) throw workoutError;

  // when the whole week is logged, close the microcycle; the week N→N+1
  // generation job (Phase 4) activates the next one
  const { data: siblings, error: siblingError } = await supabase
    .from("workouts")
    .select("status")
    .eq("microcycle_id", workout.microcycle_id);
  if (siblingError) throw siblingError;
  const allDone = (siblings ?? []).every(
    (w) => w.status === "completed" || w.status === "skipped",
  );
  if (allDone) {
    const { error } = await supabase
      .from("microcycles")
      .update({ status: "completed" })
      .eq("id", workout.microcycle_id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// end early (fig 1.1 options menu, 09 session-5 §9) — skip what's left, then
// close. Logged history is never modified; only still-open planned slots are
// skipped and statuses advance.
// ---------------------------------------------------------------------------

/**
 * End the current workout early: skip every still-open set on every exercise,
 * then run the standard completion path (exercise statuses, microcycle close).
 * Reuses {@link skipRemainingSets} + {@link completeWorkout}; allowed while the
 * workout is planned/in_progress.
 */
export async function endWorkout(
  supabase: Client,
  userId: string,
  workoutId: string,
): Promise<void> {
  const { data: wes, error: weError } = await supabase
    .from("workout_exercises")
    .select("id")
    .eq("workout_id", workoutId);
  if (weError) throw weError;
  for (const we of wes ?? []) {
    await skipRemainingSets(supabase, we.id);
  }
  await completeWorkout(supabase, userId, workoutId, null);
}

/**
 * End a mesocycle early: for every not-yet-finished workout, skip all open
 * sets and close it (completed if anything was logged on it, else skipped),
 * then close every microcycle and mark the mesocycle completed. Logged sets
 * are never touched. No week generation runs — the meso is over.
 */
export async function endMesocycle(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<void> {
  const { data: micros, error: microError } = await supabase
    .from("microcycles")
    .select("id")
    .eq("mesocycle_id", mesoId)
    .eq("user_id", userId);
  if (microError) throw microError;
  const microIds = (micros ?? []).map((m) => m.id);

  if (microIds.length > 0) {
    const { data: workouts, error: wError } = await supabase
      .from("workouts")
      .select("id, status")
      .in("microcycle_id", microIds);
    if (wError) throw wError;

    for (const w of workouts ?? []) {
      if (!isRemainingWorkout(w.status)) continue;

      const { data: wes, error: weError } = await supabase
        .from("workout_exercises")
        .select("id")
        .eq("workout_id", w.id);
      if (weError) throw weError;
      const weIds = (wes ?? []).map((x) => x.id);

      // skip the open slots while the workout is still in_progress, before the
      // status flip (logged_sets/feedback lock on completion, not these)
      for (const id of weIds) {
        await skipRemainingSets(supabase, id);
      }

      let loggedWeIds = new Set<string>();
      if (weIds.length > 0) {
        const { data: sets, error: setsError } = await supabase
          .from("logged_sets")
          .select("workout_exercise_id")
          .in("workout_exercise_id", weIds);
        if (setsError) throw setsError;
        loggedWeIds = new Set((sets ?? []).map((s) => s.workout_exercise_id));
      }
      for (const id of weIds) {
        const { error } = await supabase
          .from("workout_exercises")
          .update({ status: loggedWeIds.has(id) ? "completed" : "skipped" })
          .eq("id", id);
        if (error) throw error;
      }

      const { error: wUpdError } = await supabase
        .from("workouts")
        .update({
          status: endWorkoutStatus(loggedWeIds.size > 0),
          performed_at: new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("user_id", userId);
      if (wUpdError) throw wUpdError;
    }

    const { error: microUpdError } = await supabase
      .from("microcycles")
      .update({ status: "completed" })
      .in("id", microIds)
      .neq("status", "completed");
    if (microUpdError) throw microUpdError;
  }

  const { data: endedMeso, error: mesoUpdError } = await supabase
    .from("mesocycles")
    .update({ status: "completed" })
    .eq("id", mesoId)
    .eq("user_id", userId)
    .select("macrocycle_id")
    .single();
  if (mesoUpdError) throw mesoUpdError;

  // doc 17 §4.1 natural close: ending the macro's last open block closes the
  // macro itself (placeholders don't count as open work)
  await maybeCompleteMacroAfterMeso(supabase, userId, endedMeso.macrocycle_id);
}

// ---------------------------------------------------------------------------
// end a macrocycle (doc 17 §4.1, N40) — the meso closeout family one level up.
// Explicit and irrevocable: every open block is driven terminal (logged work ⇒
// the endMesocycle path, never started ⇒ abandoned), then the macro completes.
// Logged history is never touched (hard rule 5).
// ---------------------------------------------------------------------------

export interface EndMacroResult {
  ok: boolean;
  error?: string;
  /** open mesos closed through the endMesocycle path (had logged work) */
  ended: number;
  /** open mesos + placeholders marked abandoned (never started) */
  abandoned: number;
}

/**
 * End a macrocycle: in position order, every non-terminal meso with logged
 * work is ended via {@link endMesocycle} (open sets skipped, `completed`);
 * never-started mesos and unplanned placeholders go `abandoned`; then the
 * macro goes `completed`. Refused when the macro is already terminal.
 */
export async function endMacrocycle(
  supabase: Client,
  userId: string,
  macroId: string,
): Promise<EndMacroResult> {
  const { data: macro, error: macroError } = await supabase
    .from("macrocycles")
    .select("id, status")
    .eq("id", macroId)
    .eq("user_id", userId)
    .maybeSingle();
  if (macroError) throw macroError;
  if (!macro)
    return { ok: false, error: "Macrocycle not found.", ended: 0, abandoned: 0 };
  if (isTerminalMacroStatus(macro.status))
    return {
      ok: false,
      error: `this macrocycle is already ${macro.status}.`,
      ended: 0,
      abandoned: 0,
    };

  const { data: mesos, error: mesoError } = await supabase
    .from("mesocycles")
    .select("id, status")
    .eq("macrocycle_id", macroId)
    .eq("user_id", userId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at");
  if (mesoError) throw mesoError;

  // which open blocks hold logged work (few open blocks; per-block head count)
  const withLogged = new Set<string>();
  for (const m of mesos ?? []) {
    if (m.status === "completed" || m.status === "abandoned") continue;
    const { count, error } = await supabase
      .from("logged_sets")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("mesocycle_id", m.id);
    if (error) throw error;
    if ((count ?? 0) > 0) withLogged.add(m.id);
  }

  const plan = planEndMacrocycle(
    (mesos ?? []).map((m) => ({ ...m, hasLogged: withLogged.has(m.id) })),
  );
  for (const id of plan.endIds) {
    await endMesocycle(supabase, userId, id);
  }
  if (plan.abandonIds.length > 0) {
    const { error } = await supabase
      .from("mesocycles")
      .update({ status: "abandoned" })
      .in("id", plan.abandonIds)
      .eq("user_id", userId);
    if (error) throw error;
  }

  const { error: macroUpdError } = await supabase
    .from("macrocycles")
    .update({ status: "completed" })
    .eq("id", macroId)
    .eq("user_id", userId);
  if (macroUpdError) throw macroUpdError;

  return { ok: true, ended: plan.endIds.length, abandoned: plan.abandonIds.length };
}

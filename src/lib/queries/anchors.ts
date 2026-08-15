import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recencyWeightedE1rm,
  assumedRir,
  isMeasuringRir,
  coerceLoadType,
  effectiveLoad,
  type EngineParams,
  type E1rmSample,
  type E1rmAnchor,
  type LoadType,
} from "@/lib/engine";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

const DAY_MS = 1000 * 60 * 60 * 24;

// NB (WS-J): we deliberately do NOT add a `performed_at` recency floor here. The
// recency weight (0.5^(ageDays/halflife)) is RELATIVE within an exercise's samples,
// so an exercise last trained months ago still yields a valid (old) anchor the
// predictor uses. A live-data check showed ~56% of (user, exercise) pairs were last
// trained >4 half-lives ago — a floor would drop their anchor entirely, forcing
// cold-start where real data exists (against the "use real data when available"
// ruling).
//
// N88: egress used to be bounded by a global `.limit(600)` on a recency-ordered
// read across the WHOLE batch — which reintroduced that very floor by the back
// door, at a cutoff that moved with batch width. An exercise on a longer rotation
// could have its entire history evicted by its batch-mates' recent sets, read as
// "no history", and seed a blank starting weight (owner's 2026-08-10 meso seed:
// Kneeling Hamstring Curl's newest set ranked 755th of the batch, so all 66 of its
// rows fell outside the cap). The bound is now PER EXERCISE, via the ranked view —
// one lift's rotation can no longer starve another's.
const ANCHOR_SETS_PER_EXERCISE = 40;

/**
 * Recency-weighted strength anchor (e1RM) per exercise (doc 11), powering the
 * live reps predictor — and, with `seed_from_anchor` (§S1, standalone-prescription
 * investigation 2026-06-23), the meso-start seed. Reads the user's recent working
 * sets, resolves each set's RIR through the shared `assumedRir` rule (doc 21 §2:
 * the athlete's reported RIR, else the slot's prescribed target — the doc-11
 * premise demoted to a fallback), and folds them through the pure
 * `recencyWeightedE1rm`. `ageDays` is computed here (query land); the engine stays
 * clock-free.
 *
 * Lives in this leaf module (re-exported from `logging.ts` for existing importers)
 * so both `generation.ts` (seed) and `logging.ts`/`progression.ts` can use it
 * without a generation ↔ logging import cycle.
 */
export async function getExerciseE1rmAnchors(
  supabase: Client,
  userId: string,
  exerciseIds: string[],
  params: EngineParams,
): Promise<Map<string, E1rmAnchor>> {
  const out = new Map<string, E1rmAnchor>();
  if (exerciseIds.length === 0) return out;

  // T-I2: under the bodyweight model the anchor prices on EFFECTIVE load, so a
  // bodyweight set (entered weight 0) anchors on the lifter's bodyweight. Drop the
  // `weight > 0` DB filter so those rows are fetched; the effective load is computed
  // per set below and the junk (effective ≤ 0) is dropped in JS. Off ⇒ exactly the
  // prior query (filter weight > 0, raw weight). `bodyweight` is always selected
  // (a real column post-migration); it is simply unused when the flag is off.
  //
  // N88: reads `v_anchor_candidate_sets`, which ranks each user's candidates
  // WITHIN an exercise, so `set_rank <= N` bounds egress per exercise instead of
  // per call. The view also carries the eligibility filters that used to live
  // here — non-warmup, rep-bearing, and (N3) COMPLETED workouts only — so a rank
  // slot is never spent on a row this function would discard.
  const bwModel = params.bodyweight_model ?? false;
  let query = supabase
    .from("v_anchor_candidate_sets")
    .select(
      "exercise_id, workout_exercise_id, weight, reps, rir_reported, performed_at, bodyweight",
    )
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .lte("set_rank", ANCHOR_SETS_PER_EXERCISE);
  if (!bwModel) query = query.gt("weight", 0);
  // `set_rank` ascends as `performed_at` descends within an exercise, so this is
  // the same newest-first scan the old `.order("performed_at", desc)` gave —
  // which `performedAtBySession` below relies on to resolve a session's date to
  // its newest set rather than to whichever row the planner happened to emit.
  const { data: sets, error } = await query.order("set_rank");
  if (error) throw error;
  if (!sets || sets.length === 0) return out;

  // #4: the target-RIR lookup and (under the bodyweight model) the load-type
  // lookup are independent of each other, so fetch them in one Promise.all
  // rather than serially. `target_rir` is resolved for ALL fetched sets'
  // workout_exercises.
  //
  // N3 (resolves T-A7/T-A8) used to be enforced here by a third read that
  // filtered the fetched sets down to completed workouts. N88 moved that filter
  // INTO `v_anchor_candidate_sets`: prescriptions and predictions still read
  // PREVIOUS COMPLETED workouts only — the in-progress workout's sets post to
  // history live as they're logged, but must NOT feed the anchor, or the first
  // set of the current exercise, if it's the recency-weighted best, makes the
  // session average (one set logged ⇒ that set IS the average) snap every
  // remaining prescription onto it. Enforcing it in the view additionally keeps
  // the live session's sets from consuming per-exercise rank slots, and drops a
  // round-trip here.
  const allWeIds = [...new Set(sets.map((s) => s.workout_exercise_id))];
  const [{ data: wes, error: weError }, exResult] = await Promise.all([
    supabase.from("workout_exercises").select("id, target_rir").in("id", allWeIds),
    bwModel
      ? supabase
          .from("exercises")
          .select("id, load_type, equipment_type")
          .in("id", exerciseIds)
      : Promise.resolve({
          data: null as { id: string; load_type: string | null; equipment_type: string }[] | null,
          error: null,
        }),
  ]);
  if (weError) throw weError;
  if (exResult.error) throw exResult.error;

  // the fallback half of `assumedRir` (doc 21 §2): the parent prescription's
  // target RIR, used where the set carried no reported RIR of its own
  const targetRirByWe = new Map((wes ?? []).map((w) => [w.id, w.target_rir]));

  // T-I2: resolve each exercise's load type so a bodyweight set's effective load
  // (bodyweight ± entered) anchors correctly. Only needed under the flag.
  let loadTypeByEx: Map<string, LoadType> | null = null;
  if (bwModel) {
    loadTypeByEx = new Map(
      (exResult.data ?? []).map((e) => [
        e.id,
        coerceLoadType(e.load_type, e.equipment_type),
      ]),
    );
  }

  const now = Date.now();
  const byExercise = new Map<string, E1rmSample[]>();
  for (const s of sets) {
    // effective load: raw entered weight (external / flag off), or bodyweight ±
    // entered under the bodyweight model. Skip sets with no usable load (effective
    // ≤ 0 — e.g. a bodyweight lift with no captured bodyweight, or junk 0 entries).
    let load = s.weight;
    if (bwModel && loadTypeByEx) {
      const lt = loadTypeByEx.get(s.exercise_id) ?? "external";
      const eff = effectiveLoad(lt, s.weight, s.bodyweight ?? null);
      if (eff == null || eff <= 0) continue;
      load = eff;
    }
    const ageDays = Math.max(
      0,
      (now - new Date(s.performed_at).getTime()) / DAY_MS,
    );
    // doc 21 §2: the ONE resolution rule, shared with the stamp site and the
    // compliance marker (`rir_reported ?? the slot's prescribed target_rir`)
    const rir = assumedRir(
      s.rir_reported,
      targetRirByWe.get(s.workout_exercise_id),
    );
    // doc 21 §6.1: past the measuring band the set is not a measurement, so it
    // is dropped from the anchor rather than fed in at a fabricated e1RM. The
    // consequence is deliberate: during a deep back-off the anchor FREEZES at
    // its last measured value instead of drifting on fictional data — a stale
    // honest anchor beats a fabricated one, and the return ramp is the coach's
    // job (§4.2). A backed-off set INSIDE the band still anchors: it is
    // RIR-adjusted and therefore comparable, and excluding it would make the
    // return prescription jump straight back to full load.
    if (!isMeasuringRir(rir, params.e1rm)) continue;
    const sample: E1rmSample = {
      weight: load,
      reps: s.reps,
      targetRir: rir,
      ageDays,
      // session = one exercise on one day (doc 13 §9.3 session_best anchor)
      sessionKey: s.workout_exercise_id,
    };
    const cur = byExercise.get(s.exercise_id) ?? [];
    cur.push(sample);
    byExercise.set(s.exercise_id, cur);
  }

  // N45: resolve the winning set's timestamp for the anchor's provenance —
  // sessionKey is the workout_exercise_id, and every set in a session shares a
  // day, so the session's newest performed_at is the coordinate's date.
  const performedAtBySession = new Map<string, string>();
  for (const s of sets) {
    if (!performedAtBySession.has(s.workout_exercise_id)) {
      performedAtBySession.set(s.workout_exercise_id, s.performed_at);
    }
  }

  for (const [exerciseId, samples] of byExercise) {
    const anchor = recencyWeightedE1rm(samples, params);
    if (!anchor) continue;
    if (anchor.source?.sessionKey) {
      anchor.source.performedAt =
        performedAtBySession.get(anchor.source.sessionKey) ?? null;
    }
    out.set(exerciseId, anchor);
  }
  return out;
}

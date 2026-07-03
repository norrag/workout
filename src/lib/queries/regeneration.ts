import type { SupabaseClient } from "@supabase/supabase-js";
import {
  engineInputsSchema,
  prescribe,
  resolveEffectiveParams,
  rirRamp,
  seedMeso,
  toEngineEquipment,
  volumeCountingWeights,
  type E1rmAnchor,
  type EngineInputs,
  type EngineParams,
  type ExerciseParamOverride,
  type Prescription,
} from "@/lib/engine";
import { getMuscleRoleIdsForExercises } from "./exercises";
import type { Database, EngineDecisionKind } from "@/lib/types/database";
import { getExerciseE1rmAnchors } from "./logging";
import { getActiveEngineParams } from "./generation";
import { getExerciseParamOverrides } from "./exercise-overrides";
import {
  catchUpMesoGeneration,
  buildEngineInputs,
  weeklySetsByGroup,
  peakByExercise,
} from "./progression";
import { getMesoPlan } from "./cycles";
import { createServiceClient } from "@/lib/supabase/service";
import { reportError } from "@/lib/observability/report";
import { engineGoal } from "./engine-goal";
import { engineCodeSha, hashParams } from "./params-provenance";
import type {
  ExerciseFeedbackRow,
  LoggedSetRow,
  WorkoutExerciseRow,
  WorkoutFeedbackRow,
} from "@/lib/types/database";
import {
  buildConfigInputs,
  computeDepFingerprint,
  paramsTokenFor,
  seedEngineInputs,
  type ConfigInputs,
  type SeedPeak,
} from "./fingerprint";
import type { MacroGoalType } from "@/lib/types/database";

/**
 * Prescription freshness reconcile (doc 14) — the single "keep stored
 * prescriptions correct" operation, run on the read path.
 *
 * A prescription is a cached derived value: the output of the pure engine, frozen
 * at a meso seed or a week N→N+1 advance, then displayed for days. It goes stale
 * the instant any input that fed it changes (engine params, profile, macro goal,
 * meso config, the upstream week's prescription). Rather than make each source
 * hunt down and flag the rows it affects, every prescription carries a fingerprint
 * of the CONFIG projection of its inputs (doc 14 §3); on read we re-resolve those
 * inputs as they are NOW and compare. A mismatch means stale, and exactly the
 * diverged rows recompute — lazily, in week order, lightly (a hash compare).
 *
 * This supersedes the single-scalar `params_version` staleness gate (doc 14 §9):
 * the params version is now just one component of the fingerprint, and the
 * fingerprint additionally sees every other config input the engine consumes.
 *
 * Scope / invariants (CLAUDE.md hard rules):
 *   - #5 immutable history: only `planned` workouts, only `workout_exercises`
 *     with NO logged set, are ever rewritten; logged sets and manual `set_weights`
 *     overrides are untouched.
 *   - #4 service-role scoping: the caller passes a service client; every read and
 *     write is scoped to the row's own server-derived owner, never a tool arg.
 *   - #3 engine purity: all resolution + hashing live here; the engine still takes
 *     one resolved `EngineInputs` + `EngineParams`.
 */

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// pure recompute core (unit-tested; doc 14 §6.1) — replay the row's stored
// derived inputs through the engine with the LIVE config overlaid + a refreshed
// strength anchor, then classify the outcome. This is the reshaped core of the
// old plan/applyRegeneration (doc 14 §10): same replay→classify→write, now keyed
// on the dependency fingerprint instead of a params-version diff.
// ---------------------------------------------------------------------------

/**
 * Pure: the lookup key for a decision-less open row's advance source — its
 * week-(N-1) same-day, same-exercise counterpart (doc 14 §7c). Returns null in
 * week 1, which has no prior week to advance from and so is a genuine cold-start
 * seed. The format matches the `${week}:${day}:${exerciseId}` index built over
 * the meso's completed workout_exercises, so a hit there IS the source row.
 */
export function advanceSourceKey(
  weekNumber: number,
  dayNumber: number,
  exerciseId: string,
): string | null {
  return weekNumber <= 1 ? null : `${weekNumber - 1}:${dayNumber}:${exerciseId}`;
}

export type RecomputeStatus = "changed" | "unchanged" | "invalid_source";

export interface RecomputeArgs {
  /** which engine produced the row — selects the replay entry (doc 14 §6.2) */
  kind: EngineDecisionKind;
  /** the diverged row's latest decision inputs (source of the derived history) */
  storedInputs: Record<string, unknown>;
  /** the freshly-resolved config inputs (live equipment/profile/goal/week/previous) */
  liveConfig: ConfigInputs;
  /** the strength anchor recomputed from current logged history (advance only) */
  anchor: E1rmAnchor | null;
  /** T-I2: the lifter's current bodyweight, refreshed from the live profile on
   *  recompute (a derived input, like the anchor) */
  bodyweight: number | null;
  /** the row's current stored prescription, for diffing */
  currentOutput: Pick<Prescription, "weight" | "reps" | "sets" | "targetRir">;
}

export interface RecomputeResult {
  status: RecomputeStatus;
  /** the rebuilt inputs that produced `output` (present unless invalid_source) */
  inputs?: EngineInputs;
  /** the freshly computed prescription (present unless invalid_source) */
  output?: Prescription;
}

const PRESCRIPTION_FIELDS = ["weight", "reps", "sets", "targetRir"] as const;

/** Did the engine output diverge from the stored prescription? (ignores prose) */
function prescriptionChanged(
  stored: RecomputeArgs["currentOutput"],
  fresh: Pick<Prescription, "weight" | "reps" | "sets" | "targetRir">,
): boolean {
  return PRESCRIPTION_FIELDS.some(
    (f) => JSON.stringify(stored[f]) !== JSON.stringify(fresh[f]),
  );
}

/**
 * Pure: recompute a diverged row by replaying the engine of its `kind` (doc 14
 * §6.2) with the live config overlaid, and report whether the prescription
 * changed. No I/O — same inputs + params ⇒ same plan, so it is unit-tested
 * directly (hard rule #3). Dispatches on `kind`:
 *   - "advance" → `prescribe`, with the row's immutable stored derived history
 *     (`storedInputs`) and a freshly refreshed strength anchor.
 *   - "seed"    → `seedMeso`, with the row's frozen cold-start basis (its prior
 *     peak, stored in `weekPeak`) and the live config (initial defaults, week RIR).
 */
export function recomputeRow(
  args: RecomputeArgs,
  params: EngineParams,
): RecomputeResult {
  return args.kind === "seed"
    ? recomputeSeed(args, params)
    : recomputeAdvance(args, params);
}

/**
 * Advance replay. Reusing the stored derived inputs is correct (doc 14 §6.4): an
 * open prescription's `previous` and derived inputs come from immutable, completed
 * work that doesn't drift mid-view. Overlaying the live config is what makes a
 * profile / goal / meso / params / upstream-week change take effect; refreshing
 * the anchor is what makes a config-triggered recompute also pick up the latest
 * history.
 */
function recomputeAdvance(
  args: RecomputeArgs,
  params: EngineParams,
): RecomputeResult {
  const rebuilt = {
    ...args.storedInputs,
    ...args.liveConfig,
    strengthAnchor: args.anchor,
    bodyweight: args.bodyweight,
  };
  const parsed = engineInputsSchema.safeParse(rebuilt);
  if (!parsed.success) return { status: "invalid_source" };

  let output: Prescription;
  try {
    output = prescribe(parsed.data, params);
  } catch {
    return { status: "invalid_source" };
  }

  return {
    status: prescriptionChanged(args.currentOutput, output)
      ? "changed"
      : "unchanged",
    inputs: parsed.data,
    output,
  };
}

/**
 * Seed replay (doc 14 §6.2). A cold start has no completed source week to refresh
 * from, so we overlay the LIVE config (equipment / profile / goal / week RIR /
 * plan initial defaults / params) onto the row's FROZEN derived basis — its prior
 * peak, captured in `weekPeak` at seed time — and re-run `seedMeso`. This makes a
 * units / params / RIR / equipment change take effect on a not-yet-started seed
 * while leaving its prior-peak basis stable (it predates the meso; doc 14 §6.4).
 */
function recomputeSeed(
  args: RecomputeArgs,
  params: EngineParams,
): RecomputeResult {
  const cfg = args.liveConfig;
  const storedPeak = (args.storedInputs.weekPeak ?? null) as
    | { weight: number | null; reps: number | null; sets: number }
    | null;
  const priorPeak: SeedPeak | null = storedPeak
    ? { weight: storedPeak.weight, reps: storedPeak.reps, sets: storedPeak.sets }
    : null;

  let output: Prescription;
  try {
    output = seedMeso(
      priorPeak,
      cfg.initial,
      cfg.exercise,
      cfg.user,
      cfg.week.targetRir,
      params,
      // §S1: the anchor (refreshed from live history by the reconcile) drives the
      // anchor-aware seed when seed_from_anchor is active; ignored otherwise.
      // T-I2: bodyweight drives the bodyweight model when active.
      { goalType: cfg.goalType, anchor: args.anchor, bodyweight: args.bodyweight },
    );
  } catch {
    return { status: "invalid_source" };
  }

  return {
    status: prescriptionChanged(args.currentOutput, output)
      ? "changed"
      : "unchanged",
    inputs: seedEngineInputs(cfg, priorPeak, args.anchor, args.bodyweight),
    output,
  };
}

// ---------------------------------------------------------------------------
// read-path reconcile
// ---------------------------------------------------------------------------

export interface ReconcileResult {
  /** missing days created from a completed previous-week counterpart */
  generated: number;
  /** stale prescriptions whose recompute changed the prescribed numbers */
  refreshed: number;
}

/** A planned, not-yet-started prescription row + the cycle context to check it. */
interface OpenRow {
  id: string;
  workoutId: string;
  exerciseId: string;
  microcycleId: string;
  weekNumber: number;
  dayNumber: number;
  targetRir: number;
  isDeload: boolean;
  currentOutput: Pick<Prescription, "weight" | "reps" | "sets" | "targetRir">;
  depFingerprint: string | null;
  /** the version this row currently advertises as verified-accurate (doc 14 stamp) */
  paramsVersion: number | null;
}

export interface LatestDecision {
  id: string;
  kind: EngineDecisionKind;
  sourceWorkoutExerciseId: string | null;
  inputs: Record<string, unknown>;
}

/** One page of the decision columns the reconcile needs (newest first). */
export interface DecisionPageRow {
  id: string;
  workout_exercise_id: string | null;
  source_workout_exercise_id: string | null;
  kind: EngineDecisionKind;
  inputs: Record<string, unknown>;
}

/**
 * Latest decision per open row, fetched in fixed-size pages (R11). The old
 * unbounded fetch silently truncated at the PostgREST `max-rows` cap (1000);
 * decisions accumulate per row per recompute, so past the cap the OLDEST rows
 * dropped — an open row whose only decision was old was misclassified
 * decision-less and backfilled as a fresh seed off the prior-meso peak,
 * discarding its real in-meso progression. Pages must arrive in a STABLE total
 * order (created_at desc, id desc — created_at alone ties within a batch
 * insert) so offset pagination neither skips nor duplicates rows; the loop
 * stops early once every open row has its newest decision, or when a short
 * page says the set is exhausted.
 */
export async function latestDecisionsByRow(
  fetchPage: (from: number, to: number) => Promise<DecisionPageRow[]>,
  openRowIds: readonly string[],
  pageSize = 1000,
): Promise<Map<string, LatestDecision>> {
  const latest = new Map<string, LatestDecision>();
  const wanted = new Set(openRowIds);
  for (let from = 0; latest.size < wanted.size; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    for (const d of page) {
      if (
        d.workout_exercise_id &&
        wanted.has(d.workout_exercise_id) &&
        !latest.has(d.workout_exercise_id)
      ) {
        latest.set(d.workout_exercise_id, {
          id: d.id,
          kind: d.kind,
          sourceWorkoutExerciseId: d.source_workout_exercise_id,
          inputs: d.inputs,
        });
      }
    }
    if (page.length < pageSize) break;
  }
  return latest;
}

/** Recording-time provenance for a recomputed decision (doc 14 §6.1 step 4): the
 *  doc-11 RIR-fallback record, the engine build, and WHY the row recomputed —
 *  the fingerprint transition plus the resolved dependency component values. */
function recomputeProvenance(
  inputs: EngineInputs,
  liveConfig: ConfigInputs,
  codeSha: string | null,
  fromFingerprint: string | null,
  toFingerprint: string,
  incrementOverride: number | null,
): Record<string, unknown> {
  const working = inputs.actualSets.filter((s) => !s.isWarmup);
  const assumed = working.filter((s) => s.rirReported == null).length;
  return {
    code_sha: codeSha,
    rir_fallback: {
      rule: "null rir_reported assumed at the prescribed target RIR (doc 11)",
      working_sets: working.length,
      sets_assumed: assumed,
      applied: assumed > 0,
    },
    recomputed: {
      reason: "dependency fingerprint changed",
      from_fingerprint: fromFingerprint,
      to_fingerprint: toFingerprint,
      // the resolved dependency component values that fed the new fingerprint, so
      // explain_prescription can show what input changed on a recompute (doc 14 §4)
      dependencies: {
        equipmentType: liveConfig.exercise.equipmentType,
        experienceLevel: liveConfig.user.experienceLevel,
        goalType: liveConfig.goalType,
        week: liveConfig.week,
        previous: liveConfig.previous,
        // per-user×exercise increment override folded into effective params
        // (doc 14 phase 3); null = engine default
        incrementOverride,
      },
    },
  };
}

/**
 * Live-resolve each UNLOGGED week's target RIR from the active params' ramp
 * (doc 14 freshness). The working-week ramp (`rir_start`→`rir_end`) and the deload
 * RIR (`params.deload.target_rir`) are *config* inputs, but they were frozen onto
 * the microcycle row at meso-build time — so tuning `deload.target_rir` (or editing
 * the meso's RIR ramp) never reached an existing meso's still-planned weeks: the
 * freshness check recomputed the prescription numbers but re-read the stale stored
 * RIR. Re-derive the live ramp here and return the microcycles whose stored RIR
 * drifted. A microcycle is only refreshed when it has NOT been started — every one
 * of its workouts is still `planned` (a started/completed week is the intensity the
 * user actually trained; never rewrite it, hard rule #5). Pure; the caller persists
 * the returned rows and feeds the corrected RIR into the freshness pass so the
 * affected prescriptions go stale and recompute at the new RIR.
 */
export function liveWeekRirUpdates(
  micros: { id: string; week_number: number; target_rir: number }[],
  startedMicroIds: Set<string>,
  meso: {
    weeks: number;
    includes_deload: boolean;
    rir_start: number;
    rir_end: number;
  },
  params: EngineParams,
): { id: string; target_rir: number }[] {
  let ramp;
  try {
    ramp = rirRamp(
      meso.weeks,
      meso.includes_deload,
      meso.rir_start,
      meso.rir_end,
      params,
    );
  } catch {
    // a meso with out-of-range weeks/RIR shouldn't exist (validated at creation),
    // but never break the reconcile over it — leave the stored RIRs untouched.
    return [];
  }
  const liveByWeek = new Map(ramp.map((w) => [w.weekNumber, w.targetRir]));
  const updates: { id: string; target_rir: number }[] = [];
  for (const m of micros) {
    if (startedMicroIds.has(m.id)) continue; // started/logged week — never touch
    const live = liveByWeek.get(m.week_number);
    if (live != null && live !== m.target_rir) {
      updates.push({ id: m.id, target_rir: live });
    }
  }
  return updates;
}

/**
 * The meso-global inputs whose change could make ANY prescription in the meso
 * stale (WS-J #1 reconcile gate). Each maps to a dependency-fingerprint input
 * (`fingerprint.ts` / `paramsTokenFor`); a coarse watermark (count + latest
 * `updated_at`) only ever OVER-triggers a reconcile, never under — so the gate
 * cannot miss a genuinely stale row. Hashed into `mesocycles.last_reconcile_sig`.
 */
interface MesoStaleInputs {
  /** active engine_params version */
  paramsVersion: number;
  /** meso RIR ramp + length → `week.targetRir` / `isDeload` in the fingerprint */
  rirStart: number;
  rirEnd: number;
  weeks: number;
  includesDeload: boolean;
  /** macro `goal_type` (fingerprint goal); null for a standalone meso */
  goalType: string | null;
  /** profile experience level (fingerprint config). Deliberately NOT a coarse
   *  `profiles.updated_at` — bodyweight edits are frequent and fingerprint-irrelevant. */
  experienceLevel: string | null;
  /** per-user override watermark: count + latest `updated_at` catches add/edit/delete */
  overrideCount: number;
  overrideLatest: string | null;
  /** exercise-library watermark (equipment/load_type edits — rare; global) */
  exerciseLatest: string | null;
  /** completed-work watermark, split in two (N12): prescriptions depend only on
   *  CLOSED sessions (N3 — an active workout never feeds a prescription), so the
   *  timestamp side watches completed/skipped rows only. Watching every row's
   *  `updated_at` made the first set of each session bust the gate — its own
   *  `in_progress` flip bumped the watermark, so that log paid the full reconcile.
   *  `workoutCount` still spans ALL rows: generation / plan edits add or remove
   *  planned rows without closing anything, and count catches those. */
  workoutCount: number;
  closedWorkoutLatest: string | null;
}

/** Stable signature of the meso-stale inputs (sha256 of canonical JSON). Pure, so
 *  the conservatism test can assert each input is captured. */
export function mesoStaleSignature(inputs: MesoStaleInputs): string {
  return hashParams(inputs);
}

/** Load the meso-stale inputs with a handful of cheap, indexed reads (two
 *  round-trips) — far cheaper than the full reconcile this gates. */
async function loadMesoStaleInputs(
  service: Client,
  userId: string,
  mesoId: string,
  paramsVersion: number,
): Promise<MesoStaleInputs> {
  const [mesoRes, profileRes, overrideRes, exerciseRes, microRes] =
    await Promise.all([
      service
        .from("mesocycles")
        .select("rir_start, rir_end, weeks, includes_deload, macrocycle_id")
        .eq("id", mesoId)
        .eq("user_id", userId)
        .single(),
      service.from("profiles").select("experience_level").eq("id", userId).single(),
      service
        .from("exercise_param_overrides")
        .select("updated_at", { count: "exact" })
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1),
      service
        .from("exercises")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1),
      service
        .from("microcycles")
        .select("id")
        .eq("mesocycle_id", mesoId)
        .eq("user_id", userId),
    ]);
  if (mesoRes.error) throw mesoRes.error;
  if (profileRes.error) throw profileRes.error;
  if (overrideRes.error) throw overrideRes.error;
  if (exerciseRes.error) throw exerciseRes.error;
  if (microRes.error) throw microRes.error;

  const microIds = (microRes.data ?? []).map((m) => m.id);
  const [macroRes, workoutCountRes, closedRes] = await Promise.all([
    mesoRes.data.macrocycle_id
      ? service
          .from("macrocycles")
          .select("goal_type")
          .eq("id", mesoRes.data.macrocycle_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { goal_type: string } | null, error: null }),
    microIds.length > 0
      ? service
          .from("workouts")
          .select("id", { count: "exact", head: true })
          .in("microcycle_id", microIds)
          .eq("user_id", userId)
      : Promise.resolve({ count: 0, error: null }),
    // closed sessions only (N12): the first-set `in_progress` flip must not move
    // this watermark — only a completion/skip changes any prescription input
    microIds.length > 0
      ? service
          .from("workouts")
          .select("updated_at")
          .in("microcycle_id", microIds)
          .eq("user_id", userId)
          .in("status", ["completed", "skipped"])
          .order("updated_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as { updated_at: string }[], error: null }),
  ]);
  if (macroRes.error) throw macroRes.error;
  if (workoutCountRes.error) throw workoutCountRes.error;
  if (closedRes.error) throw closedRes.error;

  return {
    paramsVersion,
    rirStart: mesoRes.data.rir_start,
    rirEnd: mesoRes.data.rir_end,
    weeks: mesoRes.data.weeks,
    includesDeload: mesoRes.data.includes_deload,
    goalType: macroRes.data?.goal_type ?? null,
    experienceLevel: profileRes.data?.experience_level ?? null,
    overrideCount: overrideRes.count ?? 0,
    overrideLatest: overrideRes.data?.[0]?.updated_at ?? null,
    exerciseLatest: exerciseRes.data?.[0]?.updated_at ?? null,
    workoutCount: workoutCountRes.count ?? 0,
    closedWorkoutLatest: closedRes.data?.[0]?.updated_at ?? null,
  };
}

/**
 * Bring a user's meso's stored prescriptions in line with their current inputs,
 * transparently and on demand. Two halves of one read-path job (doc 14 §10):
 *   1. heal generation gaps — create any missing day whose previous-week
 *      counterpart is complete (`catchUpMesoGeneration`); a SEPARATE concern the
 *      freshness framework does not cover, kept here.
 *   2. refresh freshness — for each open prescription with a recorded decision,
 *      re-resolve its config inputs, hash, and compare to the stored fingerprint;
 *      recompute exactly the rows that diverged, in week order so a changed
 *      `previous` propagates to the next week within the one pass.
 *
 * Lazy + idempotent: nothing recomputes until a row's inputs actually differ;
 * after a recompute the row carries the current fingerprint, so the next read
 * matches and short-circuits. Never touches started/completed workouts, logged
 * sets, or manual `set_weights` overrides.
 *
 * Both advance and seed rows participate (doc 14 §6.2): each carries a decision
 * tagged with its `kind`, and recompute replays the matching engine (`prescribe`
 * for an advance, `seedMeso` for a seed). A row that still has no decision (a seed
 * written before phase 2, or whose best-effort decision write failed) is skipped,
 * exactly as before.
 */
export async function reconcilePrescriptions(
  service: Client,
  userId: string,
  mesoId: string,
  activeParams?: { version: number; params: EngineParams },
): Promise<ReconcileResult> {
  // active engine params: reuse the caller's already-resolved value when given
  // (the page resolves it once for the predictor — avoids a duplicate read on the
  // hot path, #8). The active row is global, so it's identical to a service read.
  const { version, params } = activeParams ?? (await getActiveEngineParams(service));

  // #1 reconcile gate: if no meso-global input that feeds a dependency fingerprint
  // has changed since the last successful reconcile, no row can be stale and no
  // generation gap can have opened (a gap only opens when a workout closes, which
  // moves the completed-work watermark) — so skip the whole pass. A null/absent
  // stamp or any change falls through to the full reconcile, which re-stamps. The
  // gate is ~2 cheap round-trips vs. the full pass's ~8-10.
  const staleSig = mesoStaleSignature(
    await loadMesoStaleInputs(service, userId, mesoId, version),
  );
  const { data: mesoStamp, error: stampError } = await service
    .from("mesocycles")
    .select("last_reconcile_sig")
    .eq("id", mesoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (stampError) throw stampError;
  if (mesoStamp?.last_reconcile_sig === staleSig) {
    return { generated: 0, refreshed: 0 };
  }

  // 1. heal generation gaps first; freshly generated days are stamped current, so
  //    the freshness pass below sees them as fresh.
  const generated = await catchUpMesoGeneration(service, userId, mesoId);

  // 2. the meso's weeks (target RIR / deload per week)
  const { data: micros, error: microsError } = await service
    .from("microcycles")
    .select("id, week_number, target_rir, is_deload")
    .eq("mesocycle_id", mesoId)
    .eq("user_id", userId);
  if (microsError) throw microsError;
  if (!micros || micros.length === 0) return { generated, refreshed: 0 };
  const microById = new Map(micros.map((m) => [m.id, m]));
  const microIds = micros.map((m) => m.id);

  // 3. ALL the meso's workouts (planned + completed — completed rows are the
  //    `previous` sources for later weeks)
  const { data: workouts, error: workoutsError } = await service
    .from("workouts")
    .select("id, microcycle_id, day_number, status")
    .in("microcycle_id", microIds)
    .eq("user_id", userId);
  if (workoutsError) throw workoutsError;
  if (!workouts || workouts.length === 0) return { generated, refreshed: 0 };
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const plannedWorkoutIds = new Set(
    workouts.filter((w) => w.status === "planned").map((w) => w.id),
  );

  // 3b. live-resolve each UNLOGGED week's target RIR from the active params' ramp
  //     (doc 14 freshness): the working ramp + deload RIR are config inputs that
  //     were frozen onto the microcycle at build time, so tuning them never reached
  //     existing planned weeks. A microcycle is started (untouchable) if ANY of its
  //     workouts is past `planned`; otherwise refresh its stored RIR to the live
  //     ramp and let the freshness pass below recompute the affected rows. Persist
  //     before building `livePrescribed`/`rows` so they read the corrected RIR.
  const startedMicroIds = new Set(
    workouts.filter((w) => w.status !== "planned").map((w) => w.microcycle_id),
  );
  const { data: mesoConfig, error: mesoConfigError } = await service
    .from("mesocycles")
    .select("weeks, includes_deload, rir_start, rir_end")
    .eq("id", mesoId)
    .single();
  if (mesoConfigError) throw mesoConfigError;
  const rirUpdates = liveWeekRirUpdates(
    micros,
    startedMicroIds,
    mesoConfig,
    params,
  );
  for (const u of rirUpdates) {
    const { error: rirError } = await service
      .from("microcycles")
      .update({ target_rir: u.target_rir })
      .eq("id", u.id)
      .eq("user_id", userId);
    if (rirError) throw rirError;
    const m = microById.get(u.id);
    if (m) m.target_rir = u.target_rir; // downstream reads the corrected value
  }

  // 4. ALL the meso's workout_exercises (need completed sources for `previous`)
  const { data: wes, error: wesError } = await service
    .from("workout_exercises")
    .select(
      "id, workout_id, exercise_id, muscle_group_id, status, prescribed_weight, prescribed_reps, prescribed_sets, target_rir, dep_fingerprint, params_version",
    )
    .in("workout_id", [...workoutById.keys()]);
  if (wesError) throw wesError;
  if (!wes || wes.length === 0) return { generated, refreshed: 0 };

  // live prescribed map for `previous` resolution + week-order propagation
  const livePrescribed = new Map<
    string,
    Pick<Prescription, "weight" | "reps" | "sets" | "targetRir">
  >();
  for (const we of wes) {
    const workout = workoutById.get(we.workout_id);
    const micro = workout ? microById.get(workout.microcycle_id) : undefined;
    livePrescribed.set(we.id, {
      weight: we.prescribed_weight,
      reps: we.prescribed_reps,
      sets: we.prescribed_sets ?? 1,
      targetRir: we.target_rir ?? micro?.target_rir ?? 0,
    });
  }

  // the open (planned) rows we may rewrite
  const openWes = wes.filter((we) => plannedWorkoutIds.has(we.workout_id));
  if (openWes.length === 0) return { generated, refreshed: 0 };
  const openWeIds = openWes.map((we) => we.id);

  // 5. exclude any open row that already has a logged set (defensive — a planned
  //    workout should have none, but never re-prescribe over started work)
  const { data: logged, error: loggedError } = await service
    .from("logged_sets")
    .select("workout_exercise_id")
    .in("workout_exercise_id", openWeIds);
  if (loggedError) throw loggedError;
  const loggedWeIds = new Set((logged ?? []).map((s) => s.workout_exercise_id));

  // 6. latest decision per open row (kind + source pointer + stored inputs),
  //    paged in a stable order so the PostgREST row cap can never truncate the
  //    set (R11). A row with none is a pre-phase-2 seed → backfilled below.
  const latestByWe = await latestDecisionsByRow(async (from, to) => {
    const { data, error } = await service
      .from("engine_decisions")
      .select("id, workout_exercise_id, source_workout_exercise_id, kind, inputs")
      .in("workout_exercise_id", openWeIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as DecisionPageRow[];
  }, openWeIds);

  // 7. config dimensions resolved once: profile, macro goal, equipment per exercise
  const [{ data: profile, error: profileError }, mesoGoal] = await Promise.all([
    service.from("profiles").select("*").eq("id", userId).single(),
    resolveMesoGoal(service, mesoId),
  ]);
  if (profileError) throw profileError;
  const goal = engineGoal(mesoGoal);

  const exerciseIds = [...new Set(openWes.map((we) => we.exercise_id))];
  const [{ data: exercises, error: exError }, overrideByExercise] = await Promise.all([
    exerciseIds.length > 0
      ? service.from("exercises").select("id, equipment_type").in("id", exerciseIds)
      : Promise.resolve({ data: [] as { id: string; equipment_type: string }[], error: null }),
    // per-user×exercise increment overrides (doc 14 phase 3): one indexed read,
    // folded into each row's fingerprint token so an increment edit goes stale
    // for exactly that exercise's open rows (the scope falls out of the hash, §7).
    getExerciseParamOverrides(service, userId, exerciseIds),
  ]);
  if (exError) throw exError;
  const equipmentById = new Map(
    (exercises ?? []).map((e) => [e.id, e.equipment_type]),
  );

  // assemble the open rows with their cycle context, in week → day → position
  // order. A row WITHOUT a decision is no longer dropped (doc 14 §6.2/§6.3): a
  // pre-phase-2 seed, or one whose best-effort decision write failed, used to be
  // skipped forever — so a bypassed/un-logged planned day (e.g. a week the user
  // jumped over) could never be brought current by ANY input change. It is now
  // backfilled as a seed below from the live plan + prior peak, then participates
  // exactly like every other row. (Logged rows are still excluded, hard rule #5.)
  const rows: OpenRow[] = openWes
    .filter((we) => !loggedWeIds.has(we.id))
    .map((we) => {
      const workout = workoutById.get(we.workout_id)!;
      const micro = microById.get(workout.microcycle_id)!;
      return {
        id: we.id,
        workoutId: we.workout_id,
        exerciseId: we.exercise_id,
        microcycleId: workout.microcycle_id,
        weekNumber: micro.week_number,
        dayNumber: workout.day_number,
        targetRir: micro.target_rir,
        isDeload: micro.is_deload,
        currentOutput: {
          weight: we.prescribed_weight,
          reps: we.prescribed_reps,
          sets: we.prescribed_sets ?? 1,
          targetRir: we.target_rir ?? micro.target_rir,
        },
        depFingerprint: we.dep_fingerprint,
        paramsVersion: we.params_version,
      };
    })
    .sort((a, b) => a.weekNumber - b.weekNumber || a.dayNumber - b.dayNumber);

  if (rows.length === 0) return { generated, refreshed: 0 };

  // 7b. seed-backfill basis for any open row with NO decision (a pre-phase-2 seed,
  //     or one whose best-effort decision write failed). Such a row can't replay a
  //     stored decision, so we reconstruct a cold-start seed from the LIVE plan
  //     defaults (`meso_exercises.initial_*`) + the user's prior peak
  //     (`v_exercise_prs`) — exactly what generation seeds from — and run it
  //     through `seedMeso` (doc 14 §6.2/§6.3). Resolved once, only when needed.
  const decisionlessRows = rows.filter((r) => !latestByWe.has(r.id));
  let initialByDayExercise: Map<string, ConfigInputs["initial"]> | null = null;
  let prByExercise: Map<
    string,
    { best_weight: number | null; best_reps: number | null }
  > | null = null;
  if (decisionlessRows.length > 0) {
    const [plan, { data: prs, error: prError }] = await Promise.all([
      getMesoPlan(service, mesoId),
      service
        .from("v_exercise_prs")
        .select("exercise_id, best_weight, best_reps")
        .eq("user_id", userId),
    ]);
    if (prError) throw prError;
    initialByDayExercise = new Map();
    for (const day of plan?.days ?? []) {
      for (const group of day.groups) {
        for (const fill of group.fills) {
          const key = `${day.day_number}::${fill.exercise_id}`;
          // first fill wins for a duplicated exercise in a day (cold-start
          // defaults match); the prior peak, not `initial`, drives the number.
          if (!initialByDayExercise.has(key)) {
            initialByDayExercise.set(key, {
              weight: fill.initial_weight,
              reps: fill.initial_reps,
              sets: fill.initial_sets,
            });
          }
        }
      }
    }
    prByExercise = new Map(
      (prs ?? []).map((p) => [
        p.exercise_id,
        { best_weight: p.best_weight, best_reps: p.best_reps },
      ]),
    );
  }

  // 7c. advance-backfill basis. A decision-less open row in week N (>1) whose
  //     week-(N-1) same-day, same-exercise counterpart is COMPLETED is NOT a cold
  //     start: it is an advance the generation flow never recorded — e.g. a
  //     planned day imported into the MIDDLE of imported history, which the
  //     generation gap-heal skips (the day already exists) and per-completion
  //     advance never reaches (its prior-week sibling pre-existed, so no day was
  //     "missing"). Seeding such a row (§7b) reprices it off the prior-MESO peak
  //     and discards the in-meso week N-1 → N progression. Instead we rebuild its
  //     ADVANCE inputs from the completed counterpart's logged work, exactly like
  //     `generateDay`, so the recompute progresses the real prior week. Resolved
  //     once, only when at least one decision-less row has such a counterpart.
  const completedWeByKey = new Map<string, (typeof wes)[number]>();
  for (const we of wes) {
    const w = workoutById.get(we.workout_id);
    const mc = w ? microById.get(w.microcycle_id) : undefined;
    if (!w || !mc) continue;
    if (w.status === "completed" || w.status === "skipped") {
      completedWeByKey.set(`${mc.week_number}:${w.day_number}:${we.exercise_id}`, we);
    }
  }
  const advanceSourceByRow = new Map<string, (typeof wes)[number]>();
  for (const r of decisionlessRows) {
    const key = advanceSourceKey(r.weekNumber, r.dayNumber, r.exerciseId);
    const src = key ? completedWeByKey.get(key) : undefined;
    if (src) advanceSourceByRow.set(r.id, src);
  }

  // pre-build the advance inputs (the engine's derived history) for those rows,
  // mirroring generateDay's per-exercise assembly: the counterpart's logged sets,
  // its joint-pain feedback + the group-closing pump/workload, the source
  // workout's session feedback, the source week's planned weekly sets, and the
  // heaviest meso prescription so far. The strength anchor is left null here and
  // applied by the recompute (it refreshes anchors itself, doc 14 §6.1) — and it
  // is a derived input, excluded from the fingerprint, so this never desyncs the
  // freshness check.
  const advanceInputsByRow = new Map<string, EngineInputs>();
  if (advanceSourceByRow.size > 0) {
    const sourceWorkoutIds = new Set(
      [...advanceSourceByRow.values()].map((s) => s.workout_id),
    );
    const sourceWes = wes.filter((we) => sourceWorkoutIds.has(we.workout_id));
    const sourceWeIds = sourceWes.map((we) => we.id);
    const [
      { data: srcSets, error: srcSetsError },
      { data: srcFb, error: srcFbError },
      { data: srcWf, error: srcWfError },
    ] = await Promise.all([
      service
        .from("logged_sets")
        .select("*")
        .in("workout_exercise_id", sourceWeIds)
        .eq("user_id", userId)
        .order("set_number"),
      service
        .from("exercise_feedback")
        .select("*")
        .in("workout_exercise_id", sourceWeIds)
        .eq("user_id", userId),
      service
        .from("workout_feedback")
        .select("*")
        .in("workout_id", [...sourceWorkoutIds])
        .eq("user_id", userId),
    ]);
    if (srcSetsError) throw srcSetsError;
    if (srcFbError) throw srcFbError;
    if (srcWfError) throw srcWfError;

    const setsByWe = new Map<string, LoggedSetRow[]>();
    for (const s of srcSets ?? []) {
      const cur = setsByWe.get(s.workout_exercise_id) ?? [];
      cur.push(s);
      setsByWe.set(s.workout_exercise_id, cur);
    }
    const fbByWe = new Map(
      (srcFb ?? []).map((f) => [f.workout_exercise_id, f as ExerciseFeedbackRow]),
    );
    const wfByWorkout = new Map(
      (srcWf ?? []).map((f) => [f.workout_id, f as WorkoutFeedbackRow]),
    );
    // group-scoped pump/workload lives on whichever exercise closed each group,
    // resolved per source workout (matches generateDay).
    const groupFbByWorkout = new Map<
      string,
      Map<string, { pump: number | null; workload: number | null }>
    >();
    for (const we of sourceWes) {
      const fb = fbByWe.get(we.id);
      if (we.muscle_group_id && fb && (fb.pump != null || fb.workload != null)) {
        const m = groupFbByWorkout.get(we.workout_id) ?? new Map();
        m.set(we.muscle_group_id, { pump: fb.pump, workload: fb.workload });
        groupFbByWorkout.set(we.workout_id, m);
      }
    }
    // planned weekly sets per group, and heaviest meso prescription so far, both
    // keyed off the SOURCE week (week N-1) like generateDay. R14: the weekly-set
    // count credits fractionally via each exercise's muscle links.
    const regenRoles = await getMuscleRoleIdsForExercises(
      service,
      wes.map((we) => we.exercise_id),
    );
    const regenWeights = volumeCountingWeights(params);
    const wesByWeek = new Map<number, (typeof wes)[number][]>();
    for (const we of wes) {
      const w = workoutById.get(we.workout_id);
      const mc = w ? microById.get(w.microcycle_id) : undefined;
      if (!mc) continue;
      const cur = wesByWeek.get(mc.week_number) ?? [];
      cur.push(we);
      wesByWeek.set(mc.week_number, cur);
    }

    for (const [rowId, src] of advanceSourceByRow) {
      const row = rows.find((r) => r.id === rowId)!;
      const srcWorkout = workoutById.get(src.workout_id)!;
      const srcMicro = microById.get(srcWorkout.microcycle_id)!;
      const equipmentType = equipmentById.get(row.exerciseId) ?? "other";
      const priorWeekWes = wes.filter((we) => {
        const w = workoutById.get(we.workout_id);
        const mc = w ? microById.get(w.microcycle_id) : undefined;
        return mc != null && mc.week_number <= srcMicro.week_number;
      });
      const mgWeekly = weeklySetsByGroup(
        (wesByWeek.get(srcMicro.week_number) ?? []) as unknown as WorkoutExerciseRow[],
        regenRoles,
        regenWeights,
      );
      const peaks = peakByExercise(
        priorWeekWes as unknown as WorkoutExerciseRow[],
        srcMicro.target_rir,
      );
      advanceInputsByRow.set(
        rowId,
        buildEngineInputs({
          we: src as unknown as WorkoutExerciseRow,
          sets: setsByWe.get(src.id) ?? [],
          feedback: fbByWe.get(src.id) ?? null,
          groupFeedback: src.muscle_group_id
            ? (groupFbByWorkout.get(src.workout_id)?.get(src.muscle_group_id) ?? null)
            : null,
          workoutFeedback: wfByWorkout.get(src.workout_id) ?? null,
          microTargetRir: srcMicro.target_rir,
          nextWeek: { targetRir: row.targetRir, isDeload: row.isDeload },
          goal,
          equipmentType,
          profile,
          muscleGroupWeeklySets: src.muscle_group_id
            ? (mgWeekly.get(src.muscle_group_id) ?? null)
            : null,
          weekPeak: peaks.get(row.exerciseId) ?? null,
          strengthAnchor: null,
          bodyweight: profile.bodyweight ?? null,
        }),
      );
    }
  }

  // 8. week-order pass: detect divergence, recompute, write back. Anchors are
  //    fetched once, only if at least one row actually diverged.
  let anchors: Map<string, E1rmAnchor> | null = null;
  let refreshed = 0;
  const paramsHash = hashParams(params as unknown as Record<string, unknown>);
  const codeSha = engineCodeSha();

  for (const row of rows) {
    const decision = latestByWe.get(row.id) ?? null;
    // a decision-bearing row replays its recorded kind; a decision-less row is
    // backfilled as an ADVANCE when its completed prior-week counterpart is known
    // (§7c), else as a seed (§7b) — either way it can never stay stale.
    const advanceSource = advanceSourceByRow.get(row.id) ?? null;
    const kind: EngineDecisionKind =
      decision?.kind ?? (advanceSource ? "advance" : "seed");
    const sourceId =
      decision?.sourceWorkoutExerciseId ?? advanceSource?.id ?? null;

    const equipmentType = equipmentById.get(row.exerciseId) ?? "other";
    const override: ExerciseParamOverride | null =
      overrideByExercise.get(row.exerciseId) ?? null;

    // resolve the config inputs + the stored derived basis the recompute replays.
    let previous: ConfigInputs["previous"];
    let initial: ConfigInputs["initial"];
    let storedInputs: Record<string, unknown>;
    if (decision) {
      previous =
        (sourceId ? livePrescribed.get(sourceId) : undefined) ??
        ((decision.inputs.previous as ConfigInputs["previous"]) ?? null);
      initial = (decision.inputs.initial as ConfigInputs["initial"]) ?? null;
      storedInputs = decision.inputs;
    } else if (advanceSource) {
      // advance backfill (§7c): progress the completed prior-week counterpart.
      // `previous` is its live prescription; the derived history is the inputs
      // pre-built above (its logged sets + feedback). The recompute overlays the
      // live config + a refreshed anchor and runs `prescribe`, exactly like a
      // recorded advance.
      previous =
        livePrescribed.get(advanceSource.id) ?? {
          weight: advanceSource.prescribed_weight,
          reps: advanceSource.prescribed_reps,
          sets: advanceSource.prescribed_sets ?? 1,
          targetRir: advanceSource.target_rir ?? row.targetRir,
        };
      initial = null;
      storedInputs = advanceInputsByRow.get(row.id) as unknown as Record<
        string,
        unknown
      >;
    } else {
      // backfill: a seed has no upstream week; its basis is the prior peak.
      previous = null;
      initial =
        initialByDayExercise?.get(`${row.dayNumber}::${row.exerciseId}`) ?? null;
      const pr = prByExercise?.get(row.exerciseId);
      const priorPeak: SeedPeak | null =
        pr?.best_weight != null
          ? {
              weight: pr.best_weight,
              reps: pr.best_reps,
              sets: initial?.sets ?? row.currentOutput.sets,
            }
          : null;
      storedInputs = seedEngineInputs(
        buildConfigInputs({
          equipmentType,
          profile,
          goal,
          week: { targetRir: row.targetRir, isDeload: row.isDeload },
          previous,
          initial,
        }),
        priorPeak,
      ) as unknown as Record<string, unknown>;
    }

    const liveConfig = buildConfigInputs({
      equipmentType,
      profile,
      goal,
      week: { targetRir: row.targetRir, isDeload: row.isDeload },
      previous,
      initial,
    });
    // the params token folds in this exercise's increment override (doc 14 §3), so
    // an override change moves the expected fingerprint for ONLY that exercise's
    // rows; rows for other exercises stay byte-identical and short-circuit.
    const expected = computeDepFingerprint(
      liveConfig,
      paramsTokenFor(version, override?.weightIncrement),
    );
    if (expected === row.depFingerprint) {
      // fresh — the numbers are accurate under the active version. Advance the
      // legible "accurate as of Vx" stamp if it is behind (a one-time catch-up
      // after a version bump; a no-op once current), so a row whose recompute
      // wouldn't change anything still advertises the latest verified version.
      if (row.paramsVersion !== version) {
        await stampParamsVersion(service, row.id, version);
      }
      continue;
    }

    // recompute under EFFECTIVE params (global active + this exercise's override),
    // so a recomputed number actually reflects the override (doc 14 §6.1).
    const effectiveParams = resolveEffectiveParams(
      params,
      override,
      toEngineEquipment(equipmentType),
    );

    // diverged → recompute the row's engine of `kind`. The anchor feeds the
    // advance replay and — with §S1 `seed_from_anchor` — the seed replay too (so a
    // re-seeded week 1 reprices off current strength, not the frozen prior peak);
    // fetch once, lazily, only when a row that consumes it actually diverges.
    const needsAnchor =
      kind === "advance" || (kind === "seed" && (params.seed_from_anchor ?? false));
    let anchor: E1rmAnchor | null = null;
    if (needsAnchor) {
      if (!anchors) {
        anchors = await getExerciseE1rmAnchors(service, userId, exerciseIds, params);
      }
      anchor = anchors.get(row.exerciseId) ?? null;
    }
    const result = recomputeRow(
      {
        kind,
        storedInputs,
        liveConfig,
        anchor,
        bodyweight: profile.bodyweight ?? null,
        currentOutput: row.currentOutput,
      },
      effectiveParams,
    );

    if (result.status === "invalid_source") {
      // self-heal (doc 14 §6.3): can't replay → stamp the current expected
      // fingerprint and move on. Not a permanent lie: if any input changes again,
      // the expected fingerprint changes again and the row is re-attempted.
      await stampFingerprint(service, row.id, expected, version);
      continue;
    }

    const isBackfill = !decision;
    if (result.status === "unchanged" && !isBackfill) {
      // the change didn't move THIS row's prescription; stamp it current so the
      // next read short-circuits (the fingerprint, not the numbers, was stale).
      await stampFingerprint(service, row.id, expected, version);
      continue;
    }

    // Either the prescription changed, OR this is a decision-less row we're
    // normalizing into the framework for the first time (record its seed decision
    // now so it replays cleanly forever after — even if the numbers matched).
    const output = result.output!;
    const inputs = result.inputs!;
    const changed = result.status === "changed";
    if (changed) {
      const { error: updateError } = await service
        .from("workout_exercises")
        .update({
          prescribed_weight: output.weight,
          prescribed_reps: output.reps,
          prescribed_sets: output.sets,
          target_rir: output.targetRir,
          notes: output.rationale,
          dep_fingerprint: expected,
          params_version: version,
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
    } else {
      // backfill with unchanged numbers: only the fingerprint needs stamping.
      await stampFingerprint(service, row.id, expected, version);
    }

    const { error: insertError } = await service.from("engine_decisions").insert({
      user_id: userId,
      workout_exercise_id: row.id,
      exercise_id: row.exerciseId,
      source_workout_exercise_id: sourceId,
      workout_id: row.workoutId,
      microcycle_id: row.microcycleId,
      mesocycle_id: mesoId,
      inputs: inputs as unknown as Record<string, unknown>,
      output: output as unknown as Record<string, unknown>,
      params_version: version,
      params_hash: paramsHash,
      provenance: recomputeProvenance(
        inputs,
        liveConfig,
        codeSha,
        row.depFingerprint,
        expected,
        override?.weightIncrement ?? null,
      ),
      // a recompute preserves the row's origin kind, so a re-seeded row stays a
      // seed (and replays through seedMeso) on its next divergence.
      kind,
    });
    if (insertError) throw insertError;

    if (changed) {
      livePrescribed.set(row.id, output);
      refreshed += 1;
    }
  }

  // #1: stamp the signature computed at the start of this pass so the next open
  // short-circuits. Safe to stamp the start value: the reconcile writes only
  // microcycles.target_rir + workout_exercises (no signature input). Generation
  // may have added workouts (bumping the completed-work watermark) — that re-misses
  // the gate exactly once on the next open, then settles. A false re-reconcile is
  // harmless; a missed stale row would not be, so we never stamp optimistically.
  const { error: stampWriteError } = await service
    .from("mesocycles")
    .update({ last_reconcile_sig: staleSig })
    .eq("id", mesoId)
    .eq("user_id", userId);
  if (stampWriteError) throw stampWriteError;

  return { generated, refreshed };
}

/**
 * Read-path freshness entry point (doc 14 §5): the single function EVERY surface
 * that displays prescriptions calls before reading them, so stored numbers are
 * brought in line with the user's current inputs no matter which screen they open
 * — not just the Workout tab (doc 14 §10). It owns the service client the
 * reconcile needs (the recompute writes the audit trail, hard rule #4) and never
 * throws: a freshness hiccup must degrade to showing the last numbers, never take
 * down a page render. Returns the reconcile result (or null on failure) so a
 * caller that already loaded the prescriptions can cheaply re-read when something
 * actually changed.
 */
export async function ensureFreshPrescriptions(
  userId: string,
  mesoId: string,
  activeParams?: { version: number; params: EngineParams },
): Promise<ReconcileResult | null> {
  try {
    return await reconcilePrescriptions(
      createServiceClient(),
      userId,
      mesoId,
      activeParams,
    );
  } catch (error) {
    // degrade to the stored numbers, but loudly (R20): a persistent failure
    // here means silently stale prescriptions
    await reportError("queries:freshness-reconcile", error, { userId, mesoId });
    return null;
  }
}

/** Stamp a single open row's freshness fingerprint + verified params version
 *  current (no prescription change). The two are written together so the legible
 *  version stamp can never drift from the fingerprint (which already encodes it). */
async function stampFingerprint(
  service: Client,
  workoutExerciseId: string,
  fingerprint: string,
  version: number,
): Promise<void> {
  const { error } = await service
    .from("workout_exercises")
    .update({ dep_fingerprint: fingerprint, params_version: version })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/** Advance only the legible "accurate as of Vx" stamp on an already-fresh row
 *  (its fingerprint already matches the active version, so the numbers are correct;
 *  this just catches the version label up after a bump). */
async function stampParamsVersion(
  service: Client,
  workoutExerciseId: string,
  version: number,
): Promise<void> {
  const { error } = await service
    .from("workout_exercises")
    .update({ params_version: version })
    .eq("id", workoutExerciseId);
  if (error) throw error;
}

/** The meso's progression goal (macro goal → standalone default). */
async function resolveMesoGoal(
  service: Client,
  mesoId: string,
): Promise<MacroGoalType | null> {
  const { data: meso, error } = await service
    .from("mesocycles")
    .select("macrocycle_id")
    .eq("id", mesoId)
    .maybeSingle();
  if (error) throw error;
  if (!meso?.macrocycle_id) return null;
  const { data: macro, error: macroError } = await service
    .from("macrocycles")
    .select("goal_type")
    .eq("id", meso.macrocycle_id)
    .maybeSingle();
  if (macroError) throw macroError;
  return macro?.goal_type ?? null;
}

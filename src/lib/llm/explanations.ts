import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createServiceClient } from "@/lib/supabase/service";
import { reportError } from "@/lib/observability/report";
import { llmExplanationsGenerate } from "./config";
import { createCompletion, type LlmCompletion } from "./openai";
import {
  EXPLANATION_MAX_OUTPUT_TOKENS,
  EXPLANATION_PROMPT_VERSION,
  EXPLANATION_SYSTEM_PROMPT,
  PAYLOAD_TOKEN_CEILING,
  buildExplanationPayload,
  estimateTokens,
  monthDay,
  postCheckExplanation,
  type ExplanationContext,
} from "./prescription-explainer";

type Client = SupabaseClient<Database>;

/**
 * N58 / doc 18 §5 — generation at decision-write, fire-and-forget.
 *
 * Every doc-16 §10 decision write site calls one of the `schedule*` entry
 * points right after its insert commits. The work runs AFTER the response
 * (Next's `after()`, falling back to a detached promise outside a request
 * scope, e.g. under vitest) and NEVER throws into the caller: a generation
 * failure leaves no row, and no row ⇒ the deterministic composer renders
 * (§5 — that IS the fallback, not an error state).
 *
 * Invalidation is free by construction: rows are keyed to
 * `engine_decisions.id` and the read path joins a row's LATEST decision, so
 * this module never updates or deletes — `ignoreDuplicates` on the insert
 * makes re-runs harmless.
 *
 * Uses the service client (hard rule #4: explicit user scoping on every
 * query) because generation runs at write sites that may hold only the
 * user's client, while `decision_explanations` is service-write-only.
 */

/** Bound one burst: a reconcile re-decides a meso's open rows together (§5);
 *  anything past this is left for its next natural recompute. */
const MAX_BURST = 40;
/** Parallel completions per chunk — bounds the after() window without
 *  serializing a whole day's burst. */
const CHUNK = 4;

export interface ExplanationDeps {
  service: Client;
  complete: (input: {
    instructions: string;
    input: string;
    maxOutputTokens: number;
  }) => Promise<LlmCompletion>;
}

/** Schedule generation for specific just-written decision ids (seed + slot +
 *  reconcile sites, which see their ids). Synchronous, never throws. */
export function scheduleDecisionExplanations(
  userId: string,
  decisionIds: string[],
): void {
  if (!llmExplanationsGenerate() || decisionIds.length === 0) return;
  fireAndForget(() => generateDecisionExplanations(userId, decisionIds));
}

/** Schedule generation for every decision of one just-generated workout (the
 *  advance site writes through an RPC that doesn't return decision ids). */
export function scheduleWorkoutExplanations(
  userId: string,
  workoutId: string,
): void {
  if (!llmExplanationsGenerate()) return;
  fireAndForget(async () => {
    const service = createServiceClient();
    const { data, error } = await service
      .from("engine_decisions")
      .select("id")
      .eq("user_id", userId)
      .eq("workout_id", workoutId);
    if (error) throw error;
    if (!data || data.length === 0) return;
    await generateDecisionExplanations(
      userId,
      data.map((d) => d.id),
    );
  });
}

/** Run `task` after the response when a request scope exists (Next `after()`
 *  — keeps the serverless function alive past the response); detach it
 *  otherwise (tests, scripts). Failures are R20-reported, never rethrown —
 *  the explanation is a display artifact and must not be able to break a
 *  write path. `next/server` is imported lazily so this module's consumers
 *  (query land) stay loadable under plain node/vitest. */
function fireAndForget(task: () => Promise<unknown>): void {
  const run = () =>
    task().catch((error) =>
      reportError("llm:explanations", error, { stage: "burst" }),
    );
  void import("next/server")
    .then((mod) => mod.after(run))
    .catch(() => void run());
}

// ---------------------------------------------------------------------------
// context assembly — the few lookups the decision row doesn't carry
// ---------------------------------------------------------------------------

interface RecentSetRow {
  exercise_id: string;
  performed_at: string;
  set_number: number;
  weight: number;
  reps: number;
}

/**
 * Pure: fold newest-first working-set rows into ≤3 per-exercise history lines
 * in the history sheet's shape — "Jul 15 · 255 × 8, 7, 7" (top weight of the
 * day, reps in set order). Exported for unit tests.
 */
export function recentLines(
  rows: RecentSetRow[],
  limitDays = 3,
): Map<string, string[]> {
  type Day = { day: string; weight: number; reps: number[] };
  const byExercise = new Map<string, Day[]>();
  for (const row of rows) {
    const day = row.performed_at.slice(0, 10);
    let days = byExercise.get(row.exercise_id);
    if (!days) byExercise.set(row.exercise_id, (days = []));
    let entry = days.find((d) => d.day === day);
    if (!entry && days.length >= limitDays) continue;
    if (!entry) days.push((entry = { day, weight: 0, reps: [] }));
    entry.weight = Math.max(entry.weight, row.weight);
    entry.reps.push(row.reps);
  }
  const lines = new Map<string, string[]>();
  for (const [exerciseId, days] of byExercise) {
    lines.set(
      exerciseId,
      days.map(
        (d) => `${monthDay(d.day) ?? d.day} · ${d.weight} × ${d.reps.join(", ")}`,
      ),
    );
  }
  return lines;
}

interface DecisionRowSlice {
  id: string;
  workout_exercise_id: string | null;
  exercise_id: string | null;
  microcycle_id: string | null;
  mesocycle_id: string | null;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  kind: string;
}

async function assembleContexts(
  service: Client,
  userId: string,
  decisions: DecisionRowSlice[],
): Promise<Map<string, ExplanationContext>> {
  const exerciseIds = [
    ...new Set(decisions.map((d) => d.exercise_id).filter((v): v is string => !!v)),
  ];
  const weIds = decisions
    .map((d) => d.workout_exercise_id)
    .filter((v): v is string => !!v);
  const microIds = [
    ...new Set(decisions.map((d) => d.microcycle_id).filter((v): v is string => !!v)),
  ];
  const mesoIds = [
    ...new Set(decisions.map((d) => d.mesocycle_id).filter((v): v is string => !!v)),
  ];

  const [exercises, wes, micros, mesos, sets] = await Promise.all([
    exerciseIds.length
      ? service.from("exercises").select("id, name").in("id", exerciseIds)
      : Promise.resolve({ data: [], error: null }),
    weIds.length
      ? service
          .from("workout_exercises")
          .select("id, muscle_group_id")
          .in("id", weIds)
      : Promise.resolve({ data: [], error: null }),
    microIds.length
      ? service.from("microcycles").select("id, week_number").in("id", microIds)
      : Promise.resolve({ data: [], error: null }),
    mesoIds.length
      ? service.from("mesocycles").select("id, weeks").in("id", mesoIds)
      : Promise.resolve({ data: [], error: null }),
    exerciseIds.length
      ? service
          .from("logged_sets")
          .select("exercise_id, performed_at, set_number, weight, reps")
          .eq("user_id", userId)
          .in("exercise_id", exerciseIds)
          .eq("is_warmup", false)
          .order("performed_at", { ascending: false })
          .order("set_number", { ascending: true })
          // 3 sessions × a generous 8 sets, per exercise
          .limit(24 * exerciseIds.length)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [exercises, wes, micros, mesos, sets]) {
    if (result.error) throw result.error;
  }

  const mgIds = [
    ...new Set(
      (wes.data ?? [])
        .map((w) => (w as { muscle_group_id?: string | null }).muscle_group_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const muscleGroups = mgIds.length
    ? await service.from("muscle_groups").select("id, name").in("id", mgIds)
    : { data: [], error: null };
  if (muscleGroups.error) throw muscleGroups.error;

  const nameByExercise = new Map(
    (exercises.data ?? []).map((e) => [e.id, e.name]),
  );
  const mgByWe = new Map(
    (wes.data ?? []).map((w) => [
      w.id,
      (w as { muscle_group_id?: string | null }).muscle_group_id ?? null,
    ]),
  );
  const mgName = new Map((muscleGroups.data ?? []).map((m) => [m.id, m.name]));
  const weekByMicro = new Map(
    (micros.data ?? []).map((m) => [m.id, m.week_number]),
  );
  const weeksByMeso = new Map((mesos.data ?? []).map((m) => [m.id, m.weeks]));
  const recentByExercise = recentLines((sets.data ?? []) as RecentSetRow[]);

  const contexts = new Map<string, ExplanationContext>();
  for (const decision of decisions) {
    const mgId = decision.workout_exercise_id
      ? mgByWe.get(decision.workout_exercise_id)
      : null;
    contexts.set(decision.id, {
      exerciseName:
        (decision.exercise_id
          ? nameByExercise.get(decision.exercise_id)
          : null) ?? "Exercise",
      muscleGroup: (mgId ? mgName.get(mgId) : null) ?? null,
      weekNumber: decision.microcycle_id
        ? (weekByMicro.get(decision.microcycle_id) ?? null)
        : null,
      mesoWeeks: decision.mesocycle_id
        ? (weeksByMeso.get(decision.mesocycle_id) ?? null)
        : null,
      recent: decision.exercise_id
        ? (recentByExercise.get(decision.exercise_id) ?? [])
        : [],
    });
  }
  return contexts;
}

// ---------------------------------------------------------------------------
// generation
// ---------------------------------------------------------------------------

/**
 * Generate + store explanations for the given decisions. Exported for
 * integration tests (deps injectable); production entry is the `schedule*`
 * pair. Per-decision failures are isolated: one bad row never sinks the
 * burst. Returns the number of explanations stored.
 */
export async function generateDecisionExplanations(
  userId: string,
  decisionIds: string[],
  deps?: Partial<ExplanationDeps>,
): Promise<number> {
  const results = await runGeneration(userId, decisionIds, deps, {
    overwrite: false,
  });
  return results.filter((r) => r.ok).length;
}

/** One decision's generation outcome — the detailed shape the admin
 *  regenerate tool surfaces (the deterministic path only needs the count). */
export interface GenerationResult {
  decision_id: string;
  ok: boolean;
  /** the stored explanation (present on success) */
  body?: string;
  /** why it was skipped (post-check reason, missing context, or error) */
  reason?: string;
}

/**
 * Admin regeneration (doc 18 §7.6 tooling): (re)generate explanations for a
 * chosen set of decisions and **overwrite** any existing rows, returning each
 * body so the caller can read the batch inline. This is the cost-controlled
 * iteration primitive — regenerate one exercise's latest decision after a
 * prompt tweak instead of repopulating everything. Errors are surfaced
 * per-decision (never thrown), so one bad row doesn't sink the batch.
 */
export async function regenerateExplanations(
  userId: string,
  decisionIds: string[],
  deps?: Partial<ExplanationDeps>,
): Promise<GenerationResult[]> {
  return runGeneration(userId, decisionIds, deps, { overwrite: true });
}

/** Shared core: fetch the decisions, assemble context, generate in bounded
 *  parallel chunks. `overwrite` chooses insert-if-absent (write path) vs
 *  replace (regenerate). */
async function runGeneration(
  userId: string,
  decisionIds: string[],
  deps: Partial<ExplanationDeps> | undefined,
  opts: { overwrite: boolean },
): Promise<GenerationResult[]> {
  const service = deps?.service ?? createServiceClient();
  const complete = deps?.complete ?? createCompletion;

  const { data, error } = await service
    .from("engine_decisions")
    .select(
      "id, workout_exercise_id, exercise_id, microcycle_id, mesocycle_id, inputs, output, kind",
    )
    .eq("user_id", userId)
    .in("id", decisionIds.slice(0, MAX_BURST));
  if (error) throw error;
  const decisions = (data ?? []) as DecisionRowSlice[];
  if (decisions.length === 0) return [];

  const contexts = await assembleContexts(service, userId, decisions);

  const out: GenerationResult[] = [];
  for (let i = 0; i < decisions.length; i += CHUNK) {
    const results = await Promise.all(
      decisions.slice(i, i + CHUNK).map(async (decision) => {
        try {
          return await generateOne(
            service,
            userId,
            decision,
            contexts,
            complete,
            opts.overwrite,
          );
        } catch (error) {
          await reportError("llm:explanations", error, {
            userId,
            decisionId: decision.id,
          });
          return {
            decision_id: decision.id,
            ok: false,
            reason: error instanceof Error ? error.message : "error",
          };
        }
      }),
    );
    out.push(...results);
  }
  return out;
}

async function generateOne(
  service: Client,
  userId: string,
  decision: DecisionRowSlice,
  contexts: Map<string, ExplanationContext>,
  complete: ExplanationDeps["complete"],
  overwrite: boolean,
): Promise<GenerationResult> {
  const context = contexts.get(decision.id);
  if (!context) return { decision_id: decision.id, ok: false, reason: "no context" };
  const payload = buildExplanationPayload(
    { kind: decision.kind, inputs: decision.inputs, output: decision.output },
    context,
  );
  const input = JSON.stringify(payload);
  if (estimateTokens(input) > PAYLOAD_TOKEN_CEILING) {
    // over-budget payloads are a shape bug, not a cost emergency — report
    // and generate anyway (the ceiling is ~9% of the model's context)
    await reportError(
      "llm:explanations",
      new Error(`payload over token ceiling (${estimateTokens(input)})`),
      { userId, decisionId: decision.id },
    );
  }

  const completion = await complete({
    instructions: EXPLANATION_SYSTEM_PROMPT,
    input,
    maxOutputTokens: EXPLANATION_MAX_OUTPUT_TOKENS,
  });

  const checked = postCheckExplanation(completion.text, payload);
  if (!checked.ok) {
    // §4: discard, report, deterministic fallback (no row)
    await reportError(
      "llm:explanations",
      new Error(`post-check failed: ${checked.reason}`),
      { userId, decisionId: decision.id, model: completion.model },
    );
    return { decision_id: decision.id, ok: false, reason: checked.reason };
  }

  const { error } = await service.from("decision_explanations").upsert(
    {
      decision_id: decision.id,
      user_id: userId,
      body: checked.body,
      model: completion.model,
      prompt_version: EXPLANATION_PROMPT_VERSION,
      tokens_in: completion.tokensIn,
      tokens_out: completion.tokensOut,
    },
    // write path: keep the first (decision id is the cache key). Regenerate:
    // replace, so a prompt tweak actually takes.
    overwrite
      ? { onConflict: "decision_id" }
      : { onConflict: "decision_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  return { decision_id: decision.id, ok: true, body: checked.body };
}

// ---------------------------------------------------------------------------
// scope resolution — the admin regenerate tool's target selector
// ---------------------------------------------------------------------------

/** Which open prescriptions to regenerate for. All optional: an empty scope =
 *  every open row of the caller's active meso. */
export interface RegenScope {
  /** narrow to one exercise */
  exerciseId?: string;
  /** narrow to one day coordinate (both required together) */
  week?: number;
  day?: number;
  /** cap (default MAX_BURST) */
  limit?: number;
}

export interface ResolvedScope {
  mesocycleId: string | null;
  decisionIds: string[];
  /** rows in scope that carry no decision yet (nothing to regenerate) */
  openRowsWithoutDecision: number;
}

/**
 * Resolve a scope to the latest decision id per matching OPEN prescription
 * (planned / in-progress workouts) of the caller's active meso. Service-scoped
 * to `userId`. Returns [] when there's no active meso or nothing matches.
 */
export async function resolveScopedOpenDecisionIds(
  userId: string,
  scope: RegenScope = {},
  client?: Client,
): Promise<ResolvedScope> {
  const service = client ?? createServiceClient();
  const empty: ResolvedScope = {
    mesocycleId: null,
    decisionIds: [],
    openRowsWithoutDecision: 0,
  };

  const { data: meso, error: mesoError } = await service
    .from("mesocycles")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mesoError) throw mesoError;
  if (!meso) return empty;

  const { data: micros, error: microError } = await service
    .from("microcycles")
    .select("id, week_number")
    .eq("mesocycle_id", meso.id)
    .eq("user_id", userId);
  if (microError) throw microError;
  const microIds = (micros ?? [])
    .filter((m) => scope.week == null || m.week_number === scope.week)
    .map((m) => m.id);
  if (microIds.length === 0) return { ...empty, mesocycleId: meso.id };

  // open = still prescribable (planned / in-progress); completed & skipped are
  // history. A named day coordinate overrides the status filter.
  let workoutQuery = service
    .from("workouts")
    .select("id, day_number")
    .eq("user_id", userId)
    .in("microcycle_id", microIds);
  if (scope.day != null) workoutQuery = workoutQuery.eq("day_number", scope.day);
  else workoutQuery = workoutQuery.in("status", ["planned", "in_progress"]);
  const { data: workouts, error: workoutError } = await workoutQuery;
  if (workoutError) throw workoutError;
  const workoutIds = (workouts ?? []).map((w) => w.id);
  if (workoutIds.length === 0) return { ...empty, mesocycleId: meso.id };

  let weQuery = service
    .from("workout_exercises")
    .select("id")
    .in("workout_id", workoutIds);
  if (scope.exerciseId) weQuery = weQuery.eq("exercise_id", scope.exerciseId);
  const { data: wes, error: weError } = await weQuery;
  if (weError) throw weError;
  const weIds = (wes ?? []).map((w) => w.id);
  if (weIds.length === 0) return { ...empty, mesocycleId: meso.id };

  // latest decision per open row (newest first, dedup by workout_exercise_id)
  const { data: decisions, error: decisionError } = await service
    .from("engine_decisions")
    .select("id, workout_exercise_id, created_at")
    .eq("user_id", userId)
    .in("workout_exercise_id", weIds)
    .order("created_at", { ascending: false });
  if (decisionError) throw decisionError;
  const latestByWe = new Map<string, string>();
  for (const d of decisions ?? []) {
    if (d.workout_exercise_id && !latestByWe.has(d.workout_exercise_id)) {
      latestByWe.set(d.workout_exercise_id, d.id);
    }
  }
  const decisionIds = [...latestByWe.values()].slice(0, scope.limit ?? MAX_BURST);
  return {
    mesocycleId: meso.id,
    decisionIds,
    openRowsWithoutDecision: weIds.length - latestByWe.size,
  };
}

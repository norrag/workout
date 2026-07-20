import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createServiceClient } from "@/lib/supabase/service";
import { describeError, reportError } from "@/lib/observability/report";
import { PROGRESSION_RULE, engineParamsSchema } from "@/lib/engine";
import {
  PROGRESSION_LOOKBACK_DAYS,
  aggregateProgressionEvents,
  toProgressionAuditEvent,
  type ProgressionAuditEvent,
} from "@/lib/queries/progression-history";
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
  projectTrend,
  type ExplanationContext,
  type PayloadTrend,
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

// ---------------------------------------------------------------------------
// durable failure log (N58 follow-up)
// ---------------------------------------------------------------------------

/** Where in the pipeline an attempt died (mirrors the table's check). */
export type FailureStage = "burst" | "generate" | "post_check";

/**
 * Best-effort insert into `llm_explanation_failures` so a failed generation is
 * queryable (SQL editor, `get_llm_explanation_status`) instead of visible only
 * in Vercel function logs. Runs BESIDE the R20 report, never instead of it,
 * and never throws — the failure log must not be able to break the failure
 * path it records.
 */
async function recordFailure(
  service: Client,
  userId: string,
  decisionId: string | null,
  stage: FailureStage,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await service.from("llm_explanation_failures").insert({
      user_id: userId,
      decision_id: decisionId,
      stage,
      error: describeError(error).message.slice(0, 2000) || "unknown error",
      context: context ?? null,
    });
  } catch {
    // swallowed by design; the R20 report already fired
  }
}

/** Schedule generation for specific just-written decision ids (seed + slot +
 *  reconcile sites, which see their ids). Synchronous, never throws. */
export function scheduleDecisionExplanations(
  userId: string,
  decisionIds: string[],
): void {
  if (!llmExplanationsGenerate() || decisionIds.length === 0) return;
  fireAndForget(userId, () => generateDecisionExplanations(userId, decisionIds));
}

/** Schedule generation for every decision of one just-generated workout (the
 *  advance site writes through an RPC that doesn't return decision ids). */
export function scheduleWorkoutExplanations(
  userId: string,
  workoutId: string,
): void {
  if (!llmExplanationsGenerate()) return;
  fireAndForget(userId, async () => {
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
function fireAndForget(userId: string, task: () => Promise<unknown>): void {
  const run = () =>
    task().catch(async (error) => {
      await reportError("llm:explanations", error, { stage: "burst" });
      await recordFailure(createServiceClient(), userId, null, "burst", error);
    });
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

/**
 * §10 v2: the trend block per exercise — the progression-history aggregate
 * (`aggregateProgressionEvents`) over the same lookback the pacer reads,
 * folded from recorded decisions and priced through the ACTIVE params' e1RM
 * curve. Best-effort by design: the trend is coaching context, so any failure
 * here (no active params row yet, a query hiccup) omits the block rather than
 * sinking the burst — the R20 report still fires for real errors.
 */
async function assembleTrends(
  service: Client,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, PayloadTrend>> {
  const trends = new Map<string, PayloadTrend>();
  if (exerciseIds.length === 0) return trends;
  try {
    const sinceIso = new Date(
      Date.now() - PROGRESSION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const [paramsResult, decisionsResult] = await Promise.all([
      service
        .from("engine_params")
        .select("params")
        .eq("is_active", true)
        .limit(1),
      service
        .from("engine_decisions")
        .select("id, kind, workout_id, exercise_id, microcycle_id, created_at, inputs, output")
        .eq("user_id", userId)
        .in("exercise_id", exerciseIds)
        .contains("output", { trace: [{ rule: PROGRESSION_RULE }] })
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(1000),
    ]);
    if (paramsResult.error) throw paramsResult.error;
    if (decisionsResult.error) throw decisionsResult.error;
    const rawParams = paramsResult.data?.[0]?.params;
    if (!rawParams) return trends; // no active params ⇒ nothing to price with
    const params = engineParamsSchema.parse(rawParams);

    const byExercise = new Map<string, ProgressionAuditEvent[]>();
    for (const row of decisionsResult.data ?? []) {
      if (!row.exercise_id) continue;
      const cur = byExercise.get(row.exercise_id) ?? [];
      cur.push(
        toProgressionAuditEvent(
          row as unknown as Parameters<typeof toProgressionAuditEvent>[0],
          params,
        ),
      );
      byExercise.set(row.exercise_id, cur);
    }
    for (const [exerciseId, events] of byExercise) {
      const trend = projectTrend(
        aggregateProgressionEvents(events),
        PROGRESSION_LOOKBACK_DAYS,
      );
      if (trend) trends.set(exerciseId, trend);
    }
  } catch (error) {
    await reportError("llm:explanations", error, { userId, stage: "trend" });
  }
  return trends;
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

  const [exercises, wes, micros, mesos, sets, pinnedNotes, sessionNotes, workoutFeedback, trends] = await Promise.all([
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
    // §10 v2: the user's own words — pinned note per exercise…
    exerciseIds.length
      ? service
          .from("exercise_notes")
          .select("exercise_id, body, updated_at")
          .eq("user_id", userId)
          .eq("is_pinned", true)
          .in("exercise_id", exerciseIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    // …and the latest session note (`exercise_feedback.notes`, 09 session-5 §8)
    service
      .from("exercise_feedback")
      .select("workout_exercise_id, notes, created_at")
      .eq("user_id", userId)
      .not("notes", "is", null)
      .order("created_at", { ascending: false })
      .limit(30),
    // §10 v2: last workout-level feedback (fatigue/effort/performance)
    service
      .from("workout_feedback")
      .select("overall_fatigue, effort_rating, performance_rating, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
    // §10 v2: the progression trend block (best-effort, never throws)
    assembleTrends(service, userId, exerciseIds),
  ]);
  for (const result of [exercises, wes, micros, mesos, sets, pinnedNotes, sessionNotes, workoutFeedback]) {
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

  // resolve the noted feedback rows' workout_exercises to exercise ids (their
  // sessions are historical — disjoint from this burst's weIds)
  const notedWeIds = [
    ...new Set(
      (sessionNotes.data ?? [])
        .map((n) => (n as { workout_exercise_id?: string }).workout_exercise_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const notedWes = notedWeIds.length
    ? await service
        .from("workout_exercises")
        .select("id, exercise_id")
        .in("id", notedWeIds)
    : { data: [], error: null };
  if (notedWes.error) throw notedWes.error;
  const exerciseByNotedWe = new Map(
    (notedWes.data ?? []).map((w) => [
      w.id,
      (w as { exercise_id?: string | null }).exercise_id ?? null,
    ]),
  );
  // newest-first rows ⇒ first hit per exercise is its latest session note
  const sessionNoteByExercise = new Map<string, string>();
  for (const row of sessionNotes.data ?? []) {
    const r = row as { workout_exercise_id?: string; notes?: string | null };
    const exerciseId = r.workout_exercise_id
      ? exerciseByNotedWe.get(r.workout_exercise_id)
      : null;
    if (exerciseId && r.notes && !sessionNoteByExercise.has(exerciseId)) {
      sessionNoteByExercise.set(exerciseId, r.notes);
    }
  }

  const pinnedByExercise = new Map<string, string>();
  for (const row of pinnedNotes.data ?? []) {
    const r = row as { exercise_id?: string; body?: string };
    if (r.exercise_id && r.body && !pinnedByExercise.has(r.exercise_id)) {
      pinnedByExercise.set(r.exercise_id, r.body);
    }
  }

  const wfRow = (workoutFeedback.data ?? [])[0] as
    | {
        overall_fatigue?: number | null;
        effort_rating?: number | null;
        performance_rating?: number | null;
      }
    | undefined;
  const lastWorkoutFeedback = wfRow
    ? {
        fatigue: wfRow.overall_fatigue ?? null,
        effort: wfRow.effort_rating ?? null,
        performance: wfRow.performance_rating ?? null,
      }
    : null;
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
      pinnedNote: decision.exercise_id
        ? (pinnedByExercise.get(decision.exercise_id) ?? null)
        : null,
      lastSessionNote: decision.exercise_id
        ? (sessionNoteByExercise.get(decision.exercise_id) ?? null)
        : null,
      workoutFeedback: lastWorkoutFeedback,
      trend: decision.exercise_id
        ? (trends.get(decision.exercise_id) ?? null)
        : null,
    });
  }
  return contexts;
}

// ---------------------------------------------------------------------------
// generation
// ---------------------------------------------------------------------------

/** One decision's generation outcome, surfaced by the admin tooling. */
export interface ExplanationOutcome {
  decisionId: string;
  exercise: string | null;
  ok: boolean;
  /** on success: the stored body */
  body?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** on failure: which stage died + the exact error */
  stage?: FailureStage;
  error?: string;
}

export interface ExplanationRunResult {
  /** rows actually written (post-check passed + upsert succeeded) */
  stored: number;
  results: ExplanationOutcome[];
}

export interface GenerateOptions {
  /** overwrite an existing explanation for the same decision (admin retesting;
   *  the production hook keeps `ignoreDuplicates` so re-runs are harmless) */
  overwrite?: boolean;
}

/**
 * Generate + store explanations for the given decisions. Exported for
 * integration tests (deps injectable) and the admin MCP tools (synchronous,
 * per-decision outcomes); production entry is the `schedule*` pair.
 * Per-decision failures are isolated: one bad row never sinks the burst —
 * each is R20-reported AND recorded in `llm_explanation_failures`.
 */
export async function generateDecisionExplanations(
  userId: string,
  decisionIds: string[],
  deps?: Partial<ExplanationDeps>,
  opts?: GenerateOptions,
): Promise<ExplanationRunResult> {
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
  if (decisions.length === 0) return { stored: 0, results: [] };

  const contexts = await assembleContexts(service, userId, decisions);

  const results: ExplanationOutcome[] = [];
  for (let i = 0; i < decisions.length; i += CHUNK) {
    const chunk = await Promise.all(
      decisions.slice(i, i + CHUNK).map(async (decision) => {
        const exercise = contexts.get(decision.id)?.exerciseName ?? null;
        try {
          return await generateOne(
            service,
            userId,
            decision,
            contexts,
            complete,
            opts?.overwrite ?? false,
          );
        } catch (error) {
          await reportError("llm:explanations", error, {
            userId,
            decisionId: decision.id,
          });
          await recordFailure(service, userId, decision.id, "generate", error);
          return {
            decisionId: decision.id,
            exercise,
            ok: false,
            stage: "generate" as const,
            error: describeError(error).message,
          };
        }
      }),
    );
    results.push(...chunk);
  }
  return { stored: results.filter((r) => r.ok).length, results };
}

async function generateOne(
  service: Client,
  userId: string,
  decision: DecisionRowSlice,
  contexts: Map<string, ExplanationContext>,
  complete: ExplanationDeps["complete"],
  overwrite: boolean,
): Promise<ExplanationOutcome> {
  const context = contexts.get(decision.id);
  if (!context) {
    return {
      decisionId: decision.id,
      exercise: null,
      ok: false,
      stage: "generate",
      error: "no context assembled for decision",
    };
  }
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
    await recordFailure(
      service,
      userId,
      decision.id,
      "post_check",
      new Error(checked.reason),
      { model: completion.model },
    );
    return {
      decisionId: decision.id,
      exercise: context.exerciseName,
      ok: false,
      stage: "post_check",
      error: checked.reason,
    };
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
    { onConflict: "decision_id", ignoreDuplicates: !overwrite },
  );
  if (error) throw error;
  return {
    decisionId: decision.id,
    exercise: context.exerciseName,
    ok: true,
    body: checked.body,
    model: completion.model,
    tokensIn: completion.tokensIn,
    tokensOut: completion.tokensOut,
  };
}

// ---------------------------------------------------------------------------
// diagnostics (N58 follow-up) — the admin MCP tools' service half
// ---------------------------------------------------------------------------

export interface ProbeResult {
  ok: boolean;
  /** the §3 payload sent (present when a decision was probed) */
  payload?: Record<string, unknown>;
  /** raw completion on success (NOT stored unless `store` was set) */
  body?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** whether the row was written (only when `store` requested and checks passed) */
  stored?: boolean;
  /** §4 post-check verdict for a decision probe */
  postCheck?: { ok: boolean; reason?: string };
  /** the exact upstream/pipeline error on failure — the diagnostic this exists for */
  error?: string;
}

/**
 * One live OpenAI call with a trivial prompt — proves key, billing, model id,
 * and request shape from INSIDE the deployed environment (where the env vars
 * live), and returns the exact upstream error when any of them is wrong.
 * Never stores anything; costs ~30 tokens.
 */
export async function probeLlmConnectivity(): Promise<ProbeResult> {
  try {
    const completion = await createCompletion({
      instructions: "You are a connectivity check.",
      input: "Reply with exactly: ok",
      maxOutputTokens: 16,
    });
    return {
      ok: true,
      body: completion.text,
      model: completion.model,
      tokensIn: completion.tokensIn,
      tokensOut: completion.tokensOut,
    };
  } catch (error) {
    return { ok: false, error: describeError(error).message };
  }
}

/**
 * Run the FULL generation pipeline for one recorded decision — payload
 * projection, live completion, §4 post-check — and return every intermediate,
 * without storing unless `store` is set (then upserted with overwrite, so
 * iterating on a single decision is cheap). User-scoped via the service
 * client; the caller (admin MCP tool) supplies the session's own userId.
 */
export async function probeDecisionExplanation(
  userId: string,
  decisionId: string,
  opts?: { store?: boolean },
): Promise<ProbeResult> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("engine_decisions")
    .select(
      "id, workout_exercise_id, exercise_id, microcycle_id, mesocycle_id, inputs, output, kind",
    )
    .eq("user_id", userId)
    .eq("id", decisionId)
    .maybeSingle();
  if (error) return { ok: false, error: describeError(error).message };
  if (!data) return { ok: false, error: "decision not found (or not yours)" };
  const decision = data as DecisionRowSlice;

  const contexts = await assembleContexts(service, userId, [decision]);
  const context = contexts.get(decision.id);
  if (!context) return { ok: false, error: "no context assembled for decision" };
  const payload = buildExplanationPayload(
    { kind: decision.kind, inputs: decision.inputs, output: decision.output },
    context,
  );

  let completion: LlmCompletion;
  try {
    completion = await createCompletion({
      instructions: EXPLANATION_SYSTEM_PROMPT,
      input: JSON.stringify(payload),
      maxOutputTokens: EXPLANATION_MAX_OUTPUT_TOKENS,
    });
  } catch (error) {
    return {
      ok: false,
      payload: payload as unknown as Record<string, unknown>,
      error: describeError(error).message,
    };
  }

  const checked = postCheckExplanation(completion.text, payload);
  let stored = false;
  if (checked.ok && opts?.store) {
    const { error: upsertError } = await service
      .from("decision_explanations")
      .upsert(
        {
          decision_id: decision.id,
          user_id: userId,
          body: checked.body,
          model: completion.model,
          prompt_version: EXPLANATION_PROMPT_VERSION,
          tokens_in: completion.tokensIn,
          tokens_out: completion.tokensOut,
        },
        { onConflict: "decision_id", ignoreDuplicates: false },
      );
    if (upsertError)
      return {
        ok: false,
        payload: payload as unknown as Record<string, unknown>,
        body: completion.text,
        error: describeError(upsertError).message,
      };
    stored = true;
  }

  return {
    ok: checked.ok,
    payload: payload as unknown as Record<string, unknown>,
    body: completion.text,
    model: completion.model,
    tokensIn: completion.tokensIn,
    tokensOut: completion.tokensOut,
    stored,
    postCheck: checked.ok ? { ok: true } : { ok: false, reason: checked.reason },
    ...(checked.ok ? {} : { error: `post-check failed: ${checked.reason}` }),
  };
}

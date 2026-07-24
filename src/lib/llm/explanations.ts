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
  monthDay,
  projectTrace,
  projectTrend,
  type ExplanationContext,
  type PayloadTrend,
} from "./prescription-explainer";
import {
  buildExplanationFacts,
  type ExplanationFacts,
  type FactsContext,
  type FactsDecision,
} from "./explanation-facts";
import { scoreTriggers, type Trigger, type TriggerSignals } from "./coaching-triggers";
import {
  COACHING_MAX_OUTPUT_TOKENS,
  COACHING_PROMPT_VERSION,
  COACHING_SYSTEM_PROMPT,
  parseCoachingResponse,
  postCheckCoaching,
  type NoteClass,
} from "./coaching";
import { getActiveCoachingPrompt } from "@/lib/queries/coaching-prompts";

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

/** The system prompt + version a generation runs with — either the ACTIVE
 *  editable DB prompt (coaching_prompts) or, when the table is empty/unreadable,
 *  the code constant. Resolved ONCE per burst and threaded through so a whole
 *  burst is byte-stable (prompt-cache friendly) and stamps a consistent
 *  prompt_version on every row it writes. */
export interface ResolvedCoachingPrompt {
  body: string;
  version: number;
}

/** The code fallback — the permanent floor when no DB prompt is active. */
export const CODE_COACHING_PROMPT: ResolvedCoachingPrompt = {
  body: COACHING_SYSTEM_PROMPT,
  version: COACHING_PROMPT_VERSION,
};

/**
 * Resolve the coaching system prompt for a generation burst: the active DB row
 * if present, else the code constant. Any read failure falls back to the
 * constant (and is reported) — the prompt editor can never take the pipeline
 * down; the deterministic layers plus a working code prompt are the floor.
 */
export async function resolveCoachingPrompt(service: Client): Promise<ResolvedCoachingPrompt> {
  try {
    const active = await getActiveCoachingPrompt(service);
    if (active) return { body: active.body, version: active.version };
  } catch (error) {
    await reportError("llm:coaching-prompt", error, {});
  }
  return CODE_COACHING_PROMPT;
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

/** doc 19 §6/§7 — what became of one decision in the v3 trigger-gated path. */
export type ExplanationDisposition =
  | "stored" // a coaching row was written
  | "skipped" // no trigger fired ⇒ no API call, deterministic layers stand alone
  | "abstained" // the model was called but had nothing worth saying (success)
  | "discarded" // post-check/parse rejected the output (no row)
  | "error"; // an upstream/pipeline error

/** One decision's generation outcome, surfaced by the admin tooling. */
export interface ExplanationOutcome {
  decisionId: string;
  exercise: string | null;
  /** the attempt completed without erroring/discarding (skip + abstain are ok) */
  ok: boolean;
  /** whether a coaching row was actually written (the `stored` tally counts these) */
  stored: boolean;
  disposition: ExplanationDisposition;
  /** doc 19 §6.1 — the triggers that gated (or would have gated) the call */
  triggers?: Trigger[];
  /** on a stored row: the coaching body */
  body?: string;
  /** the model's note classification when a note was in the payload */
  noteClass?: NoteClass;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** on failure/discard: which stage died + the exact reason */
  stage?: FailureStage;
  error?: string;
}

export interface ExplanationRunResult {
  /** rows actually written (triggered + post-check passed + upsert succeeded) */
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

  // Resolve the active prompt ONCE for the whole burst — byte-stable across the
  // chunked completions (prompt-cache friendly) and one consistent
  // prompt_version stamped on every row this call writes.
  const prompt = await resolveCoachingPrompt(service);

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
            prompt,
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
            stored: false,
            disposition: "error" as const,
            stage: "generate" as const,
            error: describeError(error).message,
          };
        }
      }),
    );
    results.push(...chunk);
  }
  return { stored: results.filter((r) => r.stored).length, results };
}

/** §6.2 discard path — R20 report + durable failure row + a `discarded`
 *  outcome; shared by the parse-failure and post-check-failure branches. */
async function discardOutcome(
  service: Client,
  userId: string,
  decision: DecisionRowSlice,
  context: ExplanationContext,
  model: string,
  reason: string,
  triggers: Trigger[],
): Promise<ExplanationOutcome> {
  await reportError(
    "llm:explanations",
    new Error(`post-check failed: ${reason}`),
    { userId, decisionId: decision.id, model },
  );
  await recordFailure(service, userId, decision.id, "post_check", new Error(reason), { model });
  return {
    decisionId: decision.id,
    exercise: context.exerciseName,
    ok: false,
    stored: false,
    disposition: "discarded",
    triggers,
    stage: "post_check",
    error: reason,
  };
}

async function generateOne(
  service: Client,
  userId: string,
  decision: DecisionRowSlice,
  contexts: Map<string, ExplanationContext>,
  complete: ExplanationDeps["complete"],
  overwrite: boolean,
  prompt: ResolvedCoachingPrompt,
): Promise<ExplanationOutcome> {
  const context = contexts.get(decision.id);
  if (!context) {
    return {
      decisionId: decision.id,
      exercise: null,
      ok: false,
      stored: false,
      disposition: "error",
      stage: "generate",
      error: "no context assembled for decision",
    };
  }

  // doc 19 §5–§6.1: the facts projection + the trigger gate. No trigger ⇒ no
  // API call and no row — the deterministic ask + why are the complete output.
  const { factsDecision, factsContext, signals } = toFactsInputs(decision, context);
  const facts = buildExplanationFacts(factsDecision, factsContext);
  const triggers = scoreTriggers(facts, signals);
  if (triggers.length === 0) {
    return {
      decisionId: decision.id,
      exercise: context.exerciseName,
      ok: true,
      stored: false,
      disposition: "skipped",
      triggers,
    };
  }

  const completion = await complete({
    instructions: prompt.body,
    input: JSON.stringify(facts),
    maxOutputTokens: COACHING_MAX_OUTPUT_TOKENS,
  });

  // §6.2: parse the structured reply, then run the extended post-check against
  // the FACTS payload. Any parse/check failure ⇒ discard, report, no row (the
  // deterministic layers render alone — the permanent fallback).
  const parsed = parseCoachingResponse(completion.text);
  if (!parsed.ok) {
    return discardOutcome(service, userId, decision, context, completion.model, parsed.reason, triggers);
  }
  const checked = postCheckCoaching(parsed.response, facts, triggers);
  if (!checked.ok) {
    return discardOutcome(service, userId, decision, context, completion.model, checked.reason, triggers);
  }
  if ("abstain" in checked) {
    // §6.2: abstention is a success path — the trigger got the model to the
    // plate; it does not oblige a swing. Nothing stored, no failure recorded.
    return {
      decisionId: decision.id,
      exercise: context.exerciseName,
      ok: true,
      stored: false,
      disposition: "abstained",
      triggers,
      noteClass: parsed.response.note_class,
      model: completion.model,
      tokensIn: completion.tokensIn,
      tokensOut: completion.tokensOut,
    };
  }

  const { error } = await service.from("decision_explanations").upsert(
    {
      decision_id: decision.id,
      user_id: userId,
      body: checked.body,
      model: completion.model,
      prompt_version: prompt.version,
      tokens_in: completion.tokensIn,
      tokens_out: completion.tokensOut,
      triggers,
    },
    { onConflict: "decision_id", ignoreDuplicates: !overwrite },
  );
  if (error) throw error;
  return {
    decisionId: decision.id,
    exercise: context.exerciseName,
    ok: true,
    stored: true,
    disposition: "stored",
    triggers,
    body: checked.body,
    noteClass: parsed.response.note_class,
    model: completion.model,
    tokensIn: completion.tokensIn,
    tokensOut: completion.tokensOut,
  };
}

// ---------------------------------------------------------------------------
// doc 19 §5–§6 — facts + triggers projection over the assembled context
// ---------------------------------------------------------------------------

function fNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function fStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function fRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Adapt one recorded decision + its assembled context into the pure §5 facts
 * inputs and the §6.1 trigger signals. The comparability-heavy fields the facts
 * layer needs (effort observation, joint-pain recurrence, trend confidence, the
 * completion/deviation/increment signals) are populated best-effort here and
 * conservatively where the query doesn't yet supply them — so the dry-run never
 * over-claims (plateau/pace stay guarded). Phase 3/4 refine the real assembly.
 */
export function toFactsInputs(
  decision: DecisionRowSlice,
  context: ExplanationContext,
): { factsDecision: FactsDecision; factsContext: FactsContext; signals: TriggerSignals } {
  const inputs = decision.inputs;
  const output = decision.output;
  const week = fRec(inputs.week);
  const previous = fRec(inputs.previous);
  const feedback = fRec(inputs.exerciseFeedback);
  const exercise = fRec(inputs.exercise);
  const loadType = (exercise ? fStr(exercise.loadType) : undefined) ?? "external";
  const isDeload = week?.isDeload === true;
  const targetRir = fNum(output.targetRir) ?? (week ? fNum(week.targetRir) : null);
  const jointPain = feedback ? fNum(feedback.jointPain) : null;
  const trace = projectTrace(output);

  const factsDecision: FactsDecision = {
    kind: decision.kind,
    isDeload,
    loadType,
    ask: {
      weight: fNum(output.weight),
      reps: fNum(output.reps),
      sets: fNum(output.sets),
      targetRir,
    },
    previous: previous
      ? {
          weight: fNum(previous.weight),
          reps: fNum(previous.reps),
          sets: fNum(previous.sets),
          targetRir: fNum(previous.targetRir),
        }
      : null,
    trace,
  };

  const trend = context.trend;
  const factsContext: FactsContext = {
    exerciseName: context.exerciseName,
    muscleGroup: context.muscleGroup,
    weekNumber: context.weekNumber,
    mesoWeeks: context.mesoWeeks,
    // phase 3: derive from rir_reported on the previous session's working sets
    effortObserved: null,
    pain:
      jointPain != null && jointPain > 0
        ? { recurring: false, lastReportSessionsAgo: 0 }
        : null,
    pinnedNote: context.pinnedNote ?? null,
    lastSessionNote: context.lastSessionNote ?? null,
    trend: trend
      ? {
          window_days: trend.window_days,
          measuredGainPctPer30d: trend.measured_gain_pct_per_30d ?? null,
          prescribedGainPctPer30d: trend.prescribed_gain_pct_per_30d ?? null,
          comparableSessions: Object.values(trend.statuses).reduce((a, b) => a + b, 0),
          // conservative until the real §5.1 comparability gates are wired:
          // never lets the dry-run claim a plateau it can't yet support
          e1rmConfidence: "low",
          comparable: false,
        }
      : null,
  };

  const signals: TriggerSignals = { trace };
  return { factsDecision, factsContext, signals };
}

/** One decision's dry-run trigger verdict (§7.3) — no API call, no row. */
export interface TriggerDryRun {
  decisionId: string;
  exercise: string | null;
  triggers: Trigger[];
  wouldGenerate: boolean;
  facts: ExplanationFacts;
}

/**
 * Compute facts + triggers for the given decisions WITHOUT calling the model
 * (§7.3 dry-run) — the calibration surface for §6.1 before the trigger gate is
 * flipped on. Returns per-decision would-trigger status; costs zero tokens.
 */
export async function dryRunDecisionTriggers(
  userId: string,
  decisionIds: string[],
  deps?: Pick<ExplanationDeps, "service">,
): Promise<TriggerDryRun[]> {
  const service = deps?.service ?? createServiceClient();
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
  return decisions.map((decision) => {
    const context = contexts.get(decision.id);
    const { factsDecision, factsContext, signals } = toFactsInputs(
      decision,
      context ?? {
        exerciseName: "Exercise",
        muscleGroup: null,
        weekNumber: null,
        mesoWeeks: null,
        recent: [],
      },
    );
    const facts = buildExplanationFacts(factsDecision, factsContext);
    const triggers = scoreTriggers(facts, signals);
    return {
      decisionId: decision.id,
      exercise: context?.exerciseName ?? null,
      triggers,
      wouldGenerate: triggers.length > 0,
      facts,
    };
  });
}

// ---------------------------------------------------------------------------
// diagnostics (N58 follow-up) — the admin MCP tools' service half
// ---------------------------------------------------------------------------

export interface ProbeResult {
  ok: boolean;
  /** the facts payload actually sent to the model (§5 — the v3 worldview) */
  payload?: Record<string, unknown>;
  /** doc 19 §5 facts projection for the decision (present on a decision probe) */
  facts?: ExplanationFacts;
  /** doc 19 §6.1 triggers that gate the generation call */
  triggers?: Trigger[];
  /** whether the triggers would have routed this decision to the call in prod */
  wouldGenerate?: boolean;
  /** the model's note classification (§6.2) when a note was in the payload */
  noteClass?: NoteClass;
  /** the model chose to abstain — a success path (nothing to store) */
  abstained?: boolean;
  /** the coaching body on success (NOT stored unless `store` was set) */
  body?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** whether the row was written (only when `store` requested and checks passed) */
  stored?: boolean;
  /** §6.2 post-check verdict for a decision probe */
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

  // doc 19 §5–§6.1: the facts projection + trigger verdict. Unlike production
  // generation, the probe ALWAYS makes the call (an explicit single-decision
  // test) and reports would_generate separately, so the admin can read what the
  // model would say even for a decision that wouldn't trigger in prod (§7.3).
  const { factsDecision, factsContext, signals } = toFactsInputs(decision, context);
  const facts = buildExplanationFacts(factsDecision, factsContext);
  const triggers = scoreTriggers(facts, signals);
  const payload = facts as unknown as Record<string, unknown>;

  // Probe the SAME prompt production would run (active DB prompt, else the code
  // fallback) so a preview reflects what a real generation would say.
  const prompt = await resolveCoachingPrompt(service);

  let completion: LlmCompletion;
  try {
    completion = await createCompletion({
      instructions: prompt.body,
      input: JSON.stringify(facts),
      maxOutputTokens: COACHING_MAX_OUTPUT_TOKENS,
    });
  } catch (error) {
    return {
      ok: false,
      payload,
      facts,
      triggers,
      wouldGenerate: triggers.length > 0,
      error: describeError(error).message,
    };
  }

  const base = {
    payload,
    facts,
    triggers,
    wouldGenerate: triggers.length > 0,
    body: completion.text,
    model: completion.model,
    tokensIn: completion.tokensIn,
    tokensOut: completion.tokensOut,
  };

  const parsed = parseCoachingResponse(completion.text);
  if (!parsed.ok) {
    return { ok: false, ...base, postCheck: { ok: false, reason: parsed.reason }, error: parsed.reason };
  }
  const checked = postCheckCoaching(parsed.response, facts, triggers);
  const noteClass = parsed.response.note_class;
  if (!checked.ok) {
    return { ok: false, ...base, noteClass, postCheck: { ok: false, reason: checked.reason }, error: checked.reason };
  }
  if ("abstain" in checked) {
    return { ok: true, ...base, noteClass, abstained: true, stored: false, postCheck: { ok: true } };
  }

  let stored = false;
  if (opts?.store) {
    const { error: upsertError } = await service
      .from("decision_explanations")
      .upsert(
        {
          decision_id: decision.id,
          user_id: userId,
          body: checked.body,
          model: completion.model,
          prompt_version: prompt.version,
          tokens_in: completion.tokensIn,
          tokens_out: completion.tokensOut,
          triggers,
        },
        { onConflict: "decision_id", ignoreDuplicates: false },
      );
    if (upsertError) {
      return { ok: false, ...base, noteClass, error: describeError(upsertError).message };
    }
    stored = true;
  }

  return { ok: true, ...base, body: checked.body, noteClass, stored, postCheck: { ok: true } };
}

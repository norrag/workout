import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EngineDecisionKind } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

/** One step of an engine decision's trace (rule + human-readable detail).
 *  Progression steps (doc 16 §3.6) additionally carry their status coding —
 *  preserved here so the quick-read narrative and the audit panel can read the
 *  state structurally instead of parsing the detail prose. */
export interface AuditTraceStep {
  rule: string;
  detail: string;
  /** doc 16 §3.6 status vocabulary on `progression` steps */
  status?: string;
  /** which governor declined an earned step (status `paced`) */
  governor?: string;
  /** the first failing gate predicate (status `not_earned`) */
  predicate?: string;
}

/**
 * The latest engine decision behind a prescription — the audit record exposed by
 * the day-view "prescription detail" reveal (owner request 2026-06-25). It pairs
 * the row's legible "verified accurate as of Vx" stamp
 * (`workout_exercises.params_version`, supplied separately by the caller) with the
 * decision that last *computed* the numbers, so the user can confirm a version bump
 * verified the row even when nothing changed.
 *
 * `decisionVersion` is `engine_decisions.params_version` — the version that last
 * actually moved the prescription. It deliberately lags the row stamp when a newer
 * version was activated and re-verified the row without changing the numbers (no new
 * decision is written then); that gap is the audit signal, not a bug.
 */
export interface PrescriptionAudit {
  kind: EngineDecisionKind;
  /** the engine_params version that last COMPUTED (changed) this prescription */
  decisionVersion: number;
  /** when that decision was recorded */
  decidedAt: string;
  /** the prescription's rationale (engine output) */
  rationale: string | null;
  /** the engine trace that produced it */
  trace: AuditTraceStep[];
  /** the decision's prescribed numbers — compared against the live row so an
   *  out-of-band write (numbers the engine never produced) is surfaced instead
   *  of being passed off as "re-verified" (N33 S4 tripwire) */
  output: DecisionOutputNumbers | null;
  /** the previous session's prescription the decision advanced from
   *  (`inputs.previous`) — feeds the quick-read's plain-language delta; null on
   *  seeds and cold rows */
  previous: DecisionOutputNumbers | null;
  /** doc 19 §3 — the stored LLM coaching line for THIS decision, fetched only
   *  when the caller says the feature is serving (`llmExplanationsServe`) AND
   *  the row is a v3 row (`prompt_version >= 3`; v1–v2 whole-blob rows stop
   *  being served the moment the seam inverts, §3). Appended BENEATH the
   *  deterministic why (never a replacement); the ask, why, and ENGINE AUDIT
   *  panel stay deterministic. Null ⇒ the composer stands alone. */
  explanation: string | null;
}

/** The prescription tuple recorded on a decision's output. */
export interface DecisionOutputNumbers {
  weight: number | null;
  reps: number | null;
  sets: number | null;
  targetRir: number | null;
}

/** Coerce the stored `output` jsonb into the prescribed tuple. Pure; defensive
 *  (the stored jsonb is untyped). Null when no numeric field is present. */
export function readOutputNumbers(output: unknown): DecisionOutputNumbers | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const numbers = {
    weight: num(o.weight),
    reps: num(o.reps),
    sets: num(o.sets),
    targetRir: num(o.targetRir),
  };
  return Object.values(numbers).every((v) => v == null) ? null : numbers;
}

/** Pure (N33 S4): does the live row still carry the decision's numbers? Field
 *  null-mismatches count as divergence — the whole tuple is engine-written. */
export function prescriptionMatchesDecision(
  live: DecisionOutputNumbers,
  decision: DecisionOutputNumbers,
): boolean {
  return (
    live.weight === decision.weight &&
    live.reps === decision.reps &&
    live.sets === decision.sets &&
    live.targetRir === decision.targetRir
  );
}

/** Coerce the stored `output` jsonb into the trace steps we display. Pure;
 *  exported for unit testing (the stored jsonb is untyped, so it is defensively
 *  parsed). */
export function readTrace(output: unknown): AuditTraceStep[] {
  const raw = (output as { trace?: unknown } | null)?.trace;
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;
  return raw
    .filter(
      (s): s is Record<string, unknown> => !!s && typeof s === "object",
    )
    .map((s) => {
      const status = str(s.status);
      const governor = str(s.governor);
      const predicate = str(s.predicate);
      return {
        rule: typeof s.rule === "string" ? s.rule : "",
        detail: typeof s.detail === "string" ? s.detail : "",
        ...(status !== undefined ? { status } : {}),
        ...(governor !== undefined ? { governor } : {}),
        ...(predicate !== undefined ? { predicate } : {}),
      };
    });
}

/**
 * The latest engine decision for one workout_exercise, newest first. RLS-scoped:
 * `engine_decisions` has an owner-or-admin SELECT policy, so the user's own client
 * reads only their own rows — no service client needed. Returns null when the row
 * has no decision yet (a planned row the reconcile hasn't normalized into a seed
 * decision, or pre-phase-2 history) — the caller shows the row stamp alone.
 */
export async function getPrescriptionAudit(
  client: Client,
  userId: string,
  workoutExerciseId: string,
  includeExplanation = false,
): Promise<PrescriptionAudit | null> {
  const { data, error } = await client
    .from("engine_decisions")
    .select("id, kind, params_version, created_at, output, inputs")
    .eq("user_id", userId)
    .eq("workout_exercise_id", workoutExerciseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // doc 19 §3: the coaching line is keyed to the decision id, so joining the
  // row's LATEST decision (above) makes staleness structurally impossible.
  // Fetched only when serving is on — shadow mode stores but never shows.
  // The `prompt_version >= 3` gate is the seam-inversion serving cut: v1–v2
  // whole-blob rows are never served, so they age out as decisions recompute.
  let explanation: string | null = null;
  if (includeExplanation) {
    const { data: stored, error: explanationError } = await client
      .from("decision_explanations")
      .select("body")
      .eq("decision_id", data.id)
      .eq("user_id", userId)
      .gte("prompt_version", 3)
      .maybeSingle();
    if (explanationError) throw explanationError;
    explanation = stored?.body ?? null;
  }

  const rationale = (data.output as { rationale?: unknown } | null)?.rationale;
  return {
    kind: data.kind as EngineDecisionKind,
    decisionVersion: data.params_version,
    decidedAt: data.created_at,
    rationale: typeof rationale === "string" ? rationale : null,
    trace: readTrace(data.output),
    output: readOutputNumbers(data.output),
    previous: readOutputNumbers(
      (data.inputs as { previous?: unknown } | null)?.previous ?? null,
    ),
    explanation,
  };
}

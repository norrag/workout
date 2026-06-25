import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EngineDecisionKind } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

/** One step of an engine decision's trace (rule + human-readable detail). */
export interface AuditTraceStep {
  rule: string;
  detail: string;
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
}

/** Coerce the stored `output` jsonb into the trace steps we display. Pure;
 *  exported for unit testing (the stored jsonb is untyped, so it is defensively
 *  parsed). */
export function readTrace(output: unknown): AuditTraceStep[] {
  const raw = (output as { trace?: unknown } | null)?.trace;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is { rule?: unknown; detail?: unknown } => !!s && typeof s === "object")
    .map((s) => ({
      rule: typeof s.rule === "string" ? s.rule : "",
      detail: typeof s.detail === "string" ? s.detail : "",
    }));
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
): Promise<PrescriptionAudit | null> {
  const { data, error } = await client
    .from("engine_decisions")
    .select("kind, params_version, created_at, output")
    .eq("user_id", userId)
    .eq("workout_exercise_id", workoutExerciseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rationale = (data.output as { rationale?: unknown } | null)?.rationale;
  return {
    kind: data.kind as EngineDecisionKind,
    decisionVersion: data.params_version,
    decidedAt: data.created_at,
    rationale: typeof rationale === "string" ? rationale : null,
    trace: readTrace(data.output),
  };
}

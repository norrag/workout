import "server-only";
import type { EngineInputs, EngineParams, Prescription } from "@/lib/engine";
import type { EngineDecisionKind } from "@/lib/types/database";
import { createServiceClient } from "@/lib/supabase/service";
import { reportError } from "@/lib/observability/report";
import { scheduleDecisionExplanations } from "@/lib/llm/explanations";
import { engineCodeSha, hashParams } from "./params-provenance";

/**
 * Seed-decision recording (doc 14 phase 2, §6.2).
 *
 * A seed prescription (`seedMeso` — meso activation, open-workout regeneration on
 * a plan edit, or a slot added mid-workout) is a cached derived value just like a
 * week N→N+1 advance, and goes stale the same way when an input changes. Phase 1
 * recorded a decision only for advances, so seed rows had no replay source and the
 * freshness reconcile skipped them. Phase 2 records a `kind:"seed"` decision so
 * they participate in exactly the same recompute.
 *
 * `engine_decisions` is service-role-only (no user INSERT policy — it is the audit
 * trail). The seed WRITE sites (`startMeso`, `regenerateOpenWorkouts`,
 * `addWorkoutExercises`) run on the user's client, which can stamp the prescription
 * + `dep_fingerprint` (it owns `workout_exercises`) but cannot write the decision.
 * So this module obtains a service client for the decision write only, scoped
 * explicitly to the passed `userId` (hard rule #4). `server-only` keeps it out of
 * any client bundle.
 *
 * Best-effort by design: a seed decision is an optimization (it lets the row
 * participate in freshness), never a correctness gate for the user-facing seed.
 * If the write fails, the row keeps its stamped fingerprint but no decision — i.e.
 * it is simply skipped by the reconcile, exactly the pre-phase-2 behavior — so a
 * service-client hiccup never breaks meso start / plan save / add-exercise.
 */

/** One slot prescription paired with the engine I/O that produced it. Defaults
 *  to a cold-start seed; a swap/add that progressed a §9 lookback source instead
 *  records `kind:"advance"` with that source (N33 — the resolver derives the
 *  kind from the data, and the decision must record what actually ran). */
export interface SeededDecision {
  workoutExerciseId: string;
  exerciseId: string;
  inputs: EngineInputs;
  output: Prescription;
  /** which engine produced it; absent ⇒ "seed" (the historical shape) */
  kind?: EngineDecisionKind;
  /** the week-(N-k) source an advance progressed from; absent/null for a seed */
  sourceWorkoutExerciseId?: string | null;
}

/** Cycle coordinates shared by every seeded row of one workout/day. */
export interface SeedDecisionCoords {
  workoutId: string;
  microcycleId: string;
  mesocycleId: string;
}

/** Recording-time provenance for a slot decision. A seed mirrors the advance
 *  shape with a zeroed RIR fallback (a cold start has no logged sets); an
 *  advance computes the doc-11 fallback from its source's actual sets, exactly
 *  like `decisionProvenance` in progression.ts. */
function slotProvenance(
  kind: EngineDecisionKind,
  inputs: EngineInputs,
  codeSha: string | null,
): Record<string, unknown> {
  const working = (inputs.actualSets ?? []).filter((s) => !s.isWarmup);
  const assumed = working.filter((s) => s.rirReported == null).length;
  return {
    code_sha: codeSha,
    rir_fallback: {
      rule: "null rir_reported assumed at the prescribed target RIR (doc 11)",
      working_sets: working.length,
      sets_assumed: assumed,
      applied: assumed > 0,
    },
    ...(kind === "seed"
      ? { seed: { reason: "cold start (seedMeso): no logged history" } }
      : {
          slot_advance: {
            reason:
              "swap/add progressed a recent same-slot instance (N33 §9 lookback)",
          },
        }),
  };
}

/**
 * Pure: assemble the `engine_decisions` insert rows for a batch of seeded
 * prescriptions. Exported for unit testing (the only logic worth asserting;
 * the insert itself is trivial I/O).
 */
export function buildSeedDecisionRows(
  userId: string,
  rows: SeededDecision[],
  coords: SeedDecisionCoords,
  paramsVersion: number,
  paramsHash: string,
  codeSha: string | null,
) {
  return rows.map((r) => {
    const kind: EngineDecisionKind = r.kind ?? "seed";
    return {
      user_id: userId,
      workout_exercise_id: r.workoutExerciseId,
      exercise_id: r.exerciseId,
      // a seed has no week-N source — it is a cold start, not a progression;
      // an advance records the §9 lookback source it progressed
      source_workout_exercise_id:
        kind === "seed" ? null : (r.sourceWorkoutExerciseId ?? null),
      workout_id: coords.workoutId,
      microcycle_id: coords.microcycleId,
      mesocycle_id: coords.mesocycleId,
      inputs: r.inputs as unknown as Record<string, unknown>,
      output: r.output as unknown as Record<string, unknown>,
      params_version: paramsVersion,
      params_hash: paramsHash,
      provenance: slotProvenance(kind, r.inputs, codeSha),
      kind,
    };
  });
}

/**
 * Record seed decisions for a batch of just-inserted seed rows. Best-effort:
 * swallows + logs errors so the user-facing seed operation never fails on the
 * audit write (see module note). Returns the number of decisions written.
 */
export async function recordSeedDecisions(
  userId: string,
  rows: SeededDecision[],
  coords: SeedDecisionCoords,
  params: EngineParams,
  paramsVersion: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const service = createServiceClient();
    const paramsHash = hashParams(params as unknown as Record<string, unknown>);
    const inserts = buildSeedDecisionRows(
      userId,
      rows,
      coords,
      paramsVersion,
      paramsHash,
      engineCodeSha(),
    );
    const { data, error } = await service
      .from("engine_decisions")
      .insert(inserts)
      .select("id");
    if (error) throw error;
    // N58 / doc 18 §5: explanations generate at decision-write, fire-and-forget
    // (a no-op unless the LLM feature is enabled; failures leave no row ⇒ the
    // deterministic quick-read renders)
    scheduleDecisionExplanations(
      userId,
      (data ?? []).map((d) => d.id),
    );
    return inserts.length;
  } catch (e) {
    // non-fatal: the row keeps its stamped fingerprint but no decision, so the
    // reconcile simply skips it (pre-phase-2 behavior). Never break the seed —
    // but report it (R20): every skipped row is an audit-trail gap.
    await reportError("queries:record-seed-decisions", e, {
      userId,
      mesocycleId: coords.mesocycleId,
      rows: rows.length,
    });
    return 0;
  }
}

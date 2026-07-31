import type { EngineParams } from "../params";
import type { EngineInputs, Prescription } from "../types";
import { roundToStep } from "./rounding";

/** Deload: a fixed fraction of the meso's peak load and sets, high RIR. */
export function prescribeDeload(
  inputs: EngineInputs,
  params: EngineParams,
  /** N67 — the rounding lattice's phase; null ⇒ the absolute grid */
  origin: number | null = null,
): Prescription {
  const peak = inputs.weekPeak ?? inputs.previous;
  const baseWeight = peak?.weight ?? inputs.initial?.weight ?? null;
  const baseSets = peak?.sets ?? inputs.initial?.sets ?? params.min_sets;
  const reps = peak?.reps ?? inputs.initial?.reps ?? null;

  const weight =
    baseWeight === null
      ? null
      : roundToStep(
          baseWeight * params.deload.load_pct,
          inputs.exercise.equipmentType,
          params,
          origin,
        );
  const sets = Math.max(
    params.min_sets,
    Math.round(baseSets * params.deload.set_pct),
  );

  return {
    weight,
    reps,
    sets,
    targetRir: params.deload.target_rir,
    rationale: `Deload: ${Math.round(params.deload.load_pct * 100)}% of peak load, ${sets} sets, ${params.deload.target_rir}+ RIR. Recover before the next block.`,
    trace: [
      {
        rule: "deload",
        detail: `deload: ${Math.round(params.deload.load_pct * 100)}% of peak load, ${sets} sets, ${params.deload.target_rir}+ RIR`,
      },
    ],
  };
}

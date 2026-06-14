/**
 * Progression engine — pure and deterministic (docs/04-feedback-engine.md).
 * `prescribe(inputs, params)` does no I/O; all tunables come from `params`
 * (the active `engine_params` row, validated by `engineParamsSchema`).
 */
import { engineParamsSchema, type EngineParams } from "./params";
import {
  engineInputsSchema,
  type EngineInputs,
  type Prescription,
} from "./types";
import { assessPerformance } from "./rules/performance";
import { modulateFromFeedback } from "./rules/feedback";
import { prescribeDeload } from "./rules/deload";
import { rirRamp, type WeekPlan } from "./rules/rir";
import { incrementFor, roundToStep } from "./rules/rounding";

export { rirRamp, type WeekPlan };
export { engineParamsSchema, DEFAULT_ENGINE_PARAMS } from "./params";
export { macroGoalTypes, phaseNames } from "./params";
export { engineInputsSchema } from "./types";
export {
  planMacrocycle,
  spreadPhases,
  macroPlanInputSchema,
  macroProfileSchema,
  type MacroPlan,
  type MacroPlanInput,
  type MacroPlanArgs,
  type MacroProfile,
  type MacroGoal,
  type MacroRange,
  type PhaseName,
} from "./macro";
export {
  estimateE1rm,
  epley,
  brzycki,
  type E1rmEstimate,
  type E1rmConfidence,
} from "./e1rm";
export {
  composeAutoregulationSummary,
  composeMesoCompleteSummary,
  type SummaryContext,
  type SummaryDelta,
} from "./summary";
export type { EngineInputs, Prescription, EngineParams };

export function prescribe(
  rawInputs: EngineInputs,
  rawParams: EngineParams,
): Prescription {
  const inputs = engineInputsSchema.parse(rawInputs);
  const params = engineParamsSchema.parse(rawParams);

  // §6 deload week short-circuits everything else
  if (inputs.week.isDeload) {
    return prescribeDeload(inputs, params);
  }

  const reasons: string[] = [];

  // §1 anchor on actuals
  const perf = assessPerformance(inputs, params.small_miss_reps);

  // cold start: no history — use previous prescription or plan initials
  if (perf.outcome === "no_data") {
    const base = inputs.previous ?? {
      weight: inputs.initial?.weight ?? null,
      reps: inputs.initial?.reps ?? null,
      sets: inputs.initial?.sets ?? params.min_sets,
      targetRir: inputs.week.targetRir,
    };
    return {
      weight:
        base.weight === null
          ? null
          : roundToStep(
              base.weight,
              inputs.exercise.equipmentType,
              inputs.user.units,
              params,
            ),
      reps: base.reps,
      sets: clampSets(base.sets, params),
      targetRir: inputs.week.targetRir,
      rationale: `Starting prescription at ${inputs.week.targetRir} RIR (${perf.detail}).`,
    };
  }

  const baseWeight = perf.bestWeight!;
  const baseReps = inputs.previous?.reps ?? perf.bestReps!;
  let sets = inputs.previous?.sets ?? inputs.initial?.sets ?? params.min_sets;
  let weight = baseWeight;
  let reps = baseReps;

  // §4 feedback modulation (computed first: the pain gate caps §3 increases)
  const mod = modulateFromFeedback(inputs, params);
  reasons.push(...mod.notes);

  // §2 RIR step: dropping target RIR with the same load is itself progression
  const prevRir = inputs.previous?.targetRir ?? inputs.week.targetRir;
  const rirStepped = inputs.week.targetRir < prevRir;

  // §3 performance delta + §5 goal bias
  const style = params.progression_style[inputs.goalType] ?? "hold";
  const increment = incrementFor(
    inputs.exercise.equipmentType,
    inputs.user.experienceLevel,
    inputs.user.units,
    params,
  );

  if (perf.outcome === "met" || perf.outcome === "beat") {
    const wantsLoad = style === "load_first" || perf.outcome === "beat";
    if (wantsLoad && !mod.painGated && !mod.sessionDampened) {
      weight = baseWeight + increment;
      reasons.unshift(
        `+${increment} ${inputs.user.units}: ${perf.detail}`,
      );
      if (rirStepped) {
        reasons.push(
          `target RIR steps ${prevRir} to ${inputs.week.targetRir}`,
        );
      }
    } else if (style === "reps_first" && !mod.sessionDampened) {
      reps = baseReps + 1;
      reasons.unshift(`+1 rep: ${perf.detail}`);
    } else {
      weight = baseWeight;
      if (mod.painGated || mod.sessionDampened) {
        reasons.unshift(`hold ${baseWeight} ${inputs.user.units}: ${perf.detail}`);
      } else {
        reasons.unshift(
          rirStepped
            ? `hold load; RIR drop ${prevRir} to ${inputs.week.targetRir} is the progression (${perf.detail})`
            : `hold steady per ${inputs.goalType} goal (${perf.detail})`,
        );
      }
    }
  } else if (perf.outcome === "small_miss") {
    weight = baseWeight;
    reasons.unshift(`hold load, close miss: ${perf.detail}`);
  } else {
    // big miss
    weight = baseWeight * params.regression_pct;
    reasons.unshift(
      `-${Math.round((1 - params.regression_pct) * 100)}% load: ${perf.detail}`,
    );
  }

  // pain gate is a hard bound: never above what was actually handled
  if (mod.painGated && weight > baseWeight) {
    weight = baseWeight;
  }

  sets = clampSets(sets + mod.setDelta, params);

  let finalWeight = roundToStep(
    weight,
    inputs.exercise.equipmentType,
    inputs.user.units,
    params,
  );
  // rounding must never lift a gated/held weight above what was handled
  if ((mod.painGated || mod.sessionDampened) && finalWeight > baseWeight) {
    finalWeight = baseWeight;
  }

  return {
    weight: finalWeight,
    reps,
    sets,
    targetRir: inputs.week.targetRir,
    rationale: capitalize(reasons.join("; ") + "."),
  };
}

/** §7 meso seeding: start a new meso from the prior meso's peak, backed off. */
export function seedMeso(
  priorPeak: { weight: number | null; reps: number | null; sets: number } | null,
  initial: { weight: number | null; reps: number | null; sets: number } | null,
  exercise: EngineInputs["exercise"],
  user: EngineInputs["user"],
  startRir: number,
  rawParams: EngineParams,
): Prescription {
  const params = engineParamsSchema.parse(rawParams);
  if (priorPeak?.weight != null) {
    return {
      weight: roundToStep(
        priorPeak.weight * params.meso_seed_backoff_pct,
        exercise.equipmentType,
        user.units,
        params,
      ),
      reps: priorPeak.reps,
      sets: clampSets(priorPeak.sets, params),
      targetRir: startRir,
      rationale: `Seeded from prior meso peak, backed off ${Math.round((1 - params.meso_seed_backoff_pct) * 100)}% to start at ${startRir} RIR.`,
    };
  }
  return {
    weight:
      initial?.weight == null
        ? null
        : roundToStep(initial.weight, exercise.equipmentType, user.units, params),
    reps: initial?.reps ?? null,
    sets: clampSets(initial?.sets ?? params.min_sets, params),
    targetRir: startRir,
    rationale: `No prior history; starting from plan defaults at ${startRir} RIR.`,
  };
}

/** Progress scoring v1: percentage e1RM trend between two points. */
export function scoreProgress(
  earliestE1rm: number | null,
  latestE1rm: number | null,
): number | null {
  if (!earliestE1rm || !latestE1rm || earliestE1rm <= 0) return null;
  return Math.round(((latestE1rm - earliestE1rm) / earliestE1rm) * 1000) / 10;
}

/** Epley estimated 1RM. */
export function epleyE1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

function clampSets(sets: number, params: EngineParams): number {
  return Math.min(params.max_sets_per_exercise, Math.max(params.min_sets, sets));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

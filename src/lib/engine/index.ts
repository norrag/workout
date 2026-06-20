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
  type DecisionTraceStep,
} from "./types";
import { assessPerformance, gradeOnRir } from "./rules/performance";
import { modulateFromFeedback } from "./rules/feedback";
import { prescribeDeload } from "./rules/deload";
import { rirRamp, type WeekPlan } from "./rules/rir";
import { incrementFor, roundToStep } from "./rules/rounding";
import { weightForRepsAtRir, predictRepsAtWeight } from "./reps";

export { rirRamp, type WeekPlan };
export { engineParamsSchema, DEFAULT_ENGINE_PARAMS, toEngineEquipment } from "./params";
export { macroGoalTypes, phaseNames } from "./params";
export { engineInputsSchema } from "./types";
export {
  planMacrocycle,
  spreadPhases,
  suggestMesoLength,
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
  predictRepsAtWeight,
  impliedRirAtReps,
  effectiveRepsForE1rm,
  recencyWeightedE1rm,
  type E1rmSample,
  type E1rmAnchor,
} from "./reps";
export {
  composeAutoregulationSummary,
  composeMesoCompleteSummary,
  type SummaryContext,
  type SummaryDelta,
} from "./summary";
export {
  muscleVolumeLandmark,
  classifyVolume,
  assessMuscleVolume,
  type ExperienceLevel,
  type VolumeZone,
  type VolumeLandmark,
  type VolumeAssessment,
} from "./volume";
export {
  pplCategory,
  classifyDayEmphasis,
  type PplCategory,
  type MuscleRole,
  type DaySlotVolume,
  type DayClassification,
  type DayEmphasis,
} from "./classification";
export {
  resolveEffectiveParams,
  type ExerciseParamOverride,
} from "./effective-params";
export { incrementFor } from "./rules/rounding";
export type { EquipmentType } from "./params";
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

  const reasons: DecisionTraceStep[] = [];

  // §1 anchor on actuals
  const perf = assessPerformance(inputs, params.small_miss_reps);

  // cold start: no history vs the previous prescription
  if (perf.outcome === "no_data") {
    // swap-in / first session that nonetheless has prior history for this lift:
    // seed from the strength anchor rather than blank/plan defaults (doc 13 §9 /
    // the swap-in case) — pick the load for the window's low rep at this RIR.
    const winCS = repWindowFor(inputs.goalType, params);
    const anchorCS = inputs.strengthAnchor;
    if (
      params.weight_selection === "rep_window" &&
      anchorCS != null &&
      winCS != null &&
      confidenceAtLeast(anchorCS.confidence, params.reps_predict.min_confidence)
    ) {
      const raw = weightForRepsAtRir(
        anchorCS.value,
        winCS.target_low,
        inputs.week.targetRir,
        params,
      );
      if (raw != null) {
        const fw = roundToStep(
          raw,
          inputs.exercise.equipmentType,
          inputs.user.units,
          params,
        );
        const predicted = predictRepsAtWeight(
          anchorCS.value,
          fw,
          inputs.week.targetRir,
          params,
        );
        const reps =
          predicted == null
            ? winCS.target_low
            : Math.min(winCS.max, Math.max(winCS.min, predicted));
        const detail = `seeded from strength anchor (e1RM ${anchorCS.value} ${inputs.user.units}): ${fw} ${inputs.user.units} for ${reps} reps at ${inputs.week.targetRir} RIR`;
        return {
          weight: fw,
          reps,
          sets: clampSets(
            inputs.previous?.sets ?? inputs.initial?.sets ?? params.min_sets,
            params,
          ),
          targetRir: inputs.week.targetRir,
          rationale: capitalize(detail + "."),
          trace: [{ rule: "seed_anchor", detail }],
        };
      }
    }

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
      trace: [
        {
          rule: "cold_start",
          detail: `starting prescription at ${inputs.week.targetRir} RIR (${perf.detail})`,
        },
      ],
    };
  }

  const baseWeight = perf.bestWeight!;
  const baseReps = inputs.previous?.reps ?? perf.bestReps!;
  let sets = inputs.previous?.sets ?? inputs.initial?.sets ?? params.min_sets;
  let weight = baseWeight;
  let reps = baseReps;

  // §4 feedback modulation (computed first: the pain gate caps §3 increases)
  const mod = modulateFromFeedback(inputs, params);
  reasons.push(...mod.notes.map((detail) => ({ rule: "feedback", detail })));

  // §2 RIR step: dropping target RIR with the same load is itself progression
  const prevRir = inputs.previous?.targetRir ?? inputs.week.targetRir;
  const rirStepped = inputs.week.targetRir < prevRir;

  // §3 weight selection — rep-window (doc 13) or legacy increment, mode-gated.
  const goalWindow = repWindowFor(inputs.goalType, params);
  const anchor = inputs.strengthAnchor;
  const useRepWindow =
    params.weight_selection === "rep_window" &&
    anchor != null &&
    goalWindow != null &&
    confidenceAtLeast(anchor.confidence, params.reps_predict.min_confidence);

  // rep-window reps follow the *rounded* weight, so resolve them after rounding
  let repWindow: {
    anchorValue: number;
    win: NonNullable<typeof goalWindow>;
    gradeDetail: string | null;
  } | null = null;

  if (useRepWindow) {
    // §9.2 Option-A schedule: walk reps up the window at a held load; reset to
    // the bottom and let the load step when the window tops out. The anchor (not
    // a fixed increment / regression %) carries real strength change — including
    // a caught overperformance — and a falling anchor handles under-performance.
    const prevReps = baseReps;
    const targetReps =
      prevReps >= goalWindow!.target_high
        ? goalWindow!.target_low
        : Math.min(goalWindow!.target_high, Math.max(goalWindow!.target_low, prevReps + 1));
    let w =
      weightForRepsAtRir(anchor!.value, targetReps, inputs.week.targetRir, params) ??
      baseWeight;
    if ((mod.painGated || mod.sessionDampened) && w > baseWeight) w = baseWeight;
    weight = w;
    const grade =
      params.grading === "rir"
        ? gradeOnRir(perf, anchor!.value, prevRir, params)
        : null;
    repWindow = {
      anchorValue: anchor!.value,
      win: goalWindow!,
      gradeDetail: grade?.detail ?? null,
    };
  } else {
    // ----- legacy increment path (unchanged — parity, doc 13 §3.8) ----------
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
        reasons.unshift({
          rule: "load",
          detail: `+${increment} ${inputs.user.units}: ${perf.detail}`,
        });
        if (rirStepped) {
          reasons.push({
            rule: "rir",
            detail: `target RIR steps ${prevRir} to ${inputs.week.targetRir}`,
          });
        }
      } else if (style === "reps_first" && !mod.sessionDampened) {
        reps = baseReps + 1;
        reasons.unshift({ rule: "load", detail: `+1 rep: ${perf.detail}` });
      } else {
        weight = baseWeight;
        if (mod.painGated || mod.sessionDampened) {
          reasons.unshift({
            rule: "load",
            detail: `hold ${baseWeight} ${inputs.user.units}: ${perf.detail}`,
          });
        } else {
          reasons.unshift({
            rule: "load",
            detail: rirStepped
              ? `hold load; RIR drop ${prevRir} to ${inputs.week.targetRir} is the progression (${perf.detail})`
              : `hold steady per ${inputs.goalType} goal (${perf.detail})`,
          });
        }
      }
    } else if (perf.outcome === "small_miss") {
      weight = baseWeight;
      // a "small_miss" holds the load for two different reasons: a genuine
      // reps-short miss, or reps met/beaten but at a lower RIR than target (the
      // set was harder than prescribed). Word each accurately (§5.11) — calling
      // the latter a "close miss" misread a set the lifter actually hit.
      reasons.unshift({
        rule: "load",
        detail: perf.repsMet
          ? `hold load, hit reps but below target RIR: ${perf.detail}`
          : `hold load, close miss: ${perf.detail}`,
      });
    } else {
      // big miss
      weight = baseWeight * params.regression_pct;
      reasons.unshift({
        rule: "load",
        detail: `-${Math.round((1 - params.regression_pct) * 100)}% load: ${perf.detail}`,
      });
    }

    // pain gate is a hard bound: never above what was actually handled
    if (mod.painGated && weight > baseWeight) {
      weight = baseWeight;
    }
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

  // rep-window: reps derive from the *rounded* weight so prescribed = predicted
  // = displayed (doc 13 decision 3); nudge one loadable step toward center if
  // rounding pushed predicted reps outside the hard [min,max] bounds (§4.2.3).
  if (repWindow) {
    finalWeight = boundRepsToWindow(
      finalWeight,
      repWindow.anchorValue,
      repWindow.win,
      inputs,
      params,
    );
    if ((mod.painGated || mod.sessionDampened) && finalWeight > baseWeight) {
      finalWeight = baseWeight;
    }
    const predicted = predictRepsAtWeight(
      repWindow.anchorValue,
      finalWeight,
      inputs.week.targetRir,
      params,
    );
    if (predicted != null) {
      reps = Math.min(repWindow.win.max, Math.max(repWindow.win.min, predicted));
    }
    const move = finalWeight - baseWeight;
    const moveDetail =
      Math.abs(move) < 1e-9
        ? `hold ${finalWeight} ${inputs.user.units}, reps to ${reps} of ${repWindow.win.target_low}–${repWindow.win.target_high}`
        : `${move > 0 ? "+" : "−"}${round2(Math.abs(move))} ${inputs.user.units} to ${reps} reps at ${inputs.week.targetRir} RIR`;
    reasons.unshift({
      rule: "load",
      detail: `${moveDetail} (anchor e1RM ${repWindow.anchorValue} ${inputs.user.units})`,
    });
    if (repWindow.gradeDetail) {
      reasons.push({ rule: "grade", detail: repWindow.gradeDetail });
    }
    if (rirStepped) {
      reasons.push({
        rule: "rir",
        detail: `target RIR steps ${prevRir} to ${inputs.week.targetRir}`,
      });
    }
  }

  return {
    weight: finalWeight,
    reps,
    sets,
    targetRir: inputs.week.targetRir,
    // rationale is derived from the trace so the two can never drift (P0-4)
    rationale: capitalize(reasons.map((r) => r.detail).join("; ") + "."),
    trace: reasons,
  };
}

type RepWindow = NonNullable<ReturnType<typeof repWindowFor>>;
const CONF_RANK: Record<"low" | "moderate" | "high", number> = {
  low: 0,
  moderate: 1,
  high: 2,
};

/** Resolve the goal's rep window, falling back to the hypertrophy window. */
function repWindowFor(goal: EngineInputs["goalType"], params: EngineParams) {
  return params.rep_window[goal] ?? params.rep_window.hypertrophy ?? null;
}

function confidenceAtLeast(
  c: "low" | "moderate" | "high",
  min: "low" | "moderate" | "high",
): boolean {
  return CONF_RANK[c] >= CONF_RANK[min];
}

/**
 * Keep the prescribed reps inside the window's hard bounds: if rounding the
 * anchor-chosen load left predicted reps above `max` (load too light) add one
 * loadable step; below `min` (too heavy) drop one. A single step is enough.
 */
function boundRepsToWindow(
  weight: number,
  anchorValue: number,
  win: RepWindow,
  inputs: EngineInputs,
  params: EngineParams,
): number {
  const predicted = predictRepsAtWeight(
    anchorValue,
    weight,
    inputs.week.targetRir,
    params,
  );
  if (predicted == null) return weight;
  const step = params.rounding[inputs.exercise.equipmentType]?.[inputs.user.units] ?? 0;
  if (step <= 0) return weight;
  if (predicted > win.max) {
    return roundToStep(weight + step, inputs.exercise.equipmentType, inputs.user.units, params);
  }
  if (predicted < win.min) {
    return roundToStep(weight - step, inputs.exercise.equipmentType, inputs.user.units, params);
  }
  return weight;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
      trace: [
        {
          rule: "seed",
          detail: `seeded from prior meso peak, backed off ${Math.round((1 - params.meso_seed_backoff_pct) * 100)}% to start at ${startRir} RIR`,
        },
      ],
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
    trace: [
      {
        rule: "seed",
        detail: `no prior history; starting from plan defaults at ${startRir} RIR`,
      },
    ],
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

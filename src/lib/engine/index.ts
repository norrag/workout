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
import { roundToStep } from "./rules/rounding";
import {
  weightForRepsAtRir,
  predictRepsAtWeight,
  type E1rmAnchor,
} from "./reps";
import { prescribeBodyweight, usesBodyweightModel } from "./rules/bodyweight";

export { rirRamp, type WeekPlan };
export { engineParamsSchema, DEFAULT_ENGINE_PARAMS, toEngineEquipment } from "./params";
export { engineInputsSchema } from "./types";
export {
  planMacrocycle,
  spreadPhases,
  suggestMesoLength,
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
  volumeCountingWeights,
  fractionalSetCount,
  type ExperienceLevel,
  type VolumeZone,
  type VolumeLandmark,
  type VolumeAssessment,
  type VolumeCountingWeights,
  type RoleSetCount,
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
export {
  isBodyweightLoad,
  toEngineLoadType,
  coerceLoadType,
  effectiveLoad,
  enteredForEffective,
  type LoadType,
} from "./load";
export type { EquipmentType } from "./params";
export type { EngineInputs, Prescription, EngineParams };

export function prescribe(
  rawInputs: EngineInputs,
  rawParams: EngineParams,
): Prescription {
  const inputs = engineInputsSchema.parse(rawInputs);
  const params = engineParamsSchema.parse(rawParams);

  // T-I2: bodyweight load types price on effective load (bodyweight ± entered) and
  // progress on reps at a fixed load (bodyweight_only) or the rep-window in effective
  // space (loadable/assisted). Gated on `bodyweight_model`; the external path below
  // is unchanged. Covers deload + cold start internally.
  if (usesBodyweightModel(inputs, params)) {
    return prescribeBodyweight(inputs, params);
  }

  // §6 deload week short-circuits everything else.
  if (inputs.week.isDeload) {
    // Anchor-based deload (gated by `deload_anchor_rir`): select the load the
    // SAME way a working week does — pick the weight that lands window-centered
    // reps at the week's (higher) deload target RIR, from the strength anchor —
    // instead of the legacy "load_pct of peak, carry the peak reps" heuristic.
    // That heuristic produced an internally inconsistent triple (e.g. 75 lb × 8
    // reps @ 4 RIR, when 8 reps at ≈55% of peak leaves far more than 4 in
    // reserve), which the live predictor then "corrected" by re-deriving reps
    // from the light load + RIR — exploding toward its rep cap (~32). Choosing
    // the load from the anchor makes prescribed reps = predicted reps at the
    // deload RIR by construction, so the prescription and the logging field agree.
    const deloadRir = inputs.week.targetRir; // = params.deload.target_rir (rir.ts)
    const win = repWindowFor(inputs.goalType, params);
    const anchor = inputs.strengthAnchor;
    if (
      (params.deload_anchor_rir ?? false) &&
      params.weight_selection === "rep_window" &&
      anchor != null &&
      win != null &&
      confidenceAtLeast(anchor.confidence, params.reps_predict.min_confidence)
    ) {
      // center the deload on the goal's window (≈10 reps for hypertrophy 8–12),
      // i.e. "the same model as normal, just a higher RIR" — no rep climb.
      const targetReps = Math.round((win.target_low + win.target_high) / 2);
      const raw = weightForRepsAtRir(anchor.value, targetReps, deloadRir, params);
      if (raw != null) {
        let finalWeight = roundToStep(
          raw,
          inputs.exercise.equipmentType,
          params,
        );
        // keep reps inside the window if rounding nudged them out (same bound the
        // working path uses; predictRepsAtWeight here reads the deload RIR).
        finalWeight = boundRepsToWindow(
          finalWeight,
          anchor.value,
          win,
          inputs,
          params,
        );
        const predicted = predictRepsAtWeight(
          anchor.value,
          finalWeight,
          deloadRir,
          params,
        );
        const reps =
          predicted == null
            ? targetReps
            : Math.min(win.max, Math.max(win.min, predicted));
        const baseSets =
          inputs.weekPeak?.sets ??
          inputs.previous?.sets ??
          inputs.initial?.sets ??
          params.min_sets;
        const sets = clampSets(
          Math.max(params.min_sets, Math.round(baseSets * params.deload.set_pct)),
          params,
        );
        const detail = `deload off strength anchor (e1RM ${anchor.value} lb): ${finalWeight} lb for ${reps} reps at ${deloadRir} RIR, ${sets} sets`;
        return {
          weight: finalWeight,
          reps,
          sets,
          targetRir: deloadRir,
          rationale: capitalize(detail + ". Recover before the next block."),
          trace: [{ rule: "deload", detail }],
        };
      }
    }
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
        const detail = `seeded from strength anchor (e1RM ${anchorCS.value} lb): ${fw} lb for ${reps} reps at ${inputs.week.targetRir} RIR`;
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

  // R24: a no-anchor hold must hold EXACTLY — set on that branch to skip the
  // final rounding (27.5 lb on a 5-lb step used to prescribe 30 with a
  // rationale still reading "hold 27.5 lb": a fabricated +step on the one path
  // whose whole point, per T-I3/T-I5, is never inventing numbers).
  let heldNoAnchor = false;

  // rep-window reps follow the *rounded* weight, so resolve them after rounding
  let repWindow: {
    anchorValue: number;
    win: NonNullable<typeof goalWindow>;
    gradeDetail: string | null;
    /** the Option-A schedule reps for this week (held effective workload) */
    targetReps: number;
    /** hold the exact load + schedule reps: a gate blocked a warranted
     *  increase (§S5) or the hold-week deadband absorbed anchor drift (§R24b) */
    gateHeld: boolean;
  } | null = null;

  if (useRepWindow) {
    // §9.2 Option-A schedule: walk reps up the window at a held load; reset to
    // the bottom and let the load step when the window tops out. The anchor (not
    // a fixed increment / regression %) carries real strength change — including
    // a caught overperformance — and a falling anchor handles under-performance.
    // §v12 #1: the climb advances off what was actually PERFORMED — the minimum
    // working-set reps (double progression resets only when *every* set reached
    // the top), not the previous *prescription* (which would bump the load even
    // when the top set was prescribed but missed). Gated; falls back to the
    // prescribed reps when the flag is off or there are no logged working sets.
    const workingReps = inputs.actualSets
      .filter((s) => !s.isWarmup && s.reps > 0)
      .map((s) => s.reps);
    const performedMin = workingReps.length ? Math.min(...workingReps) : null;
    const prevReps =
      (params.climb_on_performed_reps ?? false) && performedMin != null
        ? performedMin
        : baseReps;
    // §R24a: the +1 climb exists to offset a −1 RIR step (constant effective
    // reps ⇒ held load, doc 13 §9.2). On a ramp-hold week the step didn't
    // happen, so — gated — reps hold too; the unconditional +1 repriced the
    // load DOWN mid-meso. Topping the window still resets/steps regardless
    // (double progression earns the load step on performance, not the ramp).
    const toppedOut = prevReps >= goalWindow!.target_high;
    const climbs = rirStepped || !(params.climb_requires_rir_step ?? false);
    const targetReps = toppedOut
      ? goalWindow!.target_low
      : Math.min(
          goalWindow!.target_high,
          Math.max(goalWindow!.target_low, climbs ? prevReps + 1 : prevReps),
        );
    let repriced =
      weightForRepsAtRir(anchor!.value, targetReps, inputs.week.targetRir, params) ??
      baseWeight;
    // §R24b: a pure hold (same reps, same RIR) should return the handled load,
    // but the recency anchor decays between sessions — absorb a sub-step
    // shortfall as decay noise; a full step or more is real signal. The held
    // load is exact (like the §S5 gate hold): the window nudge and the
    // anchor-predictor reps clamp are skipped below, else they'd re-price the
    // very drift the deadband just absorbed.
    let deadbandHeld = false;
    const pureHold = !rirStepped && !toppedOut && targetReps <= baseReps;
    if ((params.hold_week_anchor_deadband ?? false) && pureHold) {
      const step = params.rounding[inputs.exercise.equipmentType] ?? 5;
      const drift = baseWeight - repriced;
      if (drift > 0 && drift < step) {
        reasons.push({
          rule: "load",
          detail: `hold-week deadband: anchor drifted −${round2(drift)} lb (under one ${step} lb step); holding ${baseWeight} lb`,
        });
        repriced = baseWeight;
        deadbandHeld = true;
      }
    }
    // §S5: a gate (pain or session dampener) blocks a warranted *increase*. The
    // legacy path then resets the load to baseWeight but re-derives reps from the
    // anchor predictor clamped to the window ceiling — producing a `weight × reps
    // @ RIR` triple whose implied RIR contradicts the target. When
    // `hold_rep_consistent` is set we instead HOLD the effective workload: keep the
    // load and prescribe the Option-A schedule reps (which rise one step as the RIR
    // ramp drops), so the triple stays internally consistent. Absent ⇒ legacy.
    const gateHeld =
      (mod.painGated || mod.sessionDampened) && repriced > baseWeight;
    const w = gateHeld ? baseWeight : repriced;
    weight = w;
    const grade =
      params.grading === "rir"
        ? gradeOnRir(perf, anchor!.value, prevRir, params)
        : null;
    repWindow = {
      anchorValue: anchor!.value,
      win: goalWindow!,
      gradeDetail: grade?.detail ?? null,
      targetReps,
      gateHeld: (gateHeld && (params.hold_rep_consistent ?? false)) || deadbandHeld,
    };
  } else {
    // ----- no-anchor safety hold (T-I4: the legacy increment/regression path is
    // retired) ----------------------------------------------------------------
    // The legacy model fabricated progression without a strength anchor (+fixed
    // increment on a hit, −regression_pct on a big miss, reps_first/load_first per
    // goal). The owner ruling (2026-06-25, T-I3) is anchor-only: real strength
    // change is carried by the recency anchor (rising or falling), never a fixed
    // step or hidden back-off. Under the active params (rep_window + bodyweight
    // model) every lift with usable history has an anchor, so this branch is a rare
    // SAFETY fallback for the no-confident-anchor case — HOLD the last load and reps
    // rather than invent a number. `setDelta` (volume autoregulation) still applies
    // below; the pain gate can only hold, never lift, so no extra bound is needed.
    weight = baseWeight;
    reps = baseReps;
    heldNoAnchor = true;
    const gated = mod.painGated || mod.sessionDampened;
    reasons.unshift({
      rule: "load",
      detail: `hold ${baseWeight} lb at ${baseReps} reps${gated ? " (gated)" : ""}; not enough recent data to reprice (${perf.detail})`,
    });
    if (rirStepped) {
      reasons.push({
        rule: "rir",
        detail: `target RIR steps ${prevRir} to ${inputs.week.targetRir} is the progression`,
      });
    }
  }

  sets = clampSets(sets + mod.setDelta, params);

  // a held load is already a real, previously-handled weight — rounding it to
  // the loadable step would move it (R24); everything else rounds as usual
  let finalWeight = heldNoAnchor
    ? weight
    : roundToStep(weight, inputs.exercise.equipmentType, params);
  // rounding must never lift a gated/held weight above what was handled
  if ((mod.painGated || mod.sessionDampened) && finalWeight > baseWeight) {
    finalWeight = baseWeight;
  }

  // rep-window: reps derive from the *rounded* weight so prescribed = predicted
  // = displayed (doc 13 decision 3); nudge one loadable step toward center if
  // rounding pushed predicted reps outside the hard [min,max] bounds (§4.2.3).
  if (repWindow) {
    if (repWindow.gateHeld) {
      // §S5 held: keep the exact handled load and prescribe the Option-A schedule
      // reps (the held effective workload). No boundRepsToWindow nudge (that would
      // move the held load) and no anchor-predictor clamp (that manufactures a
      // dishonest "@ N RIR" when the held load is far off an off-target anchor).
      finalWeight = baseWeight;
      reps = Math.min(
        repWindow.win.max,
        Math.max(repWindow.win.min, repWindow.targetReps),
      );
    } else {
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
    }
    const move = finalWeight - baseWeight;
    const moveDetail =
      Math.abs(move) < 1e-9
        ? `hold ${finalWeight} lb, reps to ${reps} of ${repWindow.win.target_low}–${repWindow.win.target_high}`
        : `${move > 0 ? "+" : "−"}${round2(Math.abs(move))} lb to ${reps} reps at ${inputs.week.targetRir} RIR`;
    reasons.unshift({
      rule: "load",
      detail: `${moveDetail} (anchor e1RM ${repWindow.anchorValue} lb)`,
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
  const step = params.rounding[inputs.exercise.equipmentType] ?? 0;
  if (step <= 0) return weight;
  const predAt = (w: number) =>
    predictRepsAtWeight(anchorValue, w, inputs.week.targetRir, params);

  // §v12 #2: prefer landing in the TARGET band [target_low, target_high]. If the
  // rounded load predicts above target_high, take one step up — but only when it
  // keeps reps at/above target_low (else the lighter load is a genuine coarse-step
  // buffer and we keep it). The hard [min,max] bounds are still enforced: if even
  // the buffer would breach a hard bound, step anyway. Symmetric below target_low.
  if (params.bound_to_target_window ?? false) {
    if (predicted > win.target_high) {
      const up = roundToStep(weight + step, inputs.exercise.equipmentType, params);
      const pu = predAt(up);
      if (pu != null && pu >= win.target_low) return up; // lands in the window
      if (predicted > win.max) return up; // buffer breaches the hard max → must step
      return weight;
    }
    if (predicted < win.target_low) {
      const down = roundToStep(weight - step, inputs.exercise.equipmentType, params);
      const pd = predAt(down);
      if (pd != null && pd <= win.target_high) return down;
      if (predicted < win.min) return down; // breaches the hard min → must step
      return weight;
    }
    return weight;
  }

  // legacy: only correct when the prediction breaches the hard [min,max] bounds.
  if (predicted > win.max) {
    return roundToStep(weight + step, inputs.exercise.equipmentType, params);
  }
  if (predicted < win.min) {
    return roundToStep(weight - step, inputs.exercise.equipmentType, params);
  }
  return weight;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * §7 meso seeding: start a new meso from the prior meso's peak, backed off.
 *
 * §S1 (standalone-prescription investigation 2026-06-23): when `seed_from_anchor`
 * is set (and weight_selection = rep_window with a confident anchor), seed week 1
 * exactly the way a mid-meso swap-in already does — pick the load for the window's
 * `target_low` reps at the start RIR off the recency strength anchor, and let the
 * reps follow that load — instead of carrying the prior peak's rep count verbatim
 * (which escaped the rep window entirely, the headline runaway-reps bug). Falls
 * back to the legacy peak-backoff / plan-default seed when the flag is off or there
 * is no confident anchor. `opts.goalType` resolves the per-goal window (seedMeso has
 * no goal otherwise); `opts.anchor` is the caller-computed recency anchor (engine
 * stays pure). It is a *derived* input, so it does not enter the freshness
 * fingerprint (doc 14 §3) — see buildSeedInputs/seedEngineInputs.
 *
 * §T-I5 (owner ruling 2026-06-25, WS-I): the legacy `priorPeak ×
 * meso_seed_backoff_pct` branch is DELETED outright (R24: it is gone for every
 * params row, not gated on `retire_prior_peak_seed` — that flag is inert and
 * retained only for historical-row parsing). It fabricated a seed (carried
 * `priorPeak.reps` verbatim off a never-performed per-column-max set). Seed
 * precedence is strictly: confident anchor → the user's plan `initial_*` (a
 * manual seed) → UNSEEDED (null weight, prompt the user). A prescription is
 * never invented from a peak set.
 */
export function seedMeso(
  priorPeak: { weight: number | null; reps: number | null; sets: number } | null,
  initial: { weight: number | null; reps: number | null; sets: number } | null,
  exercise: EngineInputs["exercise"],
  user: EngineInputs["user"],
  startRir: number,
  rawParams: EngineParams,
  opts?: {
    goalType?: EngineInputs["goalType"];
    anchor?: E1rmAnchor | null;
    bodyweight?: number | null;
  },
): Prescription {
  const params = engineParamsSchema.parse(rawParams);

  // T-I2: bodyweight load types seed through the bodyweight model (effective load
  // off the anchor; reps-only for bodyweight_only). Gated on `bodyweight_model`.
  if ((params.bodyweight_model ?? false) && exercise.loadType !== "external") {
    const seedInputs = engineInputsSchema.parse({
      exercise,
      user,
      goalType: opts?.goalType ?? "hypertrophy",
      week: { targetRir: startRir, isDeload: false },
      previous: null,
      actualSets: [],
      strengthAnchor: opts?.anchor ?? null,
      initial,
      bodyweight: opts?.bodyweight ?? null,
    });
    return prescribeBodyweight(seedInputs, params);
  }

  // §S1 anchor seed — mirrors prescribe()'s seed_anchor branch (index.ts:103-151)
  const anchor = opts?.anchor ?? null;
  const win = repWindowFor(opts?.goalType ?? "hypertrophy", params);
  if (
    (params.seed_from_anchor ?? false) &&
    params.weight_selection === "rep_window" &&
    anchor != null &&
    win != null &&
    confidenceAtLeast(anchor.confidence, params.reps_predict.min_confidence)
  ) {
    const raw = weightForRepsAtRir(anchor.value, win.target_low, startRir, params);
    if (raw != null) {
      const fw = roundToStep(raw, exercise.equipmentType, params);
      const predicted = predictRepsAtWeight(anchor.value, fw, startRir, params);
      const reps =
        predicted == null
          ? win.target_low
          : Math.min(win.max, Math.max(win.min, predicted));
      const detail = `seeded from strength anchor (e1RM ${anchor.value} lb): ${fw} lb for ${reps} reps at ${startRir} RIR`;
      return {
        weight: fw,
        reps,
        sets: clampSets(
          priorPeak?.sets ?? initial?.sets ?? params.min_sets,
          params,
        ),
        targetRir: startRir,
        rationale: capitalize(detail + "."),
        trace: [{ rule: "seed_anchor", detail }],
      };
    }
  }

  // T-I4 / T-I5 (owner ruling 2026-06-25): the legacy prior-peak × back-off seed is
  // RETIRED — it fabricated a seed (carried priorPeak.reps verbatim off a
  // never-performed per-column-max set, and never re-priced through the rep window).
  // Seed precedence is now strictly: confident recency anchor (above) → the user's
  // plan `initial_*` (a manual seed) → UNSEEDED (null weight, prompt the user).
  // Nothing is ever invented from a peak set. (`meso_seed_backoff_pct` is retained
  // in the schema for historical-row parsing only; no code reads it.)
  const hasInitial = initial?.weight != null;
  const { rationale, detail } = hasInitial
    ? {
        rationale: `Starting from your planned values at ${startRir} RIR.`,
        detail: `no confident anchor; starting from plan defaults at ${startRir} RIR`,
      }
    : {
        rationale: `Not enough confident recent data to prescribe — enter a starting weight to seed this exercise.`,
        detail: `no confident data to seed; awaiting a manual starting weight`,
      };
  return {
    weight: hasInitial
      ? roundToStep(initial!.weight!, exercise.equipmentType, params)
      : null,
    reps: initial?.reps ?? null,
    sets: clampSets(initial?.sets ?? params.min_sets, params),
    targetRir: startRir,
    rationale,
    trace: [{ rule: "seed", detail }],
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

// (epleyE1rm removed with T-A1 — raw single-formula Epley is retired
// everywhere; the engine's estimateE1rm/e1rm.ts is the one formula.)

function clampSets(sets: number, params: EngineParams): number {
  return Math.min(params.max_sets_per_exercise, Math.max(params.min_sets, sets));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

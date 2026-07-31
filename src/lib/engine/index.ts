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
  type SeedEarnContext,
} from "./types";
import { assessPerformance, gradeOnRir } from "./rules/performance";
import { modulateFromFeedback } from "./rules/feedback";
import { prescribeDeload } from "./rules/deload";
import { rirRamp, type WeekPlan } from "./rules/rir";
import { roundToStep, latticeOrigin } from "./rules/rounding";
import {
  weightForRepsAtRir,
  predictRepsAtWeight,
  type E1rmAnchor,
} from "./reps";
import { prescribeBodyweight, usesBodyweightModel } from "./rules/bodyweight";
import {
  PROGRESSION_RULE,
  assessProgression,
  progressionActive,
  type ProgressionAssessment,
} from "./rules/progression";
import { estimateE1rm as estimateE1rmCore } from "./predict";
import { effectiveLoad } from "./load";

export {
  PROGRESSION_RULE,
  progressionActive,
  complianceBand,
  setComplianceMarker,
  DEFAULT_COMPLIANCE_BAND,
  type ProgressionStatus,
  type ProgressionTraceStep,
} from "./rules/progression";
export {
  envelopeActive,
  deriveBandPosition,
  boundaryStep,
  MAX_BOUNDARY_STEP,
  type EnvelopeMesoOutcome,
  type EnvelopeParams,
} from "./rules/envelope";
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
  strengthTrend,
  volumeWeightedMean,
  DEFAULT_STRENGTH,
  type StrengthTrend,
  type StrengthTrendConfig,
  type StrengthTrendLabel,
} from "./strength";
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
export type { EngineInputs, Prescription, EngineParams, SeedEarnContext };

export function prescribe(
  rawInputs: EngineInputs,
  rawParams: EngineParams,
): Prescription {
  const inputs = engineInputsSchema.parse(rawInputs);
  const params = engineParamsSchema.parse(rawParams);

  // doc 16 — prescribed progression (earned-step overload). Inactive (block
  // absent / mode off / goal factor 0) ⇒ the core path below runs untouched:
  // byte-identical output, fingerprint, and trace (§2.7). A deload is not a
  // working prescription — it neither earns nor takes steps (§3.4), so it
  // bypasses the progression wrapper entirely.
  if (!progressionActive(inputs, params) || inputs.week.isDeload) {
    return prescribeCore(inputs, params);
  }
  return prescribeWithProgression(inputs, params);
}

/**
 * The pre-doc-16 prescription path, unchanged — everything is expressed
 * relative to the strength-anchor input, which is exactly what lets the
 * progression wrapper thread `A* = A + δ` through it (§3.1): the same climb,
 * deadband, gate-hold, window-bound, and rounding machinery composes on a
 * substituted anchor with no further changes. Takes ALREADY-PARSED inputs.
 */
function prescribeCore(
  inputs: EngineInputs,
  params: EngineParams,
): Prescription {
  // N67: the rounding lattice's phase for this exercise — the last load the
  // lifter actually entered, when the effective params ask for it. Null (the
  // default) keeps every rounding call on the absolute grid.
  const origin = latticeOrigin(inputs, params);

  // T-I2: bodyweight load types price on effective load (bodyweight ± entered) and
  // progress on reps at a fixed load (bodyweight_only) or the rep-window in effective
  // space (loadable/assisted). Gated on `bodyweight_model`; the external path below
  // is unchanged. Covers deload + cold start internally.
  if (usesBodyweightModel(inputs, params)) {
    return prescribeBodyweight(inputs, params, origin);
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
          origin,
        );
        // keep reps inside the window if rounding nudged them out (same bound the
        // working path uses; predictRepsAtWeight here reads the deload RIR).
        finalWeight = boundRepsToWindow(
          finalWeight,
          anchor.value,
          win,
          deloadRir,
          inputs.exercise.equipmentType,
          params,
          origin,
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
    return prescribeDeload(inputs, params, origin);
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
        // N51: rounding to the nearest increment lands heavy half the time —
        // re-price through the same window bound the working path applies, so
        // the seed never prescribes below target_low (e.g. 6 when the window
        // is 8–12) when stepping the weight down one increment fixes it.
        const fw = boundRepsToWindow(
          roundToStep(raw, inputs.exercise.equipmentType, params, origin),
          anchorCS.value,
          winCS,
          inputs.week.targetRir,
          inputs.exercise.equipmentType,
          params,
          origin,
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
              origin,
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
    : roundToStep(weight, inputs.exercise.equipmentType, params, origin);
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
        inputs.week.targetRir,
        inputs.exercise.equipmentType,
        params,
        origin,
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

/**
 * doc 16 — the earned-step wrapper around the core path (working, non-deload
 * prescriptions while the mode is active). Always emits exactly ONE
 * status-coded `progression` trace step (§3.6):
 *
 *  1. price the UNEARNED prescription (today's behavior) — the baseline;
 *  2. run the earn gate + governors (§3.4/§3.5) against the previous session;
 *  3. when earned + offered, re-price the SAME machinery off the target anchor
 *     `A* = A + δ` — an anchor-input substitution, with the R24b deadband
 *     disabled on that run only (the deadband's job is absorbing decay on a
 *     hold; an earned week intends an increase — §3.1);
 *  4. apply the realized-ask rule AFTER rounding (§3.3): a byte-identical
 *     realized ask claims nothing and retains the earn (`vanished`, retry per
 *     §2.3 — never `A + kδ`); an ask past `max_pct_per_step × A` holds today's
 *     behavior (`paced`); otherwise the led prescription ships (`stepped`).
 *
 * Grading stays on the MEASURED anchor throughout (§3.6) — the led run's grade
 * note is swapped back to the baseline's.
 */
function prescribeWithProgression(
  inputs: EngineInputs,
  params: EngineParams,
): Prescription {
  const baseline = prescribeCore(inputs, params);
  const gate = assessProgression(inputs, params, baseline);

  if (!gate.offered) {
    // record why (auditability, §3.6) without touching the prescription or its
    // rationale — a hold is never narrated as an overload.
    return withProgressionStep(baseline, holdStep(gate));
  }

  const anchor = inputs.strengthAnchor!;
  const led = prescribeCore(
    {
      ...inputs,
      strengthAnchor: { ...anchor, value: gate.targetAnchor! },
    },
    { ...params, hold_week_anchor_deadband: false },
  );
  // grading stays on the measured anchor (§3.6): the led run graded last week
  // against A*, which is not the measurement — restore the baseline's grade.
  const baselineGrade = baseline.trace.find((s) => s.rule === "grade");
  const ledTrace = led.trace.map((s) =>
    s.rule === "grade" && baselineGrade ? { ...s, detail: baselineGrade.detail } : s,
  );
  return applyRealizedAsk({
    baseline,
    led,
    ledTrace,
    gate,
    anchorValue: anchor.value,
    inputs,
    params,
  });
}

/** The §3.6 step recorded when the gate/governors declined a step (`paced` /
 *  `not_earned`) — the prescription itself is untouched. */
function holdStep(gate: ProgressionAssessment): DecisionTraceStep {
  return {
    rule: PROGRESSION_RULE,
    detail: gate.detail,
    status: gate.status === "paced" ? "paced" : "not_earned",
    deltaTarget: gate.delta,
    deltaRealized: null,
    ...(gate.governor ? { governor: gate.governor } : {}),
    ...(gate.predicate ? { predicate: gate.predicate } : {}),
  };
}

/**
 * The realized-ask rule (§3.3), AFTER rounding — shared verbatim by the advance
 * wrapper above and the seed wrapper (§3.7), so the two routes cannot diverge:
 * a byte-identical realized ask claims nothing and retains the earn
 * (`vanished`, retry per §2.3 — never `A + kδ`); an ask past
 * `max_pct_per_step × A` holds today's behavior (`paced`); otherwise the led
 * prescription ships (`stepped`) with the rationale recomposed from the trace
 * (P0-4 lockstep).
 */
function applyRealizedAsk(args: {
  baseline: Prescription;
  led: Prescription;
  /** the led run's trace, post any caller adjustment (the advance grade swap) */
  ledTrace: DecisionTraceStep[];
  gate: ProgressionAssessment;
  /** the MEASURED anchor value `A` (the max_pct_per_step base) */
  anchorValue: number;
  inputs: Pick<EngineInputs, "exercise" | "bodyweight" | "goalType">;
  params: EngineParams;
}): Prescription {
  const { baseline, led, gate, params } = args;
  const baseE1rm = prescribedE1rm(baseline, args.inputs, params);
  const ledE1rm = prescribedE1rm(led, args.inputs, params);
  const deltaRealized =
    baseE1rm != null && ledE1rm != null
      ? Math.round((ledE1rm - baseE1rm) * 10) / 10
      : null;

  const identical = led.weight === baseline.weight && led.reps === baseline.reps;
  if (identical || deltaRealized == null || deltaRealized <= 0) {
    // the quantum vanished (window hard cap, `bodyweight_only` rep ceiling,
    // lattice corner): claim nothing, keep the earn (retry, don't stack —
    // §2.3). At the bodyweight_only rep cap the rationale carries the
    // substitution nudge instead of an overload claim.
    const win = repWindowFor(args.inputs.goalType, params);
    const atBodyweightCap =
      args.inputs.exercise.loadType === "bodyweight_only" &&
      win != null &&
      baseline.reps != null &&
      baseline.reps >= win.max;
    const out = withProgressionStep(baseline, {
      rule: PROGRESSION_RULE,
      detail: "earned but unrealizable at this increment; earn retained",
      status: "vanished",
      deltaTarget: gate.delta,
      deltaRealized: deltaRealized ?? 0,
    });
    return atBodyweightCap
      ? {
          ...out,
          rationale:
            out.rationale +
            " At the rep cap for a bodyweight movement — add load or progress to the loadable variation to keep overloading.",
        }
      : out;
  }
  if (deltaRealized > params.progression!.max_pct_per_step * args.anchorValue) {
    // a coarse plate jump on a light lift: the cap binds on the REALIZED ask,
    // where it can actually fire — skip the step, hold today's behavior.
    return withProgressionStep(baseline, {
      rule: PROGRESSION_RULE,
      detail: `earned; realized step ${deltaRealized} lb exceeds max_pct_per_step (${Math.round(params.progression!.max_pct_per_step * 100)}% of anchor ${args.anchorValue})`,
      status: "paced",
      deltaTarget: gate.delta,
      deltaRealized,
      governor: "max_pct_per_step",
    });
  }

  // stepped: the led prescription ships, the trace announces the target, and
  // the rationale is recomposed from the adjusted trace (P0-4 lockstep).
  const step: DecisionTraceStep = {
    rule: PROGRESSION_RULE,
    detail: gate.detail,
    status: "stepped",
    deltaTarget: gate.delta,
    deltaRealized,
    targetAnchor: gate.targetAnchor!,
  };
  const fullTrace = [...args.ledTrace, step];
  return {
    ...led,
    trace: fullTrace,
    rationale: capitalize(fullTrace.map((s) => s.detail).join("; ") + "."),
  };
}

/** Append the always-on progression step, leaving the prescription untouched. */
function withProgressionStep(
  p: Prescription,
  step: DecisionTraceStep,
): Prescription {
  return { ...p, trace: [...p.trace, step] };
}

/**
 * The e1RM a prescription demands (§3.3's realized-ask measure): its effective
 * load × reps scored at the target RIR through the shared curve. Null when the
 * triple is incomplete.
 */
function prescribedE1rm(
  p: Pick<Prescription, "weight" | "reps" | "targetRir">,
  inputs: Pick<EngineInputs, "exercise" | "bodyweight">,
  params: EngineParams,
): number | null {
  if (p.weight == null || p.reps == null) return null;
  // zod-free mirror of rules/bodyweight.ts::usesBodyweightModel, on a Pick so
  // the seed wrapper (which has no full EngineInputs) shares this measure.
  const bwModel =
    (params.bodyweight_model ?? false) && inputs.exercise.loadType !== "external";
  const load = bwModel
    ? effectiveLoad(inputs.exercise.loadType, p.weight, inputs.bodyweight)
    : p.weight;
  if (load == null || load <= 0) return null;
  return estimateE1rmCore(load, p.reps, p.targetRir, params.e1rm)?.value ?? null;
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
  targetRir: number,
  equipmentType: EngineInputs["exercise"]["equipmentType"],
  params: EngineParams,
  /** N67 — the rounding lattice's phase; null ⇒ the absolute grid */
  origin: number | null = null,
): number {
  const predicted = predictRepsAtWeight(anchorValue, weight, targetRir, params);
  if (predicted == null) return weight;
  const step = params.rounding[equipmentType] ?? 0;
  if (step <= 0) return weight;
  const predAt = (w: number) =>
    predictRepsAtWeight(anchorValue, w, targetRir, params);

  // §v12 #2: prefer landing in the TARGET band [target_low, target_high]. If the
  // rounded load predicts above target_high, take one step up — but only when it
  // keeps reps at/above target_low (else the lighter load is a genuine coarse-step
  // buffer and we keep it). The hard [min,max] bounds are still enforced: if even
  // the buffer would breach a hard bound, step anyway. Symmetric below target_low.
  if (params.bound_to_target_window ?? false) {
    if (predicted > win.target_high) {
      const up = roundToStep(weight + step, equipmentType, params, origin);
      const pu = predAt(up);
      if (pu != null && pu >= win.target_low) return up; // lands in the window
      if (predicted > win.max) return up; // buffer breaches the hard max → must step
      return weight;
    }
    if (predicted < win.target_low) {
      const down = roundToStep(weight - step, equipmentType, params, origin);
      const pd = predAt(down);
      if (pd != null && pd <= win.target_high) return down;
      if (predicted < win.min) return down; // breaches the hard min → must step
      return weight;
    }
    return weight;
  }

  // legacy: only correct when the prediction breaches the hard [min,max] bounds.
  if (predicted > win.max) {
    return roundToStep(weight + step, equipmentType, params, origin);
  }
  if (predicted < win.min) {
    return roundToStep(weight - step, equipmentType, params, origin);
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
    /** the target week is a deload — deloads neither earn nor take steps
     *  (doc 16 §3.4), so the progression wrapper is bypassed exactly like
     *  prescribe()'s. Default false (today's callers all seed working weeks). */
    isDeload?: boolean;
    /** doc 16 §3.7 — the prior meso's final working session, the seed's earn
     *  context, assembled by the caller exactly like the advance chain's
     *  inputs. Omit for swaps/cold starts (no compliance context ⇒ not
     *  earned ⇒ today's `seed_anchor` behavior). */
    earn?: EngineInputs["seedEarn"];
    /** doc 16 §8.2 — the governors' derived lookback, caller-assembled from
     *  recent engine_decisions like the advance path's */
    progressionHistory?: EngineInputs["progressionHistory"];
    /** doc 16 §3.4 staleness gate: days since the earn context's session was
     *  performed (caller clock — across a deload boundary this is what decides
     *  whether the earn carries or the athlete re-measures first) */
    daysSincePreviousSession?: EngineInputs["daysSincePreviousSession"];
    /** doc 17 §3 (N37): the personalized plan strength band the rate pacer
     *  reads under `rate_source: "plan"`, caller-derived like the advance
     *  path's. Null/omitted ⇒ the pacer degrades to the bucket band. */
    planStrengthRate?: EngineInputs["planStrengthRate"];
    /** doc 17 §7 (N36): the envelope loop's derived per-user band position,
     *  caller-derived like the advance path's. Null/omitted ⇒ the pacer reads
     *  the fixed params `band_position` (loop off). */
    bandPosition?: EngineInputs["bandPosition"];
  },
): Prescription {
  const params = engineParamsSchema.parse(rawParams);
  const goalType = opts?.goalType ?? "hypertrophy";
  const anchor = opts?.anchor ?? null;
  const bodyweight = opts?.bodyweight ?? null;
  // N67: the seed's lattice phase — the prior meso's final working sets when an
  // earn context came across the boundary, else the peak / plan starting weight.
  const origin = latticeOrigin(
    { seedEarn: opts?.earn ?? null, weekPeak: priorPeak, initial },
    params,
  );
  const baseline = seedCore(
    priorPeak,
    initial,
    exercise,
    user,
    startRir,
    params,
    goalType,
    anchor,
    bodyweight,
    origin,
  );

  // doc 16 §3.7 — the earned-step wrapper on the seed route, mirroring
  // prescribe()'s. Inactive (block absent / mode off / goal factor 0) or a
  // deload target week ⇒ the baseline ships untouched: byte-identical output,
  // trace, and recorded inputs (§2.7).
  if (!progressionActive({ goalType }, params) || (opts?.isDeload ?? false)) {
    return baseline;
  }

  // the earn is evaluated through the SAME gate + governors as the advance
  // chain (§3.4/§3.5) — the earn context stands in for `previous`/`actualSets`
  // and the quantum δ is priced at the unearned SEED's effective point, so the
  // two routes share one comparison and one arithmetic (§2.5).
  const earn = opts?.earn ?? null;
  const gateInputs: EngineInputs = {
    exercise,
    user,
    goalType,
    week: { targetRir: startRir, isDeload: false },
    previous: earn?.previous ?? null,
    actualSets: earn?.actualSets ?? [],
    exerciseFeedback: earn?.exerciseFeedback ?? null,
    workoutFeedback: earn?.workoutFeedback ?? null,
    muscleGroupWeeklySets: null,
    weekPeak: null,
    strengthAnchor: anchor,
    initial: null,
    bodyweight,
    progressionHistory: opts?.progressionHistory ?? null,
    daysSincePreviousSession: opts?.daysSincePreviousSession ?? null,
    planStrengthRate: opts?.planStrengthRate ?? null,
    bandPosition: opts?.bandPosition ?? null,
  };
  const gate = assessProgression(gateInputs, params, baseline);
  if (!gate.offered) {
    return withProgressionStep(baseline, holdStep(gate));
  }
  const led = seedCore(
    priorPeak,
    initial,
    exercise,
    user,
    startRir,
    params,
    goalType,
    { ...anchor!, value: gate.targetAnchor! },
    bodyweight,
    origin,
  );
  return applyRealizedAsk({
    baseline,
    led,
    ledTrace: led.trace,
    gate,
    anchorValue: anchor!.value,
    inputs: gateInputs,
    params,
  });
}

/** The pre-doc-16 seed path, unchanged — parameterized on the anchor input,
 *  which is exactly what lets the §3.7 wrapper thread `A* = A + δ` through it
 *  (the same substitution `prescribe()` uses). Takes ALREADY-PARSED params. */
function seedCore(
  priorPeak: { weight: number | null; reps: number | null; sets: number } | null,
  initial: { weight: number | null; reps: number | null; sets: number } | null,
  exercise: EngineInputs["exercise"],
  user: EngineInputs["user"],
  startRir: number,
  params: EngineParams,
  goalType: EngineInputs["goalType"],
  anchor: E1rmAnchor | null,
  bodyweight: number | null,
  /** N67 — the rounding lattice's phase; null ⇒ the absolute grid */
  origin: number | null = null,
): Prescription {
  // T-I2: bodyweight load types seed through the bodyweight model (effective load
  // off the anchor; reps-only for bodyweight_only). Gated on `bodyweight_model`.
  if ((params.bodyweight_model ?? false) && exercise.loadType !== "external") {
    const seedInputs = engineInputsSchema.parse({
      exercise,
      user,
      goalType,
      week: { targetRir: startRir, isDeload: false },
      previous: null,
      actualSets: [],
      strengthAnchor: anchor,
      initial,
      bodyweight,
    });
    return prescribeBodyweight(seedInputs, params, origin);
  }

  // §S1 anchor seed — mirrors prescribe()'s seed_anchor branch (index.ts:103-151)
  const win = repWindowFor(goalType, params);
  if (
    (params.seed_from_anchor ?? false) &&
    params.weight_selection === "rep_window" &&
    anchor != null &&
    win != null &&
    confidenceAtLeast(anchor.confidence, params.reps_predict.min_confidence)
  ) {
    const raw = weightForRepsAtRir(anchor.value, win.target_low, startRir, params);
    if (raw != null) {
      // N51: same window bound as the working prescribe path — nearest-step
      // rounding lands heavy half the time and the hard [min,max] clamp alone
      // let 6–7 reps through an 8–12 target window.
      const fw = boundRepsToWindow(
        roundToStep(raw, exercise.equipmentType, params, origin),
        anchor.value,
        win,
        startRir,
        exercise.equipmentType,
        params,
        origin,
      );
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
      ? roundToStep(initial!.weight!, exercise.equipmentType, params, origin)
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

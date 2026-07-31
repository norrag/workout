/**
 * Bodyweight prescription (WS-I / T-I2) — pure.
 *
 * When `params.bodyweight_model` is on and an exercise's `loadType` is a bodyweight
 * type, `prescribe()`/`seedMeso()` route here instead of running the external
 * rep-window / legacy increment path. Bodyweight movements have a real load even
 * with nothing entered (the lifter's bodyweight), so the strength math runs in
 * EFFECTIVE-load space (see `load.ts`) and the result is converted back to the
 * value the user enters/logs:
 *
 *   bodyweight_only      load is FIXED at bodyweight → progress on reps only
 *   bodyweight_loadable  effective = bodyweight + added  → rep-window picks effective,
 *                        the *added* weight is what's prescribed/rounded
 *   bodyweight_assisted  effective = bodyweight − assist → same, the *assist* is
 *                        prescribed/rounded (the inverse of loadable)
 *
 * The anchor is computed on effective load upstream (the anchor query, gated on the
 * same flag), so it is non-null for bodyweight lifts once they have history. With no
 * confident anchor and no known bodyweight we DEFER (null weight, prompt the user) —
 * never fabricate (owner ruling 2026-06-25). Rounding is applied to the entered
 * added/assist value, not the effective load, so plates stay clean even when the
 * lifter's bodyweight is not a multiple of the step.
 */
import type { EngineParams } from "../params";
import type { EngineInputs, Prescription } from "../types";
import { predictRepsAtWeight, weightForRepsAtRir } from "../reps";
import { roundToStep } from "./rounding";
import { effectiveLoad, enteredForEffective } from "../load";

const CONF_RANK: Record<"low" | "moderate" | "high", number> = {
  low: 0,
  moderate: 1,
  high: 2,
};

function repWindowFor(goal: EngineInputs["goalType"], params: EngineParams) {
  return params.rep_window[goal] ?? params.rep_window.hypertrophy ?? null;
}

function confidenceAtLeast(
  c: "low" | "moderate" | "high",
  min: "low" | "moderate" | "high",
): boolean {
  return CONF_RANK[c] >= CONF_RANK[min];
}

function clampSets(sets: number, params: EngineParams): number {
  return Math.min(params.max_sets_per_exercise, Math.max(params.min_sets, sets));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Should this set of inputs be handled by the bodyweight model? */
export function usesBodyweightModel(
  inputs: EngineInputs,
  params: EngineParams,
): boolean {
  return (
    (params.bodyweight_model ?? false) && inputs.exercise.loadType !== "external"
  );
}

/** A null-weight, defer-to-manual-seed prescription (owner ruling: never fabricate). */
function deferred(inputs: EngineInputs, params: EngineParams, why: string): Prescription {
  const sets = clampSets(
    inputs.previous?.sets ?? inputs.initial?.sets ?? params.min_sets,
    params,
  );
  return {
    weight: null,
    reps: inputs.previous?.reps ?? inputs.initial?.reps ?? null,
    sets,
    targetRir: inputs.week.targetRir,
    rationale: capitalize(why + "."),
    trace: [{ rule: "bodyweight", detail: why }],
  };
}

/**
 * Prescribe a bodyweight-load exercise. Assumes `usesBodyweightModel(inputs,
 * params)` is true and that inputs/params are already validated. Always returns a
 * Prescription (a real one, or a deferred null-weight one when there isn't enough
 * to compute honestly).
 */
export function prescribeBodyweight(
  inputs: EngineInputs,
  params: EngineParams,
  /** N67 — the rounding lattice's phase for the ENTERED (added/assist) value;
   *  null ⇒ the absolute grid. Resolved by the caller from the same inputs. */
  origin: number | null = null,
): Prescription {
  const loadType = inputs.exercise.loadType;
  const bw = inputs.bodyweight;
  const win = repWindowFor(inputs.goalType, params);
  const anchor = inputs.strengthAnchor;
  const targetRir = inputs.week.targetRir;
  const isDeload = inputs.week.isDeload;

  const hasAnchor =
    params.weight_selection === "rep_window" &&
    anchor != null &&
    win != null &&
    confidenceAtLeast(anchor.confidence, params.reps_predict.min_confidence);

  // ----- bodyweight_only: the load is fixed at bodyweight; progress on reps -----
  if (loadType === "bodyweight_only") {
    if (bw == null) {
      return deferred(
        inputs,
        params,
        "this is a bodyweight exercise — set your bodyweight in your profile to prescribe it",
      );
    }
    const sets = bodyweightSets(inputs, params, isDeload);
    if (hasAnchor && win != null && anchor != null) {
      const predicted = predictRepsAtWeight(anchor.value, bw, targetRir, params);
      const reps =
        predicted == null
          ? Math.round((win.target_low + win.target_high) / 2)
          : Math.min(win.max, Math.max(win.min, predicted));
      const detail = isDeload
        ? `bodyweight deload: ${reps} reps at ${targetRir} RIR (load = bodyweight ${bw} lb), ${sets} sets`
        : `bodyweight: ${reps} reps at ${targetRir} RIR (load = bodyweight ${bw} lb, anchor e1RM ${anchor.value} lb)`;
      return {
        weight: bw,
        reps,
        sets,
        targetRir,
        rationale: capitalize(detail + (isDeload ? ". Recover before the next block." : ".")),
        trace: [{ rule: "bodyweight", detail }],
      };
    }
    // cold start: the load (bodyweight) is known, but rep capacity is not — carry a
    // planned/previous rep target if present, else defer reps to a manual seed.
    const reps = inputs.previous?.reps ?? inputs.initial?.reps ?? null;
    const detail =
      reps == null
        ? `bodyweight exercise (load = bodyweight ${bw} lb); no history yet — log your reps to seed it`
        : `bodyweight exercise (load = bodyweight ${bw} lb); starting at ${reps} reps, ${targetRir} RIR`;
    return {
      weight: bw,
      reps,
      sets: bodyweightSets(inputs, params, isDeload),
      targetRir,
      rationale: capitalize(detail + "."),
      trace: [{ rule: "bodyweight", detail }],
    };
  }

  // ----- bodyweight_loadable / bodyweight_assisted: rep-window in effective space -
  if (bw == null) {
    return deferred(
      inputs,
      params,
      "this is a bodyweight exercise — set your bodyweight in your profile to prescribe it",
    );
  }
  const sets = bodyweightSets(inputs, params, isDeload);
  const kind = loadType === "bodyweight_loadable" ? "added" : "assist";

  if (hasAnchor && win != null && anchor != null) {
    // target reps: deload centres the window; a working week walks the rep-window
    // climb (off performed reps when `climb_on_performed_reps` is set) — same rule
    // as the external path, in effective space.
    let targetReps: number;
    if (isDeload) {
      targetReps = Math.round((win.target_low + win.target_high) / 2);
    } else if (inputs.previous == null) {
      // fresh seed / swap-in (no prior prescription this meso): start at the
      // window bottom, mirroring the external seed_anchor branch — don't climb yet.
      targetReps = win.target_low;
    } else {
      const workingReps = inputs.actualSets
        .filter((s) => !s.isWarmup && s.reps > 0)
        .map((s) => s.reps);
      const performedMin = workingReps.length ? Math.min(...workingReps) : null;
      const baseReps = inputs.previous.reps ?? win.target_low;
      const prevReps =
        (params.climb_on_performed_reps ?? false) && performedMin != null
          ? performedMin
          : baseReps;
      targetReps =
        prevReps >= win.target_high
          ? win.target_low
          : Math.min(win.target_high, Math.max(win.target_low, prevReps + 1));
    }

    const effTarget = weightForRepsAtRir(anchor.value, targetReps, targetRir, params);
    if (effTarget != null) {
      // convert the effective target to the entered (added/assist) value and round
      // THAT to the loadable step, then recompute the effective load from it.
      const rawEntered = enteredForEffective(loadType, effTarget, bw) ?? 0;
      const entered = Math.max(
        0,
        roundToStep(rawEntered, inputs.exercise.equipmentType, params, origin),
      );
      const eff = effectiveLoad(loadType, entered, bw) ?? effTarget;
      const predicted = predictRepsAtWeight(anchor.value, eff, targetRir, params);
      const reps =
        predicted == null
          ? targetReps
          : Math.min(win.max, Math.max(win.min, predicted));
      const detail = isDeload
        ? `bodyweight deload: ${entered} lb ${kind} for ${reps} reps at ${targetRir} RIR (effective ${Math.round(eff)} lb), ${sets} sets`
        : `${entered} lb ${kind} for ${reps} reps at ${targetRir} RIR (effective ${Math.round(eff)} lb, anchor e1RM ${anchor.value} lb)`;
      return {
        weight: entered,
        reps,
        sets,
        targetRir,
        rationale: capitalize(detail + (isDeload ? ". Recover before the next block." : ".")),
        trace: [{ rule: "bodyweight", detail }],
      };
    }
  }

  // cold start: carry the user's own planned/previous entered value, else defer.
  const base = inputs.previous ?? {
    weight: inputs.initial?.weight ?? null,
    reps: inputs.initial?.reps ?? null,
  };
  if (base.weight == null) {
    return deferred(
      inputs,
      params,
      `no confident recent data to prescribe — enter a starting ${kind} weight to seed this exercise`,
    );
  }
  const entered = Math.max(
    0,
    roundToStep(base.weight, inputs.exercise.equipmentType, params, origin),
  );
  const detail = `starting ${kind} ${entered} lb at ${targetRir} RIR`;
  return {
    weight: entered,
    reps: base.reps,
    sets,
    targetRir,
    rationale: capitalize(detail + "."),
    trace: [{ rule: "bodyweight", detail }],
  };
}

/** Set count: deload reduces by `deload.set_pct`; otherwise carry forward. */
function bodyweightSets(
  inputs: EngineInputs,
  params: EngineParams,
  isDeload: boolean,
): number {
  const base =
    inputs.weekPeak?.sets ??
    inputs.previous?.sets ??
    inputs.initial?.sets ??
    params.min_sets;
  if (isDeload) {
    return clampSets(
      Math.max(params.min_sets, Math.round(base * params.deload.set_pct)),
      params,
    );
  }
  return clampSets(base, params);
}

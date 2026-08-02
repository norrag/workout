/**
 * Prescribed progression — earned-step overload + macro-rate pacing
 * (docs/16-prescribed-progression.md, Phase 1) — pure.
 *
 * The engine leads the prescribed demand by at most ONE earned quantum off the
 * measured anchor: `A* = A + δ` when the step is earned and offered, `A`
 * otherwise (§3.1). The measured e1RM pipeline is untouched — no stored anchor
 * or stat is ever bumped (T-I5); performing the led prescription at the
 * prescribed RIR *is* the data point that raises the measurement. Re-armed off
 * the measured anchor every time (never `previousTarget + δ`), so the lead
 * never compounds unconfirmed: the anchor is the only accumulator (§2.3).
 *
 * This module owns the earn gate (§3.4), the governors (§3.5), the quantum δ
 * (§3.2), and the shared set-level e1RM comparison (§5.3) the gate and the
 * day-view markers both read. It is clockless and does no I/O (hard rule 3):
 * `progressionHistory` and `daysSincePreviousSession` arrive as caller-computed
 * derived inputs (doc 14 §3), exactly like the strength anchor does.
 */
import type { EngineParams } from "../params";
import type { DecisionTraceStep, EngineInputs } from "../types";
import {
  assumedRir,
  e1rmFactor,
  estimateE1rm,
  type E1rmConfig,
} from "../predict";
import { effectiveLoad } from "../load";
import { modulateFromFeedback } from "./feedback";

// mirrors rules/bodyweight.ts::usesBodyweightModel, duplicated as one line
// rather than imported: bodyweight.ts pulls the zod-parsing reps layer, and
// this module must stay zod-free so the Phase-3 day view can consume the
// shared comparison without regressing the WS-J client-bundle split.
function usesBodyweightModel(
  inputs: Pick<EngineInputs, "exercise">,
  params: EngineParams,
): boolean {
  return (
    (params.bodyweight_model ?? false) && inputs.exercise.loadType !== "external"
  );
}

export const PROGRESSION_RULE = "progression";

/** §3.6 status vocabulary — exactly one status-coded step per working
 *  prescription while the mode is active. */
export type ProgressionStatus = "stepped" | "vanished" | "paced" | "not_earned";

export interface ProgressionTraceStep extends DecisionTraceStep {
  rule: typeof PROGRESSION_RULE;
  status: ProgressionStatus;
  deltaTarget: number | null;
  deltaRealized: number | null;
  governor?: string;
  predicate?: string;
  targetAnchor?: number;
}

/**
 * The default set-level comparison band when the params block is absent —
 * the day view's old P19 `MARKER_BAND` (±1.5% e1RM), which
 * `progression.compliance_band` absorbed so marker, earn gate, and grading
 * read one tunable (§5.3; the day view consumes it via `complianceBand()`
 * since Phase 3).
 */
export const DEFAULT_COMPLIANCE_BAND = 0.015;

export function complianceBand(params: EngineParams): number {
  return params.progression?.compliance_band ?? DEFAULT_COMPLIANCE_BAND;
}

/**
 * Whether the earned-step mode is live for these inputs: block present, mode
 * `earned_step`, and the resolved goal's rate factor > 0. A factor of 0 is the
 * per-goal opt-out (cut/maintain hold strength honestly per R24) and — like an
 * absent block — produces NO trace step and byte-identical output (§3.6).
 */
export function progressionActive(
  inputs: Pick<EngineInputs, "goalType">,
  params: EngineParams,
): boolean {
  const p = params.progression;
  if (!p || p.mode !== "earned_step") return false;
  return (p.goal_rate_factor[inputs.goalType] ?? 0) > 0;
}

/**
 * §5.3 / §3.4 — the ONE set-level comparison shared by the earn gate, the
 * ▲/met/▼ markers, and grading: both sides scored through the same e1RM curve,
 * at effective loads, the logged side at (reported RIR ?? target RIR), inside
 * a symmetric band. Three-state (`met` is a positive state under this model);
 * null stays reserved for "not comparable" (no prescription / non-working
 * load). The grinder guard is intrinsic: an honestly reported RIR below target
 * scores fewer effective reps and lands `under` without a separate clause.
 */
export function setComplianceMarker(args: {
  prescribedEffectiveWeight: number | null;
  prescribedReps: number | null;
  loggedEffectiveWeight: number | null;
  loggedReps: number;
  /** reported reps-in-reserve, or null when the set was quick-logged */
  loggedRir: number | null;
  targetRir: number;
  band: number;
  e1rmCfg: E1rmConfig;
}): "over" | "met" | "under" | null {
  const prescriptionE1rm =
    args.prescribedEffectiveWeight != null &&
    args.prescribedEffectiveWeight > 0 &&
    args.prescribedReps != null
      ? (estimateE1rm(
          args.prescribedEffectiveWeight,
          args.prescribedReps,
          args.targetRir,
          args.e1rmCfg,
        )?.value ?? null)
      : null;
  const loggedE1rm =
    args.loggedEffectiveWeight != null && args.loggedEffectiveWeight > 0
      ? (estimateE1rm(
          args.loggedEffectiveWeight,
          args.loggedReps,
          // doc 21 §2: the shared resolution — reported wins, else the
          // prescription's target (never 0; that is the N11 regression)
          assumedRir(args.loggedRir, args.targetRir),
          args.e1rmCfg,
        )?.value ?? null)
      : null;
  if (prescriptionE1rm == null || loggedE1rm == null || prescriptionE1rm <= 0)
    return null;
  if (loggedE1rm > prescriptionE1rm * (1 + args.band)) return "over";
  if (loggedE1rm < prescriptionE1rm * (1 - args.band)) return "under";
  return "met";
}

/** Gate/governor outcome before the realized-ask rule (§3.3) runs. */
export interface ProgressionAssessment {
  /** earned AND offered: price the prescription off `targetAnchor` */
  offered: boolean;
  /** the intended quantum δ in e1RM space (rounded to 0.1 lb), when computable */
  delta: number | null;
  /** `A + δ`, the prescription-basis anchor (rounded to 0.1 lb) */
  targetAnchor: number | null;
  status: "offered" | "paced" | "not_earned";
  /** which governor declined an earned step (status `paced`) */
  governor?: string;
  /** the FIRST failing gate predicate (status `not_earned`) */
  predicate?: string;
  detail: string;
}

const CONF_RANK: Record<"low" | "moderate" | "high", number> = {
  low: 0,
  moderate: 1,
  high: 2,
};

/**
 * The earn gate (§3.4) + governors (§3.5), evaluated against the previous
 * session. `baseline` is the UNEARNED prescription (today's behavior) — the
 * quantum δ is evaluated at its effective-rep point, and the caller applies
 * the realized-ask rule (§3.3) after rounding. Assumes `progressionActive`.
 */
export function assessProgression(
  inputs: EngineInputs,
  params: EngineParams,
  baseline: { weight: number | null; reps: number | null },
): ProgressionAssessment {
  const p = params.progression!;
  const notEarned = (predicate: string, detail: string): ProgressionAssessment => ({
    offered: false,
    delta: null,
    targetAnchor: null,
    status: "not_earned",
    predicate,
    detail: `not earned: ${detail}`,
  });

  // ---- gate predicates, in the §3.4 table order (first failing one is named) --

  // prescription fully performed — the §5.3 shared comparison per working set
  const compliance = sessionCompliance(inputs, params);
  if (!compliance.ok) return notEarned(compliance.predicate, compliance.detail);

  const mod = modulateFromFeedback(inputs, params);
  if (mod.painGated) {
    return notEarned("pain", "joint pain reported last session");
  }
  if (mod.sessionDampened) {
    return notEarned("dampener", "rough session reported");
  }
  const workload = inputs.exerciseFeedback?.workload;
  const workloadHot = workload != null && workload >= params.workload_high;
  // never cut the dose and raise the potency off the same feedback: a pain- or
  // workload-driven set cut (the only −1 sources) also fails the gate
  if (workloadHot || mod.setDelta === -1) {
    return notEarned("workload", "workload ran hot last session");
  }
  // deloads neither earn nor take steps. The generated side short-circuits
  // before this rule runs (prescribe's deload path); this predicate is the
  // defensive belt — the earning side cannot be a deload in the advance chain
  // (the deload is structurally the meso's final week; the next meso seeds).
  if (inputs.week.isDeload) {
    return notEarned("deload", "deload week");
  }
  if (
    inputs.daysSincePreviousSession != null &&
    inputs.daysSincePreviousSession > p.max_gap_days
  ) {
    return notEarned(
      "stale",
      `previous session is ${Math.round(inputs.daysSincePreviousSession)} days old (max ${p.max_gap_days}) — reproduce the anchor first`,
    );
  }
  const anchor = inputs.strengthAnchor;
  if (anchor == null || CONF_RANK[anchor.confidence] < CONF_RANK[p.min_confidence]) {
    return notEarned(
      "confidence",
      anchor == null
        ? "no strength anchor to lead"
        : `anchor confidence ${anchor.confidence} below ${p.min_confidence}`,
    );
  }
  // (goal opted in — `goal_rate_factor > 0` — is `progressionActive`'s check:
  // factor 0 emits no step at all, per §3.6.)

  // ---- the quantum δ (§3.2), at the unearned prescription's effective point --
  const delta = quantum(inputs, params, baseline);
  if (delta == null || delta <= 0) {
    return notEarned("compliance", "no priced prescription to step from");
  }
  const targetAnchor = round1(anchor.value + delta);

  // ---- governors (§3.5): earned ≠ offered; they only ever delay -------------
  const paced = (governor: string, detail: string): ProgressionAssessment => ({
    offered: false,
    delta: round1(delta),
    targetAnchor: null,
    status: "paced",
    governor,
    detail: `earned; ${detail}`,
  });
  const history = inputs.progressionHistory;
  if (p.cadence === "microcycle" && history?.earnedThisMicrocycle) {
    return paced("cadence", "skipped by cadence (already stepped this microcycle)");
  }
  if (p.pacing === "macro_rate") {
    const target = pacerTargetRate(inputs, params);
    const trailing = history?.trailing30dPrescribedGainPct ?? null;
    if (target != null && trailing != null && trailing >= target) {
      return paced(
        "rate_pacer",
        `skipped by rate pacer (trailing ${round1(trailing)}%/mo ≥ target ${round1(target)}%/mo)`,
      );
    }
  }
  if ((history?.consecutiveMissedEarns ?? 0) >= 2) {
    return paced(
      "miss_throttle",
      `skipped by miss throttle (${history!.consecutiveMissedEarns} earned-then-missed cycles; ${p.miss_rearm_sessions} compliant sessions re-arm)`,
    );
  }
  if (p.peak_week === "skip" && inputs.week.targetRir === 0) {
    return paced("peak_week", "skipped at peak week (target RIR 0)");
  }

  return {
    offered: true,
    delta: round1(delta),
    targetAnchor,
    status: "offered",
    detail: `earned overload: targeting e1RM ${targetAnchor} (measured ${anchor.value} + ${round1(delta)})`,
  };
}

/**
 * §3.4 row 1 — the previous session fully performed its prescription: working
 * set count ≥ prescribed, and every working set not `under` its prescribed set
 * in e1RM space (§5.3 comparison; effective loads; reported RIR ?? target RIR).
 * An athlete-owned weight change that lands on the prescribed e1RM target
 * complies; an honestly reported grind below target does not.
 */
function sessionCompliance(
  inputs: EngineInputs,
  params: EngineParams,
): { ok: true } | { ok: false; predicate: string; detail: string } {
  const prev = inputs.previous;
  const working = inputs.actualSets.filter((s) => !s.isWarmup);
  if (!prev || working.length === 0) {
    return {
      ok: false,
      predicate: "no_previous_session",
      detail: "no previous session to earn from",
    };
  }
  if (prev.weight == null || prev.reps == null) {
    return {
      ok: false,
      predicate: "compliance",
      detail: "previous prescription had no comparable target",
    };
  }
  if (working.length < prev.sets) {
    return {
      ok: false,
      predicate: "compliance",
      detail: `performed ${working.length} of ${prev.sets} prescribed working sets`,
    };
  }
  // effective loads (§5.3): under the bodyweight model the entered value maps
  // through the lifter's bodyweight; externally it IS the load.
  const bwModel = usesBodyweightModel(inputs, params);
  const loadType = inputs.exercise.loadType;
  const effective = (entered: number): number | null =>
    bwModel ? effectiveLoad(loadType, entered, inputs.bodyweight) : entered;
  const band = complianceBand(params);
  const prescribedEffectiveWeight = effective(prev.weight);
  for (const set of working) {
    const marker = setComplianceMarker({
      prescribedEffectiveWeight,
      prescribedReps: prev.reps,
      loggedEffectiveWeight: effective(set.weight),
      loggedReps: set.reps,
      loggedRir: set.rirReported,
      targetRir: prev.targetRir,
      band,
      e1rmCfg: params.e1rm,
    });
    if (marker === "under" || marker === null) {
      return {
        ok: false,
        predicate: "compliance",
        detail:
          marker === "under"
            ? `set ${set.setNumber} under its prescribed set in e1RM terms`
            : `set ${set.setNumber} not comparable to its prescription`,
      };
    }
  }
  return { ok: true };
}

/**
 * §3.2 — the quantum δ, evaluated in e1RM space at the unearned prescription's
 * effective-rep point `E = reps + targetRir × rir_offset`:
 *   δ_w = rounding[equipment] × k(E)   (one loadable step; the per-exercise
 *         editable increment override feeds `rounding` upstream)
 *   δ_r = w × (k(E+1) − k(E))          (one rep at the held effective load)
 * `min` (default) picks the smallest honest step the exercise can express.
 */
function quantum(
  inputs: EngineInputs,
  params: EngineParams,
  baseline: { weight: number | null; reps: number | null },
): number | null {
  const p = params.progression!;
  const cfg = params.e1rm;
  if (baseline.reps == null) return null;
  const E = baseline.reps + inputs.week.targetRir * cfg.rir_offset;
  const kE = e1rmFactor(E, cfg);
  const kE1 = e1rmFactor(E + 1, cfg);
  const step = params.rounding[inputs.exercise.equipmentType] ?? 5;
  const deltaW = step > 0 ? step * kE : null;
  const bwModel = usesBodyweightModel(inputs, params);
  const w =
    baseline.weight == null
      ? null
      : bwModel
        ? effectiveLoad(inputs.exercise.loadType, baseline.weight, inputs.bodyweight)
        : baseline.weight;
  const deltaR = w != null && w > 0 ? w * (kE1 - kE) : null;
  switch (p.step) {
    case "increment":
      return deltaW;
    case "rep":
      return deltaR ?? deltaW;
    default: {
      if (deltaW == null) return deltaR;
      if (deltaR == null) return deltaW;
      return Math.min(deltaW, deltaR);
    }
  }
}

/**
 * §3.5 rate pacer target: `lerp(source_band, band_position) ×
 * goal_rate_factor[goal]`, in %/month. The source band is selected by
 * `rate_source` (doc 17 §3, N37): `"plan"` reads the caller-derived
 * `planStrengthRate` (the §2.1-personalized `strengthRatePctMonth` — always
 * strength-denominated, whatever the macro's goal); `"band"` — and `"plan"`
 * with no plan rate assembled — reads the bucket table. Degradation is always
 * toward `"band"`, never unpaced; the position and the goal factor compose
 * identically under either source (so the doc 17 §7 envelope is
 * source-agnostic). The position itself is the envelope loop's derived
 * per-user `inputs.bandPosition` when assembled (N36), else the fixed params
 * `band_position` — the default, and the value while the loop is off.
 * Null disables the pacer (no evidenced band for the bucket).
 */
function pacerTargetRate(
  inputs: EngineInputs,
  params: EngineParams,
): number | null {
  const p = params.progression!;
  const factor = p.goal_rate_factor[inputs.goalType] ?? 0;
  const position = inputs.bandPosition ?? p.band_position;
  if (p.rate_source === "plan" && inputs.planStrengthRate != null) {
    const { low, high } = inputs.planStrengthRate;
    return (low + (high - low) * position) * factor;
  }
  const band = params.macro_target.strength_pct_month[inputs.user.experienceLevel];
  if (!band) return null;
  const [low, high] = band;
  return (low + (high - low) * position) * factor;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

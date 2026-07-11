import type { ProgressionAuditSummary } from "./progression-history";

/**
 * doc 17 §4.2 — the macrocycle retrospective (N40): one pure fold, shared by
 * the completed-macro Overview and MCP `get_macrocycle_summary` (the
 * shared-views convention — one definition of the verdict). Derive-on-read
 * from the permanent record (principle 5): nothing here is stored.
 *
 * Grading always uses the CONTRACT (`macrocycles.target_*`, principle 3) —
 * never a live recompute of the plan. Verdicts stick to the fixed vocabulary
 * (`within band` / `above band` / `below band` / `insufficient data`), never
 * letter grades; estimate-vs-estimate copy per doc 10 §9. Mass outcomes grade
 * ONLY against measured body data and read "not measured" otherwise
 * (principle 6) — in this phase body data doesn't exist yet (N41/N34), so the
 * mass row is always unmeasured.
 */

export type RetroVerdict =
  | "within band"
  | "above band"
  | "below band"
  | "insufficient data";

/** The stored goal contract, as graded against (never the live plan). */
export interface RetroContract {
  goalType: string;
  targetLow: number | null;
  targetHigh: number | null;
  targetUnit: string | null;
  targetDirection: string | null;
}

/** The doc-10 §6 est-strength rollup over the macro span (PR #157). */
export interface RetroStrengthInput {
  /** volume-weighted mean of the muscle changes — the headline */
  estStrengthPct: number | null;
  /** qualifying (≥ min-session) lifts contributing to the rollup */
  qualifyingLifts: number;
  /** the qualifying-lift floor under which the verdict is `insufficient data`
   *  (§4.2: `strength.min_sessions`) */
  minQualifyingLifts: number;
  muscles: { muscleGroup: string; scorePct: number | null; lifts: number }[];
}

/** Aggregate-grain demand-side mix over the macro span (§4.2). */
export interface RetroDemand {
  decisions: number;
  stepped: number;
  vanished: number;
  paced: number;
  notEarned: number;
  /** `paced` decisions by governor — how often the pacer bound (rate-limited)
   *  vs the other governors */
  governorFirings: Record<string, number>;
  /** `not_earned` decisions by first failing gate predicate
   *  (entitlement-limited) */
  gateFailures: Record<string, number>;
  /** vanished / (stepped + vanished) — the increment-sizing signal */
  vanishedShare: number | null;
  earnedThenMet: number;
  earnedThenMissed: number;
}

export interface RetroAdherence {
  adherencePct: number | null;
  sessionsLogged: number;
  totalVolume: number;
}

/** Block-outcome mix: placeholders a natural close leaves behind read
 *  "not built" (§4.1). */
export interface RetroBlocks {
  completed: number;
  abandoned: number;
  notBuilt: number;
}

/** Measured body data bracketing the macro span. Phase 4 (bodyweight series)
 *  and Phase 5b (DEXA) supply this; until then it is always null and the mass
 *  row reads "not measured". */
export interface RetroBodyData {
  measuredDeltaLb: number;
  source: "bodyweight_log" | "dexa";
}

export interface MacroRetrospective {
  strength: {
    estStrengthPct: number | null;
    /** null ⇒ informational (mass-goal macro: strength was never the promise) */
    verdict: RetroVerdict | null;
    informational: boolean;
    /** the contract band, when strength-denominated */
    band: { low: number; high: number } | null;
    muscles: { muscleGroup: string; scorePct: number | null; lifts: number }[];
  };
  /** null when the contract isn't mass-denominated (strength macros) */
  mass: {
    measured: boolean;
    verdict: RetroVerdict | null;
    measuredDeltaLb: number | null;
    note: string;
  } | null;
  /** null while no progression decisions exist in the span (mode inactive) */
  demand: RetroDemand | null;
  adherence: RetroAdherence;
  blocks: RetroBlocks;
}

/** Band placement with the fixed verdict vocabulary. */
function bandVerdict(
  value: number,
  low: number,
  high: number,
  direction: string | null,
): RetroVerdict {
  // a loss-direction contract stores positive magnitudes (e.g. cut lb); grade
  // on magnitude in the promised direction
  const v = direction === "loss" ? -value : value;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  if (v > hi) return "above band";
  if (v < lo) return "below band";
  return "within band";
}

/**
 * Pure: combine per-exercise `aggregateProgressionEvents` summaries into the
 * macro-grain demand mix. The earned-then-met/missed pairing only makes sense
 * per exercise (decision k answers exercise-local ask k−1), so the fold sums
 * the per-exercise aggregates rather than re-pairing a merged stream. Returns
 * null when no decisions exist (progression mode inactive over the span).
 */
export function combineDemandSummaries(
  summaries: ProgressionAuditSummary[],
): RetroDemand | null {
  const out: RetroDemand = {
    decisions: 0,
    stepped: 0,
    vanished: 0,
    paced: 0,
    notEarned: 0,
    governorFirings: {},
    gateFailures: {},
    vanishedShare: null,
    earnedThenMet: 0,
    earnedThenMissed: 0,
  };
  for (const s of summaries) {
    out.decisions += s.decisions;
    out.stepped += s.statusCounts.stepped;
    out.vanished += s.statusCounts.vanished;
    out.paced += s.statusCounts.paced;
    out.notEarned += s.statusCounts.not_earned;
    out.earnedThenMet += s.earnedThenMet;
    out.earnedThenMissed += s.earnedThenMissed;
    for (const [k, v] of Object.entries(s.governorFirings))
      out.governorFirings[k] = (out.governorFirings[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.gateFailures))
      out.gateFailures[k] = (out.gateFailures[k] ?? 0) + v;
  }
  if (out.decisions === 0) return null;
  const asks = out.stepped + out.vanished;
  out.vanishedShare =
    asks > 0 ? Math.round((out.vanished / asks) * 100) / 100 : null;
  return out;
}

const MASS_NOT_MEASURED_NOTE =
  "not measured — a bodyweight series or DEXA scans bracketing this block would grade it";

/**
 * Pure: fold the macro's contract + measured outcomes into the retrospective.
 * `bodyData` stays null until a measured series brackets the span (Phase 4/5);
 * passing it flips the mass row from "not measured" to a graded Δbw.
 */
export function macroRetrospective(
  contract: RetroContract,
  strength: RetroStrengthInput,
  demand: RetroDemand | null,
  adherence: RetroAdherence,
  blocks: RetroBlocks,
  bodyData: RetroBodyData | null = null,
): MacroRetrospective {
  // strength-denominated contract ⇔ the strength row is the promise
  const strengthDenominated = contract.targetUnit === "%";
  const hasBand = contract.targetLow != null && contract.targetHigh != null;

  let verdict: RetroVerdict | null = null;
  if (strengthDenominated) {
    verdict =
      strength.estStrengthPct == null ||
      strength.qualifyingLifts < strength.minQualifyingLifts ||
      !hasBand
        ? "insufficient data"
        : bandVerdict(
            strength.estStrengthPct,
            contract.targetLow!,
            contract.targetHigh!,
            contract.targetDirection,
          );
  }

  const mass = strengthDenominated
    ? null
    : bodyData == null
      ? {
          measured: false,
          verdict: null,
          measuredDeltaLb: null,
          note: MASS_NOT_MEASURED_NOTE,
        }
      : {
          measured: true,
          verdict: hasBand
            ? bandVerdict(
                bodyData.measuredDeltaLb,
                contract.targetLow!,
                contract.targetHigh!,
                contract.targetDirection,
              )
            : ("insufficient data" as RetroVerdict),
          measuredDeltaLb: bodyData.measuredDeltaLb,
          note: `measured via ${bodyData.source === "dexa" ? "DEXA" : "the bodyweight series"}`,
        };

  return {
    strength: {
      estStrengthPct: strength.estStrengthPct,
      verdict,
      informational: !strengthDenominated,
      band:
        strengthDenominated && hasBand
          ? { low: contract.targetLow!, high: contract.targetHigh! }
          : null,
      muscles: strength.muscles,
    },
    mass,
    demand,
    adherence,
    blocks,
  };
}

/**
 * Weekly-set volume landmark assessment (10 §2). Pure, params-driven: given a
 * muscle's weekly working-set count and the tunable `engine_params.volume`
 * landmarks, classify it against the muscle's MEV / MAV / MRV band so a coach
 * can say *"chest is below maintenance volume"* rather than only flag relative
 * imbalance. Heuristic by design (the per-muscle numbers carry large individual
 * variance, 10 §9) — advisory, never a hard prescription.
 */
import type { EngineParams } from "./params";
import { experienceLevels } from "./params";

export type ExperienceLevel = (typeof experienceLevels)[number];

export type VolumeZone = "below_mev" | "optimal" | "high" | "above_mrv";

// ---------------------------------------------------------------------------
// §2 fractional volume counting (R14)
// ---------------------------------------------------------------------------

export interface VolumeCountingWeights {
  /** credit per primary-muscle link (doc 10 §2 `volume.direct`, default 1.0) */
  direct: number;
  /** credit per secondary-muscle link (`volume.indirect`, default 0.5) */
  indirect: number;
}

/**
 * The counting weights from params, with the doc 10 §2 defaults applied when
 * the (optional, v11+ discipline) keys are absent. Pure.
 */
export function volumeCountingWeights(
  params: EngineParams,
): VolumeCountingWeights {
  return {
    direct: params.volume.direct ?? 1.0,
    indirect: params.volume.indirect ?? 0.5,
  };
}

export interface RoleSetCount {
  role: "primary" | "secondary";
  sets: number;
}

/**
 * Fold per-role set counts into one fractional direct-equivalent number
 * (doc 10 §2): Σ sets × (primary ⇒ direct, secondary ⇒ indirect), rounded to
 * 2 dp so tuned weights can't leak float noise into displayed cells. Pure —
 * every weekly-sets surface (stats matrix/balance, MCP volume + balance tools,
 * the engine's ceiling input) must count through this one definition.
 */
export function fractionalSetCount(
  entries: readonly RoleSetCount[],
  weights: VolumeCountingWeights,
): number {
  const raw = entries.reduce(
    (n, e) =>
      n + e.sets * (e.role === "primary" ? weights.direct : weights.indirect),
    0,
  );
  return Math.round(raw * 100) / 100;
}

export interface VolumeLandmark {
  /** minimum effective volume — the productive floor */
  mev: number;
  /** top of the adaptive (productive) work zone */
  mav: number;
  /** maximum recoverable volume — the ceiling */
  mrv: number;
}

export interface VolumeAssessment extends VolumeLandmark {
  zone: VolumeZone;
  /** plain-English read of where the weekly sets land in the band */
  note: string;
}

/**
 * The experience-scaled `[MEV, MAV_high, MRV]` landmark for a muscle, or null
 * when the muscle isn't parameterized (e.g. traps/forearms — no landmark seeded).
 * Stored numbers are an intermediate baseline; `experience_scale` shifts the
 * whole band. Rounded to whole sets. Pure.
 */
export function muscleVolumeLandmark(
  params: EngineParams,
  muscle: string,
  experience: ExperienceLevel,
): VolumeLandmark | null {
  const raw = params.volume.landmarks[muscle.toLowerCase()];
  if (!raw) return null;
  const scale = params.volume.experience_scale[experience] ?? 1;
  const [mev, mav, mrv] = raw;
  return {
    mev: Math.round(mev * scale),
    mav: Math.round(mav * scale),
    mrv: Math.round(mrv * scale),
  };
}

/** Classify weekly working sets against a landmark band. Pure. */
export function classifyVolume(sets: number, lm: VolumeLandmark): VolumeZone {
  if (sets < lm.mev) return "below_mev";
  if (sets <= lm.mav) return "optimal";
  if (sets <= lm.mrv) return "high";
  return "above_mrv";
}

const ZONE_NOTE: Record<VolumeZone, string> = {
  below_mev:
    "below MEV (minimum effective volume) — likely too little to drive much growth; consider adding sets",
  optimal: "within the productive MEV–MAV work zone",
  high: "above MAV, approaching MRV — productive but near the recoverable ceiling; watch fatigue",
  above_mrv:
    "above MRV (maximum recoverable volume) — likely more than can be recovered from; consider trimming sets",
};

/**
 * Full assessment of a muscle's weekly sets: the scaled band, the zone it lands
 * in, and a plain note. Returns null when the muscle isn't parameterized. Pure.
 */
export function assessMuscleVolume(
  params: EngineParams,
  muscle: string,
  weeklySets: number,
  experience: ExperienceLevel,
): VolumeAssessment | null {
  const lm = muscleVolumeLandmark(params, muscle, experience);
  if (!lm) return null;
  const zone = classifyVolume(weeklySets, lm);
  return { ...lm, zone, note: ZONE_NOTE[zone] };
}

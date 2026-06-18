/**
 * Per-day session classification (10 §7 PPL map + fractional 1.0/0.5 volume
 * counting). Pure + deterministic: given a day's slots — each a planned set
 * count plus the exercise's own muscle roles — label the day by its dominant
 * fractional volume (e.g. `legs`, `upper-push`, `full-body`).
 *
 * Why this exists (12 §2): a naive read of a meso's days mistakes a low-set leg
 * day for an under-trained day. The label is **context, not a verdict** — it
 * exists to prevent that misread, not to add judgment; real volume deficits
 * still come from get_muscle_balance's MEV/MAV/MRV assessment.
 */

export type PplCategory = "push" | "pull" | "legs";

export interface MuscleRole {
  /** muscle-group name, app vocabulary (chest/back/shoulders/…) */
  name: string;
  role: "primary" | "secondary";
}

export interface DaySlotVolume {
  /** the slot's week-1 (planned) set count */
  sets: number;
  /** the exercise's muscle roles — primary counts 1.0, secondary 0.5 */
  muscles: MuscleRole[];
}

export type DayClassification =
  | "legs"
  | "upper-push"
  | "upper-pull"
  | "upper"
  | "full-body"
  | "unclassified";

export interface DayEmphasis {
  classification: DayClassification;
  /** fractional direct-equivalent sets per PPL category on the day */
  fractional_sets: Record<PplCategory, number>;
  total_fractional_sets: number;
  /** the single most-trained category, or null when nothing maps */
  dominant: PplCategory | null;
}

/**
 * The 10 §7 push/pull/legs map, applied to the app's seeded muscle-group
 * vocabulary (chest/back/shoulders/triceps/biceps/quads/hamstrings/glutes/
 * calves/abs/traps/forearms). The app keeps a single `shoulders` group (it does
 * not split front/side/rear delts), so shoulders → push; traps/forearms →
 * pull (accessory pulling). abs and anything unmapped → null (kept out of the
 * cards, matching the in-app balance read). Pure.
 */
const PPL_MAP: Record<string, PplCategory> = {
  chest: "push",
  shoulders: "push",
  triceps: "push",
  back: "pull",
  biceps: "pull",
  traps: "pull",
  forearms: "pull",
  quads: "legs",
  hamstrings: "legs",
  glutes: "legs",
  calves: "legs",
};

export function pplCategory(muscle: string): PplCategory | null {
  return PPL_MAP[muscle.trim().toLowerCase()] ?? null;
}

export interface ClassifyDayOpts {
  /** weight for a primary muscle (10 §7 fractional counting, default 1.0) */
  direct?: number;
  /** weight for a secondary muscle (default 0.5) */
  indirect?: number;
  /** share of total at which a single PPL category dominates (default 0.6) */
  dominantShare?: number;
  /** share of upper volume at which push or pull dominates an upper day (default 0.6) */
  upperSplitShare?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Classify a day by dominant fractional volume. Each slot credits `sets × 1.0`
 * to every primary muscle's PPL category and `sets × 0.5` to every secondary's
 * — the same fractional rule the paradigm uses (10 §7). Labelling:
 *   - legs ≥ `dominantShare` of total → `legs`
 *   - upper (push + pull) ≥ `dominantShare` → `upper-push` / `upper-pull` /
 *     `upper` by how push and pull split within the upper work
 *   - otherwise a genuine mix → `full-body`
 * Pure; thresholds are the documented 10 §7 weights (overridable for tests).
 */
export function classifyDayEmphasis(
  slots: DaySlotVolume[],
  opts: ClassifyDayOpts = {},
): DayEmphasis {
  const direct = opts.direct ?? 1.0;
  const indirect = opts.indirect ?? 0.5;
  const dominantShare = opts.dominantShare ?? 0.6;
  const upperSplit = opts.upperSplitShare ?? 0.6;

  const frac: Record<PplCategory, number> = { push: 0, pull: 0, legs: 0 };
  for (const slot of slots) {
    const sets = slot.sets > 0 ? slot.sets : 0;
    if (sets === 0) continue;
    for (const m of slot.muscles) {
      const cat = pplCategory(m.name);
      if (!cat) continue;
      frac[cat] += sets * (m.role === "primary" ? direct : indirect);
    }
  }
  frac.push = round2(frac.push);
  frac.pull = round2(frac.pull);
  frac.legs = round2(frac.legs);
  const total = round2(frac.push + frac.pull + frac.legs);

  if (total === 0) {
    return {
      classification: "unclassified",
      fractional_sets: frac,
      total_fractional_sets: 0,
      dominant: null,
    };
  }

  const dominant = (["push", "pull", "legs"] as PplCategory[]).reduce((a, b) =>
    frac[b] > frac[a] ? b : a,
  );

  const legsShare = frac.legs / total;
  const upper = frac.push + frac.pull;
  const upperShare = upper / total;

  let classification: DayClassification;
  if (legsShare >= dominantShare) {
    classification = "legs";
  } else if (upperShare >= dominantShare) {
    const pushOfUpper = upper > 0 ? frac.push / upper : 0;
    if (pushOfUpper >= upperSplit) classification = "upper-push";
    else if (pushOfUpper <= 1 - upperSplit) classification = "upper-pull";
    else classification = "upper";
  } else {
    classification = "full-body";
  }

  return {
    classification,
    fractional_sets: frac,
    total_fractional_sets: total,
    dominant,
  };
}

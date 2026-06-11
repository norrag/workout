import type { EngineParams } from "../params";

export interface WeekPlan {
  weekNumber: number;
  targetRir: number;
  isDeload: boolean;
}

/**
 * The meso's RIR ramp: linear from rirStart down to rirEnd across the
 * working weeks, peak (rirEnd) on the final working week, then an optional
 * deload week at the deload target RIR.
 */
export function rirRamp(
  weeks: number,
  includesDeload: boolean,
  rirStart: number,
  rirEnd: number,
  params: EngineParams,
): WeekPlan[] {
  if (weeks < 3 || weeks > 6) {
    throw new Error(`meso weeks must be 3..6, got ${weeks}`);
  }
  if (rirEnd > rirStart) {
    throw new Error("rir_end must be <= rir_start");
  }
  const workingWeeks = includesDeload ? weeks - 1 : weeks;
  const plans: WeekPlan[] = [];
  for (let i = 0; i < workingWeeks; i++) {
    const t = workingWeeks === 1 ? 1 : i / (workingWeeks - 1);
    plans.push({
      weekNumber: i + 1,
      targetRir: Math.round(rirStart + (rirEnd - rirStart) * t),
      isDeload: false,
    });
  }
  if (includesDeload) {
    plans.push({
      weekNumber: weeks,
      targetRir: params.deload.target_rir,
      isDeload: true,
    });
  }
  return plans;
}

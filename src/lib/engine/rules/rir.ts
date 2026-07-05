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
 *
 * N18-B: an explicit per-week `schedule` (one RIR per WORKING week, any values
 * 0–5 in any order — flexibility is the point) replaces the interpolation when
 * present; the deload week still comes from `params.deload.target_rir` either
 * way. Callers own length consistency — a schedule that doesn't cover the
 * working weeks exactly is a programming error, not a fallback case.
 */
export function rirRamp(
  weeks: number,
  includesDeload: boolean,
  rirStart: number,
  rirEnd: number,
  params: EngineParams,
  schedule?: number[] | null,
): WeekPlan[] {
  if (weeks < 3 || weeks > 8) {
    throw new Error(`meso weeks must be 3..8, got ${weeks}`);
  }
  if (rirEnd > rirStart) {
    throw new Error("rir_end must be <= rir_start");
  }
  const workingWeeks = includesDeload ? weeks - 1 : weeks;
  if (schedule != null) {
    if (schedule.length !== workingWeeks) {
      throw new Error(
        `rir_schedule must cover the ${workingWeeks} working weeks, got ${schedule.length}`,
      );
    }
    for (const rir of schedule) {
      if (!Number.isInteger(rir) || rir < 0 || rir > 5) {
        throw new Error(`rir_schedule values must be integers 0..5, got ${rir}`);
      }
    }
  }
  const plans: WeekPlan[] = [];
  for (let i = 0; i < workingWeeks; i++) {
    const t = workingWeeks === 1 ? 1 : i / (workingWeeks - 1);
    plans.push({
      weekNumber: i + 1,
      targetRir:
        schedule != null
          ? schedule[i]
          : Math.round(rirStart + (rirEnd - rirStart) * t),
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

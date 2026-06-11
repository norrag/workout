/**
 * Mesocycle activation planner — pure, like the engine. Given a planned
 * meso, its exercise slots, and the active engine params, it computes the
 * microcycle rows and the week-1 workout prescriptions. Callers (server
 * actions) do the I/O.
 */
import {
  rirRamp,
  seedMeso,
  type EngineParams,
  type Prescription,
} from "@/lib/engine";
import type {
  EquipmentType,
  ExperienceLevel,
  MesoExerciseRow,
  Units,
} from "@/lib/types/database";

export interface ActivationMeso {
  weeks: number;
  days_per_week: number;
  includes_deload: boolean;
  rir_start: number;
  rir_end: number;
}

export interface ActivationUser {
  units: Units;
  experienceLevel: ExperienceLevel;
}

export interface MicrocyclePlan {
  week_number: number;
  target_rir: number;
  is_deload: boolean;
  start_date: string;
  status: "active" | "pending";
}

export interface WorkoutExercisePlan {
  exercise_id: string;
  position: number;
  prescription: Prescription;
}

export interface WorkoutPlan {
  day_number: number;
  exercises: WorkoutExercisePlan[];
}

export interface ActivationPlan {
  microcycles: MicrocyclePlan[];
  /** week-1 sessions, one per planned day */
  week1Workouts: WorkoutPlan[];
}

type PlanItem = Pick<
  MesoExerciseRow,
  | "exercise_id"
  | "day_of_week"
  | "position"
  | "initial_weight"
  | "initial_reps"
  | "initial_sets"
>;

export function buildActivationPlan(
  meso: ActivationMeso,
  planItems: PlanItem[],
  equipmentByExercise: Record<string, EquipmentType>,
  user: ActivationUser,
  params: EngineParams,
  startDate: string,
): ActivationPlan {
  const ramp = rirRamp(
    meso.weeks,
    meso.includes_deload,
    meso.rir_start,
    meso.rir_end,
    params,
  );

  const microcycles: MicrocyclePlan[] = ramp.map((week) => ({
    week_number: week.weekNumber,
    target_rir: week.targetRir,
    is_deload: week.isDeload,
    start_date: addDays(startDate, (week.weekNumber - 1) * 7),
    status: week.weekNumber === 1 ? "active" : "pending",
  }));

  const week1Rir = ramp[0].targetRir;
  const week1Workouts: WorkoutPlan[] = [];
  for (let day = 1; day <= meso.days_per_week; day++) {
    const slots = planItems
      .filter((item) => item.day_of_week === day)
      .sort((a, b) => a.position - b.position);
    week1Workouts.push({
      day_number: day,
      exercises: slots.map((slot) => {
        const equipmentType = equipmentByExercise[slot.exercise_id];
        if (!equipmentType) {
          throw new Error(`missing equipment type for ${slot.exercise_id}`);
        }
        return {
          exercise_id: slot.exercise_id,
          position: slot.position,
          prescription: seedMeso(
            null,
            {
              weight: slot.initial_weight,
              reps: slot.initial_reps,
              sets: slot.initial_sets,
            },
            { equipmentType },
            user,
            week1Rir,
            params,
          ),
        };
      }),
    });
  }

  return { microcycles, week1Workouts };
}

/** date-only arithmetic on YYYY-MM-DD strings, UTC-safe */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${date}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

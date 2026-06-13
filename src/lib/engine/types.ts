import { z } from "zod";
import {
  engineParamsSchema,
  equipmentTypes,
  experienceLevels,
  goalTypes,
} from "./params";

export const loggedSetInputSchema = z.object({
  setNumber: z.number().int().min(1),
  weight: z.number().min(0),
  reps: z.number().int().min(0),
  rirReported: z.number().int().min(0).max(10).nullable().default(null),
  isWarmup: z.boolean().default(false),
});

// fig 1.4: joint pain 0–3 per exercise; pump and workload 0–10 sliders
// scoped to the exercise's muscle group ("just right" workload = 5)
export const exerciseFeedbackInputSchema = z.object({
  jointPain: z.number().int().min(0).max(3).nullable(),
  pump: z.number().int().min(0).max(10).nullable(),
  workload: z.number().int().min(0).max(10).nullable(),
});

export const workoutFeedbackInputSchema = z.object({
  overallFatigue: z.number().int().min(0).max(4).nullable(),
  effortRating: z.number().int().min(0).max(4).nullable(),
  performanceRating: z.number().int().min(0).max(4).nullable(),
});

export const prescriptionSchema = z.object({
  weight: z.number().min(0).nullable(),
  reps: z.number().int().min(1).nullable(),
  sets: z.number().int().min(1),
  targetRir: z.number().int().min(0).max(5),
});

/**
 * Everything `prescribe` needs, assembled by the caller (route handler,
 * MCP tool, admin replay). The engine itself does no I/O.
 */
export const engineInputsSchema = z.object({
  exercise: z.object({
    equipmentType: z.enum(equipmentTypes),
  }),
  user: z.object({
    experienceLevel: z.enum(experienceLevels),
    units: z.enum(["kg", "lb"]),
  }),
  goalType: z.enum(goalTypes),
  // the week being generated
  week: z.object({
    targetRir: z.number().int().min(0).max(5),
    isDeload: z.boolean(),
  }),
  // last week's prescription for this exercise (null in week 1)
  previous: prescriptionSchema.nullable(),
  // what was actually performed against `previous`
  actualSets: z.array(loggedSetInputSchema).default([]),
  exerciseFeedback: exerciseFeedbackInputSchema.nullable().default(null),
  workoutFeedback: workoutFeedbackInputSchema.nullable().default(null),
  // current weekly working sets for the exercise's primary muscle group
  muscleGroupWeeklySets: z.number().int().min(0).nullable().default(null),
  // peak (heaviest) working prescription of the meso, for deload sizing
  weekPeak: prescriptionSchema.nullable().default(null),
  // plan defaults for cold starts (meso_exercises.initial_*)
  initial: z
    .object({
      weight: z.number().min(0).nullable(),
      reps: z.number().int().min(1).nullable(),
      sets: z.number().int().min(1),
    })
    .nullable()
    .default(null),
});

export type EngineInputs = z.infer<typeof engineInputsSchema>;
export type LoggedSetInput = z.infer<typeof loggedSetInputSchema>;
export type PrescriptionBase = z.infer<typeof prescriptionSchema>;

export interface Prescription extends PrescriptionBase {
  /** human-readable explanation surfaced in the UI and over MCP */
  rationale: string;
}

export type EngineParams = z.infer<typeof engineParamsSchema>;

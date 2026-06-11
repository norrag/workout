/**
 * Database types for the schema in supabase/migrations.
 *
 * Hand-authored to match 20260611000001_initial_schema.sql; once a local
 * Supabase stack is available, regenerate with `npm run db:types` (the
 * generated output replaces this file — keep shapes in sync via migrations).
 */

type Defaulted = "id" | "created_at" | "updated_at";
type InsertOf<R> = Omit<R, Defaulted> &
  Partial<Pick<R, Extract<Defaulted, keyof R>>>;
type Table<R> = {
  Row: R;
  Insert: InsertOf<R>;
  Update: Partial<R>;
  Relationships: [];
};

export type GoalType = "cut" | "gain" | "maintain";
export type EquipmentType =
  | "dumbbell"
  | "barbell"
  | "machine"
  | "cable"
  | "smith"
  | "bodyweight"
  | "other";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type Units = "kg" | "lb";

export type ProfileRow = {
  id: string;
  display_name: string | null;
  age: number | null;
  gender: "female" | "male" | "other" | "undisclosed" | null;
  experience_level: ExperienceLevel | null;
  preferred_equipment: string[];
  units: Units;
  role: "user" | "admin";
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MuscleGroupRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type ExerciseRow = {
  id: string;
  user_id: string | null;
  name: string;
  equipment_type: EquipmentType;
  notes: string | null;
  video_url: string | null;
  source_exercise_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ExerciseMuscleGroupRow = {
  id: string;
  exercise_id: string;
  muscle_group_id: string;
  role: "primary" | "secondary";
  created_at: string;
  updated_at: string;
}

export type MacrocycleRow = {
  id: string;
  user_id: string;
  name: string;
  goal_type: GoalType;
  goal_notes: string | null;
  target_metrics: Record<string, unknown>;
  start_date: string;
  target_end_date: string | null;
  status: "active" | "completed" | "archived";
  created_at: string;
  updated_at: string;
}

export type MesocycleRow = {
  id: string;
  macrocycle_id: string;
  user_id: string;
  name: string;
  weeks: number;
  days_per_week: number;
  includes_deload: boolean;
  rir_start: number;
  rir_end: number;
  status: "planned" | "active" | "completed" | "abandoned";
  template_id: string | null;
  start_date: string | null;
  created_at: string;
  updated_at: string;
}

export type MesoExerciseRow = {
  id: string;
  mesocycle_id: string;
  day_of_week: number;
  position: number;
  exercise_id: string;
  initial_weight: number | null;
  initial_reps: number | null;
  initial_sets: number;
  created_at: string;
  updated_at: string;
}

export type MicrocycleRow = {
  id: string;
  mesocycle_id: string;
  user_id: string;
  week_number: number;
  target_rir: number;
  is_deload: boolean;
  start_date: string | null;
  status: "pending" | "active" | "completed";
  created_at: string;
  updated_at: string;
}

export type WorkoutRow = {
  id: string;
  microcycle_id: string;
  user_id: string;
  day_number: number;
  scheduled_date: string | null;
  performed_at: string | null;
  status: "planned" | "in_progress" | "completed" | "skipped";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkoutExerciseRow = {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  prescribed_weight: number | null;
  prescribed_reps: number | null;
  prescribed_sets: number | null;
  target_rir: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type LoggedSetRow = {
  id: string;
  workout_exercise_id: string;
  user_id: string;
  exercise_id: string;
  macrocycle_id: string;
  mesocycle_id: string;
  microcycle_id: string;
  workout_id: string;
  performed_at: string;
  set_number: number;
  weight: number;
  reps: number;
  rir_reported: number | null;
  is_warmup: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ExerciseFeedbackRow = {
  id: string;
  workout_exercise_id: string;
  user_id: string;
  joint_pain: number | null;
  muscle_strain: number | null;
  pump: number | null;
  fatigue: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkoutFeedbackRow = {
  id: string;
  workout_id: string;
  user_id: string;
  overall_fatigue: number | null;
  effort_rating: number | null;
  performance_rating: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateRow = {
  id: string;
  user_id: string | null;
  name: string;
  emphasis: string;
  intended_gender: "female" | "male" | "any" | null;
  days_per_week: number;
  description: string | null;
  source_template_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateDayRow = {
  id: string;
  template_id: string;
  day_number: number;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateExerciseRow = {
  id: string;
  template_day_id: string;
  exercise_id: string;
  position: number;
  default_sets: number;
  default_rep_range: string | null;
  created_at: string;
  updated_at: string;
}

export type ShareRow = {
  id: string;
  owner_id: string;
  grantee_id: string | null;
  object_type: "exercise" | "template" | "mesocycle";
  object_id: string;
  share_code: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EngineParamsRow = {
  id: string;
  version: number;
  params: Record<string, unknown>;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type EngineDecisionRow = {
  id: string;
  user_id: string;
  workout_exercise_id: string | null;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  params_version: number;
  created_at: string;
}

export type VExerciseHistoryRow = {
  user_id: string;
  exercise_id: string;
  exercise_name: string;
  mesocycle_id: string;
  microcycle_id: string;
  workout_id: string;
  performed_on: string;
  working_sets: number;
  volume: number | null;
  top_weight: number | null;
  e1rm: number | null;
  avg_rir_reported: number | null;
}

export type VMuscleGroupVolumeRow = {
  user_id: string;
  muscle_group_id: string;
  muscle_group: string;
  microcycle_id: string;
  mesocycle_id: string;
  week_start: string;
  primary_sets: number;
  secondary_sets: number;
  volume: number | null;
}

export type VMesoSummaryRow = {
  user_id: string;
  mesocycle_id: string;
  name: string;
  status: string;
  weeks: number;
  days_per_week: number;
  rir_start: number;
  rir_end: number;
  includes_deload: boolean;
  start_date: string | null;
  workouts_completed: number;
  workouts_total: number;
  working_sets: number;
  total_volume: number | null;
  best_e1rm: number | null;
  avg_joint_pain: number | null;
  avg_pump: number | null;
  avg_overall_fatigue: number | null;
  avg_performance: number | null;
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      muscle_groups: Table<MuscleGroupRow>;
      exercises: Table<ExerciseRow>;
      exercise_muscle_groups: Table<ExerciseMuscleGroupRow>;
      macrocycles: Table<MacrocycleRow>;
      mesocycles: Table<MesocycleRow>;
      meso_exercises: Table<MesoExerciseRow>;
      microcycles: Table<MicrocycleRow>;
      workouts: Table<WorkoutRow>;
      workout_exercises: Table<WorkoutExerciseRow>;
      logged_sets: Table<LoggedSetRow>;
      exercise_feedback: Table<ExerciseFeedbackRow>;
      workout_feedback: Table<WorkoutFeedbackRow>;
      templates: Table<TemplateRow>;
      template_days: Table<TemplateDayRow>;
      template_exercises: Table<TemplateExerciseRow>;
      shares: Table<ShareRow>;
      engine_params: Table<EngineParamsRow>;
      engine_decisions: Table<EngineDecisionRow>;
    };
    Views: {
      v_exercise_history: { Row: VExerciseHistoryRow; Relationships: [] };
      v_muscle_group_volume: { Row: VMuscleGroupVolumeRow; Relationships: [] };
      v_meso_summary: { Row: VMesoSummaryRow; Relationships: [] };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

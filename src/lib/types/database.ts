/**
 * Database types for the schema in supabase/migrations.
 *
 * Hand-authored to match 20260611000001_initial_schema.sql; once a local
 * Supabase stack is available, regenerate with `npm run db:types` (the
 * generated output replaces this file — keep shapes in sync via migrations).
 */

type Defaulted =
  | "id"
  | "created_at"
  | "updated_at"
  // has a DB default ('{}'); only workout_exercises carries these keys
  | "skipped_set_numbers"
  | "set_weights"
  // nullable freshness fingerprint; stamped by the engine/reconcile paths only
  | "dep_fingerprint"
  // engine_decisions.kind defaults to 'advance' in the DB; seed writers pass it
  | "kind"
  // nullable per-set e1RM (PH31); computed at log/amend time, optional on insert
  | "e1rm"
  // nullable; set only by the library seed/import, never by app inserts
  | "legacy_id";
type InsertOf<R> = Omit<R, Defaulted> &
  Partial<Pick<R, Extract<Defaulted, keyof R>>>;
type Table<R> = {
  Row: R;
  Insert: InsertOf<R>;
  Update: Partial<R>;
  Relationships: [];
};

/** June 2026 macrocycle goal vocabulary (replaces the old cut/gain/maintain). */
export type MacroGoalType = "hypertrophy" | "strength" | "cut" | "maintain";
/** suggested/assigned mesocycle phase within a macro (deload is a per-week flag). */
export type MesoPhase = "accumulation" | "intensification" | "peak";
// canonical engine buckets (used by user-created customs) plus the wider
// vocabulary the imported library stores verbatim. The engine normalizes the
// extra labels to a canonical bucket via toEngineEquipment (engine/params.ts).
export type EquipmentType =
  | "dumbbell"
  | "barbell"
  | "machine"
  | "cable"
  | "smith"
  | "bodyweight"
  | "bands"
  | "kettlebell"
  | "other"
  | "smith machine"
  | "bodyweight only"
  | "bodyweight loadable"
  | "machine assistance"
  | "freemotion";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type SetType = "straight" | "drop";

export type ProfileRow = {
  id: string;
  display_name: string | null;
  age: number | null;
  gender: "female" | "male" | "other" | "undisclosed" | null;
  /** height in whole inches (imperial-only) */
  height_in: number | null;
  bodyweight: number | null;
  bodyweight_updated_at: string | null;
  /** estimated body-fat % (optional) — feeds the FFMI proximity target model */
  body_fat_pct: number | null;
  training_since: string | null;
  experience_level: ExperienceLevel | null;
  preferred_equipment: string[];
  week_starts_on: number;
  /** auto-match a changed set weight across the exercise's unlogged sets (doc 11) */
  auto_match_weights: boolean;
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
  legacy_id: number | null;
  name: string;
  equipment_type: EquipmentType;
  description: string | null;
  notes: string | null;
  video_url: string | null;
  source_exercise_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ExcludedExerciseRow = {
  id: string;
  user_id: string;
  exercise_id: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export type ExerciseNoteRow = {
  id: string;
  user_id: string;
  exercise_id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** Per-user × exercise engine override (doc 14 phase 3). First tunable: the
 *  editable weight increment, in pounds. */
export type ExerciseParamOverrideRow = {
  id: string;
  user_id: string;
  exercise_id: string;
  weight_increment: number;
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
  goal_type: MacroGoalType;
  goal_notes: string | null;
  target_metrics: Record<string, unknown>;
  duration_months: number | null;
  meso_length_weeks: number;
  recommended_duration_months: number | null;
  /** cached planMacrocycle target snapshot (display only; recomputed when null) */
  target_low: number | null;
  target_high: number | null;
  target_unit: string | null;
  target_direction: "gain" | "loss" | "none" | null;
  rate_low: number | null;
  rate_high: number | null;
  start_date: string;
  target_end_date: string | null;
  status: "active" | "completed" | "archived";
  created_at: string;
  updated_at: string;
}

export type MesocycleRow = {
  id: string;
  macrocycle_id: string | null;
  /** M1…Mn placement within the macro (null for standalone) */
  position: number | null;
  /** suggested/assigned phase, set by the create engine; editable when planning */
  phase: MesoPhase | null;
  user_id: string;
  name: string;
  weeks: number;
  days_per_week: number;
  includes_deload: boolean;
  rir_start: number;
  rir_end: number;
  status:
    | "draft"
    | "unplanned"
    | "planned"
    | "active"
    | "completed"
    | "abandoned";
  template_id: string | null;
  start_date: string | null;
  created_at: string;
  updated_at: string;
}

export type MesoDayRow = {
  id: string;
  mesocycle_id: string;
  user_id: string;
  day_number: number;
  label: string | null;
  weekday: number | null;
  created_at: string;
  updated_at: string;
}

export type MesoDayGroupRow = {
  id: string;
  meso_day_id: string;
  muscle_group_id: string;
  position: number;
  exercise_slots: number;
  created_at: string;
  updated_at: string;
}

export type MesoExerciseRow = {
  id: string;
  mesocycle_id: string;
  day_of_week: number | null;
  meso_day_group_id: string | null;
  slot_number: number | null;
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
  muscle_group_id: string | null;
  position: number;
  prescribed_weight: number | null;
  prescribed_reps: number | null;
  prescribed_sets: number | null;
  target_rir: number | null;
  status: "pending" | "completed" | "skipped";
  /** set numbers skipped individually (greyed, reversible) — fig 1.3 */
  skipped_set_numbers: number[];
  /** per-set planned weight overrides for unlogged sets (set_number → weight), doc 11 */
  set_weights: Record<string, number>;
  notes: string | null;
  /** Freshness fingerprint (doc 14): sha256 of the config projection of this
   *  prescription's engine inputs + the engine_params token. The read-path
   *  reconcile compares it against the freshly-resolved inputs and recomputes only
   *  the rows that diverged. null = never stamped (recompute on next view). */
  dep_fingerprint: string | null;
  created_at: string;
  updated_at: string;
}

export type LoggedSetRow = {
  id: string;
  workout_exercise_id: string;
  user_id: string;
  exercise_id: string;
  macrocycle_id: string | null;
  mesocycle_id: string;
  microcycle_id: string;
  workout_id: string;
  performed_at: string;
  set_number: number;
  weight: number;
  reps: number;
  set_type: SetType;
  rir_reported: number | null;
  /** engine per-set e1RM estimate (PH31); null for bodyweight/non-working sets */
  e1rm: number | null;
  is_warmup: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ExerciseFeedbackRow = {
  id: string;
  workout_exercise_id: string;
  user_id: string;
  muscle_group_id: string | null;
  joint_pain: number | null;
  pump: number | null;
  workload: number | null;
  soreness: number | null;
  soreness_days: number | null;
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

export type TemplateDayGroupRow = {
  id: string;
  template_day_id: string;
  muscle_group_id: string;
  position: number;
  exercise_slots: number;
  created_at: string;
  updated_at: string;
}

export type TemplateExerciseRow = {
  id: string;
  template_day_id: string;
  template_day_group_id: string | null;
  slot_number: number | null;
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
  schema_version: number | null;
  params_hash: string | null;
  code_sha: string | null;
  is_replayable: boolean;
  created_at: string;
  updated_at: string;
}

/** which engine entry produced a decision (doc 14 §6.2): a week N→N+1 advance
 *  (prescribe) or a cold-start seed (seedMeso). */
export type EngineDecisionKind = "seed" | "advance";

export type EngineDecisionRow = {
  id: string;
  user_id: string;
  workout_exercise_id: string | null;
  exercise_id: string | null;
  source_workout_exercise_id: string | null;
  workout_id: string | null;
  microcycle_id: string | null;
  mesocycle_id: string | null;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  params_version: number;
  params_hash: string | null;
  provenance: Record<string, unknown> | null;
  kind: EngineDecisionKind;
  created_at: string;
}

export type McpWriteAuditRow = {
  id: string;
  user_id: string;
  tool: string;
  args_hash: string;
  summary: string | null;
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

export type VMesoWeekSetsRow = {
  user_id: string;
  mesocycle_id: string;
  week_number: number;
  is_deload: boolean;
  muscle_group_id: string | null;
  muscle_group: string | null;
  planned_sets: number | null;
  logged_sets: number;
}

export type VExercisePrsRow = {
  user_id: string;
  exercise_id: string;
  exercise_name: string;
  best_weight: number | null;
  best_reps: number | null;
  best_e1rm: number | null;
  last_performed_at: string | null;
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
  sessions_attended: number;
  sessions_due: number;
  working_reps: number;
  n_joint_pain: number;
  n_pump: number;
  n_overall_fatigue: number;
  n_performance: number;
}

export type VMacroSummaryRow = {
  user_id: string;
  macrocycle_id: string;
  meso_count: number;
  sessions_logged: number;
  workouts_total: number;
  working_sets: number;
  total_volume: number;
  first_week_start: string | null;
  sessions_attended: number;
  sessions_due: number;
}

export type VExerciseOverviewRow = {
  user_id: string;
  exercise_id: string;
  exercise_name: string;
  times_trained: number;
  total_volume: number | null;
  first_logged_at: string | null;
  last_performed_at: string | null;
  weight_pr: number | null;
  weight_pr_reps: number | null;
  volume_pr: number | null;
  volume_pr_weight: number | null;
  volume_pr_reps: number | null;
  best_e1rm: number | null;
  best_session_volume: number | null;
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      muscle_groups: Table<MuscleGroupRow>;
      exercises: Table<ExerciseRow>;
      exercise_muscle_groups: Table<ExerciseMuscleGroupRow>;
      excluded_exercises: Table<ExcludedExerciseRow>;
      exercise_notes: Table<ExerciseNoteRow>;
      exercise_param_overrides: Table<ExerciseParamOverrideRow>;
      macrocycles: Table<MacrocycleRow>;
      mesocycles: Table<MesocycleRow>;
      meso_days: Table<MesoDayRow>;
      meso_day_groups: Table<MesoDayGroupRow>;
      meso_exercises: Table<MesoExerciseRow>;
      microcycles: Table<MicrocycleRow>;
      workouts: Table<WorkoutRow>;
      workout_exercises: Table<WorkoutExerciseRow>;
      logged_sets: Table<LoggedSetRow>;
      exercise_feedback: Table<ExerciseFeedbackRow>;
      workout_feedback: Table<WorkoutFeedbackRow>;
      templates: Table<TemplateRow>;
      template_days: Table<TemplateDayRow>;
      template_day_groups: Table<TemplateDayGroupRow>;
      template_exercises: Table<TemplateExerciseRow>;
      shares: Table<ShareRow>;
      engine_params: Table<EngineParamsRow>;
      engine_decisions: Table<EngineDecisionRow>;
      mcp_write_audit: Table<McpWriteAuditRow>;
    };
    Views: {
      v_exercise_history: { Row: VExerciseHistoryRow; Relationships: [] };
      v_muscle_group_volume: { Row: VMuscleGroupVolumeRow; Relationships: [] };
      v_meso_summary: { Row: VMesoSummaryRow; Relationships: [] };
      v_meso_week_sets: { Row: VMesoWeekSetsRow; Relationships: [] };
      v_exercise_prs: { Row: VExercisePrsRow; Relationships: [] };
      v_macro_summary: { Row: VMacroSummaryRow; Relationships: [] };
      v_exercise_overview: { Row: VExerciseOverviewRow; Relationships: [] };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

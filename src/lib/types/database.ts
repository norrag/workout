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
  // nullable verified-accurate params version; stamped by the engine/reconcile paths
  | "params_version"
  // nullable meso reconcile-gate signature (WS-J #1); stamped by the reconcile only
  | "last_reconcile_sig"
  // engine_decisions.kind defaults to 'advance' in the DB; seed writers pass it
  | "kind"
  // nullable per-set e1RM (PH31); computed at log/amend time, optional on insert
  | "e1rm"
  // T-I2: exercises.load_type has a DB default ('external'); bodyweight is captured
  // at log time on logged_sets (nullable) — both optional on insert.
  | "load_type"
  | "bodyweight"
  // nullable; set only by the library seed/import, never by app inserts
  | "legacy_id"
  // N18-B: nullable (null = plain ramp); most insert paths never set it
  | "rir_schedule"
  // doc 17 §2.5: nullable contract snapshot / birthdate — stamped/edited by
  // their dedicated write paths only, optional on insert
  | "plan_inputs"
  | "birthdate"
  // bodyweight_log.source has a DB default ('manual'); writers pass it
  | "source"
  // 5b: nullable proposal-resolution stamps on body_scans — written only by
  // the resolve path, never by the import upsert (a re-sync must not reset)
  | "profile_applied_at"
  | "profile_dismissed_at"
  // 5c: nullable body-fat provenance — written by the bf% write paths only
  | "body_fat_source"
  // N60 / doc 19 §6.3: nullable triggers audit on decision_explanations — set
  // only by the v3 generation hook, optional on insert (null on pre-v3 rows)
  | "triggers";
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
  /** legacy static age (fallback); superseded by `birthdate` when present */
  age: number | null;
  /** ISO date; preferred age source — derived fresh at plan time (doc 17 §2.5) */
  birthdate: string | null;
  gender: "female" | "male" | "other" | "undisclosed" | null;
  /** height in whole inches (imperial-only) */
  height_in: number | null;
  bodyweight: number | null;
  bodyweight_updated_at: string | null;
  /** estimated body-fat % (optional) — feeds the FFMI proximity target model */
  body_fat_pct: number | null;
  /** provenance of body_fat_pct (doc 17 Phase 5c): self-estimate vs applied
   *  DEXA measurement; null = legacy/unset */
  body_fat_source: "estimate" | "dexa" | null;
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
  /** T-I2: how the entered weight maps to effective load (external |
   *  bodyweight_only | bodyweight_loadable | bodyweight_assisted); backfilled from
   *  equipment_type. Null on rows not yet backfilled ⇒ derived from equipment_type. */
  load_type: string | null;
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

export type BodyweightLogRow = {
  id: string;
  user_id: string;
  /** the calendar day the measurement is FOR (backdating allowed) */
  measured_on: string;
  /** pounds */
  weight: number;
  /** doc 17 §5 — which explicit user action appended the point */
  source: "manual" | "profile" | "dexa";
  created_at: string;
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
  /** §2.5 contract snapshot: resolved MacroProfile + params version stamped
   *  whenever target_* is written (create / goals edit); null pre-Phase-1 */
  plan_inputs: Record<string, unknown> | null;
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
  /** N18-B: explicit per-working-week RIR override; null = the rir_start→rir_end ramp */
  rir_schedule: number[] | null;
  status:
    | "draft"
    | "unplanned"
    | "planned"
    | "active"
    | "completed"
    | "abandoned";
  template_id: string | null;
  start_date: string | null;
  /** read-path reconcile gate signature (WS-J #1); null until first reconcile */
  last_reconcile_sig: string | null;
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
  /** The engine_params version this prescription was last COMPUTED or verified-
   *  still-accurate under (advances on every reconcile confirmation, even when the
   *  numbers don't change), so a row always advertises "accurate as of Vx". null =
   *  never stamped. Distinct from a decision's params_version (which only advances
   *  when the numbers actually change). */
  params_version: number | null;
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
  /** R6: client-local calendar day the set was performed (YYYY-MM-DD). Written
   *  by the client at log time; pre-R6 rows carry their old UTC bucket. */
  performed_on: string | null;
  set_number: number;
  weight: number;
  reps: number;
  set_type: SetType;
  rir_reported: number | null;
  /** engine per-set e1RM estimate (PH31); null for bodyweight/non-working sets */
  e1rm: number | null;
  /** the e1RM's confidence band (high/moderate/low) — stamped alongside `e1rm`
   *  under the active engine params, so the estimate's reliability is auditable
   *  and surfaceable without recomputing. Null when `e1rm` is null. */
  e1rm_confidence: string | null;
  /** T-I2/#4: the lifter's bodyweight at log time (lb) — the effective-load base
   *  for bodyweight movements. Captured at log, locked once the workout completes.
   *  Null when the profile had no bodyweight set. */
  bodyweight: number | null;
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

/** N58 / doc 18 — the stored LLM prescription explanation, keyed 1:1 to the
 *  engine decision it explains (the decision id IS the cache key; a recompute
 *  writes a new decision + a new explanation). Service-role writes only. */
export type DecisionExplanationRow = {
  decision_id: string;
  user_id: string;
  /** §4 output contract: plain text, ≤320 chars */
  body: string;
  model: string;
  prompt_version: number;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
  /** doc 19 §6.1 — the triggers that routed this decision to the LLM call;
   *  null on pre-v3 rows */
  triggers: string[] | null;
}

/** N58 follow-up — durable failure log for the LLM explanation pipeline: one
 *  row per failed generation attempt (API error, §4 post-check discard, or a
 *  burst-level fault), so failures are queryable instead of living only in
 *  Vercel function logs. Service-role writes only; owner-or-admin SELECT. */
export type LlmExplanationFailureRow = {
  id: string;
  user_id: string;
  /** null for burst-level failures that precede any single decision */
  decision_id: string | null;
  stage: "burst" | "generate" | "post_check";
  /** ≤2000 chars, truncated by the writer */
  error: string;
  context: Record<string, unknown> | null;
  created_at: string;
}

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
  best_set_e1rm: number | null;
}

/** R14: role-grain weekly-set facts for fractional volume counting (doc 10 §2).
 * Counts are UNWEIGHTED per role; apply engine/volume.ts::fractionalSetCount. */
export type VMesoWeekMuscleSetsRow = {
  user_id: string;
  mesocycle_id: string;
  week_number: number;
  is_deload: boolean;
  muscle_group_id: string | null;
  muscle_group: string | null;
  role: "primary" | "secondary";
  planned_sets: number | null;
  logged_sets: number;
  /** non-warmup sets at rir_reported ≤ 4 or unreported — the §2 hard-set rule */
  logged_hard_sets: number;
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
  /** the logged span (doc 17 §5): first/last completed session; null unlogged */
  first_logged_at: string | null;
  last_logged_at: string | null;
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

/** doc 15 §2.2 (N34): per-user link to an external data provider. Status and
 *  timestamps only — token material lives in `external_connection_secrets`
 *  (deny-all; service-role call sites only). */
export type ExternalConnectionRow = {
  id: string;
  user_id: string;
  provider: "bodyspec";
  /** 'error' = sync/token refresh failed; the screen offers a reconnect.
   *  Disconnect deletes the row — there is no revoked resting state. */
  status: "connected" | "error";
  provider_user_id: string | null;
  provider_email: string | null;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

/** doc 15 §2.2 (N34): OAuth token material for a connection. DENY-ALL at the
 *  database (RLS with no policies + client grants revoked): only the service
 *  role reaches it, exclusively via `src/lib/queries/external-connections.ts`
 *  call sites with explicit user scoping (hard rule 4). The row type exists
 *  for those call sites — client roles get permission-denied regardless. */
export type ExternalConnectionSecretRow = {
  connection_id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  scope: string | null;
  created_at: string;
  updated_at: string;
};

/** doc 15 §8.5 (N34): an in-flight OAuth connect round trip. DENY-ALL at the
 *  database (RLS with no policies + client grants revoked): only the service
 *  role reaches it, exclusively via `src/lib/queries/oauth-transactions.ts`.
 *  Created with a session-derived user_id at /connect; consumed single-use by
 *  `state` at /callback, so the callback needs no cookies (the installed-PWA
 *  flow spans two browsing contexts with separate cookie jars). */
export type OAuthTransactionRow = {
  /** the OAuth `state` value — 32 bytes of URL-safe entropy, single-use */
  state: string;
  user_id: string;
  provider: "bodyspec";
  code_verifier: string;
  expires_at: string;
  created_at: string;
};

/** doc 15 §2.2 (N34): one imported DEXA scan result. Canonical imperial
 *  columns (converted once at the import boundary) + verbatim provider
 *  payloads in `raw` for early-access re-mapping fidelity. */
export type BodyScanRow = {
  id: string;
  user_id: string;
  provider: "bodyspec";
  provider_result_id: string;
  scanned_at: string;
  scanner_model: string | null;
  /** intake snapshot at scan time */
  weight_lb: number | null;
  height_in: number | null;
  age_years: number | null;
  /** total tissue_fat_pct — fat % of soft tissue */
  body_fat_pct: number | null;
  lean_mass_lb: number | null;
  fat_mass_lb: number | null;
  bone_mass_lb: number | null;
  vat_mass_lb: number | null;
  vat_volume_cm3: number | null;
  android_gynoid_ratio: number | null;
  lmi_kg_m2: number | null;
  almi_kg_m2: number | null;
  bmd_total_g_cm2: number | null;
  rmr_kcal_cunningham: number | null;
  rmr_kcal_mifflin: number | null;
  /** per-region composition converted to lb: {region: {lean_mass_lb, …}} */
  regions: Record<string, unknown> | null;
  /** {params, metrics: {metric: {value, percentile}}} — provider shape */
  percentiles: Record<string, unknown> | null;
  /** verbatim API payloads per section */
  raw: Record<string, unknown>;
  /** 5b (doc 15 §2.3): when the user accepted this scan's profile-update
   *  proposal. Null with profile_dismissed_at null = unresolved. */
  profile_applied_at: string | null;
  /** 5b: when the user declined the proposal (kept current profile values). */
  profile_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** doc 15 §2.2 (N34 Phase 5b): `v_body_comp_history` — per-scan composition
 *  values + deltas vs the previous scan + the same-scanner comparability
 *  flag. The one definition every scan-comparison surface reads. */
export type VBodyCompHistoryRow = {
  user_id: string;
  scan_id: string;
  provider: "bodyspec";
  scanned_at: string;
  scanner_model: string | null;
  weight_lb: number | null;
  body_fat_pct: number | null;
  lean_mass_lb: number | null;
  fat_mass_lb: number | null;
  almi_kg_m2: number | null;
  /** null on the user's first scan */
  prev_scanned_at: string | null;
  delta_weight_lb: number | null;
  delta_body_fat_pct: number | null;
  delta_lean_lb: number | null;
  delta_fat_lb: number | null;
  /** null = no previous scan; false when either scanner model is unknown
   *  (unverifiable ⇒ not comparable by default, doc 15 §6.2) */
  same_scanner_as_prev: boolean | null;
};

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
      bodyweight_log: Table<BodyweightLogRow>;
      external_connections: Table<ExternalConnectionRow>;
      external_connection_secrets: Table<ExternalConnectionSecretRow>;
      oauth_transactions: Table<OAuthTransactionRow>;
      body_scans: Table<BodyScanRow>;
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
      decision_explanations: Table<DecisionExplanationRow>;
      llm_explanation_failures: Table<LlmExplanationFailureRow>;
      mcp_write_audit: Table<McpWriteAuditRow>;
    };
    Views: {
      v_exercise_history: { Row: VExerciseHistoryRow; Relationships: [] };
      v_meso_summary: { Row: VMesoSummaryRow; Relationships: [] };
      v_meso_week_muscle_sets: { Row: VMesoWeekMuscleSetsRow; Relationships: [] };
      v_exercise_prs: { Row: VExercisePrsRow; Relationships: [] };
      v_macro_summary: { Row: VMacroSummaryRow; Relationships: [] };
      v_exercise_overview: { Row: VExerciseOverviewRow; Relationships: [] };
      v_body_comp_history: { Row: VBodyCompHistoryRow; Relationships: [] };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      // R3 write integrity: atomic multi-statement writes live in the DB so a
      // mid-flight failure can never half-apply (20260702000005).
      save_meso_plan: {
        Args: { p_mesocycle_id: string; p_days: unknown };
        Returns: undefined;
      };
      activate_engine_params: {
        Args: { p_version: number };
        Returns: undefined;
      };
      insert_generated_day: {
        Args: {
          p_mesocycle_id: string;
          p_workout: unknown;
          p_exercises: unknown;
          p_decisions: unknown;
        };
        Returns: {
          workout_id: string | null;
          created: boolean;
          adopted?: boolean;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

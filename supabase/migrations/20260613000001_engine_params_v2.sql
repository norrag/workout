-- ---------------------------------------------------------------------------
-- Engine params v2 — Phase 4 feedback re-alignment (docs/07 Phase 4).
--
-- * pump/workload 0–10 sliders (fig 1.4) replace the old 0–3 strain/fatigue
--   thresholds; the workload anchor ("just right" = 5) drives set counts
-- * increments and rounding are expressed per equipment per unit (lb is the
--   app default), with first-class bands and kettlebell steps
--
-- Append-only: version 1 stays for decision audit/replay; version 2 becomes
-- the single active row (engine_params_single_active_idx).
-- ---------------------------------------------------------------------------

update public.engine_params set is_active = false where version = 1 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 2, '{
  "increment": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "experience_increment_scale": {
    "beginner": 1.5,
    "intermediate": 1.0,
    "advanced": 0.5
  },
  "progression_style": {
    "gain": "load_first",
    "cut": "hold",
    "maintain": "hold"
  },
  "small_miss_reps": 2,
  "regression_pct": 0.9,
  "pain_gate": 2,
  "workload_high": 8,
  "workload_low": 3,
  "set_add_pump_min": 6,
  "pump_low": 2,
  "min_sets": 2,
  "max_sets_per_exercise": 6,
  "mg_set_ceiling": 20,
  "session_fatigue_dampen_threshold": 3,
  "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 },
  "meso_seed_backoff_pct": 0.925,
  "rounding": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  }
}'::jsonb, true, 'v2 — pivot feedback re-alignment (pump/workload 0-10), per-equipment per-unit increments incl. bands/kettlebell'
where not exists (select 1 from public.engine_params where version = 2);

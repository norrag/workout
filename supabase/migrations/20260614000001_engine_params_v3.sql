-- ---------------------------------------------------------------------------
-- Engine params v3 — metric & macrocycle-planning defaults
-- (docs/10-metrics-spec.md §8; docs/07 Design v2 reconciliation backlog).
--
-- Adds the research-backed metric blocks consumed by the new pure engine
-- functions:
--   * e1rm           — effective-reps + Epley/Brzycki average + confidence bands (§1)
--   * macro_target   — profile-personalized macrocycle target + recommended timeframe (§5)
--   * phase_plan     — accumulate → intensify → peak spread across mesos (§5)
--   * key_lifts      — most-logged exercises define the strength rollup (§6)
--
-- The v2 feedback/increment block is carried forward unchanged. These keys also
-- carry schema defaults in src/lib/engine/params.ts, so an environment still on
-- v2 keeps working; this row makes them explicit and admin-tunable.
--
-- Append-only: versions 1 and 2 stay for decision audit/replay; version 3
-- becomes the single active row (engine_params_single_active_idx).
-- ---------------------------------------------------------------------------

update public.engine_params set is_active = false where version < 3 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 3, '{
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
  },
  "e1rm": {
    "rir_offset": 1.0,
    "high_max_eff_reps": 8,
    "mod_max_eff_reps": 12,
    "high_max_rir": 2,
    "mod_max_rir": 3
  },
  "macro_target": {
    "sex_factor_female": 0.5,
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27,
    "cut_bmi_lean": 22,
    "age_taper": true,
    "age_taper_start": 40,
    "age_taper_per_year": 0.02,
    "age_taper_floor": 0.6,
    "recommend_target_lb": { "male": 8, "female": 4 },
    "recommend_strength_total_pct": 10,
    "recommend_cut_bw_pct": 8,
    "recommend_min_months": 2,
    "recommend_max_months": 12,
    "present": "conservative_end"
  },
  "phase_plan": { "order": ["accumulation", "intensification", "peak"], "accumulation_fraction": 0.6 },
  "key_lifts": { "n": 5, "selection": "frequency" }
}'::jsonb, true, 'v3 — metric defaults: e1RM, macro_target (planMacrocycle), phase_plan, key_lifts (10-metrics-spec.md)'
where not exists (select 1 from public.engine_params where version = 3);

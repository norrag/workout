-- ===========================================================================
-- engine_params v4 — macrocycle-target model fix (10-metrics-spec.md §5)
--
-- The v3 hypertrophy target used discrete experience buckets × duration with a
-- hard "career-cap" clamp on the per-macro total. For lifters near genetic
-- potential (high training age) the clamp pinned every duration to the same
-- tiny number — 3-month and 12-month macros returned an identical target (the
-- "static across durations" bug). v4 replaces it with a continuous training-age
-- rate decay (`base × e^(−years/tau)`): the target scales with duration AND
-- tapers with training age. Cut now compounds on the shrinking bodyweight and
-- is capped at a realistic fraction of bodyweight (no fat floor in the profile).
--
-- Append-only; deactivates v3 (kept for replay) and seeds v4 active. The
-- single-active-row constraint holds. Mirrors src/lib/engine/params.ts.
-- ===========================================================================

update public.engine_params set is_active = false where version < 4 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 4, '{
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
    "hypertrophy_base_pct_bw_month": { "low": 1.0, "high": 1.5 },
    "hypertrophy_decay_tau_years": 5,
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27,
    "cut_bmi_lean": 22,
    "cut_cap_pct_bw": 0.25,
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
}'::jsonb, true, 'v4 — macro-target fix: continuous training-age hypertrophy decay + compounding/capped cut (10-metrics-spec.md §5)'
where not exists (select 1 from public.engine_params where version = 4);

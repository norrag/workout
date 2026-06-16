-- ===========================================================================
-- Auto-match weights setting + recency-weighted e1RM param (engine_params v6)
--
-- Two changes, both per doc 11 (workout-engine reps↔weight↔RIR linkage):
--
-- 1. `profiles.auto_match_weights` — when on, changing a set's weight during a
--    workout propagates to that exercise's still-unlogged sets (logged history
--    is never rewritten). Off by default; existing users unaffected. The
--    profiles table already has full owner-only RLS (select/insert/update gated
--    on `id = auth.uid()`), which covers every column, so no new policy is
--    needed — the column rides the existing `profiles_update_own` policy.
--
-- 2. engine_params v6 adds `e1rm.recency_halflife_days` (30) — the half-life for
--    the recency-weighted strength anchor that powers the live reps predictor.
--    The schema parses older rows via a default, but we seed an explicit v6 row
--    so the value is admin-tunable (mirrors src/lib/engine/params.ts).
--
-- Append-only; deactivates v5 (kept for replay).
-- ===========================================================================

alter table public.profiles
  add column if not exists auto_match_weights boolean not null default false;

update public.engine_params set is_active = false where version < 6 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 6, '{
  "increment": { "barbell": { "kg": 2.5, "lb": 5 }, "smith": { "kg": 2.5, "lb": 5 }, "dumbbell": { "kg": 2.0, "lb": 5 }, "machine": { "kg": 2.5, "lb": 5 }, "cable": { "kg": 2.5, "lb": 5 }, "bodyweight": { "kg": 2.5, "lb": 5 }, "bands": { "kg": 5.0, "lb": 10 }, "kettlebell": { "kg": 4.0, "lb": 9 }, "other": { "kg": 2.5, "lb": 5 } },
  "experience_increment_scale": { "beginner": 1.5, "intermediate": 1.0, "advanced": 0.5 },
  "progression_style": { "gain": "load_first", "cut": "hold", "maintain": "hold" },
  "small_miss_reps": 2, "regression_pct": 0.9, "pain_gate": 2, "workload_high": 8, "workload_low": 3, "set_add_pump_min": 6, "pump_low": 2, "min_sets": 2, "max_sets_per_exercise": 6, "mg_set_ceiling": 20, "session_fatigue_dampen_threshold": 3, "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 }, "meso_seed_backoff_pct": 0.925,
  "rounding": { "barbell": { "kg": 2.5, "lb": 5 }, "smith": { "kg": 2.5, "lb": 5 }, "dumbbell": { "kg": 2.0, "lb": 5 }, "machine": { "kg": 2.5, "lb": 5 }, "cable": { "kg": 2.5, "lb": 5 }, "bodyweight": { "kg": 2.5, "lb": 5 }, "bands": { "kg": 5.0, "lb": 10 }, "kettlebell": { "kg": 4.0, "lb": 9 }, "other": { "kg": 2.5, "lb": 5 } },
  "e1rm": { "rir_offset": 1.0, "high_max_eff_reps": 8, "mod_max_eff_reps": 12, "high_max_rir": 2, "mod_max_rir": 3, "recency_halflife_days": 30 },
  "macro_target": {
    "sex_factor_female": 0.7,
    "hypertrophy_base_pct_bw_month": { "low": 1.0, "high": 1.5 },
    "hypertrophy_decay_tau_years": 5,
    "hypertrophy_floor_pct_bw_month": { "low": 0.04, "high": 0.09 },
    "ffmi_ceiling": { "male": 25, "female": 21.5 },
    "ffmi_untrained": { "male": 18.5, "female": 14.5 },
    "proximity_macro_cap_frac": 0.6,
    "cut_bf_thresholds": { "male": { "high": 20, "lean": 12 }, "female": { "high": 30, "lean": 22 } },
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27, "cut_bmi_lean": 22, "cut_cap_pct_bw": 0.25,
    "age_taper": true, "age_taper_start": 40, "age_taper_per_year": 0.02, "age_taper_floor": 0.6,
    "recommend_target_lb": { "male": 8, "female": 4 }, "recommend_strength_total_pct": 10, "recommend_cut_bw_pct": 8, "recommend_min_months": 2, "recommend_max_months": 12, "present": "conservative_end"
  },
  "phase_plan": { "order": ["accumulation", "intensification", "peak"], "accumulation_fraction": 0.6 },
  "key_lifts": { "n": 5, "selection": "frequency" }
}'::jsonb, true, 'v6 — recency-weighted e1RM half-life for the live reps predictor (doc 11)'
where not exists (select 1 from public.engine_params where version = 6);

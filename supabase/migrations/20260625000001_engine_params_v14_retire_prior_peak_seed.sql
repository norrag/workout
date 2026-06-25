-- 20260625000001 — engine_params v14: retire the prior-peak meso seed (WS-I / T-I5)
--
-- Owner ruling (2026-06-25, recorded in docs/triage/I-engine-v9.md & backlog.md):
-- the legacy `priorPeak × meso_seed_backoff_pct` meso seed is fundamentally broken
-- and must never be used again. It backs the WEIGHT off but carries `priorPeak.reps`
-- VERBATIM (so week 1 escapes the rep window) and reads a per-column-max set from
-- v_exercise_prs the user never actually performed — a FABRICATED seed (full
-- root-cause: docs/reviews/2026-06-23-standalone-prescription-investigation.md §1–2).
--
-- Principle: a prescription is not emitted at any cost. Use real data when present;
-- when there isn't enough, defer to the user's own manual seed rather than invent a
-- number. New seed precedence (gated by `retire_prior_peak_seed`):
--   confident recency anchor (seed_from_anchor) → the user's plan initial_* (manual
--   seed) → UNSEEDED (null weight, prompt the user). Never a peak-derived fabrication.
--
-- This is the single delta from v12: `retire_prior_peak_seed:true`. Everything else
-- is byte-identical to v12. The legacy `meso_seed_backoff_pct` param is LEFT in place
-- (historical rows still carry it; dropping it from the schema would flip them
-- non-replayable). Its removal + the per-row migration is T-I4, where the whole
-- legacy increment/seed block is retired together.
--
-- Shipped INACTIVE (same discipline as v11/v12): v14 changes the live seed math, so
-- activate manually only AFTER a replay diff (admin replay_decisions; doc 13 §6).
-- See docs/deployment/manual-operations.md. v12 stays the active row until then.
-- (Note: a throwaway v13 "deload tuning" test row exists in the hosted DB only — no
-- migration, disregarded per owner; v14 is the next real version.)
--
-- Schema shape unchanged: `retire_prior_peak_seed` is `.optional()` (absent on
-- v12/earlier), so those rows parse byte-identically — their hash / is_replayable /
-- freshness fingerprint are untouched. schema_version stays 5. The JSON below is the
-- full materialization from engineParamsSchema.parse() with its canonical
-- hashParams() sha256 (guarded in params-provenance.test.ts).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  14,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":3,"session_performance_dampen_threshold":1,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":4},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}},"retire_prior_peak_seed":true}'::jsonb,
  false,
  'v14 — retire the prior-peak meso seed (T-I5): retire_prior_peak_seed=true. Seed precedence = confident anchor → user initial_* → unseeded. Otherwise identical to v12. Shipped INACTIVE — activate manually after a replay_decisions diff.',
  5,
  '6b7bce05f0c2002038c1e8ad1e9ffa328626a947e41c74971045074bfcdf4ace',
  null,
  true
)
on conflict (version) do nothing;

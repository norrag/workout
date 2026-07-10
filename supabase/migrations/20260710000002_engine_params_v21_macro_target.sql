-- 20260710000002 — engine_params v21: macro-target correction (doc 17 §2, N21)
--
-- The Phase-1 target-engine correction. Three new gated params inside
-- `macro_target` over v20 (docs/17-macrocycle-goals.md §2):
--
--   strength_sex_factor        {male: 1.0, female: 1.0} — the strength path
--                              gains the same modifier chain the hypertrophy
--                              path has. Relative 1RM gains are ~sex-equal
--                              (Roberts 2020; Refalo 2025; doc 10 §5), so the
--                              default is 1/1 — a DISTINCT param from the
--                              hypertrophy sex_factor_female (0.7), which
--                              models lean-mass fraction and is never reused.
--   age_taper_floor_strength   0.7 — the existing age taper (start 40,
--                              0.02/yr) now applies to the strength band with
--                              a strength-specific floor above the hypertrophy
--                              0.6 (preserved neural adaptation; Peterson
--                              2010, ACSM 2009). Both band endpoints scale;
--                              compounding + strength_cap_total_pct unchanged.
--   bf_proxy_pct               male {lean 10, average 16, high_bf 25} /
--                              female {lean 18, average 26, high_bf 35} —
--                              hypertrophy continuity (§2.2): with height +
--                              bodyweight but no bf%, the FFMI proximity model
--                              runs on a representative bf% for the BMI
--                              leanness band (mid-band values consistent with
--                              cut_bf_thresholds) instead of flipping to the
--                              training-age decay, so completing the bf% field
--                              moves the rate continuously. The decay path is
--                              reserved for profiles missing height/bodyweight.
--
-- Also riding v21 activation (parameterless code changes, display/pacer layer):
-- the §2.3 cut-band proportional rescale and the goal-independent
-- MacroPlan.strengthRatePctMonth exposure (the doc-17 Phase-2 pacer carrier).
--
-- All three params are `.optional()` (house discipline): every pre-v21 row
-- parses, hashes, and replays byte-identically, and with them absent
-- planMacrocycle's strength/hypertrophy paths behave exactly as before.
--
-- Shipped INACTIVE (same discipline as v11–v20): planMacrocycle is display/
-- pacer-layer (no stored prescriptions read it yet) but the params version
-- rides paramsToken, so activation is the doc-14 v-bump — replay diff + owner
-- review per doc 17 Phase R2 (docs/deployment/manual-operations.md).
-- schema_version stays 5 (optional fields are not a shape bump). The JSON is
-- the full materialization from engineParamsSchema.parse() with its canonical
-- hashParams() sha256 (guarded in params-provenance.test.ts).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  21,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":8,"session_performance_dampen_threshold":3,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":6},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"climb_requires_rir_step":true,"hold_week_anchor_deadband":true,"retire_prior_peak_seed":true,"deload_anchor_rir":true,"bodyweight_model":true,"pain_cut_gate":3,"progression":{"mode":"earned_step","step":"min","min_confidence":"moderate","compliance_band":0.015,"cadence":"microcycle","pacing":"macro_rate","rate_source":"band","band_position":0.5,"goal_rate_factor":{"strength":1,"hypertrophy":0.75,"gain":0.75,"cut":0,"maintain":0},"miss_rearm_sessions":2,"max_gap_days":10,"peak_week":"skip","max_pct_per_step":0.05},"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"strength_sex_factor":{"male":1,"female":1},"age_taper_floor_strength":0.7,"bf_proxy_pct":{"male":{"lean":10,"average":16,"high_bf":25},"female":{"lean":18,"average":26,"high_bf":35}},"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v21 — macro-target correction (doc 17 §2 / N21): strength-path personalization (strength_sex_factor 1/1 + age taper with strength floor 0.7), hypertrophy continuity via BMI-band bf% proxy (bf_proxy_pct), cut-band proportional rescale + goal-independent strengthRatePctMonth ride the code. Otherwise identical to v20. Shipped INACTIVE — activate per doc 17 Phase R2 after a replay diff (expected ≈ empty on prescriptions: targets are display/pacer layer).',
  5,
  '7017e2570317868281d772d3c139c28dd6bcb5dcdaf25719d0275ce2af3b4316',
  null,
  true
)
on conflict (version) do nothing;

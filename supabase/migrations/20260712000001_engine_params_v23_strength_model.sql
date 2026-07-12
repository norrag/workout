-- 20260712000001 — engine_params v23: two-component strength-rate model
-- (doc 17 §2.7, N43; research docs/reviews/2026-07-11-strength-rate-model-research.md)
--
-- The strength-path analogue of the N21/v21 hypertrophy correction. v21's
-- personalized strength band still buckets by CALENDAR training years
-- (bucketFor → strength_pct_month) — the same calendar-vs-body-composition
-- defect N21 fixed for hypertrophy: a lifter with 13 years under the bar but a
-- below-baseline FFMI has near-novice headroom the *advanced* bucket denies,
-- internally inconsistent with the same profile's near-novice hypertrophy
-- projection by a factor of two to three.
--
-- One new gated param block inside macro_target over v21 (§2.7):
--
--   strength_model  {enabled true,
--                    neural_n0 {low 3, high 5}, neural_floor {low 0.1, high 0.4},
--                    neural_tau_years 0.5, ffm_coupling_k 1,
--                    undermuscled_unbank 0.5, rate_ceiling_pct_month 8}
--
-- When body composition is readable (an FFMI can be computed), strengthRateBand
-- replaces the calendar bucket with the ADDITIVE model (research §4):
--   strengthRate%/mo = neural(effectiveTrainingAge) + k × hypertrophyRate_FFM
-- — a decaying neural/skill BAND (N0·e^(−effYears/τ) + floor; large near zero
-- training age, small non-zero floor for the experienced — Pearcey 2021) plus
-- the N21 FFMI-proximity rate re-expressed as %/mo of FFM and coupled ≈1:1
-- (allometric FFM exponent × trained-muscle amplification — Bamman 2007). The
-- "un-bank" guardrail discounts effective training age when realized FFM is low
-- (§4). The sum takes the SAME v21 strength sex factor + age taper and is
-- clamped to rate_ceiling_pct_month. When body comp can't be read the model
-- degrades to the v21 bucket band — the strength-path mirror of how the
-- hypertrophy path degrades to training-age decay.
--
-- (v22 was the hosted-only rate_source: "plan" micro-bump, activated in R3 then
-- rolled back to v21 this session — it carries no committed migration, so this
-- lands as v23 over the v21 base per the research doc §5.)
--
-- strength_model is `.optional()` (house discipline): every pre-v23 row parses,
-- hashes, and replays byte-identically, and with it absent planMacrocycle's
-- strength path behaves exactly as v21. Shipped INACTIVE (same discipline as
-- v11–v21): planMacrocycle is display/pacer-layer (no stored prescriptions read
-- it until rate_source is "plan"), but the params version rides paramsToken, so
-- activation is the doc-14 v-bump — replay diff + owner review per doc 17
-- Phase R (docs/deployment/manual-operations.md). schema_version stays 5
-- (an optional field is not a shape bump). The JSON is the full materialization
-- from engineParamsSchema.parse() with its canonical hashParams() sha256
-- (guarded in params-provenance.test.ts).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  23,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":8,"session_performance_dampen_threshold":3,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":6},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"climb_requires_rir_step":true,"hold_week_anchor_deadband":true,"retire_prior_peak_seed":true,"deload_anchor_rir":true,"bodyweight_model":true,"pain_cut_gate":3,"progression":{"mode":"earned_step","step":"min","min_confidence":"moderate","compliance_band":0.015,"cadence":"microcycle","pacing":"macro_rate","rate_source":"band","band_position":0.5,"goal_rate_factor":{"strength":1,"hypertrophy":0.75,"gain":0.75,"cut":0,"maintain":0},"miss_rearm_sessions":2,"max_gap_days":10,"peak_week":"skip","max_pct_per_step":0.05},"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"strength_sex_factor":{"male":1,"female":1},"age_taper_floor_strength":0.7,"bf_proxy_pct":{"male":{"lean":10,"average":16,"high_bf":25},"female":{"lean":18,"average":26,"high_bf":35}},"strength_model":{"enabled":true,"neural_n0":{"low":3,"high":5},"neural_floor":{"low":0.1,"high":0.4},"neural_tau_years":0.5,"ffm_coupling_k":1,"undermuscled_unbank":0.5,"rate_ceiling_pct_month":8},"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v23 — two-component strength-rate model (doc 17 §2.7 / N43): additive neural + FFM-coupled hypertrophic strength rate (strength_model block) supersedes the calendar bucket wherever an FFMI can be read; degrades to the v21 bucket band otherwise. Otherwise identical to v21 (v22 was the hosted-only rate_source plan micro-bump, rolled back). Shipped INACTIVE — activate per doc 17 Phase R after a replay diff (expected ≈ empty on stored prescriptions until rate_source is "plan": targets are display/pacer layer).',
  5,
  'ed12c6a0072bea554d102744353a248ec7f0222b85a5cd3bb2fe95f361e92417',
  null,
  true
)
on conflict (version) do nothing;

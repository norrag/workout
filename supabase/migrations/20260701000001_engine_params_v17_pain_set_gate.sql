-- 20260701000001 — engine_params v17: joint-pain hard gate on set counts (R8)
--
-- Doc 10 §3 step 0 labels joint pain the ONE hard safety gate: "joint_pain ≥ 2 →
-- never add sets; = 3 → −1 to −2 sets or suggest substitution, regardless of the
-- rest." The engine only ever enforced the LOAD half (`pain_gate` blocks load
-- increases); `setDelta` was computed with no reference to pain, so pain 3/3 with
-- an easy workload + strong pump still ADDED a set (repo review 2026-07-01, R8).
--
-- One delta from v16: `pain_cut_gate: 3`. With it present the feedback rule runs
-- the pain check first: pain ≥ `pain_gate` (2) vetoes any set addition, and pain ≥
-- `pain_cut_gate` (3) cuts a set and suggests substituting the exercise — both
-- regardless of workload/pump. It is `.optional()`, so v16/earlier rows are
-- byte-identical (hash/replay/fingerprint untouched) and with it ABSENT joint pain
-- never modulates set counts, exactly as before.
--
-- Shipped INACTIVE (same discipline as v11/v12/v14/v15/v16): v17 changes live
-- set-count prescriptions wherever pain ≥ 2 was reported, so activate manually
-- only AFTER a replay_decisions diff (docs/deployment/manual-operations.md).
-- schema_version stays 5 (an optional field is not a shape bump). The JSON below
-- is the full materialization from engineParamsSchema.parse() with its canonical
-- hashParams() sha256 (guarded in params-provenance.test.ts).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  17,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":3,"session_performance_dampen_threshold":1,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":6},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"retire_prior_peak_seed":true,"deload_anchor_rir":true,"bodyweight_model":true,"pain_cut_gate":3,"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v17 — joint-pain hard gate on set counts (pain_cut_gate=3): pain ≥ pain_gate (2) vetoes set additions; pain ≥ 3 cuts a set and suggests substitution, regardless of workload/pump (doc 10 §3 step 0, review R8). Otherwise identical to v16. Shipped INACTIVE — activate manually after a replay_decisions diff.',
  5,
  '72b58d846a4b1ea372cfbbc2f0fd9ee98d36f7ca5ef3de3b86ec463e133f433e',
  null,
  true
)
on conflict (version) do nothing;

-- 20260626000003 — engine_params v16: bodyweight load-type model (WS-I / T-I2)
--
-- The last reason the legacy increment path survives is bodyweight movements: with
-- no load-type model they log `weight = 0`, which produces no e1RM and no anchor, so
-- prescribe() falls through the modern rep-window path to the legacy increment block
-- (docs/notes/I-engine-v9.md). v16 turns on the bodyweight model so those lifts price
-- on EFFECTIVE load instead:
--   * bodyweight_only      — load is the lifter's bodyweight; progress on reps only
--   * bodyweight_loadable  — effective = bodyweight + added (the added weight is
--                            prescribed/rounded)
--   * bodyweight_assisted  — effective = bodyweight − assist (the inverse; the assist
--                            is prescribed/rounded)
-- The effective-load anchor is computed in query land (anchors.ts, gated on the same
-- flag) from exercises.load_type + the bodyweight captured on each logged set
-- (migration 20260626000002); the engine reasons in effective space and converts the
-- result back to the entered value. No-data lifts defer to a manual seed (never
-- fabricate, owner ruling 2026-06-25).
--
-- One delta from v15: `bodyweight_model: true`. It is `.optional()`, so v15/earlier
-- rows are byte-identical (hash/replay/fingerprint untouched) and with it OFF the
-- engine collapses bodyweight to the `bodyweight` equipment bucket exactly as today.
--
-- Shipped INACTIVE (same discipline as v11/v12/v14/v15): v16 changes live bodyweight
-- prescriptions, so activate manually only AFTER a replay_decisions diff
-- (docs/deployment/manual-operations.md). The current active row stays active until a
-- deliberate activation. schema_version stays 5 (an optional field is not a shape
-- bump). The JSON below is the full materialization from engineParamsSchema.parse()
-- with its canonical hashParams() sha256 (guarded in params-provenance.test.ts).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  16,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":3,"session_performance_dampen_threshold":1,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":6},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"retire_prior_peak_seed":true,"deload_anchor_rir":true,"bodyweight_model":true,"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v16 — bodyweight load-type model (bodyweight_model=true): bodyweight movements price on effective load (bodyweight ± entered) and progress on reps (bodyweight_only) or the rep-window in effective space (loadable/assisted); no-data lifts defer to a manual seed. Otherwise identical to v15. Shipped INACTIVE — activate manually after a replay_decisions diff.',
  5,
  '20d84f6eb6245c9355d058e6729c708b85cdcce424eba000ff3076520760e478',
  null,
  true
)
on conflict (version) do nothing;

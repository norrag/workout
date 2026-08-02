-- 20260802000003 — engine_params v26: the doc 21 §6.1 measuring band
--
-- One new key over the ACTIVE v25: `e1rm.max_measuring_rir = 8`.
--
-- BASE (read this before touching the number). The hosted chain is ahead of this
-- directory: v22, v24 and v25 were micro-bumps applied through admin MCP and
-- carry no committed migration (the same pattern the v23 migration records for
-- v22). v24 is doc 17 Phase R's `rate_source` flip to "plan"; v25 — the ACTIVE
-- row — adds the doc 17 §7 / N36 self-gating envelope loop on top. So this row
-- is built from **v25's stored materialization**, not from the v23 file next
-- door: basing it on v23 would silently revert the rate source and the envelope
-- loop the moment it was activated.
--
-- WHAT IT DOES. Past this ASSUMED RIR a set is priced and performed normally but
-- is not treated as a strength measurement: no stored e1RM (confidence `none`),
-- no anchor contribution, excluded from every strength surface — and kept in
-- volume/adherence, because the work happened (doc 21 §9.1, owner-confirmed).
-- It is the guard that makes doc 21 §4.3's UNBOUNDED prescription RIR safe:
-- without it an unbounded ask silently asserts a strength measurement nobody
-- observed (~70% assumption at RIR 21; outside the fitted band past ~36
-- effective reps), and the confidence ladder — which bottoms out at `low` —
-- would make a set at RIR 4 and a set at RIR 21 state the same honesty claim.
--
-- WHY 8 (doc 21 §9.3, owner-confirmed): it is the PRE-doc-21 `target_rir`
-- ceiling, so NOTHING that could exist before this feature becomes
-- non-measuring — activating v26 restamps nothing and re-levels nothing. A case
-- exists for 6 (`mod_max_rir` is 3, and past ~6 the assumed component already
-- dominates), and starting at 8 and tightening later is the safer order: it only
-- ever ADDS exclusions.
--
-- `max_measuring_rir` is `.optional()` (house discipline): every earlier row
-- parses, hashes, and replays byte-identically, and with it absent the stamp,
-- the anchor, and the views behave exactly as v25. Shipped INACTIVE (same
-- discipline as v11–v25) — the params version rides paramsToken, so activation
-- is the doc-14 v-bump: replay diff + owner review per
-- docs/deployment/manual-operations.md. schema_version stays 5 (an optional
-- field is not a shape bump). The JSON is the full materialization from
-- engineParamsSchema.parse() with its canonical hashParams() sha256 (guarded in
-- params-provenance.test.ts).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  26,
  '{"increment":{"bands":10,"cable":5,"other":5,"smith":5,"barbell":5,"machine":5,"dumbbell":5,"bodyweight":5,"kettlebell":9},"experience_increment_scale":{"advanced":0.5,"beginner":1.5,"intermediate":1},"progression_style":{"cut":"hold","gain":"load_first","maintain":"hold","strength":"load_first","hypertrophy":"load_first"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":8,"session_performance_dampen_threshold":3,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":6},"meso_seed_backoff_pct":0.925,"rounding":{"bands":10,"cable":5,"other":5,"smith":5,"barbell":5,"machine":5,"dumbbell":5,"bodyweight":5,"kettlebell":9},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"climb_requires_rir_step":true,"hold_week_anchor_deadband":true,"retire_prior_peak_seed":true,"deload_anchor_rir":true,"bodyweight_model":true,"pain_cut_gate":3,"progression":{"mode":"earned_step","step":"min","min_confidence":"moderate","compliance_band":0.015,"cadence":"microcycle","pacing":"macro_rate","rate_source":"plan","band_position":0.5,"goal_rate_factor":{"cut":0,"gain":0.75,"maintain":0,"strength":1,"hypertrophy":0.75},"miss_rearm_sessions":2,"max_gap_days":10,"peak_week":"skip","max_pct_per_step":0.05,"envelope":{"enabled":true,"lookback_mesos":3,"max_age_days":180,"min_decisions":8,"min_history_mesos":2,"step":0.1,"dwell_mesos":1,"raise":{"earn_rate":0.7,"max_miss_ratio":0.2,"pacer_trips":2,"over_share":0.25},"lower":{"miss_ratio":0.5,"throttle_trips":2,"workload_firings":3}}},"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3},"max_measuring_rir":8},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"strength_sex_factor":{"male":1,"female":1},"age_taper_floor_strength":0.7,"bf_proxy_pct":{"male":{"lean":10,"average":16,"high_bf":25},"female":{"lean":18,"average":26,"high_bf":35}},"strength_model":{"enabled":true,"neural_n0":{"low":3,"high":5},"neural_floor":{"low":0.1,"high":0.4},"neural_tau_years":0.5,"ffm_coupling_k":1,"undermuscled_unbank":0.5,"rate_ceiling_pct_month":8},"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"abs":[4,16,25],"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"biceps":[6,20,26],"calves":[6,16,20],"glutes":[4,16,20],"triceps":[6,18,24],"shoulders":[8,20,26],"hamstrings":[6,16,20]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v26 — the doc 21 §6.1 measuring band (e1rm.max_measuring_rir = 8) over the active v25: past this assumed RIR a set is priced but not measured (e1rm null, confidence ''none'', dropped from the anchor and every strength surface, kept in volume). The guard that makes doc 21 §4.3''s unbounded prescription RIR safe. Otherwise identical to v25 (rate_source "plan" + the envelope loop are carried forward unchanged). Shipped INACTIVE — activate per doc 14 after a replay diff (expected EMPTY: 8 is the pre-doc-21 target_rir ceiling, so no set that can exist today becomes non-measuring).',
  5,
  '6dd0224425b8c6afaa51f442386cddb7672f31727604ad578120f8c7c5eb96fa',
  null,
  true
)
on conflict (version) do nothing;

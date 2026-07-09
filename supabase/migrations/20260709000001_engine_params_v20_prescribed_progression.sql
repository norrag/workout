-- 20260709000001 — engine_params v20: prescribed progression (doc 16, Phase 1)
--
-- Earned-step overload + macro-rate pacing (docs/16-prescribed-progression.md,
-- consolidating the N35 design thread). One new gated block over v19:
--
--   progression   mode "earned_step": the engine leads the prescribed demand by
--                 ONE earned quantum off the measured anchor (A* = A + δ) —
--                 earned by full previous-session compliance in e1RM space
--                 (§3.4), metered by the governors (cadence / macro-rate pacer
--                 / miss throttle / peak-week skip, §3.5), capped on the
--                 REALIZED ask (max_pct_per_step, §3.3), and always disclosed
--                 by a status-coded `progression` trace step (§3.6). The
--                 measured e1RM pipeline is untouched (T-I5): performing the
--                 led prescription is what raises the measurement. Earns retry,
--                 never stack — the anchor is the only accumulator (§2.3).
--                 goal_rate_factor 0 (cut/maintain) disables the gate per goal;
--                 hypertrophy/gain 0.75 is a HEURISTIC pending the Phase-R
--                 research pass. compliance_band absorbs the day view's
--                 MARKER_BAND as the one shared set-comparison tunable (§5.3).
--
-- The block is `.optional()` (house discipline): every pre-v20 row parses,
-- hashes, and replays byte-identically, and with the block absent every
-- output, fingerprint, and trace is identical to today (§2.7).
--
-- Shipped INACTIVE (same discipline as v11–v19): activation follows Phase R —
-- research pass on the hypertrophy factor, replay diff via
-- simulate_prescriptions, owner review — per docs/deployment/manual-operations.md.
-- schema_version stays 5 (an optional block is not a shape bump). The JSON
-- below is the full materialization from engineParamsSchema.parse() with its
-- canonical hashParams() sha256 (guarded in params-provenance.test.ts).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  20,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":8,"session_performance_dampen_threshold":3,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":6},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"climb_requires_rir_step":true,"hold_week_anchor_deadband":true,"retire_prior_peak_seed":true,"deload_anchor_rir":true,"bodyweight_model":true,"pain_cut_gate":3,"progression":{"mode":"earned_step","step":"min","min_confidence":"moderate","compliance_band":0.015,"cadence":"microcycle","pacing":"macro_rate","rate_source":"band","band_position":0.5,"goal_rate_factor":{"strength":1,"hypertrophy":0.75,"gain":0.75,"cut":0,"maintain":0},"miss_rearm_sessions":2,"max_gap_days":10,"peak_week":"skip","max_pct_per_step":0.05},"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v20 — prescribed progression (doc 16 Phase 1): earned-step overload (A* = A + δ off the measured anchor, full-compliance earn gate in e1RM space) + macro-rate pacing (band_position 0.5 of strength_pct_month × goal_rate_factor), retry-not-stack, always-on status-coded progression trace, compliance_band 0.015 absorbing MARKER_BAND. Otherwise identical to v19. Shipped INACTIVE — activate per doc 16 §10 Phase R after a replay diff.',
  5,
  'cb451a02d96135a5cb6d1bec5f01e83a5fbdb08f87da9d1799dae176d1c90287',
  null,
  true
)
on conflict (version) do nothing;

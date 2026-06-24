-- 20260624000002 — engine_params v11: standalone-prescription investigation fixes
--
-- docs/reviews/2026-06-23-standalone-prescription-investigation.md. Bundles the
-- four gated engine behaviors as ONE activatable version, so they ship together
-- and roll back together:
--
--   §S1 seed_from_anchor=true             — seed week 1 from the recency anchor
--                                           (rep-window low rep at the start RIR),
--                                           not the prior peak's rep count verbatim
--   §S3 e1rm.brzycki_max_eff_reps=10      — Brzycki only ≤10 eff reps, Epley above
--       e1rm.session_value_confidence_weights {high:1, moderate:0.6, low:0.3}
--                                           — down-weight low-confidence burnout
--                                           sets in the session_best anchor value
--   §S5 hold_rep_consistent=true          — a gated hold keeps the held load's reps
--                                           on the Option-A schedule (held effective
--                                           workload), not clamped to the window
--                                           ceiling (no dishonest "@ N RIR")
--       session_dampen_require_both=true  — dampen only when BOTH high fatigue AND
--                                           poor performance are reported
--
-- These are the v11 deltas; every other tunable is identical to v10.
--
-- IMPORTANT — shipped INACTIVE on purpose (investigation §"Gating"): v11 changes
-- the live prescription calculator and grading, so it is activated MANUALLY after
-- an admin `replay_decisions` / `simulate_prescriptions` diff on Madeline + a
-- couple of other users (doc 13 §6). This migration only INSERTS v11; v10 stays
-- the active row. See docs/deployment/manual-operations.md for the activation step.
--
-- Schema is UNCHANGED in shape: the new params are `.optional()` (absent on every
-- v10/earlier row), so older rows parse byte-identically — their canonical
-- materialization, params_hash, is_replayable, and the doc-14 freshness
-- fingerprint are all untouched. schema_version stays 5. The v11 JSON below is the
-- full materialization produced by `engineParamsSchema.parse()`, with its canonical
-- sha256 from `hashParams()`, so it replays exactly (is_replayable = true).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  11,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":3,"session_performance_dampen_threshold":1,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":4},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v11 — standalone-prescription investigation (2026-06-23): seed_from_anchor (S1), e1rm.brzycki_max_eff_reps=10 + session_value_confidence_weights (S3), hold_rep_consistent + session_dampen_require_both (S5). Otherwise identical to v10. Shipped INACTIVE — activate manually after a replay_decisions diff.',
  5,
  '43102e52f88144649c0a546ea81513b7132dc6f2e4d064dd7d5ffec6fc35b8e0',
  null,
  true
)
on conflict (version) do nothing;

-- 20260625000003 — engine_params v15: anchor-based deload selection (owner ruling 2026-06-25)
--
-- The legacy deload (`prescribeDeload`) prescribed `deload.load_pct` (≈55%) of the
-- meso peak, CARRIED the peak reps forward, and stated a fixed `deload.target_rir`
-- (4). Those three numbers do not form a consistent triple: at ≈55% of peak the
-- carried reps leave FAR more than 4 RIR in reserve. The day-view logging field
-- (an uncapped reps-to-hit-target-RIR predictor, doc 11) then re-derived reps from
-- the light load + RIR and exploded toward its rep cap (~32 reps) — disagreeing
-- with the prescription detail's carried reps. Two symptoms, one root cause: the
-- prescription itself was internally inconsistent.
--
-- v15 fixes the MODEL, not the display. It selects the deload load the SAME way a
-- working week does (doc 13 rep-window weight selection): pick the weight that
-- lands window-CENTERED reps (≈10 for the 8–12 hypertrophy window) at the deload
-- target RIR, from the strength anchor — "the same model as normal, just a higher
-- RIR." Because the load is chosen from the anchor, prescribed reps = predicted
-- reps at the deload RIR by construction, so the prescription and the live logging
-- field agree, and the weight × reps @ RIR triple is honest. Two deltas from v14:
--   * `deload_anchor_rir: true`  — turn on the new deload selection.
--   * `deload.target_rir: 4 → 6` — a genuine recovery RIR (was the legacy ≤5 cap).
-- Both are gated: `deload_anchor_rir` is `.optional()` (absent on v14/earlier ⇒
-- byte-identical, hash/replay untouched), and with it OFF the deload is exactly the
-- legacy load_pct path. Requires the widened target_rir bound (migration
-- 20260625000002) so a 6-RIR deload week/prescription can persist.
--
-- Shipped INACTIVE (same discipline as v11/v12/v14): v15 changes the live deload
-- math, so activate manually only AFTER a replay diff (admin replay_decisions; doc
-- 13 §6). See docs/deployment/manual-operations.md. The current active row (v14 as
-- of 2026-06-25) stays active until a deliberate activation. schema_version stays 5
-- (an optional field is not a shape
-- bump). The JSON below is the full materialization from engineParamsSchema.parse()
-- with its canonical hashParams() sha256 (guarded in params-provenance.test.ts).

insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  15,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":3,"session_performance_dampen_threshold":1,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":6},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"retire_prior_peak_seed":true,"deload_anchor_rir":true,"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v15 — anchor-based deload (deload_anchor_rir=true) at deload RIR 6: the deload selects its load from the strength anchor to land window-centered reps at the deload RIR, the same model as a working week, so the prescription is internally consistent and the live predictor agrees. Otherwise identical to v14. Shipped INACTIVE — activate manually after a replay_decisions diff.',
  5,
  '437679f0707850638b85e77478c3b53be24d726fd58f689b637825eb94c00084',
  null,
  true
)
on conflict (version) do nothing;

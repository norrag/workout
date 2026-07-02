-- 20260702000004 — I14: one 0–10 scale for every feedback slider
--
-- The complete-workout session sliders (overall fatigue / effort /
-- performance) were 0–4 while the per-exercise sliders (pump / workload /
-- soreness) were 0–10. Owner ruling (2026-07-02): "Unify it absolutely.
-- Rescale the data appropriately to match the new scale."
--
-- Three coupled moves, one transaction — they must not ship separately:
--   1. Rescale stored `workout_feedback` values round(x × 2.5):
--      0→0, 1→3, 2→5, 3→8, 4→10 (CHECKs widened to 0..10).
--   2. engine_params v18 = v17 with the session-dampen thresholds rescaled to
--      the same scale: fatigue ≥ 3-of-4 → ≥ 8-of-10; performance ≤ 1-of-4 →
--      ≤ 3-of-10. Same trip points on the rescaled data — engine behavior is
--      unchanged for equivalent inputs.
--   3. v18 ACTIVATED here (unlike v11–v17's ship-inactive discipline) because
--      the data rescale and the threshold flip are inseparable: rescaled data
--      under v17's thresholds would dampen every mid-scale session (5 ≥ 3),
--      and unrescaled data under v18's would never dampen. Replay is
--      unaffected either way — historical decisions re-run their own stored
--      0–4 inputs against their own stored params row (bounds stay valid).
--
-- schema_version stays 5 (value change inside existing fields, no shape
-- change). The JSON below is the full materialization from
-- engineParamsSchema.parse() with its canonical hashParams() sha256 (guarded
-- in params-provenance.test.ts).

-- 1. rescale stored session feedback onto 0–10
alter table public.workout_feedback
  drop constraint workout_feedback_overall_fatigue_check,
  drop constraint workout_feedback_effort_rating_check,
  drop constraint workout_feedback_performance_rating_check;

update public.workout_feedback
set overall_fatigue    = round(overall_fatigue * 2.5)::int,
    effort_rating      = round(effort_rating * 2.5)::int,
    performance_rating = round(performance_rating * 2.5)::int;

alter table public.workout_feedback
  add constraint workout_feedback_overall_fatigue_check
    check (overall_fatigue between 0 and 10),
  add constraint workout_feedback_effort_rating_check
    check (effort_rating between 0 and 10),
  add constraint workout_feedback_performance_rating_check
    check (performance_rating between 0 and 10);

comment on table public.workout_feedback is
  'Session-level feedback. All sliders 0–10 since I14 (2026-07-02); pre-I14 0–4 values were rescaled round(x × 2.5): 0→0, 1→3, 2→5, 3→8, 4→10.';

-- 2. + 3. engine_params v18 (thresholds on the new scale), activated
insert into public.engine_params (version, params, is_active, notes, schema_version, params_hash, code_sha, is_replayable)
values (
  18,
  '{"increment":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"experience_increment_scale":{"beginner":1.5,"intermediate":1,"advanced":0.5},"progression_style":{"gain":"load_first","hypertrophy":"load_first","strength":"load_first","cut":"hold","maintain":"hold"},"small_miss_reps":2,"regression_pct":0.9,"pain_gate":2,"workload_high":8,"workload_low":3,"set_add_pump_min":6,"pump_low":2,"min_sets":2,"max_sets_per_exercise":6,"mg_set_ceiling":20,"session_fatigue_dampen_threshold":8,"session_performance_dampen_threshold":3,"deload":{"load_pct":0.55,"set_pct":0.5,"target_rir":6},"meso_seed_backoff_pct":0.925,"rounding":{"barbell":5,"smith":5,"dumbbell":5,"machine":5,"cable":5,"bodyweight":5,"bands":10,"kettlebell":9,"other":5},"weight_selection":"rep_window","grading":"rir","seed_from_anchor":true,"hold_rep_consistent":true,"session_dampen_require_both":true,"climb_on_performed_reps":true,"bound_to_target_window":true,"retire_prior_peak_seed":true,"deload_anchor_rir":true,"bodyweight_model":true,"pain_cut_gate":3,"rir_tolerance":1,"rir_regress_gap":2,"rep_window":{"hypertrophy":{"target_low":8,"target_high":12,"min":6,"max":15},"gain":{"target_low":8,"target_high":12,"min":6,"max":15},"strength":{"target_low":3,"target_high":5,"min":2,"max":6},"cut":{"target_low":8,"target_high":12,"min":6,"max":15},"maintain":{"target_low":8,"target_high":12,"min":6,"max":15}},"reps_predict":{"min_confidence":"low"},"e1rm":{"rir_offset":1,"high_max_eff_reps":8,"mod_max_eff_reps":12,"high_max_rir":2,"mod_max_rir":3,"recency_halflife_days":30,"anchor_method":"session_best","brzycki_max_eff_reps":10,"session_value_confidence_weights":{"high":1,"moderate":0.6,"low":0.3}},"macro_target":{"sex_factor_female":0.7,"hypertrophy_base_pct_bw_month":{"low":1,"high":1.5},"hypertrophy_decay_tau_years":5,"hypertrophy_floor_pct_bw_month":{"low":0.04,"high":0.09},"ffmi_ceiling":{"male":25,"female":21.5},"ffmi_untrained":{"male":18.5,"female":14.5},"proximity_macro_cap_frac":0.6,"cut_bf_thresholds":{"male":{"high":20,"lean":12},"female":{"high":30,"lean":22}},"career_cap_lb":{"male":40,"female":20},"career_tau_years":3,"hypertrophy_pct_bw_month":{"beginner":[1,1.5],"intermediate":[0.5,1],"advanced":[0.25,0.5]},"strength_pct_month":{"beginner":[4,8],"intermediate":[1.5,3],"advanced":[0.5,1.5]},"strength_cap_total_pct":{"beginner":60,"intermediate":30,"advanced":15},"cut_pct_bw_week":{"high_bf":[1,1.5],"average":[0.5,1],"lean":[0.25,0.5]},"cut_bmi_high":27,"cut_bmi_lean":22,"cut_cap_pct_bw":0.25,"age_taper":true,"age_taper_start":40,"age_taper_per_year":0.02,"age_taper_floor":0.6,"recommend_target_lb":{"male":8,"female":4},"recommend_strength_total_pct":10,"recommend_cut_bw_pct":8,"recommend_min_months":2,"recommend_max_months":12,"present":"conservative_end"},"phase_plan":{"order":["accumulation","intensification","peak"],"accumulation_fraction":0.6},"key_lifts":{"n":5,"selection":"frequency"},"volume":{"landmarks":{"back":[10,22,25],"chest":[8,20,22],"quads":[8,18,20],"hamstrings":[6,16,20],"glutes":[4,16,20],"shoulders":[8,20,26],"biceps":[6,20,26],"triceps":[6,18,24],"calves":[6,16,20],"abs":[4,16,25]},"experience_scale":{"beginner":0.7,"intermediate":1,"advanced":1.1}}}'::jsonb,
  false,
  'v18 — I14 session-slider unification: session_fatigue_dampen_threshold 3→8, session_performance_dampen_threshold 1→3 (the 0–4 sliders moved to 0–10; stored workout_feedback rescaled round(x×2.5) in the same migration). Same trip points as v17 on the rescaled data. Otherwise identical to v17. ACTIVATED by this migration — the rescale and the thresholds are inseparable.',
  5,
  'fede4627ed64d19b5134e0bb055d500007496a0fc6aee6b0964335d56f91acbd',
  null,
  true
)
on conflict (version) do nothing;

-- activate v18 atomically (deactivate whatever was active in this same
-- transaction — on the hosted DB that is v17; on a clean local stack, v10)
update public.engine_params set is_active = false where is_active;
update public.engine_params set is_active = true where version = 18;

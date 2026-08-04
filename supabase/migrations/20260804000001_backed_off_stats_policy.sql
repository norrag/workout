-- 20260804000001 — doc 21 Phase 5: the stats policy (§6.2)
--
-- The lever now bites (Phases 2–4): a day-slot can be assigned its own target
-- RIR for a week, and the engine reprices the load to meet it. This migration
-- is the read side of that — what a backed-off session is allowed to say about
-- the athlete's strength.
--
-- THE RULE (§6.2.1) — key on prescription INTENT, not on measured confidence:
--
--     backed off  ⇔  workout_exercises.target_rir > microcycles.target_rir
--
-- i.e. the slot was deliberately run EASIER than the week it sits in. That is
-- the realized, stored form of `resolveSlotEffort().backedOff`
-- (`queries/slot-effort.ts`): the resolved RIR lands in
-- `workout_exercises.target_rir` at generation, and hard rule 5 means a
-- performed session's row is never rewritten — so the comparison reads the
-- intensity that was actually trained, for history as much as for this week.
--
-- Why intent and not `e1rm_confidence`: confidence degrades with EFFECTIVE REPS
-- too (`mod_max_eff_reps`), so an honest 15-rep hypertrophy set at RIR 1 is
-- already `low`, and doc 21 §2's honest reporting pushes more real work there.
-- Excluding by confidence would silently drop legitimate sets. `target_rir >
-- the week's` is deterministic, visible and plan-level — exactly like the
-- `is_deload` filter the strength trend already applies (T-A2).
--
-- WHERE IT APPLIES (§6.2.2):
--   * EXCLUDED from strength surfaces — the e1RM trend, `best_e1rm`, and the PR
--     views. A backed-off block must not read as a regression, for the same
--     reason a deload week doesn't.
--   * KEPT in volume / adherence surfaces, with a disclosure count. The work
--     happened: it consumed recovery budget and occupied a slot in the week.
--     Dropping it would make MEV/MAV/MRV read as under-dosed during exactly the
--     block where the athlete is complying (§9.1, owner-confirmed).
--
-- NOT the §6.1 measuring band, and deliberately a different mechanism. The band
-- asks "is this a measurement at all" and answers it at the STAMP
-- (`logged_sets.e1rm = null`, `e1rm_confidence = 'none'`), because past
-- `max_measuring_rir` the number is fiction. §6.2 asks "is this measurement
-- COMPARABLE" — the set was genuinely measured and still anchors the engine
-- (§5), it just isn't like-with-like against the block around it. So the stamp
-- is untouched here and the exclusion lives in the read models, where it can be
-- disclosed and where a future policy change costs no backfill.
--
-- Nothing changes for a plan with no assignments: `workout_exercises.target_rir`
-- equals the week's value on every row generated before doc 21 existed, so the
-- predicate is false everywhere and every number below is byte-identical.
--
-- Read models only — all four views keep `security_invoker = true`, so the
-- owner-scoped RLS on logged_sets / workout_exercises / microcycles applies
-- unchanged. No new table, no new policy surface.

-- ---------------------------------------------------------------------------
-- 1. v_exercise_history — disclose the intent per session
-- ---------------------------------------------------------------------------
--
-- The session's `e1rm` / `best_set_e1rm` are NOT nulled: the estimate is honest,
-- it is only incomparable, and the Exercise page's history line shows it (§6.2's
-- closing note — surfaces should say so rather than hide it). The flag is what
-- lets the trend fold, the PR scan and the MCP surfaces drop the session, all
-- off one definition.

create or replace view public.v_exercise_history
with (security_invoker = true) as
select
  ls.user_id,
  ls.exercise_id,
  e.name as exercise_name,
  ls.mesocycle_id,
  ls.microcycle_id,
  ls.workout_id,
  coalesce(ls.performed_on, (ls.performed_at at time zone 'utc')::date) as performed_on,
  count(*) filter (where not ls.is_warmup) as working_sets,
  sum(ls.weight * ls.reps) filter (where not ls.is_warmup) as volume,
  max(ls.weight) filter (where not ls.is_warmup) as top_weight,
  round(avg(ls.e1rm) filter (where not ls.is_warmup), 1) as e1rm,
  avg(ls.rir_reported) filter (where not ls.is_warmup) as avg_rir_reported,
  -- T-A1: the session's single best per-set engine e1RM, for set-grain
  -- comparisons (PR detection) where the session average would understate
  max(ls.e1rm) filter (where not ls.is_warmup) as best_set_e1rm,
  -- doc 21 §6.2: this exercise ran EASIER than the week it sits in. bool_or
  -- because the same exercise can occupy more than one slot in a day; if any
  -- slot carried a back-off, the session is not a like-with-like strength read.
  coalesce(bool_or(we.target_rir > mc.target_rir), false) as backed_off
from public.logged_sets ls
join public.exercises e on e.id = ls.exercise_id
-- both are single-row lookups by primary key: no fan-out, no changed grain
left join public.workout_exercises we on we.id = ls.workout_exercise_id
left join public.microcycles mc on mc.id = ls.microcycle_id
group by ls.user_id, ls.exercise_id, e.name, ls.mesocycle_id, ls.microcycle_id, ls.workout_id,
  coalesce(ls.performed_on, (ls.performed_at at time zone 'utc')::date);

comment on view public.v_exercise_history is
  'Per-session exercise rollup. performed_on = the client-local day the session was logged (R6; pre-R6 rows keep their UTC bucket). e1rm = session average of stored per-set engine e1RM; best_set_e1rm = session max (T-A1). backed_off (doc 21 §6.2) = the slot ran at an assigned RIR above the week''s, so the session is excluded from strength trends/PRs but kept in volume; the e1RM is still reported, flagged rather than hidden.';

-- ---------------------------------------------------------------------------
-- 2. v_exercise_prs — never a PR off a deliberately easier session
-- ---------------------------------------------------------------------------

drop view if exists public.v_exercise_prs;

create view public.v_exercise_prs
with (security_invoker = true) as
with active as (
  select
    coalesce((params -> 'e1rm' ->> 'rir_offset')::numeric, 1) as rir_offset,
    (params -> 'e1rm' ->> 'brzycki_max_eff_reps')::numeric as brzycki_max_eff_reps
  from public.engine_params
  where is_active = true
  limit 1
),
scored as (
  select
    ls.user_id,
    ls.exercise_id,
    ls.weight,
    ls.reps,
    ls.performed_at,
    coalesce(
      ls.e1rm,
      round(
        case
          when (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset) < 36
           and (a.brzycki_max_eff_reps is null
                or (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset) <= a.brzycki_max_eff_reps)
          then (
            ls.weight * (1 + (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset) / 30.0)
            + (ls.weight * 36.0)
              / (37 - (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset))
          ) / 2.0
          else ls.weight * (1 + (ls.reps + coalesce(ls.rir_reported, 0) * a.rir_offset) / 30.0)
        end::numeric,
        1
      )
    ) as e1rm
  from public.logged_sets ls
  cross join active a
  left join public.workout_exercises we on we.id = ls.workout_exercise_id
  left join public.microcycles mc on mc.id = ls.microcycle_id
  where not ls.is_warmup
    and ls.weight > 0
    and ls.reps > 0
    -- doc 21 §6.1: never a PR off a set the app didn't measure
    and ls.e1rm_confidence is distinct from 'none'
    -- doc 21 §6.2: nor off a set the plan deliberately ran easier than the week
    and not coalesce(we.target_rir > mc.target_rir, false)
)
select distinct on (s.user_id, s.exercise_id)
  s.user_id,
  s.exercise_id,
  e.name as exercise_name,
  s.weight as best_weight,
  s.reps as best_reps,
  s.e1rm as best_e1rm,
  max(s.performed_at) over (partition by s.user_id, s.exercise_id) as last_performed_at
from scored s
join public.exercises e on e.id = s.exercise_id
order by s.user_id, s.exercise_id, s.e1rm desc nulls last, s.weight desc, s.performed_at desc;

comment on view public.v_exercise_prs is
  'Per user × exercise best set: best_weight/best_reps are the COHERENT pair from the single best-e1RM set. e1RM reads the stored per-set stamp (doc 21 §2 resolution + §6.1 measuring band), falling back to an in-view estimate only for never-stamped rows; sets stamped ''none'' (non-measuring) and sets prescribed above their week''s RIR (doc 21 §6.2 back-off) are excluded.';

-- ---------------------------------------------------------------------------
-- 3. v_exercise_overview — best_e1rm is a strength claim; the totals are not
-- ---------------------------------------------------------------------------
--
-- `best_e1rm` drops backed-off sets. `weight_pr` / `volume_pr` /
-- `best_session_volume` / `times_trained` / `total_volume` do NOT: those are
-- literal observations ("you lifted 225 for 5"), not estimates of a strength
-- the app never watched, and a lighter backed-off set cannot displace them
-- anyway. `backed_off_sets` is the disclosure that makes the asymmetry visible.

create or replace view public.v_exercise_overview
with (security_invoker = true) as
  with working as (
    select
      ls.id,
      ls.workout_exercise_id,
      ls.user_id,
      ls.exercise_id,
      ls.macrocycle_id,
      ls.mesocycle_id,
      ls.microcycle_id,
      ls.workout_id,
      ls.performed_at,
      ls.set_number,
      ls.weight,
      ls.reps,
      ls.rir_reported,
      ls.is_warmup,
      ls.notes,
      ls.created_at,
      ls.updated_at,
      ls.set_type,
      ls.e1rm,
      coalesce(we.target_rir > mc.target_rir, false) as backed_off
    from public.logged_sets ls
      left join public.workout_exercises we on we.id = ls.workout_exercise_id
      left join public.microcycles mc on mc.id = ls.microcycle_id
    where not ls.is_warmup
  ),
  agg as (
    select
      working.user_id,
      working.exercise_id,
      count(distinct working.workout_id) as times_trained,
      sum(working.weight * working.reps::numeric) as total_volume,
      min(working.performed_at) as first_logged_at,
      max(working.performed_at) as last_performed_at,
      max(working.weight) as weight_pr,
      max(working.weight * working.reps::numeric) as volume_pr,
      -- T-A1: engine per-set e1RM (undecayed best-ever), not raw Epley.
      -- doc 21 §6.2: backed-off sets are excluded from the strength claim.
      max(working.e1rm) filter (where not working.backed_off) as best_e1rm,
      count(*) filter (where working.backed_off) as backed_off_sets
    from working
    group by working.user_id, working.exercise_id
  ),
  weight_pr_reps as (
    select distinct on (w.user_id, w.exercise_id)
      w.user_id,
      w.exercise_id,
      w.reps as weight_pr_reps
    from working w
      join agg a_1 on a_1.user_id = w.user_id and a_1.exercise_id = w.exercise_id and w.weight = a_1.weight_pr
    order by w.user_id, w.exercise_id, w.reps desc
  ),
  volume_pr_set as (
    select distinct on (w.user_id, w.exercise_id)
      w.user_id,
      w.exercise_id,
      w.weight as volume_pr_weight,
      w.reps as volume_pr_reps
    from working w
      join agg a_1 on a_1.user_id = w.user_id and a_1.exercise_id = w.exercise_id and (w.weight * w.reps::numeric) = a_1.volume_pr
    order by w.user_id, w.exercise_id, w.weight desc
  ),
  session_vol as (
    select
      t.user_id,
      t.exercise_id,
      max(t.sv) as best_session_volume
    from (
      select
        working.user_id,
        working.exercise_id,
        working.workout_id,
        sum(working.weight * working.reps::numeric) as sv
      from working
      group by working.user_id, working.exercise_id, working.workout_id
    ) t
    group by t.user_id, t.exercise_id
  )
  select
    a.user_id,
    a.exercise_id,
    e.name as exercise_name,
    a.times_trained,
    a.total_volume,
    a.first_logged_at,
    a.last_performed_at,
    a.weight_pr,
    wpr.weight_pr_reps,
    a.volume_pr,
    vps.volume_pr_weight,
    vps.volume_pr_reps,
    a.best_e1rm,
    sv.best_session_volume,
    a.backed_off_sets
  from agg a
    join public.exercises e on e.id = a.exercise_id
    left join weight_pr_reps wpr on wpr.user_id = a.user_id and wpr.exercise_id = a.exercise_id
    left join volume_pr_set vps on vps.user_id = a.user_id and vps.exercise_id = a.exercise_id
    left join session_vol sv on sv.user_id = a.user_id and sv.exercise_id = a.exercise_id;

comment on view public.v_exercise_overview is
  'Lifetime per user × exercise rollup. best_e1rm = the stored per-set engine estimate (T-A1), excluding sets the plan ran above their week''s RIR (doc 21 §6.2) and sets past the measuring band (§6.1, null-stamped). weight_pr / volume_pr / totals keep every working set — those are observations, not strength estimates. backed_off_sets counts the excluded working sets.';

-- ---------------------------------------------------------------------------
-- 4. v_meso_summary — the block's best e1RM, and how much of it ran backed off
-- ---------------------------------------------------------------------------

create or replace view public.v_meso_summary
with (security_invoker = true) as
with meso_workouts as (
  select m.id as mesocycle_id, w.id as workout_id, w.status, mc.is_deload,
         mc.target_rir as week_rir
  from public.mesocycles m
  join public.microcycles mc on mc.mesocycle_id = m.id
  join public.workouts w on w.microcycle_id = mc.id
),
workout_agg as (
  select
    mesocycle_id,
    count(distinct workout_id) filter (where status = 'completed') as workouts_completed,
    count(distinct workout_id) as workouts_total,
    count(distinct workout_id) filter (
      where status = 'completed' and not coalesce(is_deload, false)
    ) as sessions_attended,
    count(distinct workout_id) filter (
      where status in ('completed', 'skipped') and not coalesce(is_deload, false)
    ) as sessions_due
  from meso_workouts
  group by mesocycle_id
),
set_agg as (
  select
    mw.mesocycle_id,
    count(ls.id) filter (where not ls.is_warmup) as working_sets,
    sum(ls.weight * ls.reps) filter (where not ls.is_warmup) as total_volume,
    -- T-A1: engine per-set e1RM (undecayed best in the meso), not raw Epley.
    -- doc 21 §6.2: a block's "best" must not be set by a session the plan
    -- deliberately ran easier than its week.
    max(ls.e1rm) filter (
      where not ls.is_warmup
        and not coalesce(we.target_rir > mw.week_rir, false)
    ) as best_e1rm,
    sum(ls.reps) filter (where not ls.is_warmup) as working_reps,
    -- the comparability disclosure: working sets run at an assigned back-off
    count(ls.id) filter (
      where not ls.is_warmup
        and coalesce(we.target_rir > mw.week_rir, false)
    ) as backed_off_sets
  from meso_workouts mw
  join public.logged_sets ls on ls.workout_id = mw.workout_id
  left join public.workout_exercises we on we.id = ls.workout_exercise_id
  group by mw.mesocycle_id
),
ef_agg as (
  select
    mc.mesocycle_id,
    avg(ef.joint_pain) as avg_joint_pain,
    avg(ef.pump) as avg_pump,
    count(ef.joint_pain) as n_joint_pain,
    count(ef.pump) as n_pump
  from public.microcycles mc
  join public.workouts w on w.microcycle_id = mc.id
  join public.workout_exercises we on we.workout_id = w.id
  join public.exercise_feedback ef on ef.workout_exercise_id = we.id
  group by mc.mesocycle_id
),
wf_agg as (
  select
    mc.mesocycle_id,
    avg(wf.overall_fatigue) as avg_overall_fatigue,
    avg(wf.performance_rating) as avg_performance,
    count(wf.overall_fatigue) as n_overall_fatigue,
    count(wf.performance_rating) as n_performance
  from public.microcycles mc
  join public.workouts w on w.microcycle_id = mc.id
  join public.workout_feedback wf on wf.workout_id = w.id
  group by mc.mesocycle_id
)
select
  m.user_id,
  m.id as mesocycle_id,
  m.name,
  m.status,
  m.weeks,
  m.days_per_week,
  m.rir_start,
  m.rir_end,
  m.includes_deload,
  m.start_date,
  coalesce(wa.workouts_completed, 0) as workouts_completed,
  coalesce(wa.workouts_total, 0) as workouts_total,
  coalesce(sa.working_sets, 0) as working_sets,
  sa.total_volume,
  sa.best_e1rm,
  ea.avg_joint_pain,
  ea.avg_pump,
  wfa.avg_overall_fatigue,
  wfa.avg_performance,
  coalesce(wa.sessions_attended, 0) as sessions_attended,
  coalesce(wa.sessions_due, 0) as sessions_due,
  coalesce(sa.working_reps, 0) as working_reps,
  coalesce(ea.n_joint_pain, 0) as n_joint_pain,
  coalesce(ea.n_pump, 0) as n_pump,
  coalesce(wfa.n_overall_fatigue, 0) as n_overall_fatigue,
  coalesce(wfa.n_performance, 0) as n_performance,
  coalesce(sa.backed_off_sets, 0) as backed_off_sets
from public.mesocycles m
  left join workout_agg wa on wa.mesocycle_id = m.id
  left join set_agg sa on sa.mesocycle_id = m.id
  left join ef_agg ea on ea.mesocycle_id = m.id
  left join wf_agg wfa on wfa.mesocycle_id = m.id;

comment on view public.v_meso_summary is
  'Per-mesocycle rollup (adherence, volume, feedback, best e1RM). best_e1rm excludes sets the plan ran above their week''s RIR (doc 21 §6.2) and non-measuring sets (§6.1); volume/reps/adherence keep every working set. backed_off_sets = the excluded working-set count, the comparability disclosure for cross-block reads.';

-- ---------------------------------------------------------------------------
-- 5. v_meso_week_muscle_sets — volume KEEPS them, and says how many
-- ---------------------------------------------------------------------------
--
-- §9.1 (owner-confirmed): a backed-off set still consumes recovery budget and
-- still occupies a slot in the week, so dropping it would make MEV/MAV/MRV read
-- as under-dosed during exactly the block where the athlete is complying. It
-- stays in `planned_sets` / `logged_sets` / `logged_hard_sets` untouched; the
-- new count is disclosure only.
--
-- NOT a subset of `logged_hard_sets`: that column bakes doc 10 §2's hard-set
-- rule (`rir_reported <= 4 or unreported`), so a set reported at RIR 6 is
-- counted here and not there. The two answer different questions — "how much of
-- this week was authored as a back-off" vs "how much of it was a growth
-- stimulus" — and conflating them is how a rehab block would read as both fully
-- dosed and under-dosed at once.

create or replace view public.v_meso_week_muscle_sets
with (security_invoker = true) as
with we_muscles as (
  select we.id as workout_exercise_id, emg.muscle_group_id, emg.role
  from public.workout_exercises we
  join public.exercise_muscle_groups emg on emg.exercise_id = we.exercise_id
  union all
  select we.id, we.muscle_group_id, 'primary'
  from public.workout_exercises we
  where not exists (
    select 1 from public.exercise_muscle_groups emg
    where emg.exercise_id = we.exercise_id
  )
),
we_sets as (
  select
    we.id as workout_exercise_id,
    we.workout_id,
    we.prescribed_sets,
    count(ls.id) filter (where not ls.is_warmup) as logged_sets,
    count(ls.id) filter (
      where not ls.is_warmup
        and (ls.rir_reported is null or ls.rir_reported <= 4)
    ) as logged_hard_sets,
    -- doc 21 §6.2 disclosure: logged working sets on a slot assigned above its
    -- week's RIR (the whole slot is either backed off that week or it isn't)
    count(ls.id) filter (
      where not ls.is_warmup
        and coalesce(we.target_rir > mc.target_rir, false)
    ) as logged_backed_off_sets
  from public.workout_exercises we
  join public.workouts w on w.id = we.workout_id
  join public.microcycles mc on mc.id = w.microcycle_id
  left join public.logged_sets ls on ls.workout_exercise_id = we.id
  group by we.id, we.workout_id, we.prescribed_sets
)
select
  mc.user_id,
  mc.mesocycle_id,
  mc.week_number,
  mc.is_deload,
  wm.muscle_group_id,
  mg.name as muscle_group,
  wm.role,
  sum(wes.prescribed_sets)::bigint as planned_sets,
  sum(wes.logged_sets)::bigint as logged_sets,
  sum(wes.logged_hard_sets)::bigint as logged_hard_sets,
  sum(wes.logged_backed_off_sets)::bigint as logged_backed_off_sets
from public.microcycles mc
  join public.workouts w on w.microcycle_id = mc.id
  join we_sets wes on wes.workout_id = w.id
  join we_muscles wm on wm.workout_exercise_id = wes.workout_exercise_id
  left join public.muscle_groups mg on mg.id = wm.muscle_group_id
group by
  mc.user_id, mc.mesocycle_id, mc.week_number, mc.is_deload,
  wm.muscle_group_id, mg.name, wm.role;

comment on view public.v_meso_week_muscle_sets is
  'Weekly set facts per (meso, week, muscle group, role) for doc 10 §2 fractional volume counting (R14). planned_sets/logged_sets/logged_hard_sets are UNWEIGHTED per-role counts; the 1.0/0.5 direct/indirect weighting is applied in engine/volume.ts::fractionalSetCount from engine_params. logged_hard_sets bakes the §2 hard-set rule: non-warmup, rir_reported <= 4 or unreported. logged_backed_off_sets (doc 21 §6.2) = logged working sets on a slot assigned above its week''s RIR — disclosure only, kept in the counts, and NOT a subset of logged_hard_sets.';

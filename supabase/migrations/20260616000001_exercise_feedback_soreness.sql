-- Soreness capture (per 2026-06-16 feedback-flow revision).
--
-- The first exercise logged for a muscle group now prompts for how sore the
-- user was from the LAST time they trained that group: an intensity rating
-- (0-10, same slider scale as pump/workload) plus how many days they stayed
-- sore (0-5). These live on that first exercise's exercise_feedback row
-- (the one carrying muscle_group_id). The redundant per-exercise joint-pain
-- prompt is dropped from the first prompt; joint pain is now asked once, with
-- the group-complete prompt (pump/workload). RLS is unchanged — the existing
-- exercise_feedback policies cover the new columns.

alter table public.exercise_feedback
  add column if not exists soreness smallint,
  add column if not exists soreness_days smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercise_feedback_soreness_check'
  ) then
    alter table public.exercise_feedback
      add constraint exercise_feedback_soreness_check
      check (soreness is null or (soreness >= 0 and soreness <= 10));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'exercise_feedback_soreness_days_check'
  ) then
    alter table public.exercise_feedback
      add constraint exercise_feedback_soreness_days_check
      check (soreness_days is null or (soreness_days >= 0 and soreness_days <= 5));
  end if;
end $$;

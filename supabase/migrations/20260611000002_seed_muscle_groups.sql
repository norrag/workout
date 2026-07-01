-- Reconcile out-of-band seed data into the migration chain (R2, 2026-07-01).
--
-- The canonical muscle-group rows have only ever lived in supabase/seed.sql,
-- which `supabase db reset` runs AFTER all migrations — but two applied
-- migrations depend on the rows already existing: 20260615000006 joins
-- muscle_groups to link the 330 stock exercises (silently linking nothing on a
-- clean DB), and 20260617000002 raises "muscle group not found" seeding the
-- stock templates. On hosted the data predated both, so this was invisible
-- until a clean-DB apply (the CI rls-tests job) exercised the chain.
--
-- Identical to the seed.sql insert and guarded the same way, so it is a no-op
-- on hosted and on any DB that has already been seeded.

insert into public.muscle_groups (name) values
  ('chest'), ('back'), ('quads'), ('hamstrings'), ('glutes'), ('biceps'),
  ('triceps'), ('shoulders'), ('calves'), ('abs'), ('forearms'), ('traps')
on conflict (name) do nothing;

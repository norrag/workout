#!/usr/bin/env python3
"""Generate the exercise-library import from the user-provided CSV.

Source of truth: docs/data/exercises_all_20260615.csv (the 2026-06-15 export).
Emits two artifacts, kept in lockstep so a fresh `supabase db reset` and the
deployed DB agree:

  1. supabase/migrations/20260615000006_replace_exercise_library.sql
       - widens exercises.equipment_type to the CSV vocabulary
       - adds exercises.legacy_id (preserves the CSV's integer ids so a later
         workout-history import can map old int -> new uuid)
       - wipes the test macro/meso/workout/template data + prior stock library
       - loads all rows as stock exercises (user_id null) with muscle links

  2. supabase/seed.sql (exercises section replaced; stock templates dropped)

Equipment values are stored EXACTLY as the CSV provides them (per the user's
instruction). The engine normalizes them to its canonical step buckets at the
input boundary (src/lib/engine/params.ts: toEngineEquipment).

Run: python3 scripts/import-exercise-library.py
"""
from __future__ import annotations

import csv
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV = ROOT / "docs" / "data" / "exercises_all_20260615.csv"
MIGRATION = ROOT / "supabase" / "migrations" / "20260615000006_replace_exercise_library.sql"
SEED = ROOT / "supabase" / "seed.sql"

# muscle_groups seeded names are lowercase; CSV uses Title/mixed case.
VALID_MG = {
    "chest", "back", "quads", "hamstrings", "glutes", "biceps",
    "triceps", "shoulders", "calves", "abs", "forearms", "traps",
}
# equipment vocabulary allowed after the migration = canonical engine set
# (used by user-created customs) UNION the CSV's verbatim labels.
CANONICAL_EQUIP = [
    "dumbbell", "barbell", "machine", "cable", "smith",
    "bodyweight", "bands", "kettlebell", "other",
]


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def sql_val(s: str | None) -> str:
    return "null" if s is None else sql_str(s)


def load_rows():
    with CSV.open(newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.reader(fh))
    out = []
    seen_ids, csv_equip = set(), set()
    for r in rows[1:]:
        if not r or not any(c.strip() for c in r):
            continue
        legacy_id = int(r[0])
        name = r[1].strip()
        primary = r[2].strip().lower()
        secondary = r[3].strip().lower() or None
        equip = r[4].strip()
        assert legacy_id not in seen_ids, f"duplicate id {legacy_id}"
        seen_ids.add(legacy_id)
        assert primary in VALID_MG, f"bad primary mg: {primary!r} (id {legacy_id})"
        if secondary is not None:
            assert secondary in VALID_MG, f"bad secondary mg: {secondary!r} (id {legacy_id})"
            if secondary == primary:  # never duplicate the primary as secondary
                secondary = None
        csv_equip.add(equip)
        out.append((legacy_id, name, equip, primary, secondary))
    return out, sorted(csv_equip)


def values_block(rows) -> str:
    lines = []
    for i, (lid, name, equip, primary, secondary) in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        lines.append(
            f"    ({lid}, {sql_str(name)}, {sql_str(equip)}, "
            f"{sql_str(primary)}, {sql_val(secondary)}){comma}"
        )
    return "\n".join(lines)


def equip_check(csv_equip) -> str:
    allowed = list(CANONICAL_EQUIP)
    for e in csv_equip:
        if e not in allowed:
            allowed.append(e)
    quoted = ", ".join(sql_str(e) for e in allowed)
    return quoted


def insert_cte(rows, indent_returning_legacy=True) -> str:
    """The shared CTE that loads `ex` -> exercises + exercise_muscle_groups."""
    return f"""with ex (legacy_id, name, equipment_type, primary_mg, secondary_mg) as (
  values
{values_block(rows)}
),
inserted as (
  insert into public.exercises (user_id, legacy_id, name, equipment_type)
  select null, ex.legacy_id, ex.name, ex.equipment_type from ex
  where not exists (
    select 1 from public.exercises e where e.legacy_id = ex.legacy_id
  )
  returning id, legacy_id
)
insert into public.exercise_muscle_groups (exercise_id, muscle_group_id, role)
select i.id, mg.id, r.role
from inserted i
join ex on ex.legacy_id = i.legacy_id
cross join lateral (
  values (ex.primary_mg, 'primary'), (ex.secondary_mg, 'secondary')
) as r (mg_name, role)
join public.muscle_groups mg on mg.name = r.mg_name
where r.mg_name is not null
on conflict (exercise_id, muscle_group_id) do nothing;"""


def write_migration(rows, csv_equip):
    body = f"""-- 20260615000006 — replace exercise library
-- Loads the user-provided library export (docs/data/exercises_all_20260615.csv,
-- {len(rows)} exercises). All prior macro/meso/workout/template rows are test data
-- and are wiped; profiles, muscle_groups, and engine_params are preserved.
--
-- ID preservation: the table PK is a uuid (every FK in the app points at it), so
-- the CSV's integer ids cannot BE the PK. They are stored in exercises.legacy_id
-- (unique) so the later workout-history import can map old int -> new uuid.
--
-- Equipment is stored verbatim from the CSV (wider vocabulary than the engine's
-- canonical buckets); the engine normalizes at its input boundary
-- (src/lib/engine/params.ts: toEngineEquipment) so prescription math is unchanged.

-- 1. schema: legacy id + widened equipment vocabulary ------------------------
alter table public.exercises add column if not exists legacy_id integer;
create unique index if not exists exercises_legacy_id_key
  on public.exercises (legacy_id);

alter table public.exercises drop constraint if exists exercises_equipment_type_check;
alter table public.exercises
  add constraint exercises_equipment_type_check
  check (equipment_type in ({equip_check(csv_equip)}));

-- 2. wipe test data + the prior stock library --------------------------------
truncate
  public.macrocycles, public.mesocycles, public.microcycles,
  public.meso_days, public.meso_day_groups, public.meso_exercises,
  public.workouts, public.workout_exercises, public.workout_feedback,
  public.logged_sets, public.exercise_feedback, public.engine_decisions,
  public.templates, public.template_days, public.template_day_groups,
  public.template_exercises, public.excluded_exercises, public.exercise_notes,
  public.shares, public.exercise_muscle_groups, public.exercises
  restart identity cascade;

-- 3. load the library (stock rows: user_id null) -----------------------------
{insert_cte(rows)}
"""
    MIGRATION.write_text(body, encoding="utf-8")


def write_seed(rows):
    """Replace the exercises section of seed.sql; drop the stock-template seeding
    (those referenced names that no longer exist). Keep muscle_groups + engine
    params verbatim."""
    current = SEED.read_text(encoding="utf-8")
    idx = current.index("-- default engine params (version 2)")
    start = current.rindex("-- ----", 0, idx)
    tail = current[start:]

    header = f"""-- Seed: muscle groups, stock exercises, default engine params.
-- Stock rows have user_id null and are written only here (service context).
-- The stock exercise library is generated from the user-provided export
-- (docs/data/exercises_all_20260615.csv) by scripts/import-exercise-library.py;
-- regenerate both this file and the import migration with that script.

-- ---------------------------------------------------------------------------
-- muscle groups
-- ---------------------------------------------------------------------------

insert into public.muscle_groups (name) values
  ('chest'), ('back'), ('quads'), ('hamstrings'), ('glutes'), ('biceps'),
  ('triceps'), ('shoulders'), ('calves'), ('abs'), ('forearms'), ('traps')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- stock exercises (user-provided library; ids preserved in legacy_id)
-- ---------------------------------------------------------------------------

{insert_cte(rows)}

"""
    SEED.write_text(header + tail, encoding="utf-8")


def main():
    rows, csv_equip = load_rows()
    write_migration(rows, csv_equip)
    write_seed(rows)
    print(f"{len(rows)} exercises -> {MIGRATION.relative_to(ROOT)} and {SEED.relative_to(ROOT)}")
    print("csv equipment vocabulary:", csv_equip)


if __name__ == "__main__":
    main()

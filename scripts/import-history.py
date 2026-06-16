#!/usr/bin/env python3
"""Prepare Garron's training-history import payload.

Reads docs/data/master_exercise_history_garron.csv and emits JSON batches that
are bulk-loaded into a staging table (public.import_hist); scripts/history-build.sql
then derives the whole hierarchy server-side (joining exercises on legacy_id), so
none of the generated uuids ever leave the database.

Encoding (verified on 100% of rows): the "Set 1" column is the working weight
(== Weight); "Set 2".."Set N" are the reps of each working set. So working sets
per row = Sets - 1, and reps = the numeric Set cells after the first.

Full procedure (one-time):
  1. psql/SQL: create the staging table
       create table public.import_hist (
         rownum int primary key, meso text, week int, day int, perf_date date,
         ex_legacy int, weight numeric, reps int[], nsets int, deload boolean, tmg text);
       alter table public.import_hist disable row level security;
       grant insert, select on public.import_hist to anon;   -- if loading via REST
  2. python3 scripts/import-history.py            # writes /tmp/hist/batch_*.json
  3. POST each batch to /rest/v1/import_hist (Prefer: return=minimal) — or COPY it in.
  4. Run scripts/history-build.sql (one session; builds macros..logged_sets).
  5. drop table public.import_hist;               # also drops the temp anon grant
"""
from __future__ import annotations
import csv, datetime, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (pathlib.Path(sys.argv[1]) if len(sys.argv) > 1
       else ROOT / "docs" / "data" / "master_exercise_history_garron.csv")
OUT = pathlib.Path("/tmp/hist"); OUT.mkdir(parents=True, exist_ok=True)
SETCOLS = [f"Set {i}" for i in range(1, 10)]
BATCH = 600


def num(x):
    x = (x or "").strip()
    if x == "":
        return None
    try:
        return float(x)
    except ValueError:
        return None


def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    objs = []
    for i, r in enumerate(rows, start=1):
        vals = [v for v in (num(r[c]) for c in SETCOLS) if v is not None]
        reps = [int(round(v)) for v in vals[1:]]      # drop Set1 (== weight)
        assert len(reps) == int(num(r["Sets"])) - 1 and reps, (i, r)
        w = num(r["Weight"]) or 0.0
        objs.append({
            "rownum": i,
            "meso": r["Mesocycle"].strip(),
            "week": int(num(r["Week"])),
            "day": int(num(r["Day"])),
            "perf_date": datetime.datetime.strptime(r["Date"].strip(), "%m/%d/%Y").date().isoformat(),
            "ex_legacy": int(num(r["exercise_id"])),
            "weight": int(w) if w == int(w) else w,
            "reps": reps,
            "nsets": len(reps),
            "deload": r["Deload"].strip().upper() == "TRUE",
            "tmg": r["Target Muscle Group"].strip().lower(),
        })

    parts = [objs[i:i + BATCH] for i in range(0, len(objs), BATCH)]
    for i, p in enumerate(parts, 1):
        json.dump(p, open(OUT / f"batch_{i:02d}.json", "w"))

    print(f"rows: {len(objs)}  working sets: {sum(o['nsets'] for o in objs)}  "
          f"mesos: {len(set(o['meso'] for o in objs))}  batches: {len(parts)}")
    print(f"batch files: {OUT}/batch_01.json .. batch_{len(parts):02d}.json")


if __name__ == "__main__":
    main()

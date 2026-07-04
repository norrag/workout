"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  EquipmentType,
  MuscleGroupRow,
} from "@/lib/types/database";
import type { ExerciseWithMuscles } from "@/lib/queries/exercises";
// R6: shared drift-safe formatter (was a local MM/DD/YY copy that parsed the
// raw timestamp — near-midnight sessions showed the wrong day)
import { shortDateWithYear as shortDate } from "@/lib/dates";
import { NewExerciseButton } from "./NewExerciseButton";

/**
 * Exercise library (fig 3.1): search + two-axis filter (MUSCLE × EQUIP, AND).
 * Client-side so search live-filters the loaded list as you type (P20) and the
 * axis chips filter instantly — no navigation round-trip.
 */
export function ExercisesBrowser({
  exercises,
  muscleGroups,
  lastPerformed,
}: {
  exercises: ExerciseWithMuscles[];
  muscleGroups: MuscleGroupRow[];
  lastPerformed: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [mg, setMg] = useState<string | null>(null);
  const [eq, setEq] = useState<EquipmentType | null>(null);

  const activeGroup = muscleGroups.find((g) => g.id === mg) ?? null;

  // search narrows the working set first; the equipment axis is drawn from
  // what's present in the searched library (mirrors the prior server behavior)
  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return exercises;
    return exercises.filter((e) => e.name.toLowerCase().includes(needle));
  }, [exercises, q]);

  const equipTypes = useMemo(
    () => [...new Set(searched.map((e) => e.equipment_type))].sort(),
    [searched],
  );

  const visible = useMemo(
    () =>
      searched.filter(
        (e) =>
          (!activeGroup || e.muscles.some((m) => m.id === activeGroup.id)) &&
          (!eq || e.equipment_type === eq),
      ),
    [searched, activeGroup, eq],
  );
  const filtering = !!activeGroup || !!eq;

  const chipBase =
    "px-2.5 py-1.5 text-[10.5px] tracking-[0.08em] whitespace-nowrap";
  const chipOn = `bg-ink text-bg-base font-bold flex items-center gap-2 ${chipBase}`;
  const chipOff = `border-[1.5px] border-ink/40 text-ink/55 font-medium ${chipBase}`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="title-display text-[32px]">exercises</h1>
        {/* N23 — tray (blank / enter code), replacing the bare page link */}
        <NewExerciseButton />
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        aria-label="search exercises"
        className="mt-4 h-[46px] w-full border-[1.5px] border-ink bg-paper px-3.5 text-sm text-ink placeholder:text-ink/45 focus:outline-none"
      />

      {/* MUSCLE axis */}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="w-[52px] flex-shrink-0 text-[10px] font-semibold tracking-[0.12em] text-ink/55">
          MUSCLE
        </span>
        <div className="flex gap-1.5 overflow-x-auto">
          {muscleGroups.map((g) =>
            activeGroup?.id === g.id ? (
              <button
                key={g.id}
                type="button"
                onClick={() => setMg(null)}
                className={chipOn}
              >
                {g.name.toUpperCase()} <span className="opacity-60">✕</span>
              </button>
            ) : (
              <button
                key={g.id}
                type="button"
                onClick={() => setMg(g.id)}
                className={chipOff}
              >
                {g.name.toUpperCase()}
              </button>
            ),
          )}
        </div>
      </div>

      {/* EQUIP axis */}
      <div className="mt-2 flex items-center gap-2">
        <span className="w-[52px] flex-shrink-0 text-[10px] font-semibold tracking-[0.12em] text-ink/55">
          EQUIP
        </span>
        <div className="flex gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setEq(null)}
            className={eq ? chipOff : chipOn}
          >
            ALL
          </button>
          {equipTypes.map((type) =>
            eq === type ? (
              <button
                key={type}
                type="button"
                onClick={() => setEq(null)}
                className={chipOn}
              >
                {type.toUpperCase()} <span className="opacity-60">✕</span>
              </button>
            ) : (
              <button
                key={type}
                type="button"
                onClick={() => setEq(type)}
                className={chipOff}
              >
                {type.toUpperCase()}
              </button>
            ),
          )}
        </div>
      </div>

      {filtering && (
        <div className="mt-2.5 flex items-baseline justify-between">
          <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/45">
            {visible.length} OF {searched.length} EXERCISES
          </div>
          <button
            type="button"
            onClick={() => {
              setMg(null);
              setEq(null);
            }}
            className="border-b-[1.5px] border-ink text-[9.5px] font-bold tracking-[0.1em] text-ink"
          >
            CLEAR ALL
          </button>
        </div>
      )}

      <div className="mt-4 border-t-[1.5px] border-ink">
        {visible.length === 0 && (
          <p className="py-4 text-sm text-ink/45">No exercises found.</p>
        )}
        {visible.map((ex) => {
          const primary = ex.muscles.find((m) => m.role === "primary")?.name;
          const last = lastPerformed[ex.id];
          const sub = [
            primary?.toUpperCase(),
            ex.equipment_type.toUpperCase(),
            last ? `LAST ${shortDate(last)}` : null,
            ex.user_id !== null ? "CUSTOM" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <Link
              key={ex.id}
              href={`/exercises/${ex.id}`}
              className="flex items-center justify-between border-b border-ink/[0.18] py-3.5"
            >
              <div>
                <div className="text-base font-bold">{ex.name}</div>
                <div className="mt-1 text-[10px] font-medium tracking-[0.1em] text-ink/55">
                  {sub}
                </div>
              </div>
              <div className="text-base text-ink/40">›</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

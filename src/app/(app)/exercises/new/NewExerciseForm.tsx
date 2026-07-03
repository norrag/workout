"use client";

import { useActionState, useState } from "react";
import type { MuscleGroupRow } from "@/lib/types/database";
import { customExerciseEquipment as EQUIPMENT } from "@/lib/types/equipment";
import { createCustomExerciseAction, type FormState } from "../actions";

/** Create custom exercise (08 §4, described not mocked) — house-style form. */
export function NewExerciseForm({
  muscleGroups,
}: {
  muscleGroups: MuscleGroupRow[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCustomExerciseAction,
    { error: null },
  );
  const [equipment, setEquipment] = useState<string>("machine");
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [secondaryIds, setSecondaryIds] = useState<string[]>([]);

  const toggleSecondary = (id: string) =>
    setSecondaryIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 4),
    );

  const label = "text-[10px] font-semibold tracking-[0.14em] text-ink/55";
  const chip = (selected: boolean) =>
    `px-2.5 py-2 text-[10px] font-semibold tracking-[0.08em] ${
      selected ? "bg-ink text-bg-base" : "border border-ink/40 text-ink/70"
    }`;

  return (
    <form action={formAction} className="mt-5">
      <input type="hidden" name="equipment_type" value={equipment} />
      <input type="hidden" name="primary_muscle_group_id" value={primaryId ?? ""} />
      <input type="hidden" name="secondary" value={JSON.stringify(secondaryIds)} />

      <div className={label}>NAME</div>
      <input
        name="name"
        maxLength={80}
        required
        placeholder="e.g. Banded Hip Thrust"
        className="mt-[7px] h-11 w-full border-[1.5px] border-ink bg-paper px-3 text-sm font-semibold text-ink placeholder:text-ink/40 focus:outline-none"
      />

      <div className={`mt-5 ${label}`}>EQUIPMENT</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EQUIPMENT.map((eq) => (
          <button
            key={eq}
            type="button"
            aria-pressed={equipment === eq}
            onClick={() => setEquipment(eq)}
            className={chip(equipment === eq)}
          >
            {eq.toUpperCase()}
          </button>
        ))}
      </div>

      <div className={`mt-5 ${label}`}>PRIMARY MUSCLE GROUP</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {muscleGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={primaryId === g.id}
            onClick={() => {
              setPrimaryId(g.id);
              setSecondaryIds((cur) => cur.filter((x) => x !== g.id));
            }}
            className={chip(primaryId === g.id)}
          >
            {g.name.toUpperCase()}
          </button>
        ))}
      </div>

      <div className={`mt-5 ${label}`}>SECONDARY — OPTIONAL</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {muscleGroups
          .filter((g) => g.id !== primaryId)
          .map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={secondaryIds.includes(g.id)}
              onClick={() => toggleSecondary(g.id)}
              className={chip(secondaryIds.includes(g.id))}
            >
              {g.name.toUpperCase()}
            </button>
          ))}
      </div>

      <div className={`mt-5 ${label}`}>DESCRIPTION — OPTIONAL</div>
      <textarea
        name="description"
        maxLength={500}
        rows={2}
        placeholder="Setup, cues, anything a picker card should say"
        className="mt-[7px] w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none"
      />

      <div className={`mt-3 ${label}`}>NOTES — OPTIONAL</div>
      <textarea
        name="notes"
        maxLength={500}
        rows={2}
        className="mt-[7px] w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none"
      />

      {state.error && <p className="mt-3 text-xs text-accent">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || primaryId === null}
        className="mt-5 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base disabled:opacity-40"
      >
        {pending ? "CREATING…" : "CREATE EXERCISE"}
      </button>
      <p className="mt-2.5 text-[11px] leading-normal text-ink/60">
        Custom exercises are visible only to you — share them from the
        exercise page.
      </p>
    </form>
  );
}

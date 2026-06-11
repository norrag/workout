"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { RirBadge } from "@/components/ui/RirBadge";
import { rirRamp, type EngineParams } from "@/lib/engine";
import type { Units } from "@/lib/types/database";
import { createMesocycleAction, type MesoFormState } from "../../actions";

export interface ExerciseOption {
  id: string;
  name: string;
  equipment: string;
  primaryMuscle: string | null;
}

interface Slot {
  exerciseId: string;
  sets: number;
  reps: string; // raw input, "" = unset
  weight: string; // raw input, "" = unset
}

const initialState: MesoFormState = { error: null };

export function MesoBuilder({
  macroId,
  units,
  engineParams,
  exercises,
}: {
  macroId: string;
  units: Units;
  engineParams: EngineParams;
  exercises: ExerciseOption[];
}) {
  const [state, formAction, pending] = useActionState(
    createMesocycleAction,
    initialState,
  );

  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [daysPerWeek, setDaysPerWeek] = useState(2);
  const [includesDeload, setIncludesDeload] = useState(true);
  const [rirStart, setRirStart] = useState(3);
  const [rirEnd, setRirEnd] = useState(0);
  const [days, setDays] = useState<Slot[][]>([[], []]);

  const ramp = useMemo(() => {
    try {
      return rirRamp(weeks, includesDeload, rirStart, rirEnd, engineParams);
    } catch {
      return null;
    }
  }, [weeks, includesDeload, rirStart, rirEnd, engineParams]);

  function setDayCount(count: number) {
    setDaysPerWeek(count);
    setDays((prev) =>
      Array.from({ length: count }, (_, i) => prev[i] ?? []),
    );
  }

  function updateSlot(day: number, idx: number, patch: Partial<Slot>) {
    setDays((prev) =>
      prev.map((slots, d) =>
        d === day
          ? slots.map((s, i) => (i === idx ? { ...s, ...patch } : s))
          : slots,
      ),
    );
  }

  function addSlot(day: number) {
    setDays((prev) =>
      prev.map((slots, d) =>
        d === day
          ? [...slots, { exerciseId: "", sets: 3, reps: "", weight: "" }]
          : slots,
      ),
    );
  }

  function removeSlot(day: number, idx: number) {
    setDays((prev) =>
      prev.map((slots, d) =>
        d === day ? slots.filter((_, i) => i !== idx) : slots,
      ),
    );
  }

  const clientError = validate(name, days);

  const plan = JSON.stringify({
    macrocycle_id: macroId,
    name,
    weeks,
    days_per_week: daysPerWeek,
    includes_deload: includesDeload,
    rir_start: rirStart,
    rir_end: rirEnd,
    exercises: days.flatMap((slots, dayIdx) =>
      slots
        .filter((s) => s.exerciseId)
        .map((s, i) => ({
          day_of_week: dayIdx + 1,
          position: i + 1,
          exercise_id: s.exerciseId,
          initial_sets: s.sets,
          initial_reps: s.reps === "" ? null : Number(s.reps),
          initial_weight: s.weight === "" ? null : Number(s.weight),
        })),
    ),
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="plan" value={plan} />

      <Card header="Structure">
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Meso 1"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Weeks"
              value={weeks}
              onChange={setWeeks}
              options={[3, 4, 5, 6]}
            />
            <SelectField
              label="Days / week"
              value={daysPerWeek}
              onChange={setDayCount}
              options={[1, 2, 3, 4, 5, 6, 7]}
            />
            <SelectField
              label="Start RIR"
              value={rirStart}
              onChange={setRirStart}
              options={[5, 4, 3, 2, 1, 0]}
            />
            <SelectField
              label="End RIR"
              value={rirEnd}
              onChange={setRirEnd}
              options={[5, 4, 3, 2, 1, 0]}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={includesDeload}
              onChange={(e) => setIncludesDeload(e.target.checked)}
              className="size-5 accent-accent"
            />
            Final week is a deload
          </label>
        </div>
      </Card>

      <Card header="RIR ramp">
        {ramp ? (
          <ol className="flex flex-wrap gap-2">
            {ramp.map((week) => (
              <li key={week.weekNumber} className="flex items-center gap-1.5">
                <span className="numeral text-xs text-text-secondary">
                  W{week.weekNumber}
                </span>
                <RirBadge rir={week.targetRir} isDeload={week.isDeload} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-warning">
            End RIR must be at or below start RIR.
          </p>
        )}
      </Card>

      {days.map((slots, dayIdx) => (
        <Card key={dayIdx} header={`Day ${dayIdx + 1}`}>
          <div className="flex flex-col gap-3">
            {slots.length === 0 && (
              <p className="text-sm text-text-secondary">
                No exercises yet.
              </p>
            )}
            {slots.map((slot, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-2 rounded-[6px] border border-border-subtle bg-bg-raised p-3"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={slot.exerciseId}
                    onChange={(e) =>
                      updateSlot(dayIdx, idx, { exerciseId: e.target.value })
                    }
                    required
                    className="min-h-11 w-full rounded-[6px] border border-border-subtle bg-bg-surface px-2 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">Choose exercise</option>
                    {exercises.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                        {ex.primaryMuscle ? ` — ${ex.primaryMuscle}` : ""}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeSlot(dayIdx, idx)}
                    aria-label={`Remove exercise ${idx + 1} from day ${dayIdx + 1}`}
                    className="shrink-0 px-2"
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    label="Sets"
                    type="number"
                    min={1}
                    max={20}
                    value={slot.sets}
                    onChange={(e) =>
                      updateSlot(dayIdx, idx, {
                        sets: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                  <Input
                    label="Reps"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="—"
                    value={slot.reps}
                    onChange={(e) =>
                      updateSlot(dayIdx, idx, { reps: e.target.value })
                    }
                  />
                  <Input
                    label={`Weight (${units})`}
                    type="number"
                    min={0}
                    step="any"
                    placeholder="—"
                    value={slot.weight}
                    onChange={(e) =>
                      updateSlot(dayIdx, idx, { weight: e.target.value })
                    }
                  />
                </div>
              </div>
            ))}
            <Button type="button" onClick={() => addSlot(dayIdx)}>
              Add exercise
            </Button>
          </div>
        </Card>
      ))}

      {(state.error ?? clientError) && (
        <p className="text-sm text-warning">{state.error ?? clientError}</p>
      )}
      <Button
        type="submit"
        variant="primary"
        disabled={pending || clientError !== null || !ramp}
      >
        {pending ? "Saving" : "Save mesocycle"}
      </Button>
    </form>
  );
}

function validate(name: string, days: Slot[][]): string | null {
  if (!name.trim()) return "Name the mesocycle.";
  for (let d = 0; d < days.length; d++) {
    if (!days[d].some((s) => s.exerciseId)) {
      return `Day ${d + 1} needs at least one exercise.`;
    }
  }
  return null;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: number[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps text-xs font-semibold text-text-secondary">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="min-h-11 rounded-[6px] border border-border-subtle bg-bg-raised px-3 text-base focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { Input } from "@/components/ui/Input";
import { MuscleChip } from "@/components/ui/MuscleChip";
import { PickerSheet, type PickerItem } from "@/components/ui/PickerSheet";
import { RirBadge } from "@/components/ui/RirBadge";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { rirRamp, type EngineParams } from "@/lib/engine";
import { DEFAULT_INITIAL_SETS } from "@/lib/plan/constants";
import { createMesocycleAction, type MesoFormState } from "../../actions";

export interface ExerciseOption {
  id: string;
  name: string;
  equipment: string;
  primaryMuscle: string | null;
}

const initialState: MesoFormState = { error: null };
const WEEK_OPTIONS = [3, 4, 5, 6] as const;

/**
 * Board → confirm flow (docs/08-ui-design-corpus.md): the board is day tabs
 * with exercise slots; sets/reps/weights and the RIR ramp are not asked —
 * they belong to the week and the engine.
 */
export function MesoBuilder({
  macroId,
  engineParams,
  exercises,
}: {
  macroId: string;
  engineParams: EngineParams;
  exercises: ExerciseOption[];
}) {
  const [state, formAction, pending] = useActionState(
    createMesocycleAction,
    initialState,
  );

  const [step, setStep] = useState<"board" | "confirm">("board");
  const [days, setDays] = useState<string[][]>([[], [], []]); // exercise ids per day
  const [activeDay, setActiveDay] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [includesDeload, setIncludesDeload] = useState(true);

  const exerciseById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );

  const pickerItems: PickerItem[] = useMemo(
    () =>
      exercises.map((e) => ({
        id: e.id,
        name: e.name,
        detail: e.equipment,
        muscle: e.primaryMuscle,
      })),
    [exercises],
  );

  // weekly working-set tally per muscle group, the board's balancing readout
  const muscleTally = useMemo(() => {
    const tally = new Map<string, number>();
    for (const day of days) {
      for (const id of day) {
        const muscle = exerciseById.get(id)?.primaryMuscle ?? "other";
        tally.set(muscle, (tally.get(muscle) ?? 0) + DEFAULT_INITIAL_SETS);
      }
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }, [days, exerciseById]);

  const ramp = rirRamp(weeks, includesDeload, 3, 0, engineParams);
  const emptyDay = days.findIndex((d) => d.length === 0);
  const boardError =
    emptyDay !== -1 ? `Day ${emptyDay + 1} needs at least one exercise.` : null;

  function patchDay(dayIdx: number, next: string[]) {
    setDays((prev) => prev.map((d, i) => (i === dayIdx ? next : d)));
  }

  function move(dayIdx: number, idx: number, dir: -1 | 1) {
    const day = [...days[dayIdx]];
    const target = idx + dir;
    if (target < 0 || target >= day.length) return;
    [day[idx], day[target]] = [day[target], day[idx]];
    patchDay(dayIdx, day);
  }

  function addDay() {
    if (days.length >= 7) return;
    setDays((prev) => [...prev, []]);
    setActiveDay(days.length);
  }

  function removeDay(dayIdx: number) {
    if (days.length <= 1) return;
    setDays((prev) => prev.filter((_, i) => i !== dayIdx));
    setActiveDay(Math.max(0, dayIdx - 1));
  }

  const plan = JSON.stringify({
    macrocycle_id: macroId,
    name,
    weeks,
    days_per_week: days.length,
    includes_deload: includesDeload,
    exercises: days.flatMap((day, dayIdx) =>
      day.map((exerciseId, i) => ({
        day_of_week: dayIdx + 1,
        position: i + 1,
        exercise_id: exerciseId,
      })),
    ),
  });

  if (step === "confirm") {
    return (
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="plan" value={plan} />

        <Card header="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Meso 1"
            aria-label="Mesocycle name"
            required
          />
        </Card>

        <Card header="Weeks">
          <ChoiceChips
            label="Weeks"
            options={WEEK_OPTIONS}
            value={weeks}
            onChange={setWeeks}
          />
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={includesDeload}
              onChange={(e) => setIncludesDeload(e.target.checked)}
              className="size-5 accent-accent"
            />
            Final week is a deload
          </label>
        </Card>

        <Card header="Intensity">
          <p className="mb-3 text-sm text-text-secondary">
            Weekly targets ramp from 3 RIR to the 0 RIR peak. Weights and
            reps are prescribed week to week from your logged performance.
          </p>
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
        </Card>

        {state.error && <p className="text-sm text-warning">{state.error}</p>}
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !name.trim()}
        >
          {pending ? "Creating" : "Create mesocycle"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setStep("board")}>
          Back to plan
        </Button>
      </form>
    );
  }

  const day = days[activeDay];

  return (
    <div className="flex flex-col gap-4">
      <SegmentedTabs
        label="Training day"
        items={days.map((_, i) => i)}
        value={activeDay}
        onChange={setActiveDay}
        render={(i) => `Day ${i + 1}`}
      />

      <Card>
        {day.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No exercises yet. Add the first one.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {day.map((exerciseId, idx) => {
              const ex = exerciseById.get(exerciseId);
              return (
                <li
                  key={`${exerciseId}-${idx}`}
                  className="flex items-center gap-2 py-2"
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`Move ${ex?.name} up`}
                      disabled={idx === 0}
                      onClick={() => move(activeDay, idx, -1)}
                      className="flex size-8 items-center justify-center text-text-secondary disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${ex?.name} down`}
                      disabled={idx === day.length - 1}
                      onClick={() => move(activeDay, idx, 1)}
                      className="flex size-8 items-center justify-center text-text-secondary disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <MuscleChip name={ex?.primaryMuscle ?? null} />
                    <p className="truncate text-sm">{ex?.name}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${ex?.name}`}
                    onClick={() =>
                      patchDay(
                        activeDay,
                        day.filter((_, i) => i !== idx),
                      )
                    }
                    className="label-caps min-h-11 px-2 text-[10px] font-semibold text-text-secondary"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-3 w-full"
        >
          Add exercise
        </Button>
      </Card>

      {muscleTally.length > 0 && (
        <Card header="Weekly sets by muscle">
          <ul className="flex flex-col gap-2">
            {muscleTally.map(([muscle, sets]) => (
              <li
                key={muscle}
                className="flex items-center justify-between text-sm"
              >
                <MuscleChip name={muscle} />
                <span className="numeral text-text-secondary">{sets}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-2">
        {days.length < 7 && (
          <Button type="button" onClick={addDay} className="flex-1">
            Add day
          </Button>
        )}
        {days.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => removeDay(activeDay)}
            className="flex-1"
          >
            Remove day {activeDay + 1}
          </Button>
        )}
      </div>

      {boardError && <p className="text-sm text-warning">{boardError}</p>}
      <Button
        type="button"
        variant="primary"
        disabled={boardError !== null}
        onClick={() => setStep("confirm")}
      >
        Continue
      </Button>

      {pickerOpen && (
        <PickerSheet
          title={`Add to day ${activeDay + 1}`}
          items={pickerItems}
          onPick={(item) => {
            patchDay(activeDay, [...day, item.id]);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

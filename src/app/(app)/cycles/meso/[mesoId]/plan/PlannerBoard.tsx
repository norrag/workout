"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { NumberStepper } from "@/components/ui/NumberStepper";
import type { MesoPlan, PlannedDay, PlannedGroup } from "@/lib/queries/cycles";
import type { MuscleGroupRow } from "@/lib/types/database";
import {
  addDayAction,
  addGroupAction,
  clearSlotAction,
  fillSlotAction,
  removeDayAction,
  removeGroupAction,
  updateDayAction,
  updateGroupAction,
} from "../../../actions";

const WEEKDAYS = [
  { value: 1, label: "MON" },
  { value: 2, label: "TUE" },
  { value: 3, label: "WED" },
  { value: 4, label: "THU" },
  { value: 5, label: "FRI" },
  { value: 6, label: "SAT" },
  { value: 7, label: "SUN" },
] as const;

export interface PickerExerciseLite {
  id: string;
  name: string;
  equipment_type: string;
  last_performed_at: string | null;
  best_weight: number | null;
  best_reps: number | null;
  muscle_group_ids: string[];
}

type PickerTarget = {
  group: PlannedGroup;
  slotNumber: number;
};

/** Planner board (figs 2.4/2.5/2.6). */
export function PlannerBoard({
  plan,
  muscleGroups,
  exercises,
}: {
  plan: MesoPlan;
  muscleGroups: MuscleGroupRow[];
  exercises: PickerExerciseLite[];
}) {
  const { meso, days } = plan;
  const [activeDayId, setActiveDayId] = useState<string | null>(
    days[0]?.id ?? null,
  );
  const [daySetup, setDaySetup] = useState<PlannedDay | "new" | null>(
    days.length === 0 ? "new" : null,
  );
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pending, startTransition] = useTransition();

  // keep the active tab valid as days are added/removed/re-sorted
  useEffect(() => {
    if (!days.some((d) => d.id === activeDayId)) {
      setActiveDayId(days[0]?.id ?? null);
    }
  }, [days, activeDayId]);

  const activeDay = days.find((d) => d.id === activeDayId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* day tabs, auto-sorted by weekday */}
      <div className="flex gap-1 overflow-x-auto">
        {days.map((day) => {
          const active = day.id === activeDayId;
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => setActiveDayId(day.id)}
              className={`label-caps min-h-11 shrink-0 border px-3 text-[10px] ${
                active
                  ? "border-ink bg-ink font-bold text-bg-base"
                  : "border-ink/30 font-medium text-ink/55"
              }`}
            >
              {day.weekday
                ? WEEKDAYS.find((w) => w.value === day.weekday)?.label
                : `DAY ${day.day_number}`}
              {day.label ? ` · ${day.label.toUpperCase()}` : ""}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDaySetup("new")}
          className="label-caps min-h-11 shrink-0 border border-dashed border-ink/40 px-3 text-[10px] font-medium text-ink/55"
        >
          + DAY
        </button>
      </div>

      {activeDay ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="label-caps text-[10px] font-semibold text-ink/55">
              {activeDay.label?.toUpperCase() ?? `DAY ${activeDay.day_number}`}
              {" · "}
              <span className="numeral">
                {activeDay.groups.reduce(
                  (n, g) =>
                    n + g.fills.reduce((s, f) => s + f.initial_sets, 0),
                  0,
                )}
              </span>{" "}
              SETS
            </p>
            <button
              type="button"
              onClick={() => setDaySetup(activeDay)}
              className="label-caps min-h-11 px-2 text-[10px] font-bold"
            >
              DAY SETUP
            </button>
          </div>

          {activeDay.groups.map((group, gi) => (
            <section key={group.id} className="border-t-[1.5px] border-ink pt-2">
              <div className="flex items-center justify-between">
                <h3 className="label-caps text-[10px] font-bold tracking-[0.14em]">
                  <span className="numeral">
                    {String(gi + 1).padStart(2, "0")}
                  </span>
                  {" — "}
                  {group.muscle_group.toUpperCase()}
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() =>
                      removeGroupAction({
                        group_id: group.id,
                        meso_id: meso.id,
                      }),
                    )
                  }
                  className="label-caps min-h-11 px-2 text-[9px] font-bold text-accent"
                >
                  REMOVE
                </button>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                {Array.from({ length: group.exercise_slots }, (_, i) => {
                  const slotNumber = i + 1;
                  const fill = group.fills.find(
                    (f) => f.slot_number === slotNumber,
                  );
                  return fill ? (
                    <div
                      key={slotNumber}
                      className="flex min-h-12 items-center justify-between border border-ink/30 px-3 py-2"
                    >
                      <button
                        type="button"
                        className="flex-1 text-left text-sm font-semibold"
                        onClick={() => setPicker({ group, slotNumber })}
                      >
                        {fill.exercise_name}
                        <span className="label-caps ml-2 text-[9px] font-medium text-ink/45">
                          <span className="numeral">{fill.initial_sets}</span>{" "}
                          SETS
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`clear ${fill.exercise_name}`}
                        onClick={() =>
                          startTransition(() =>
                            clearSlotAction({
                              meso_id: meso.id,
                              meso_exercise_id: fill.id,
                            }),
                          )
                        }
                        className="label-caps min-h-11 pl-3 text-[10px] font-bold text-ink/40"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      key={slotNumber}
                      type="button"
                      onClick={() => setPicker({ group, slotNumber })}
                      className="label-caps flex min-h-12 items-center justify-center border border-dashed border-ink/40 text-[10px] font-semibold text-ink/55"
                    >
                      + EXERCISE
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <Chip dashed className="w-full" onClick={() => setGroupSheetOpen(true)}>
            + ADD MUSCLE GROUP
          </Chip>
        </div>
      ) : (
        <p className="text-sm text-ink/55">
          Add a training day to start planning.
        </p>
      )}

      <DaySetupSheet
        key={daySetup === "new" ? "new" : (daySetup?.id ?? "closed")}
        target={daySetup}
        mesoId={meso.id}
        canRemove={days.length > 0}
        pending={pending}
        onClose={() => setDaySetup(null)}
        onCommit={(fn) => startTransition(fn)}
      />

      {activeDay && (
        <AddGroupSheet
          open={groupSheetOpen}
          day={activeDay}
          mesoId={meso.id}
          muscleGroups={muscleGroups}
          onClose={() => setGroupSheetOpen(false)}
          onCommit={(fn) => startTransition(fn)}
        />
      )}

      <ExercisePicker
        target={picker}
        mesoId={meso.id}
        exercises={exercises}
        onClose={() => setPicker(null)}
        onCommit={(fn) => startTransition(fn)}
      />
    </div>
  );
}

/** Day setup sheet (fig 2.5): label, weekday, week start, slot steppers, remove. */
function DaySetupSheet({
  target,
  mesoId,
  canRemove,
  pending,
  onClose,
  onCommit,
}: {
  target: PlannedDay | "new" | null;
  mesoId: string;
  canRemove: boolean;
  pending: boolean;
  onClose: () => void;
  onCommit: (fn: () => Promise<void>) => void;
}) {
  const isNew = target === "new";
  const day = isNew || target === null ? null : target;
  const [label, setLabel] = useState(day?.label ?? "");
  const [weekday, setWeekday] = useState<number | null>(day?.weekday ?? null);
  const [weekStartsHere, setWeekStartsHere] = useState(false);

  if (target === null) return null;

  const save = () => {
    const value = {
      label: label.trim() || null,
      weekday,
    };
    onCommit(async () => {
      if (isNew) {
        await addDayAction({ meso_id: mesoId, ...value });
      } else if (day) {
        await updateDayAction({
          day_id: day.id,
          meso_id: mesoId,
          ...value,
          week_starts_here: weekStartsHere,
        });
      }
    });
    onClose();
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={isNew ? "add day" : "day setup"}
      subtitle={isNew ? "NEW TRAINING DAY" : `DAY ${day?.day_number}`}
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Label — optional"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          placeholder="e.g. Lower A"
        />
        <fieldset>
          <legend className="label-caps mb-2 text-[10px] font-semibold text-ink/55">
            Weekday — days auto-sort by this
          </legend>
          <div className="grid grid-cols-4 gap-1.5">
            {WEEKDAYS.map((wd) => (
              <Chip
                key={wd.value}
                selected={weekday === wd.value}
                onClick={() =>
                  setWeekday(weekday === wd.value ? null : wd.value)
                }
              >
                {wd.label}
              </Chip>
            ))}
          </div>
        </fieldset>
        {!isNew && weekday !== null && (
          <Chip
            selected={weekStartsHere}
            onClick={() => setWeekStartsHere((v) => !v)}
            className="w-full"
          >
            WEEK STARTS ON THIS DAY
          </Chip>
        )}

        {!isNew && day && (
          <div className="flex flex-col gap-3 border-t border-ink/15 pt-3">
            {day.groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between"
              >
                <span className="label-caps text-[10px] font-semibold">
                  {group.muscle_group.toUpperCase()}
                </span>
                <NumberStepper
                  value={group.exercise_slots}
                  min={1}
                  max={10}
                  onChange={(next) =>
                    onCommit(() =>
                      updateGroupAction({
                        group_id: group.id,
                        meso_id: mesoId,
                        exercise_slots: next,
                      }),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}

        <Button type="button" variant="primary" onClick={save} disabled={pending}>
          {isNew ? "Add day" : "Save day"}
        </Button>
        {!isNew && day && canRemove && (
          <Button
            type="button"
            variant="ghost"
            className="text-accent"
            onClick={() => {
              onCommit(() =>
                removeDayAction({ day_id: day.id, meso_id: mesoId }),
              );
              onClose();
            }}
          >
            Remove day
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

function AddGroupSheet({
  open,
  day,
  mesoId,
  muscleGroups,
  onClose,
  onCommit,
}: {
  open: boolean;
  day: PlannedDay;
  mesoId: string;
  muscleGroups: MuscleGroupRow[];
  onClose: () => void;
  onCommit: (fn: () => Promise<void>) => void;
}) {
  const [slots, setSlots] = useState(2);
  const taken = new Set(day.groups.map((g) => g.muscle_group_id));
  const available = muscleGroups.filter((g) => !taken.has(g.id));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="add muscle group"
      subtitle={day.label?.toUpperCase() ?? `DAY ${day.day_number}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="label-caps text-[10px] font-semibold text-ink/55">
            EXERCISE SLOTS
          </span>
          <NumberStepper value={slots} min={1} max={10} onChange={setSlots} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {available.map((group) => (
            <Chip
              key={group.id}
              onClick={() => {
                onCommit(() =>
                  addGroupAction({
                    day_id: day.id,
                    meso_id: mesoId,
                    muscle_group_id: group.id,
                    exercise_slots: slots,
                  }),
                );
                onClose();
              }}
            >
              {group.name.toUpperCase()}
            </Chip>
          ))}
        </div>
        {available.length === 0 && (
          <p className="text-sm text-ink/45">
            Every muscle group is already on this day.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

/** Exercise picker (fig 2.6): pre-filtered to the slot's muscle group. */
function ExercisePicker({
  target,
  mesoId,
  exercises,
  onClose,
  onCommit,
}: {
  target: PickerTarget | null;
  mesoId: string;
  exercises: PickerExerciseLite[];
  onClose: () => void;
  onCommit: (fn: () => Promise<void>) => void;
}) {
  const [search, setSearch] = useState("");
  const [sets, setSets] = useState(3);

  const candidates = useMemo(() => {
    if (!target) return [];
    const q = search.trim().toLowerCase();
    return exercises
      .filter((e) => e.muscle_group_ids.includes(target.group.muscle_group_id))
      .filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [exercises, target, search]);

  if (!target) return null;

  return (
    <BottomSheet
      open
      onClose={() => {
        setSearch("");
        onClose();
      }}
      title="pick exercise"
      subtitle={`${target.group.muscle_group.toUpperCase()} · SLOT ${target.slotNumber}`}
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Exercise name"
        />
        <div className="flex items-center justify-between">
          <span className="label-caps text-[10px] font-semibold text-ink/55">
            START SETS
          </span>
          <NumberStepper value={sets} min={1} max={10} onChange={setSets} />
        </div>
        <div className="flex max-h-[40dvh] flex-col overflow-y-auto">
          {candidates.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                onCommit(() =>
                  fillSlotAction({
                    meso_id: mesoId,
                    group_id: target.group.id,
                    slot_number: target.slotNumber,
                    exercise_id: e.id,
                    initial_sets: sets,
                  }),
                );
                setSearch("");
                onClose();
              }}
              className="flex min-h-12 items-center justify-between border-b border-ink/15 py-2 text-left"
            >
              <span>
                <span className="block text-sm font-semibold">{e.name}</span>
                <span className="label-caps text-[9px] font-medium text-ink/45">
                  {e.equipment_type.toUpperCase()}
                </span>
              </span>
              <span className="label-caps text-right text-[9px] font-medium text-ink/45">
                {e.last_performed_at ? (
                  <>
                    LAST {e.last_performed_at.slice(0, 10)}
                    {e.best_weight != null && (
                      <span className="numeral block">
                        {e.best_weight} × {e.best_reps}
                      </span>
                    )}
                  </>
                ) : (
                  "NEVER LOGGED"
                )}
              </span>
            </button>
          ))}
          {candidates.length === 0 && (
            <p className="py-4 text-sm text-ink/45">No matches.</p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

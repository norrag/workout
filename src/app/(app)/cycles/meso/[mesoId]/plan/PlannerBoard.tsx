"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
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

export interface MacroContext {
  label: string;
  slots: { state: "filled" | "this" | "open" }[];
}

export interface PickerExerciseLite {
  id: string;
  name: string;
  equipment_type: string;
  last_performed_at: string | null;
  best_weight: number | null;
  best_reps: number | null;
  muscle_group_ids: string[];
}

type PickerTarget = { group: PlannedGroup; slotNumber: number; day: PlannedDay };
type Commit = (fn: () => Promise<void>) => void;

function badge(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function dayTabLabel(day: PlannedDay): string {
  return day.weekday
    ? (WEEKDAYS.find((w) => w.value === day.weekday)?.label ?? `D${day.day_number}`)
    : `DAY ${day.day_number}`;
}

function shortDate(iso: string): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.getDate()} ${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/** Planner board (figs 2.4/2.5/2.6). */
export function PlannerBoard({
  plan,
  macroContext,
  muscleGroups,
  exercises,
}: {
  plan: MesoPlan;
  macroContext: MacroContext | null;
  muscleGroups: MuscleGroupRow[];
  exercises: PickerExerciseLite[];
}) {
  const { meso, days } = plan;
  const router = useRouter();
  const [activeDayId, setActiveDayId] = useState<string | null>(
    days[0]?.id ?? null,
  );
  const [daySetup, setDaySetup] = useState<PlannedDay | "new" | null>(
    days.length === 0 ? "new" : null,
  );
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [, startTransition] = useTransition();
  const commit: Commit = (fn) => startTransition(fn);

  useEffect(() => {
    if (!days.some((d) => d.id === activeDayId)) {
      setActiveDayId(days[0]?.id ?? null);
    }
  }, [days, activeDayId]);

  const activeDay = days.find((d) => d.id === activeDayId) ?? null;
  const totalSlots = activeDay
    ? activeDay.groups.reduce((n, g) => n + g.exercise_slots, 0)
    : 0;
  const pickedSlots = activeDay
    ? activeDay.groups.reduce((n, g) => n + g.fills.length, 0)
    : 0;
  const daySets = activeDay
    ? activeDay.groups.reduce(
        (n, g) => n + g.fills.reduce((s, f) => s + f.initial_sets, 0),
        0,
      )
    : 0;

  return (
    <div>
      {/* macro context strip */}
      {macroContext && (
        <div className="mt-3 flex items-center justify-between border border-ink/35 px-3 py-2">
          <div className="text-[9px] font-bold tracking-[0.12em]">
            {macroContext.label}
          </div>
          <div className="flex items-center gap-[3px]">
            {macroContext.slots.map((slot, i) => (
              <div
                key={i}
                className={`h-2 w-3.5 ${
                  slot.state === "filled"
                    ? "bg-ink"
                    : slot.state === "this"
                      ? "border-[1.5px] border-accent"
                      : "border border-dashed border-ink/40"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* day tabs */}
      <div className="mt-4 flex border-[1.5px] border-ink">
        {days.map((day, i) => {
          const active = day.id === activeDayId;
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => setActiveDayId(day.id)}
              className={`flex-1 py-[11px] text-center text-[11px] tracking-[0.08em] ${
                active
                  ? "bg-ink font-bold text-bg-base"
                  : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
              }`}
            >
              {dayTabLabel(day)}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="add day"
          onClick={() => setDaySetup("new")}
          className={`flex-[0_0_40px] py-[9px] text-center text-sm font-semibold text-ink/60 ${days.length > 0 ? "border-l border-ink/25" : ""}`}
        >
          +
        </button>
      </div>

      {activeDay && (
        <>
          <div className="mt-2 flex items-center justify-between text-[9px] font-semibold tracking-[0.1em] text-ink/55">
            <span>
              {dayTabLabel(activeDay)}
              {activeDay.label ? ` "${activeDay.label.toUpperCase()}"` : ""} —{" "}
              <span className="numeral">{pickedSlots}</span> OF{" "}
              <span className="numeral">{totalSlots}</span> PICKED ·{" "}
              <span className="numeral">{daySets}</span> SETS
            </span>
            <button
              type="button"
              onClick={() => setDaySetup(activeDay)}
              className="font-bold text-ink underline underline-offset-2"
            >
              ✎ DAY SETUP
            </button>
          </div>

          {/* day board — groups with slots */}
          <div className="mt-3">
            {activeDay.groups.map((group) => (
              <div key={group.id} className="mt-3 first:mt-0">
                <div className="flex items-center gap-2 border-b-[1.5px] border-ink py-1.5">
                  <div className="flex h-[22px] w-[22px] items-center justify-center border-[1.5px] border-ink text-[9px] font-extrabold">
                    {badge(group.muscle_group)}
                  </div>
                  <div className="flex-1 text-[10px] font-extrabold tracking-[0.14em]">
                    {group.muscle_group.toUpperCase()} —{" "}
                    <span className="numeral">{group.exercise_slots}</span>{" "}
                    {group.exercise_slots === 1 ? "EXERCISE" : "EXERCISES"}
                  </div>
                  <div className="text-[9px] font-semibold tracking-[0.1em] text-ink/50">
                    <span className="numeral">
                      {group.fills.reduce((s, f) => s + f.initial_sets, 0)}
                    </span>{" "}
                    SETS
                  </div>
                </div>
                {Array.from({ length: group.exercise_slots }, (_, i) => {
                  const slotNumber = i + 1;
                  const fill = group.fills.find(
                    (f) => f.slot_number === slotNumber,
                  );
                  return fill ? (
                    <div
                      key={slotNumber}
                      className="flex items-center gap-3 border-b border-ink/[0.18] py-2.5 pl-1.5 last:border-b-0"
                    >
                      <div className="text-[13px] tracking-[-1px] text-ink/35">
                        ⋮⋮
                      </div>
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() =>
                          setPicker({ group, slotNumber, day: activeDay })
                        }
                      >
                        <div className="text-[15px] font-semibold">
                          {fill.exercise_name}
                        </div>
                        <div className="mt-[3px] text-[9px] font-semibold tracking-[0.12em] text-ink/55">
                          {exercises
                            .find((e) => e.id === fill.exercise_id)
                            ?.equipment_type.toUpperCase() ?? ""}{" "}
                          · START <span className="numeral">{fill.initial_sets}</span> SETS
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={`remove ${fill.exercise_name}`}
                        onClick={() =>
                          commit(() =>
                            clearSlotAction({
                              meso_id: meso.id,
                              meso_exercise_id: fill.id,
                            }),
                          )
                        }
                        className="px-1 text-[13px] text-ink/40"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      key={slotNumber}
                      type="button"
                      onClick={() =>
                        setPicker({ group, slotNumber, day: activeDay })
                      }
                      className="mt-2 flex w-full items-center gap-3 border-[1.5px] border-dashed border-ink/50 px-2.5 py-2.5 text-left"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-ink/60">
                          Slot <span className="numeral">{slotNumber}</span> — pick exercise
                        </div>
                        <div className="mt-[3px] text-[9px] font-semibold tracking-[0.12em] text-ink/45">
                          PICKER FILTERED TO {group.muscle_group.toUpperCase()}
                        </div>
                      </div>
                      <div className="text-[15px] font-bold">›</div>
                    </button>
                  );
                })}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setDaySetup(activeDay)}
              className="mt-3.5 w-full border-[1.5px] border-dashed border-ink/45 py-[13px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
            >
              + ADD MUSCLE GROUP
            </button>
          </div>
        </>
      )}

      {!activeDay && days.length === 0 && (
        <p className="mt-5 text-sm text-ink/60">
          Add a training day to start planning.
        </p>
      )}

      <button
        type="button"
        onClick={() => router.push(`/cycles/meso/${meso.id}`)}
        className="mt-6 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base"
      >
        {meso.status === "planned" ? "DONE — REVIEW MESO" : "DONE"}
      </button>

      <DaySetupSheet
        key={daySetup === "new" ? "new" : (daySetup?.id ?? "closed")}
        target={daySetup}
        days={days}
        mesoId={meso.id}
        muscleGroups={muscleGroups}
        onClose={() => setDaySetup(null)}
        commit={commit}
      />
      <ExercisePicker
        target={picker}
        mesoId={meso.id}
        exercises={exercises}
        onClose={() => setPicker(null)}
        commit={commit}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// day setup sheet (fig 2.5): label, weekday, week start, groups & counts
// ---------------------------------------------------------------------------

function DaySetupSheet({
  target,
  days,
  mesoId,
  muscleGroups,
  onClose,
  commit,
}: {
  target: PlannedDay | "new" | null;
  days: PlannedDay[];
  mesoId: string;
  muscleGroups: MuscleGroupRow[];
  onClose: () => void;
  commit: Commit;
}) {
  const isNew = target === "new";
  const day = isNew || target === null ? null : target;
  const [label, setLabel] = useState(day?.label ?? "");
  const [weekday, setWeekday] = useState<number | null>(day?.weekday ?? null);
  const [weekStartsHere, setWeekStartsHere] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);

  if (target === null) return null;

  const taken = new Set(day?.groups.map((g) => g.muscle_group_id) ?? []);
  const available = muscleGroups.filter((g) => !taken.has(g.id));

  const save = () => {
    const value = { label: label.trim() || null, weekday };
    commit(async () => {
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

  const stepBtn =
    "flex h-9 w-9 items-center justify-center border-[1.5px] border-ink text-[17px] font-semibold";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={isNew ? "Add day" : "Day setup"}
      subtitle={
        isNew
          ? `DAY ${days.length + 1} OF ${days.length + 1}`
          : `${day?.weekday ? (WEEKDAYS.find((w) => w.value === day.weekday)?.label ?? "") : ""} — DAY ${day?.day_number} OF ${days.length}`
      }
    >
      <div className="flex gap-2.5">
        <div className="flex-1">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            LABEL
          </div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            placeholder="e.g. Lower A"
            className="mt-[7px] h-11 w-full border-[1.5px] border-ink bg-paper px-3 text-sm font-semibold text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </div>
        <div className="w-[110px]">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            WEEKDAY
          </div>
          <select
            value={weekday ?? ""}
            onChange={(e) =>
              setWeekday(e.target.value ? Number(e.target.value) : null)
            }
            className="mt-[7px] h-11 w-full appearance-none border-[1.5px] border-ink bg-bg-base px-3 text-sm font-bold text-ink focus:outline-none"
          >
            <option value="">—</option>
            {WEEKDAYS.map((wd) => (
              <option key={wd.value} value={wd.value}>
                {wd.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWeekStartsHere((v) => !v)}
          disabled={weekday === null}
          className="flex items-center gap-2 disabled:opacity-40"
        >
          <div
            className={`flex h-[18px] w-[18px] items-center justify-center text-[11px] ${
              weekStartsHere
                ? "bg-ink text-bg-base"
                : "border-[1.5px] border-ink/40"
            }`}
          >
            {weekStartsHere ? "✓" : ""}
          </div>
          <span className="text-xs font-semibold">Week starts on this day</span>
        </button>
        {!isNew && day && (
          <button
            type="button"
            onClick={() => {
              commit(() =>
                removeDayAction({ day_id: day.id, meso_id: mesoId }),
              );
              onClose();
            }}
            className="text-[11px] font-bold text-accent"
          >
            Remove day
          </button>
        )}
      </div>

      {!isNew && day && (
        <>
          <div className="mt-5 border-b-[1.5px] border-ink pb-[7px] text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            MUSCLE GROUPS — EXERCISES PER GROUP
          </div>
          {day.groups.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-2.5 border-b border-ink/15 py-2"
            >
              <div className="flex h-[22px] w-[22px] items-center justify-center border-[1.5px] border-ink text-[9px] font-extrabold">
                {badge(group.muscle_group)}
              </div>
              <div className="flex-1 text-sm font-bold">
                {group.muscle_group}
              </div>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label={`fewer ${group.muscle_group} exercises`}
                  className={stepBtn}
                  onClick={() =>
                    group.exercise_slots > 1 &&
                    commit(() =>
                      updateGroupAction({
                        group_id: group.id,
                        meso_id: mesoId,
                        exercise_slots: group.exercise_slots - 1,
                      }),
                    )
                  }
                >
                  −
                </button>
                <div className="numeral flex h-9 w-[38px] items-center justify-center border-y-[1.5px] border-ink text-[15px] font-extrabold">
                  {group.exercise_slots}
                </div>
                <button
                  type="button"
                  aria-label={`more ${group.muscle_group} exercises`}
                  className={stepBtn}
                  onClick={() =>
                    group.exercise_slots < 10 &&
                    commit(() =>
                      updateGroupAction({
                        group_id: group.id,
                        meso_id: mesoId,
                        exercise_slots: group.exercise_slots + 1,
                      }),
                    )
                  }
                >
                  +
                </button>
              </div>
              <button
                type="button"
                aria-label={`remove ${group.muscle_group}`}
                onClick={() =>
                  commit(() =>
                    removeGroupAction({ group_id: group.id, meso_id: mesoId }),
                  )
                }
                className="px-1 text-xs text-ink/40"
              >
                ✕
              </button>
            </div>
          ))}

          {addingGroup ? (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {available.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    commit(() =>
                      addGroupAction({
                        day_id: day.id,
                        meso_id: mesoId,
                        muscle_group_id: g.id,
                        exercise_slots: 1,
                      }),
                    );
                    setAddingGroup(false);
                  }}
                  className="border border-ink/40 px-2 py-2.5 text-[10px] font-semibold tracking-[0.1em]"
                >
                  {g.name.toUpperCase()}
                </button>
              ))}
              {available.length === 0 && (
                <p className="col-span-2 text-sm text-ink/45">
                  Every muscle group is already on this day.
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingGroup(true)}
              className="mt-3 w-full border-[1.5px] border-dashed border-ink/45 py-[11px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
            >
              + ADD MUSCLE GROUP
            </button>
          )}
          <p className="mt-3 text-[11px] leading-normal text-ink/60">
            Slots are created for each group — you&apos;ll pick the exact
            exercises on the board next.
          </p>
        </>
      )}

      <div className="mt-4 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base"
        >
          DONE
        </button>
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// exercise picker (fig 2.6): pre-filtered, select then add
// ---------------------------------------------------------------------------

function ExercisePicker({
  target,
  mesoId,
  exercises,
  onClose,
  commit,
}: {
  target: PickerTarget | null;
  mesoId: string;
  exercises: PickerExerciseLite[];
  onClose: () => void;
  commit: Commit;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const candidates = useMemo(() => {
    if (!target) return [];
    const q = search.trim().toLowerCase();
    return exercises
      .filter((e) => e.muscle_group_ids.includes(target.group.muscle_group_id))
      .filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [exercises, target, search]);

  if (!target) return null;
  const selected = candidates.find((e) => e.id === selectedId) ?? null;
  const dayName = `${dayTabLabel(target.day)}${target.day.label ? ` — ${target.day.label.toUpperCase()}` : ""}`;

  const close = () => {
    setSearch("");
    setSelectedId(null);
    onClose();
  };

  return (
    <BottomSheet
      open
      onClose={close}
      title="Pick exercise"
      subtitle={`${target.group.muscle_group.toUpperCase()} — SLOT ${target.slotNumber} · ${dayName}`}
    >
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-[42px] flex-1 border-[1.5px] border-ink bg-paper px-3 text-[13px] text-ink placeholder:text-ink/45 focus:outline-none"
        />
        <div className="flex h-[42px] items-center bg-ink px-3 text-[10px] font-bold tracking-[0.1em] text-bg-base">
          {target.group.muscle_group.toUpperCase()}
        </div>
      </div>

      <div className="mt-3.5 max-h-[42dvh] overflow-y-auto">
        {selected && (
          <div className="border-2 border-accent px-3.5 py-3">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold">{selected.name}</div>
              <div className="text-[9px] font-bold tracking-[0.12em] text-accent">
                SELECTED
              </div>
            </div>
            <div className="mt-1 text-[10px] font-medium tracking-[0.1em] text-ink/55">
              {selected.equipment_type.toUpperCase()}
              {selected.last_performed_at
                ? ` · LAST PERFORMED ${shortDate(selected.last_performed_at)}`
                : " · NEVER PERFORMED"}
            </div>
            {selected.best_weight != null && (
              <div className="mt-2.5 flex items-baseline justify-between border-t border-ink/[0.18] pt-2">
                <div className="numeral text-[13px] font-bold">
                  {selected.best_weight} lb{" "}
                  <span className="font-normal text-ink/50">×</span>{" "}
                  {selected.best_reps}
                </div>
                <div className="text-[9px] font-semibold tracking-[0.1em] text-ink/55">
                  ALL-TIME BEST
                </div>
              </div>
            )}
          </div>
        )}
        {candidates
          .filter((e) => e.id !== selectedId)
          .map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelectedId(e.id)}
              className="flex w-full items-center justify-between border-b border-ink/[0.18] px-0.5 py-[13px] text-left"
            >
              <div>
                <div className="text-[15px] font-bold">{e.name}</div>
                <div className="mt-[3px] text-[9.5px] font-medium tracking-[0.1em] text-ink/55">
                  {e.equipment_type.toUpperCase()} ·{" "}
                  {e.last_performed_at
                    ? `LAST ${shortDate(e.last_performed_at)}`
                    : "NEVER PERFORMED"}
                </div>
              </div>
              <div className="text-[15px] text-ink/40">›</div>
            </button>
          ))}
        {candidates.length === 0 && (
          <p className="py-4 text-sm text-ink/45">No matches.</p>
        )}
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          commit(() =>
            fillSlotAction({
              meso_id: mesoId,
              group_id: target.group.id,
              slot_number: target.slotNumber,
              exercise_id: selected.id,
              initial_sets: 3,
            }),
          );
          close();
        }}
        className="mt-4 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.1em] text-bg-base disabled:opacity-40"
      >
        ADD TO {dayName}
      </button>
    </BottomSheet>
  );
}

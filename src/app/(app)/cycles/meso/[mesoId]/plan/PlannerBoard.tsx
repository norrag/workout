"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PencilGlyph } from "@/components/ui/PencilGlyph";
import { HistorySheet } from "@/components/HistorySheet";
import type { MesoPlan, PlannedDay } from "@/lib/queries/cycles";
import type { MuscleGroupRow } from "@/lib/types/database";
import { groupByRegion, moveInOrder, planGroupExercises } from "@/lib/planner/groups";
import {
  addDayAction,
  addGroupsAction,
  clearSlotAction,
  discardDraftAction,
  finalizeMesoAction,
  removeDayAction,
  removeGroupAction,
  reorderDayExercisesAction,
  reorderDayGroupsAction,
  saveMesoAsTemplateAction,
  saveMesoPlanAction,
  setGroupExercisesAction,
  updateDayAction,
  updateGroupAction,
  type FormState,
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

// View types the board renders from. `PlannedDay` (props) is structurally a
// superset, so live data flows straight in; the staged working copy uses the
// same shape with synthetic ids for not-yet-saved days/groups/fills.
interface ViewFill {
  id: string;
  exercise_id: string;
  exercise_name: string;
  initial_sets: number;
  slot_number: number;
  /** day-level order across all groups (#2 flat list) */
  day_position: number;
}
interface ViewGroup {
  id: string;
  muscle_group: string;
  muscle_group_id: string;
  exercise_slots: number;
  fills: ViewFill[];
}
interface ViewDay {
  id: string;
  day_number: number;
  label: string | null;
  weekday: number | null;
  groups: ViewGroup[];
}

type PickerTarget = { group: ViewGroup; day: ViewDay };
type Commit = (fn: () => Promise<void>) => void;

function tmpId(): string {
  return `tmp-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
}

/** Append an optimistic, not-yet-revalidated day so a sheet opened right after
 *  a live insert (draft path) has its backing day immediately — bridges the
 *  addDay→revalidate gap that left the day-setup sheet without a day. */
function withPending(base: ViewDay[], pending: ViewDay | null): ViewDay[] {
  if (!pending || base.some((d) => d.id === pending.id)) return base;
  return [...base, pending];
}

function toWorkDays(days: PlannedDay[]): ViewDay[] {
  return days.map((d) => {
    // flat day order across groups (#2): sort every fill by stored day-level
    // position, breaking ties by group order then group-local slot (so legacy
    // rows where position mirrored slot_number stay group-clustered).
    const dayPosById = new Map<string, number>();
    d.groups
      .flatMap((g, gi) =>
        g.fills.map((f, si) => ({
          id: f.id,
          pos: f.position ?? 0,
          gi,
          slot: f.slot_number ?? si + 1,
        })),
      )
      .sort((a, b) => a.pos - b.pos || a.gi - b.gi || a.slot - b.slot)
      .forEach((x, idx) => dayPosById.set(x.id, idx + 1));

    return {
      id: d.id,
      day_number: d.day_number,
      label: d.label,
      weekday: d.weekday,
      groups: d.groups.map((g) => ({
        id: g.id,
        muscle_group: g.muscle_group,
        muscle_group_id: g.muscle_group_id,
        exercise_slots: g.exercise_slots,
        fills: g.fills.map((f, i) => ({
          id: f.id,
          exercise_id: f.exercise_id,
          exercise_name: f.exercise_name,
          initial_sets: f.initial_sets,
          slot_number: f.slot_number ?? i + 1,
          day_position: dayPosById.get(f.id) ?? i + 1,
        })),
      })),
    };
  });
}

/** All of a day's filled exercises in flat day order (across groups). */
function flatDayFills(day: ViewDay): { fill: ViewFill; group: ViewGroup }[] {
  return day.groups
    .flatMap((g) => g.fills.map((f) => ({ fill: f, group: g })))
    .sort((a, b) => a.fill.day_position - b.fill.day_position);
}

function badge(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function dayTabLabel(day: ViewDay): string {
  return day.weekday
    ? (WEEKDAYS.find((w) => w.value === day.weekday)?.label ?? `D${day.day_number}`)
    : `DAY ${day.day_number}`;
}

/** First unused weekday, Monday-first (weeks start Monday). Falls back to Mon. */
function nextWeekday(used: (number | null)[]): number {
  const taken = new Set(used.filter((w): w is number => w != null));
  for (let d = 1; d <= 7; d++) if (!taken.has(d)) return d;
  return 1;
}

// A week has 7 days, so the plan caps at 7 training days (DB checks enforce
// day_number ≤ 7 and days_per_week ≤ 7).
const MAX_DAYS = 7;

/** Smallest unused day number in 1..7 — not max+1, so removals don't push a
 *  later add past the day_number ≤ 7 check. Returns null when the week is full. */
function nextDayNumber(used: number[]): number | null {
  const taken = new Set(used);
  for (let n = 1; n <= MAX_DAYS; n++) if (!taken.has(n)) return n;
  return null;
}

function shortDate(iso: string): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.getDate()} ${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/** Planner board (figs 2.4/2.5/2.6b/2.7).
 *
 * Drafts edit **live** (build then CREATE MESOCYCLE). Editing a non-draft meso
 * (planned/active) stages changes in a local working copy — nothing is written
 * until SAVE CHANGES; CANCEL discards. */
export function PlannerBoard({
  plan,
  macroContext,
  muscleGroups,
  exercises,
  hasHistory = false,
  initialDayNumber = null,
}: {
  plan: MesoPlan;
  macroContext: MacroContext | null;
  muscleGroups: MuscleGroupRow[];
  exercises: PickerExerciseLite[];
  hasHistory?: boolean;
  /** deep-link a specific day (e.g. from the Day View "Edit day") */
  initialDayNumber?: number | null;
}) {
  const { meso } = plan;
  const editing = meso.status !== "draft";
  const router = useRouter();

  // staged working copy (editing mode). Initialised once from props; in editing
  // mode no server action runs mid-edit, so props won't change underneath it.
  const [workDays, setWorkDays] = useState<ViewDay[]>(() => toWorkDays(plan.days));
  const [dirty, setDirty] = useState(false);
  // optimistic bridge for the draft (live) path — see withPending
  const [pendingDay, setPendingDay] = useState<ViewDay | null>(null);

  const days: ViewDay[] = editing
    ? workDays
    : withPending(toWorkDays(plan.days), pendingDay);

  const [activeDayId, setActiveDayId] = useState<string | null>(
    (initialDayNumber != null
      ? days.find((d) => d.day_number === initialDayNumber)?.id
      : null) ??
      days[0]?.id ??
      null,
  );
  const [daySetupId, setDaySetupId] = useState<string | null>(null);
  // a just-added day not yet confirmed via DONE — cancelling the sheet rolls it
  // back (so the day-tab `+` → cancel doesn't leave an orphan day).
  const [pendingNewDayId, setPendingNewDayId] = useState<string | null>(null);
  const [addGroupsDayId, setAddGroupsDayId] = useState<string | null>(null);
  // whether closing the group picker should return to the day sheet (only when
  // it was opened from there, not from the board's own + ADD MUSCLE GROUP).
  const [returnToDaySheet, setReturnToDaySheet] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [, startTransition] = useTransition();
  const commit: Commit = (fn) => startTransition(fn);

  // ----- mutators -----------------------------------------------------------
  const atDayLimit = days.length >= MAX_DAYS;

  const addDay = () => {
    if (atDayLimit) return;
    if (editing) {
      const dayNumber = nextDayNumber(workDays.map((d) => d.day_number));
      if (dayNumber == null) return;
      const id = tmpId();
      setWorkDays((ds) => [
        ...ds,
        {
          id,
          day_number: dayNumber,
          label: null,
          weekday: nextWeekday(ds.map((d) => d.weekday)),
          groups: [],
        },
      ]);
      setActiveDayId(id);
      setPendingNewDayId(id);
      setDaySetupId(id);
      setDirty(true);
      return;
    }
    const weekday = nextWeekday(days.map((d) => d.weekday));
    commit(async () => {
      const created = await addDayAction({ meso_id: meso.id, label: null, weekday });
      // render the day-setup sheet immediately from the returned row instead of
      // waiting on revalidation (the documented add-day "won't dismiss" gap).
      setPendingDay({
        id: created.id,
        day_number: created.day_number,
        label: created.label,
        weekday: created.weekday,
        groups: [],
      });
      setActiveDayId(created.id);
      setPendingNewDayId(created.id);
      setDaySetupId(created.id);
    });
  };

  const saveDay = (dayId: string, label: string | null, weekday: number | null) => {
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => (d.id === dayId ? { ...d, label, weekday } : d)),
      );
      setDirty(true);
      return;
    }
    commit(() => updateDayAction({ day_id: dayId, meso_id: meso.id, label, weekday }));
  };

  const removeDay = (dayId: string) => {
    // clear the optimistic ghost if we're removing the not-yet-revalidated day
    if (pendingDay?.id === dayId) setPendingDay(null);
    if (editing) {
      setWorkDays((ds) => ds.filter((d) => d.id !== dayId));
      setDirty(true);
      return;
    }
    commit(() => removeDayAction({ day_id: dayId, meso_id: meso.id }));
  };

  const addGroups = (dayId: string, ids: string[]) => {
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => {
          if (d.id !== dayId) return d;
          const fresh = ids
            .filter((id) => !d.groups.some((g) => g.muscle_group_id === id))
            .map((id) => ({
              id: tmpId(),
              muscle_group: muscleGroups.find((m) => m.id === id)?.name ?? "",
              muscle_group_id: id,
              exercise_slots: 1,
              fills: [],
            }));
          return { ...d, groups: [...d.groups, ...fresh] };
        }),
      );
      setDirty(true);
      return;
    }
    commit(() =>
      addGroupsAction({ day_id: dayId, meso_id: meso.id, muscle_group_ids: ids }),
    );
  };

  const updateGroupSlots = (groupId: string, slots: number) => {
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => ({
          ...d,
          groups: d.groups.map((g) =>
            g.id === groupId ? { ...g, exercise_slots: slots } : g,
          ),
        })),
      );
      setDirty(true);
      return;
    }
    commit(() =>
      updateGroupAction({ group_id: groupId, meso_id: meso.id, exercise_slots: slots }),
    );
  };

  const removeGroup = (groupId: string) => {
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== groupId) })),
      );
      setDirty(true);
      return;
    }
    commit(() => removeGroupAction({ group_id: groupId, meso_id: meso.id }));
  };

  const setGroupExercises = (groupId: string, exerciseIds: string[]) => {
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => {
          if (!d.groups.some((g) => g.id === groupId)) return d;
          // newly added exercises append after the day's current last position;
          // retained ones keep their day order (matched by exercise id).
          let nextDayPos = Math.max(
            0,
            ...d.groups.flatMap((g) => g.fills.map((f) => f.day_position)),
          );
          return {
            ...d,
            groups: d.groups.map((g) => {
              if (g.id !== groupId) return g;
              const prevByExercise = new Map(
                g.fills.map((f) => [f.exercise_id, f]),
              );
              const layout = planGroupExercises(
                g.fills.map((f) => ({
                  exercise_id: f.exercise_id,
                  initial_sets: f.initial_sets,
                })),
                exerciseIds,
                3,
              );
              return {
                ...g,
                // keep the configured slot count — picking fewer than the slots
                // leaves the rest open rather than shrinking the group.
                exercise_slots: Math.max(layout.length, g.exercise_slots),
                fills: layout.map((l) => {
                  const prev = prevByExercise.get(l.exercise_id);
                  return {
                    id: prev?.id ?? tmpId(),
                    exercise_id: l.exercise_id,
                    exercise_name:
                      exercises.find((e) => e.id === l.exercise_id)?.name ?? "",
                    initial_sets: l.initial_sets,
                    slot_number: l.slot_number,
                    day_position: prev?.day_position ?? ++nextDayPos,
                  };
                }),
              };
            }),
          };
        }),
      );
      setDirty(true);
      return;
    }
    commit(() =>
      setGroupExercisesAction({ meso_id: meso.id, group_id: groupId, exercise_ids: exerciseIds }),
    );
  };

  // reorder a muscle group within its day (−1 up / +1 down). Staged in editing
  // mode; a live position rewrite on a draft.
  const moveGroup = (dayId: string, groupId: string, delta: number) => {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;
    const ids = day.groups.map((g) => g.id);
    const ordered = moveInOrder(ids, groupId, delta);
    if (ordered === ids) return;
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => {
          if (d.id !== dayId) return d;
          const byId = new Map(d.groups.map((g) => [g.id, g]));
          return { ...d, groups: ordered.map((id) => byId.get(id)!) };
        }),
      );
      setDirty(true);
      return;
    }
    commit(() =>
      reorderDayGroupsAction({
        meso_id: meso.id,
        day_id: dayId,
        ordered_group_ids: ordered,
      }),
    );
  };

  // reorder an exercise anywhere in the day, across muscle groups (#2 flat list).
  const moveDayExercise = (dayId: string, fillId: string, delta: number) => {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;
    const orderedFills = flatDayFills(day).map((x) => x.fill.id);
    const ordered = moveInOrder(orderedFills, fillId, delta);
    if (ordered === orderedFills) return;
    const posById = new Map(ordered.map((id, i) => [id, i + 1]));
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) =>
          d.id !== dayId
            ? d
            : {
                ...d,
                groups: d.groups.map((g) => ({
                  ...g,
                  fills: g.fills.map((f) => ({
                    ...f,
                    day_position: posById.get(f.id) ?? f.day_position,
                  })),
                })),
              },
        ),
      );
      setDirty(true);
      return;
    }
    commit(() =>
      reorderDayExercisesAction({
        meso_id: meso.id,
        day_id: dayId,
        ordered_fill_ids: ordered,
      }),
    );
  };

  const clearFill = (groupId: string, fill: ViewFill) => {
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => ({
          ...d,
          groups: d.groups.map((g) =>
            g.id === groupId
              ? { ...g, fills: g.fills.filter((f) => f.id !== fill.id) }
              : g,
          ),
        })),
      );
      setDirty(true);
      return;
    }
    commit(() =>
      clearSlotAction({ meso_id: meso.id, meso_exercise_id: fill.id }),
    );
  };

  // ----- day-setup sheet flow ----------------------------------------------
  // Single sheet at a time: opening the muscle-group picker closes the day
  // sheet (so they never stack/double-render); closing the picker reopens it.

  /** DONE on the day sheet: persist label/weekday, confirm the day. */
  const confirmDaySheet = (
    dayId: string,
    label: string | null,
    weekday: number | null,
  ) => {
    saveDay(dayId, label, weekday);
    setPendingNewDayId(null);
    setDaySetupId(null);
  };

  /** Cancel/✕/scrim on the day sheet: roll back a never-confirmed new day. */
  const cancelDaySheet = (dayId: string) => {
    setDaySetupId(null);
    if (dayId === pendingNewDayId) {
      setPendingNewDayId(null);
      removeDay(dayId);
    }
  };

  const removeDayFromSheet = (dayId: string) => {
    setDaySetupId(null);
    setPendingNewDayId(null);
    removeDay(dayId);
  };

  /** + ADD MUSCLE GROUP from the day sheet: persist the day's label/weekday,
   *  then hand off to the picker (closing the day sheet — single sheet). */
  const openAddGroupsFromSheet = (
    dayId: string,
    label: string | null,
    weekday: number | null,
  ) => {
    saveDay(dayId, label, weekday);
    setDaySetupId(null);
    setReturnToDaySheet(true);
    setAddGroupsDayId(dayId);
  };

  /** + ADD MUSCLE GROUP on the board itself (no day sheet to return to). */
  const openAddGroupsFromBoard = (dayId: string) => {
    setReturnToDaySheet(false);
    setAddGroupsDayId(dayId);
  };

  /** Closing the picker returns to the day sheet only if opened from there. */
  const closeAddGroups = (dayId: string) => {
    setAddGroupsDayId(null);
    if (returnToDaySheet && days.some((d) => d.id === dayId)) {
      setDaySetupId(dayId);
    }
    setReturnToDaySheet(false);
  };

  const doSave = () => {
    const payload = days.map((d) => {
      // normalise the flat day order to 1..n so saved positions are clean
      const orderById = new Map(
        flatDayFills(d).map((x, i) => [x.fill.id, i + 1]),
      );
      return {
        day_number: d.day_number,
        label: d.label,
        weekday: d.weekday,
        groups: d.groups.map((g) => ({
          muscle_group_id: g.muscle_group_id,
          exercise_slots: g.exercise_slots,
          fills: g.fills.map((f) => ({
            slot_number: f.slot_number,
            exercise_id: f.exercise_id,
            initial_sets: f.initial_sets,
            day_position: orderById.get(f.id) ?? f.day_position,
          })),
        })),
      };
    });
    commit(() => saveMesoPlanAction({ meso_id: meso.id, days: payload }));
  };

  useEffect(() => {
    // drop the optimistic day once the revalidated props include it
    if (pendingDay && plan.days.some((d) => d.id === pendingDay.id)) {
      setPendingDay(null);
    }
  }, [plan.days, pendingDay]);

  useEffect(() => {
    // Don't snap the active day back to day-1 while a setup / add-groups sheet
    // is open for a day that the freshly-revalidated `days` hasn't caught up to
    // yet (live draft path) — that left the sheet pointing at a vanished day and
    // wedged it shut until a manual refresh.
    const pendingSheet = daySetupId ?? addGroupsDayId;
    if (pendingSheet && !days.some((d) => d.id === pendingSheet)) return;
    if (!days.some((d) => d.id === activeDayId)) {
      setActiveDayId(days[0]?.id ?? null);
    }
  }, [days, activeDayId, daySetupId, addGroupsDayId]);

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

  const hasExercise = days.some((d) => d.groups.some((g) => g.fills.length > 0));

  return (
    <div className={editing ? "pb-24" : undefined}>
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
      {days.length > 0 ? (
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
          {!atDayLimit && (
            <button
              type="button"
              aria-label="add day"
              onClick={addDay}
              className="flex-[0_0_40px] border-l border-ink/25 py-[9px] text-center text-sm font-semibold text-ink/60"
            >
              +
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={addDay}
          className="mt-4 w-full border-[1.5px] border-dashed border-ink/45 py-[14px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
        >
          + ADD TRAINING DAY
        </button>
      )}

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
              onClick={() => setDaySetupId(activeDay.id)}
              className="inline-flex items-center gap-1 font-bold text-ink"
            >
              <PencilGlyph size={13} />
              <span className="underline underline-offset-2">EDIT DAY</span>
            </button>
          </div>

          {/* day board — one flat, ordered list across all muscle groups (#2).
              Each row carries its muscle-group badge; ▲▼ move it anywhere in the
              day, across groups. Open slots and add-group sit below. */}
          <div className="mt-3">
            {(() => {
              const flat = flatDayFills(activeDay);
              return flat.map(({ fill, group }, idx) => (
                <div
                  key={fill.id}
                  className="flex items-center gap-3 border-b border-ink/[0.18] py-2.5 pl-0.5 last:border-b-0"
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`move ${fill.exercise_name} up`}
                      disabled={idx <= 0}
                      onClick={() => moveDayExercise(activeDay.id, fill.id, -1)}
                      className="flex h-3.5 w-5 items-center justify-center text-[9px] leading-none text-ink/50 disabled:opacity-25"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label={`move ${fill.exercise_name} down`}
                      disabled={idx >= flat.length - 1}
                      onClick={() => moveDayExercise(activeDay.id, fill.id, 1)}
                      className="flex h-3.5 w-5 items-center justify-center text-[9px] leading-none text-ink/50 disabled:opacity-25"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-[9px] font-extrabold">
                    {badge(group.muscle_group)}
                  </div>
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => setPicker({ group, day: activeDay })}
                  >
                    <div className="text-[15px] font-semibold">
                      {fill.exercise_name}
                    </div>
                    <div className="mt-[3px] text-[9px] font-semibold tracking-[0.12em] text-ink/55">
                      {group.muscle_group.toUpperCase()} ·{" "}
                      {exercises
                        .find((e) => e.id === fill.exercise_id)
                        ?.equipment_type.toUpperCase() ?? ""}{" "}
                      · START <span className="numeral">{fill.initial_sets}</span> SETS
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`remove ${fill.exercise_name}`}
                    onClick={() => clearFill(group.id, fill)}
                    className="px-1 text-[13px] text-ink/40"
                  >
                    ✕
                  </button>
                </div>
              ));
            })()}

            {/* open slots, one row per group with remaining capacity */}
            {/* one row per open slot (so a group set to N exercises shows N
                pickable rows, not a single collapsed one) */}
            {activeDay.groups.flatMap((group) => {
              const open = group.exercise_slots - group.fills.length;
              if (open <= 0) return [];
              return Array.from({ length: open }, (_, k) => (
                <button
                  key={`${group.id}-open-${k}`}
                  type="button"
                  onClick={() => setPicker({ group, day: activeDay })}
                  className="mt-2 flex w-full items-center gap-3 border-[1.5px] border-dashed border-ink/50 px-2.5 py-2.5 text-left"
                >
                  <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-[1.5px] border-dashed border-ink/45 text-[9px] font-extrabold text-ink/55">
                    {badge(group.muscle_group)}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink/60">
                      {group.muscle_group} — pick exercise
                    </div>
                    <div className="mt-[3px] text-[9px] font-semibold tracking-[0.12em] text-ink/45">
                      OPEN SLOT · {group.muscle_group.toUpperCase()}
                    </div>
                  </div>
                  <div className="text-[15px] font-bold">›</div>
                </button>
              ));
            })}

            {activeDay.groups.length === 0 && (
              <p className="text-sm text-ink/60">
                Add a muscle group to start picking exercises.
              </p>
            )}

            <button
              type="button"
              onClick={() => openAddGroupsFromBoard(activeDay.id)}
              className="mt-3.5 w-full border-[1.5px] border-dashed border-ink/45 py-[13px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
            >
              + ADD MUSCLE GROUP
            </button>
          </div>
        </>
      )}

      {!activeDay && days.length === 0 && (
        <p className="mt-4 text-sm text-ink/60">
          Add a training day to start planning the week.
        </p>
      )}

      {/* save as template (#7) — reusable split from the current plan. Saves the
          persisted plan, so stage + SAVE CHANGES first when editing a live meso. */}
      {hasExercise && (
        <form action={saveMesoAsTemplateAction} className="mt-6">
          <input type="hidden" name="meso_id" value={meso.id} />
          <button
            type="submit"
            className="w-full border-[1.5px] border-ink/40 py-3 text-center text-[11px] font-bold tracking-[0.1em] text-ink/70"
          >
            SAVE AS TEMPLATE
          </button>
        </form>
      )}

      {/* bottom action */}
      {meso.status === "draft" ? (
        <>
          <button
            type="button"
            disabled={!hasExercise}
            onClick={() => setFinalizing(true)}
            className="mt-6 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base disabled:opacity-40"
          >
            CREATE MESOCYCLE
          </button>
          {!hasExercise && (
            <p className="mt-2 text-center text-[11px] text-ink/55">
              Add at least one exercise to finish.
            </p>
          )}
          <form action={discardDraftAction} className="mt-3 text-center">
            <input type="hidden" name="meso_id" value={meso.id} />
            <button
              type="submit"
              className="text-[10px] font-bold tracking-[0.12em] text-accent"
            >
              DISCARD DRAFT
            </button>
          </form>
        </>
      ) : (
        // staged edit bar (fig 2.5): nothing is written until SAVE CHANGES
        <div className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-ink bg-bg-base px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-md items-center gap-2.5">
            <button
              type="button"
              onClick={() => (dirty ? setDiscarding(true) : router.push(`/cycles/meso/${meso.id}`))}
              className="flex-[0_0_auto] border-[1.5px] border-ink px-5 py-3.5 text-[12px] font-bold tracking-[0.1em]"
            >
              CANCEL
            </button>
            <button
              type="button"
              disabled={!dirty}
              onClick={() => setSaving(true)}
              className="flex-1 bg-ink py-3.5 text-center text-[12px] font-bold tracking-[0.1em] text-bg-base disabled:opacity-40"
            >
              {dirty ? "SAVE CHANGES" : "NO CHANGES"}
            </button>
          </div>
        </div>
      )}

      {(() => {
        const setupDay = daySetupId
          ? (days.find((d) => d.id === daySetupId) ?? null)
          : null;
        return setupDay ? (
          <DaySetupSheet
            key={setupDay.id}
            day={setupDay}
            isNew={setupDay.id === pendingNewDayId}
            onDone={(label, weekday) => confirmDaySheet(setupDay.id, label, weekday)}
            onCancel={() => cancelDaySheet(setupDay.id)}
            onRemoveDay={() => removeDayFromSheet(setupDay.id)}
            onUpdateGroupSlots={updateGroupSlots}
            onMoveGroup={(groupId, delta) => moveGroup(setupDay.id, groupId, delta)}
            onRemoveGroup={removeGroup}
            onAddGroups={(label, weekday) =>
              openAddGroupsFromSheet(setupDay.id, label, weekday)
            }
          />
        ) : null;
      })()}
      {(() => {
        const target = addGroupsDayId
          ? (days.find((d) => d.id === addGroupsDayId) ?? null)
          : null;
        return target ? (
          <AddGroupsSheet
            key={target.id}
            day={target}
            muscleGroups={muscleGroups}
            onAdd={(ids) => addGroups(target.id, ids)}
            onClose={() => closeAddGroups(target.id)}
          />
        ) : null;
      })()}
      <ExercisePicker
        target={picker}
        exercises={exercises}
        onSubmit={(ids) => picker && setGroupExercises(picker.group.id, ids)}
        onClose={() => setPicker(null)}
      />
      <FinalizeSheet
        open={finalizing}
        onClose={() => setFinalizing(false)}
        mesoId={meso.id}
        defaultName={meso.name}
        defaultWeeks={meso.weeks}
        rirStart={meso.rir_start}
        rirEnd={meso.rir_end}
        includesDeload={meso.includes_deload}
      />

      {/* save-changes confirm + immutability warning */}
      {saving && (
        <BottomSheet
          open
          onClose={() => setSaving(false)}
          title="Save changes"
          subtitle={`${meso.name.toUpperCase()} — ${meso.status.toUpperCase()}`}
        >
          {hasHistory ? (
            <div className="border-[1.5px] border-ink bg-paper px-3.5 py-3">
              <div className="text-[9px] font-bold tracking-[0.14em] text-accent">
                LOGGED HISTORY IS PROTECTED
              </div>
              <p className="mt-1.5 text-[12.5px] leading-[1.5] text-ink/75">
                Completed and in-progress workouts — and every set you&apos;ve
                already logged — won&apos;t change. These edits only affect days
                and sets that haven&apos;t been started yet (this week&apos;s
                remaining days and future weeks).
              </p>
            </div>
          ) : (
            <p className="text-[12.5px] leading-[1.5] text-ink/75">
              These edits apply to the planned, not-yet-started workouts. Future
              weeks pick them up when they&apos;re generated.
            </p>
          )}
          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setSaving(false)}
              className="px-4 py-3 text-[13px] font-semibold text-ink/60"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={doSave}
              className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base"
            >
              SAVE CHANGES
            </button>
          </div>
        </BottomSheet>
      )}

      {/* discard confirm */}
      {discarding && (
        <BottomSheet
          open
          onClose={() => setDiscarding(false)}
          title="Discard changes?"
          subtitle="UNSAVED EDITS WILL BE LOST"
        >
          <p className="text-[12.5px] leading-[1.5] text-ink/75">
            Your changes to this plan haven&apos;t been saved. Discard them and
            go back?
          </p>
          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setDiscarding(false)}
              className="px-4 py-3 text-[13px] font-semibold text-ink/60"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => router.push(`/cycles/meso/${meso.id}`)}
              className="border-[1.5px] border-accent px-8 py-3 text-[13px] font-bold tracking-[0.08em] text-accent"
            >
              DISCARD
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// create-mesocycle final stage (fig 2.8) — name + weeks; flips draft → planned
// ---------------------------------------------------------------------------

const FINALIZE_INITIAL: FormState = { error: null };

function FinalizeSheet({
  open,
  onClose,
  mesoId,
  defaultName,
  defaultWeeks,
  rirStart,
  rirEnd,
  includesDeload,
}: {
  open: boolean;
  onClose: () => void;
  mesoId: string;
  defaultName: string;
  defaultWeeks: number;
  rirStart: number;
  rirEnd: number;
  includesDeload: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    finalizeMesoAction,
    FINALIZE_INITIAL,
  );
  const [weeks, setWeeks] = useState(
    defaultWeeks >= 4 && defaultWeeks <= 8 ? defaultWeeks : 5,
  );

  if (!open) return null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Create mesocycle"
      subtitle="NAME IT AND CONFIRM THE LENGTH"
    >
      <form action={formAction}>
        <input type="hidden" name="meso_id" value={mesoId} />
        <input type="hidden" name="weeks" value={weeks} />

        <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
          NAME
        </div>
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={defaultName}
          placeholder="e.g. Jul '26 — Bulk II"
          className="mt-2 h-12 w-full border-[1.5px] border-ink bg-paper px-3.5 text-[15px] font-semibold text-ink placeholder:text-ink/40 focus:outline-none"
        />

        <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
          WEEKS — INCLUDING DELOAD
        </div>
        <div className="mt-2 flex border-[1.5px] border-ink">
          {[4, 5, 6, 7, 8].map((w, i) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeeks(w)}
              className={`numeral flex-1 py-[13px] text-center text-[15px] ${
                weeks === w
                  ? "bg-ink font-bold text-bg-base"
                  : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
              }`}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="mt-[7px] text-[10px] font-medium tracking-[0.08em] text-ink/50">
          RIR RAMP: {rirStart} → {rirEnd}
          {includesDeload ? ` · W${weeks} DELOAD AT 4 RIR` : ""}
        </div>

        {state.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
          >
            {pending ? "CREATING" : "CREATE MESOCYCLE"}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// day sheet (fig 2.5): the single combined view — weekday + label + muscle
// groups & counts for one day. All edits go through callbacks so the board
// decides whether they're staged (editing) or written live (draft).
// ---------------------------------------------------------------------------

function DaySetupSheet({
  day,
  isNew,
  onDone,
  onCancel,
  onRemoveDay,
  onUpdateGroupSlots,
  onMoveGroup,
  onRemoveGroup,
  onAddGroups,
}: {
  day: ViewDay;
  isNew: boolean;
  onDone: (label: string | null, weekday: number | null) => void;
  onCancel: () => void;
  onRemoveDay: () => void;
  onUpdateGroupSlots: (groupId: string, slots: number) => void;
  onMoveGroup: (groupId: string, delta: number) => void;
  onRemoveGroup: (groupId: string) => void;
  onAddGroups: (label: string | null, weekday: number | null) => void;
}) {
  const [label, setLabel] = useState(day.label ?? "");
  const [weekday, setWeekday] = useState<number | null>(day.weekday ?? null);

  const save = () => onDone(label.trim() || null, weekday);
  const addGroups = () => onAddGroups(label.trim() || null, weekday);

  const stepBtn =
    "flex h-9 w-9 items-center justify-center border-[1.5px] border-ink text-[17px] font-semibold";

  return (
    <BottomSheet
      open
      onClose={onCancel}
      title={`Day ${day.day_number}`}
      subtitle={`${weekday ? (WEEKDAYS.find((w) => w.value === weekday)?.label ?? "") + " · " : ""}${day.groups.length} ${day.groups.length === 1 ? "GROUP" : "GROUPS"}`}
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
            onChange={(e) => setWeekday(e.target.value ? Number(e.target.value) : null)}
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

      <div className="mt-3.5 flex justify-end">
        <button
          type="button"
          onClick={onRemoveDay}
          className="text-[11px] font-bold text-accent"
        >
          Remove day
        </button>
      </div>

      <div className="mt-5 border-b-[1.5px] border-ink pb-[7px] text-[10px] font-semibold tracking-[0.14em] text-ink/55">
        MUSCLE GROUPS — EXERCISES PER GROUP
      </div>
      {day.groups.map((group, gi) => (
        <div
          key={group.id}
          className="flex items-center gap-2.5 border-b border-ink/15 py-2"
        >
          <div className="flex flex-col">
            <button
              type="button"
              aria-label={`move ${group.muscle_group} up`}
              disabled={gi === 0}
              onClick={() => onMoveGroup(group.id, -1)}
              className="flex h-3.5 w-5 items-center justify-center text-[9px] leading-none text-ink/50 disabled:opacity-25"
            >
              ▲
            </button>
            <button
              type="button"
              aria-label={`move ${group.muscle_group} down`}
              disabled={gi === day.groups.length - 1}
              onClick={() => onMoveGroup(group.id, 1)}
              className="flex h-3.5 w-5 items-center justify-center text-[9px] leading-none text-ink/50 disabled:opacity-25"
            >
              ▼
            </button>
          </div>
          <div className="flex h-[22px] w-[22px] items-center justify-center border-[1.5px] border-ink text-[9px] font-extrabold">
            {badge(group.muscle_group)}
          </div>
          <div className="flex-1 text-sm font-bold">{group.muscle_group}</div>
          <div className="flex items-center">
            <button
              type="button"
              aria-label={`fewer ${group.muscle_group} exercises`}
              className={stepBtn}
              onClick={() =>
                group.exercise_slots > 1 &&
                onUpdateGroupSlots(group.id, group.exercise_slots - 1)
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
                onUpdateGroupSlots(group.id, group.exercise_slots + 1)
              }
            >
              +
            </button>
          </div>
          <button
            type="button"
            aria-label={`remove ${group.muscle_group}`}
            onClick={() => onRemoveGroup(group.id)}
            className="px-1 text-xs text-ink/40"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addGroups}
        className="mt-3 w-full border-[1.5px] border-dashed border-ink/45 py-[11px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
      >
        + ADD MUSCLE GROUP
      </button>
      <p className="mt-3 text-[11px] leading-normal text-ink/60">
        Slots are created for each group — you&apos;ll pick the exact exercises
        on the board next.
      </p>

      <div className="mt-4 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base"
        >
          {isNew ? "ADD DAY" : "DONE"}
        </button>
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// add muscle groups (fig 2.6b): region-grouped, multi-select. Groups already
// on the day show "IN DAY" and can't be re-added.
// ---------------------------------------------------------------------------

function AddGroupsSheet({
  day,
  muscleGroups,
  onAdd,
  onClose,
}: {
  day: ViewDay;
  muscleGroups: MuscleGroupRow[];
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const taken = useMemo(
    () => new Set(day.groups.map((g) => g.muscle_group_id)),
    [day.groups],
  );
  const sections = useMemo(() => groupByRegion(muscleGroups), [muscleGroups]);
  const q = search.trim().toLowerCase();
  const dayName = `${dayTabLabel(day)}${day.label ? ` — ${day.label.toUpperCase()}` : ""}`;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const add = () => {
    if (selected.size === 0) return;
    onAdd([...selected]);
    onClose();
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Add groups"
      subtitle={`${dayName} · ${taken.size} ALREADY IN DAY`}
    >
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search groups"
        className="h-[42px] w-full border-[1.5px] border-ink bg-paper px-3 text-[13px] text-ink placeholder:text-ink/45 focus:outline-none"
      />

      <div className="mt-3.5 max-h-[44dvh] overflow-y-auto">
        {sections.map((section) => {
          const rows = section.groups.filter(
            (g) => !q || g.name.toLowerCase().includes(q),
          );
          if (rows.length === 0) return null;
          return (
            <div key={section.region} className="mt-4 first:mt-0">
              <div className="border-b-[1.5px] border-ink pb-1.5 text-[9px] font-bold tracking-[0.16em] text-ink/50">
                {section.region}
              </div>
              {rows.map((g) => {
                const inDay = taken.has(g.id);
                const sel = selected.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={inDay}
                    onClick={() => toggle(g.id)}
                    className="flex w-full items-center gap-3 border-b border-ink/15 py-2 text-left disabled:cursor-default"
                  >
                    <div
                      className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center text-[12px] ${
                        inDay
                          ? "bg-ink/25 text-bg-base"
                          : sel
                            ? "bg-ink text-bg-base"
                            : "border-[1.5px] border-ink/40"
                      }`}
                    >
                      {inDay || sel ? "✓" : ""}
                    </div>
                    <div
                      className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-[1.5px] text-[9px] font-extrabold ${
                        inDay ? "border-ink/35 text-ink/40" : "border-ink"
                      }`}
                    >
                      {badge(g.name)}
                    </div>
                    <div
                      className={`flex-1 text-sm font-bold ${inDay ? "text-ink/40" : ""}`}
                    >
                      {g.name}
                    </div>
                    {inDay && (
                      <div className="text-[8.5px] font-bold tracking-[0.12em] text-ink/45">
                        IN DAY
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={selected.size === 0}
        onClick={add}
        className="mt-4 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.1em] text-bg-base disabled:opacity-40"
      >
        ADD {selected.size} {selected.size === 1 ? "GROUP" : "GROUPS"}
      </button>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// exercise picker (fig 2.7): pre-filtered to the group's muscle, multi-select,
// with an equipment filter; the selected exercises become the group's slots.
// ---------------------------------------------------------------------------

function ExercisePicker({
  target,
  exercises,
  onSubmit,
  onClose,
}: {
  target: PickerTarget | null;
  exercises: PickerExerciseLite[];
  onSubmit: (exerciseIds: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [equip, setEquip] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [historyFor, setHistoryFor] = useState<PickerExerciseLite | null>(null);

  const groupId = target?.group.id ?? null;

  useEffect(() => {
    if (!target) return;
    setSelected(new Set(target.group.fills.map((f) => f.exercise_id)));
    setSearch("");
    setEquip(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const groupCandidates = useMemo(() => {
    if (!target) return [];
    return exercises.filter((e) =>
      e.muscle_group_ids.includes(target.group.muscle_group_id),
    );
  }, [exercises, target]);

  const equipTypes = useMemo(
    () => [...new Set(groupCandidates.map((e) => e.equipment_type))].sort(),
    [groupCandidates],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupCandidates
      .filter((e) => !equip || e.equipment_type === equip)
      .filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [groupCandidates, equip, search]);

  if (!target) return null;
  const dayName = `${dayTabLabel(target.day)}${target.day.label ? ` — ${target.day.label.toUpperCase()}` : ""}`;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const close = () => {
    setSearch("");
    setEquip(null);
    onClose();
  };

  const save = () => {
    const orderedIds = groupCandidates
      .filter((e) => selected.has(e.id))
      .map((e) => e.id);
    onSubmit(orderedIds);
    close();
  };

  const chip =
    "flex h-8 flex-shrink-0 items-center px-3 text-[10px] font-bold tracking-[0.1em]";

  return (
    <BottomSheet
      open
      fullHeight
      onClose={close}
      title="Pick exercise"
      subtitle={`${target.group.muscle_group.toUpperCase()} · ${dayName}`}
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

      {/* equipment / machine-type filter */}
      {equipTypes.length > 1 && (
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setEquip(null)}
            className={`${chip} ${equip === null ? "bg-ink text-bg-base" : "border border-ink/40 text-ink/70"}`}
          >
            ALL
          </button>
          {equipTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEquip(equip === t ? null : t)}
              className={`${chip} ${equip === t ? "bg-ink text-bg-base" : "border border-ink/40 text-ink/70"}`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {visible.map((e) => {
          const sel = selected.has(e.id);
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 border-b border-ink/[0.18] py-[11px] last:border-b-0"
            >
              <button
                type="button"
                aria-label={`${sel ? "deselect" : "select"} ${e.name}`}
                onClick={() => toggle(e.id)}
                className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center text-[12px] ${
                  sel ? "bg-ink text-bg-base" : "border-[1.5px] border-ink/40"
                }`}
              >
                {sel ? "✓" : ""}
              </button>
              <button
                type="button"
                onClick={() => toggle(e.id)}
                className="flex-1 text-left"
              >
                <div className="text-[15px] font-bold">{e.name}</div>
                <div className="mt-[3px] text-[9.5px] font-medium tracking-[0.1em] text-ink/55">
                  {e.equipment_type.toUpperCase()} ·{" "}
                  {e.last_performed_at
                    ? `LAST ${shortDate(e.last_performed_at)}`
                    : "NEVER PERFORMED"}
                </div>
              </button>
              {e.last_performed_at && (
                <button
                  type="button"
                  aria-label={`${e.name} history`}
                  onClick={() => setHistoryFor(e)}
                  className="px-1 text-[15px] text-ink/40"
                >
                  ›
                </button>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="py-4 text-sm text-ink/45">No matches.</p>
        )}
      </div>

      <button
        type="button"
        onClick={save}
        className="mt-4 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.1em] text-bg-base"
      >
        ADD TO {dayName}
      </button>

      <HistorySheet
        target={
          historyFor
            ? {
                exercise_id: historyFor.id,
                exercise_name: historyFor.name,
                equipment_type: historyFor.equipment_type,
              }
            : null
        }
        onClose={() => setHistoryFor(null)}
      />
    </BottomSheet>
  );
}

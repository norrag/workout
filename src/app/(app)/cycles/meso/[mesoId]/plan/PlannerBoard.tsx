"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FilterBar } from "@/components/ui/FilterBar";
import { PencilGlyph } from "@/components/ui/PencilGlyph";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { InfoDot } from "@/components/ui/InfoDot";
import { RirScheduleEditor, rirSummary } from "../RirScheduleEditor";
import { useToast } from "@/components/ui/Toast";
import { useNavigationGuard } from "@/components/ui/useNavigationGuard";
import { HistorySheet } from "@/components/HistorySheet";
import type { MesoPlan, PlannedDay } from "@/lib/queries/cycles";
import type { MuscleGroupRow } from "@/lib/types/database";
import { shortDateWithYear as shortDate } from "@/lib/dates";
import { groupByRegion, moveInOrder, planGroupExercises } from "@/lib/planner/groups";
import { weeklySetsByGroup } from "@/lib/plan/volume-preview";
import type { VolumeCountingWeights } from "@/lib/engine/volume";
import {
  addDayAction,
  addGroupsAction,
  clearSlotAction,
  replaceSlotAction,
  discardDraftAction,
  finalizeMesoAction,
  removeDayAction,
  removeGroupAction,
  reorderDayExercisesAction,
  reorderDayGroupsAction,
  saveMesoAsTemplateAction,
  saveMesoPlanAction,
  setGroupExercisesAction,
  setPlanSlotRirAction,
  updateDayAction,
  updateFillSetsAction,
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

/** I12 — server-resolved inputs for the live weekly-set readout: exercise
 *  muscle roles (R14 fractional credit), the params counting weights, and the
 *  experience-scaled MEV/MRV band per muscle (resolved server-side so the
 *  params schema stays out of this chunk). */
export interface VolumePreviewData {
  rolesByExercise: Record<
    string,
    { name: string; role: "primary" | "secondary" }[]
  >;
  landmarks: Record<string, { mev: number; mrv: number }>;
  weights: VolumeCountingWeights;
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
  /** N78 (doc 21 §3) — this slot's flat target RIR for the whole block; null =
   *  the meso's weekly RIR target governs. The board only ever writes the FLAT
   *  column: it has no week axis, so a per-week assignment cannot be shown here
   *  truthfully (that lives on the day view's Effort target sheet). */
  target_rir: number | null;
  /** true when the slot carries a per-WEEK assignment instead — display only,
   *  so the sheet can say what it would replace rather than silently doing it */
  has_rir_schedule: boolean;
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

type PickerTarget = {
  group: ViewGroup;
  day: ViewDay;
  /** set = replace-in-place mode (N31): the picker swaps THIS fill's exercise
   *  (single-select, position/slot/sets kept) instead of editing the group's
   *  multi-select. Unset = fill open slots (the original add mode). */
  replaceFill?: ViewFill;
};
/** N78: the one filled row the exercise sheet is open for. */
type FillTarget = { fill: ViewFill; group: ViewGroup; day: ViewDay };
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
          target_rir: f.target_rir,
          has_rir_schedule: f.rir_schedule != null,
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

/** N78 — the row's effort line. "RIR —" (the meso's own ramp is in charge) is
 *  said out loud rather than left blank, so an assignment always reads as a
 *  departure from something (doc 21 §4.1) even where the board can't name the
 *  week's number. A per-week assignment is named, never flattened into a lie. */
function fillRirLabel(fill: ViewFill): string {
  if (fill.target_rir != null) return `RIR ${fill.target_rir}`;
  if (fill.has_rir_schedule) return "RIR BY WEEK";
  return "RIR —";
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

// doc 21 §3/§4.3 bounds for a slot's target RIR, mirrored here (as the day
// view's Effort sheet mirrors them) so this client chunk doesn't drag the
// query-layer module — and its engine imports — into the bundle for two numbers.
// The server re-validates through `planSlotEffortEdit` either way.
const SLOT_RIR_MIN = 0;
const SLOT_RIR_MAX = 30;
/** Where "set a target" starts: a mid-ramp value, one tap from anywhere useful. */
const DEFAULT_SLOT_RIR = 2;

/** Smallest unused day number in 1..7 — not max+1, so removals don't push a
 *  later add past the day_number ≤ 7 check. Returns null when the week is full. */
function nextDayNumber(used: number[]): number | null {
  const taken = new Set(used);
  for (let n = 1; n <= MAX_DAYS; n++) if (!taken.has(n)) return n;
  return null;
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
  volumePreview = null,
  hasHistory = false,
  initialDayNumber = null,
}: {
  plan: MesoPlan;
  macroContext: MacroContext | null;
  muscleGroups: MuscleGroupRow[];
  exercises: PickerExerciseLite[];
  volumePreview?: VolumePreviewData | null;
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
  const [fillSheet, setFillSheet] = useState<FillTarget | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [saving, setSaving] = useState(false);
  // discard-confirm destination: set = the sheet is open, and DISCARD leaves
  // to this href (CANCEL button, an intercepted link, or back → detail page)
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const commit: Commit = (fn) => startTransition(fn);

  const detailHref = `/cycles/meso/${meso.id}`;
  // R16: while edits are staged, any navigation (BottomNav tap, header link,
  // browser back, tab close) must confirm before the working copy is dropped
  useNavigationGuard(editing && dirty, (href) => setLeaveTo(href ?? detailHref));

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

  // N17: per-exercise starting set count — the engine's week-1 seed (set
  // progression takes over after that). Staged in editing mode; a live write
  // on a draft. Clamped 1–20 to match the schema check.
  const setFillSets = (fillId: string, sets: number) => {
    if (sets < 1 || sets > 20) return;
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => ({
          ...d,
          groups: d.groups.map((g) => ({
            ...g,
            fills: g.fills.map((f) =>
              f.id === fillId ? { ...f, initial_sets: sets } : f,
            ),
          })),
        })),
      );
      setDirty(true);
      return;
    }
    commit(() =>
      updateFillSetsAction({
        fill_id: fillId,
        meso_id: meso.id,
        initial_sets: sets,
      }),
    );
  };

  // N78: this slot's target RIR for the whole block — the doc-21 lever, reached
  // from the plan rather than mid-session. Flat only: the board has no week
  // axis, so it writes `meso_exercises.target_rir` and leaves per-week
  // schedules to the day view's Effort target sheet. Staged in editing mode
  // (committed by SAVE CHANGES with the rest of the plan), a live single-row
  // write on a draft — exactly the split `setFillSets` already uses.
  const setFillRir = (fillId: string, rir: number | null) => {
    if (rir != null && (rir < SLOT_RIR_MIN || rir > SLOT_RIR_MAX)) return;
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => ({
          ...d,
          groups: d.groups.map((g) => ({
            ...g,
            fills: g.fills.map((f) =>
              f.id === fillId
                ? // a flat value replaces any per-week schedule (the write does
                  // the same); clearing drops both
                  { ...f, target_rir: rir, has_rir_schedule: false }
                : f,
            ),
          })),
        })),
      );
      setDirty(true);
      return;
    }
    commit(async () => {
      const result = await setPlanSlotRirAction({
        meso_id: meso.id,
        meso_exercise_id: fillId,
        target_rir: rir,
      });
      if (result.error) toast(result.error);
    });
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
                    // an assignment belongs to the day-slot × EXERCISE, so a
                    // retained exercise keeps it and a new one starts clean
                    target_rir: prev?.target_rir ?? null,
                    has_rir_schedule: prev?.has_rir_schedule ?? false,
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

  // N31: substitute one filled slot's exercise in place — the fill keeps its
  // id (staged), day position, group slot, and starting sets; only the
  // movement changes. Staged in editing mode; a live single-row write on a
  // draft (which preserves position/slot/sets by never re-inserting).
  const replaceFillExercise = (
    groupId: string,
    fill: ViewFill,
    exerciseId: string,
  ) => {
    if (exerciseId === fill.exercise_id) return;
    if (editing) {
      setWorkDays((ds) =>
        ds.map((d) => ({
          ...d,
          groups: d.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  fills: g.fills.map((f) =>
                    f.id === fill.id
                      ? {
                          ...f,
                          exercise_id: exerciseId,
                          exercise_name:
                            exercises.find((e) => e.id === exerciseId)?.name ??
                            "",
                          // the effort assignment belongs to the exercise, not
                          // the slot — a different movement starts unassigned
                          // (which is also what the re-key on save produces)
                          target_rir: null,
                          has_rir_schedule: false,
                        }
                      : f,
                  ),
                }
              : g,
          ),
        })),
      );
      setDirty(true);
      return;
    }
    commit(async () => {
      const result = await replaceSlotAction({
        meso_id: meso.id,
        meso_exercise_id: fill.id,
        exercise_id: exerciseId,
      });
      if (result.error) toast(result.error);
    });
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
    // N78: the effort assignments ride alongside the structure rather than
    // inside it. `save_meso_plan` re-mints every slot row and the assignments
    // are re-keyed by day-slot × exercise afterwards, so they have to be
    // applied AFTER that replace — sending them as their own list keeps the
    // structural payload byte-identical to what the RPC has always taken.
    // Only what actually changed is sent, so a plain reorder writes nothing.
    const originalRir = new Map(
      toWorkDays(plan.days).flatMap((d) =>
        d.groups.flatMap((g) =>
          g.fills.map(
            (f) =>
              [`${d.day_number}::${f.exercise_id}`, f.target_rir] as const,
          ),
        ),
      ),
    );
    const effort = days.flatMap((d) =>
      d.groups.flatMap((g) =>
        g.fills
          .filter(
            (f) =>
              (originalRir.get(`${d.day_number}::${f.exercise_id}`) ?? null) !==
              f.target_rir,
          )
          .map((f) => ({
            day_number: d.day_number,
            exercise_id: f.exercise_id,
            target_rir: f.target_rir,
          })),
      ),
    );

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
    startTransition(async () => {
      // a failed save must NOT throw to the error boundary — that remounts the
      // board and discards the entire staged session (R16). Keep `workDays`
      // and the confirm sheet so SAVE CHANGES is a one-tap retry.
      try {
        await saveMesoPlanAction({ meso_id: meso.id, days: payload, effort });
        setSaving(false);
      } catch {
        toast("Couldn't save the plan — your changes are still here, try again");
      }
    });
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

  // I12: live weekly-set readout — the shared R14 fold over the CURRENT board
  // state, so every stepper tap / added exercise moves the numbers instantly.
  // Roles for a just-picked exercise arrive with the next revalidation; until
  // then it credits its group at the direct weight (the fold's fallback).
  const volumeRows = useMemo(() => {
    if (!volumePreview || !hasExercise) return null;
    const roles = new Map(Object.entries(volumePreview.rolesByExercise));
    return weeklySetsByGroup(days, roles, volumePreview.weights);
  }, [days, volumePreview, hasExercise]);

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
                  {/* ▲▼ were 20×14px targets (R18): each button is now 24×24,
                      absorbed into the row's own padding/gap via negative
                      margins so the visual layout is unchanged */}
                  <div className="-mx-0.5 -my-2.5 flex flex-col">
                    <button
                      type="button"
                      aria-label={`move ${fill.exercise_name} up`}
                      disabled={idx <= 0}
                      onClick={() => moveDayExercise(activeDay.id, fill.id, -1)}
                      className="flex h-6 w-6 items-center justify-center text-[9px] leading-none text-ink/50 disabled:opacity-25"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label={`move ${fill.exercise_name} down`}
                      disabled={idx >= flat.length - 1}
                      onClick={() => moveDayExercise(activeDay.id, fill.id, 1)}
                      className="flex h-6 w-6 items-center justify-center text-[9px] leading-none text-ink/50 disabled:opacity-25"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-[9px] font-extrabold">
                    {badge(group.muscle_group)}
                  </div>
                  {/* N78: one target for the whole row. The row used to carry a
                      −/N/+ stepper with its own micro-label AND a ✕, which is
                      six controls per exercise before any new lever is added;
                      everything an exercise can be is now behind this one tap
                      (sets, effort, substitute, remove), and the row reads as a
                      line of plan instead of a control panel. */}
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-3 text-left"
                    aria-label={`${fill.exercise_name} options`}
                    onClick={() => setFillSheet({ fill, group, day: activeDay })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">
                        {fill.exercise_name}
                      </span>
                      <span className="mt-[3px] block text-[9px] font-semibold tracking-[0.12em] text-ink/55">
                        {group.muscle_group.toUpperCase()} ·{" "}
                        {exercises
                          .find((e) => e.id === fill.exercise_id)
                          ?.equipment_type.toUpperCase() ?? ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="numeral block text-[9.5px] font-bold tracking-[0.1em] text-ink/70">
                        {fill.initial_sets} SET{fill.initial_sets === 1 ? "" : "S"}
                      </span>
                      <span className="mt-[3px] block text-[8.5px] font-semibold tracking-[0.1em] text-ink/45">
                        {fillRirLabel(fill)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[15px] font-bold text-ink/45">
                      ›
                    </span>
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

      {/* I12: weekly sets per muscle vs the MEV/MRV band — same fractional
          counting as the Balance tab and the MCP preview (one definition) */}
      {volumeRows && volumeRows.length > 0 && volumePreview && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
              WEEKLY SETS PER MUSCLE
              <InfoDot term="volume_landmarks" small />
            </div>
            <div className="flex items-center gap-1.5 text-[8.5px] font-medium tracking-[0.1em] text-ink/45">
              <span>
                {volumePreview.weights.direct.toFixed(1)} DIRECT ·{" "}
                {volumePreview.weights.indirect.toFixed(1)} SECONDARY
              </span>
              <InfoDot term="fractional_sets" small />
            </div>
          </div>
          <div className="mt-2 border-t border-ink/15">
            {volumeRows.map((r) => {
              const lm = volumePreview.landmarks[r.muscle_group];
              const under = lm != null && r.sets < lm.mev;
              const over = lm != null && r.sets > lm.mrv;
              return (
                <div
                  key={r.muscle_group}
                  className="flex items-baseline justify-between border-b border-ink/15 py-[7px]"
                >
                  <span className="label-caps text-[10px] font-semibold tracking-[0.1em] text-ink/75">
                    {r.muscle_group}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="numeral text-[13px] font-bold">
                      {r.sets % 1 === 0 ? r.sets : r.sets.toFixed(1)}
                    </span>
                    {lm != null && (
                      <span
                        className={`label-caps text-[8.5px] tracking-[0.08em] ${
                          under || over
                            ? "font-bold text-ink/80"
                            : "font-medium text-ink/45"
                        }`}
                      >
                        {under
                          ? `UNDER MEV ${lm.mev}`
                          : over
                            ? `OVER MRV ${lm.mrv}`
                            : `MEV ${lm.mev} · MRV ${lm.mrv}`}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* save as template (#7) — reusable split from the current plan. Saves the
          persisted plan, so stage + SAVE CHANGES first when editing a live meso. */}
      {hasExercise && (
        <form action={saveMesoAsTemplateAction} className="mt-6">
          <input type="hidden" name="meso_id" value={meso.id} />
          <SubmitButton
            pendingLabel="SAVING…"
            className="w-full border-[1.5px] border-ink/40 py-3 text-center text-[11px] font-bold tracking-[0.1em] text-ink/70"
          >
            SAVE AS TEMPLATE
          </SubmitButton>
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
            <SubmitButton
              pendingLabel="DISCARDING…"
              className="text-[10px] font-bold tracking-[0.12em] text-accent"
            >
              DISCARD DRAFT
            </SubmitButton>
          </form>
        </>
      ) : (
        // staged edit bar (fig 2.5): nothing is written until SAVE CHANGES
        <div className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-ink bg-bg-base px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-md items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                dirty ? setLeaveTo(detailHref) : router.push(detailHref)
              }
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
      {/* N78: everything one planned exercise can be — kept off the row so the
          board reads as a plan. Re-derived from `days` on every render (not
          held in the sheet's own state) so a staged edit made inside it is
          reflected immediately, and the sheet closes itself if its row goes. */}
      {(() => {
        if (!fillSheet) return null;
        const day = days.find((d) => d.id === fillSheet.day.id);
        const group = day?.groups.find((g) => g.id === fillSheet.group.id);
        const fill = group?.fills.find((f) => f.id === fillSheet.fill.id);
        if (!day || !group || !fill) return null;
        return (
          <ExerciseSheet
            fill={fill}
            group={group}
            equipment={
              exercises
                .find((e) => e.id === fill.exercise_id)
                ?.equipment_type.toUpperCase() ?? ""
            }
            rampLine={rirSummary(meso.rir_schedule, meso.rir_start, meso.rir_end)}
            includesDeload={meso.includes_deload}
            onSets={(sets) => setFillSets(fill.id, sets)}
            onRir={(rir) => setFillRir(fill.id, rir)}
            onReplace={() => {
              setFillSheet(null);
              setPicker({ group, day, replaceFill: fill });
            }}
            onRemove={() => {
              setFillSheet(null);
              clearFill(group.id, fill);
            }}
            onClose={() => setFillSheet(null)}
          />
        );
      })()}
      <ExercisePicker
        target={picker}
        exercises={exercises}
        onSubmit={(ids) => picker && setGroupExercises(picker.group.id, ids)}
        onReplace={(fill, exerciseId) =>
          picker && replaceFillExercise(picker.group.id, fill, exerciseId)
        }
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
        rirSchedule={meso.rir_schedule}
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
              disabled={pending}
              className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-50"
            >
              {pending ? "SAVING…" : "SAVE CHANGES"}
            </button>
          </div>
        </BottomSheet>
      )}

      {/* discard confirm — CANCEL button or any intercepted navigation (R16) */}
      {leaveTo != null && (
        <BottomSheet
          open
          onClose={() => setLeaveTo(null)}
          title="Discard changes?"
          subtitle="UNSAVED EDITS WILL BE LOST"
        >
          <p className="text-[12.5px] leading-[1.5] text-ink/75">
            Your changes to this plan haven&apos;t been saved. Discard them and
            leave?
          </p>
          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setLeaveTo(null)}
              className="px-4 py-3 text-[13px] font-semibold text-ink/60"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => router.push(leaveTo)}
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
  rirSchedule,
}: {
  open: boolean;
  onClose: () => void;
  mesoId: string;
  defaultName: string;
  defaultWeeks: number;
  rirStart: number;
  rirEnd: number;
  includesDeload: boolean;
  rirSchedule: number[] | null;
}) {
  const [state, formAction, pending] = useActionState(
    finalizeMesoAction,
    FINALIZE_INITIAL,
  );
  const [weeks, setWeeks] = useState(
    defaultWeeks >= 4 && defaultWeeks <= 8 ? defaultWeeks : 5,
  );
  // N18-A: the ramp is a deep option — collapsed by default, standard values,
  // no badgering. Expanding reveals the edit-details sheet's ramp grammar
  // (N18-B adds the per-week editor behind the same disclosure).
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ramp, setRamp] = useState({
    start: rirStart,
    end: rirEnd,
    deload: includesDeload,
    schedule: rirSchedule,
  });

  if (!open) return null;

  const rirBtn =
    "numeral flex-1 py-[13px] text-center text-[15px] disabled:opacity-40";

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
          WEEKS{ramp.deload ? " — INCLUDING DELOAD" : ""}
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
        <input type="hidden" name="rir_start" value={ramp.start} />
        <input type="hidden" name="rir_end" value={ramp.end} />
        <input type="hidden" name="includes_deload" value={String(ramp.deload)} />
        <input
          type="hidden"
          name="rir_schedule"
          value={ramp.schedule ? ramp.schedule.join(",") : ""}
        />

        {/* N18-A: collapsed summary line doubles as the ADVANCED disclosure */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-[7px] flex w-full items-center justify-between text-left"
        >
          <span className="text-[10px] font-medium tracking-[0.08em] text-ink/50">
            {rirSummary(ramp.schedule, ramp.start, ramp.end)}
            {ramp.deload ? ` · W${weeks} DELOAD AT 4 RIR` : ""}
          </span>
          <span className="text-[9px] font-bold tracking-[0.12em] text-ink/55 underline underline-offset-2">
            {showAdvanced ? "DONE" : "EDIT"}
          </span>
        </button>

        {showAdvanced && (
          <>
            {/* N18-B: the per-week schedule supersedes the ramp; hide the
                START/END pair while it's active rather than showing dead
                controls */}
            {!ramp.schedule && (
              <>
                <div className="mt-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
                    START RIR
                    <InfoDot term="rir_ramp" small />
                  </div>
                  <div className="mt-2 flex border-[1.5px] border-ink">
                    {[0, 1, 2, 3, 4, 5].map((r, i) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() =>
                          setRamp((v) => ({
                            ...v,
                            start: r,
                            end: Math.min(v.end, r),
                          }))
                        }
                        className={`${rirBtn} ${
                          ramp.start === r
                            ? "bg-ink font-bold text-bg-base"
                            : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
                    END RIR
                  </div>
                  <div className="mt-2 flex border-[1.5px] border-ink">
                    {[0, 1, 2, 3, 4, 5].map((r, i) => (
                      <button
                        key={r}
                        type="button"
                        disabled={r > ramp.start}
                        onClick={() => setRamp((v) => ({ ...v, end: r }))}
                        className={`${rirBtn} ${
                          ramp.end === r
                            ? "bg-ink font-bold text-bg-base"
                            : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <RirScheduleEditor
              weeks={weeks}
              deload={ramp.deload}
              rampStart={ramp.start}
              rampEnd={ramp.end}
              schedule={ramp.schedule}
              onChange={(schedule) => setRamp((v) => ({ ...v, schedule }))}
            />
            <button
              type="button"
              onClick={() => setRamp((v) => ({ ...v, deload: !v.deload }))}
              className="mt-4 flex w-full items-center gap-2.5 text-left"
            >
              <div
                className={`flex h-[18px] w-[18px] items-center justify-center border-[1.5px] border-ink text-[11px] font-bold ${
                  ramp.deload ? "bg-ink text-bg-base" : ""
                }`}
              >
                {ramp.deload ? "✓" : ""}
              </div>
              <span className="text-xs font-semibold">
                Final week is a deload
              </span>
            </button>
          </>
        )}

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
// N78 — exercise sheet: everything one planned exercise can be, in one place.
//
// Why a sheet at all. The board row previously carried a −/N/+ set stepper with
// its own 7.5px label and a ✕, and the exercise NAME was secretly the substitute
// control — six targets per row, one of them undiscoverable, and no room left
// for the effort lever the owner asked for. Pulling all four into a sheet costs
// one tap on the set stepper and buys back a row that reads as a line of plan.
//
// Why the RIR here is FLAT. `meso_exercises` carries both a flat `target_rir`
// and a per-week `rir_schedule` (doc 21 §3). The board has no week axis — it is
// one week's shape, repeated — so it can only write the flat column honestly.
// A slot that already carries a per-week assignment says so and says what
// setting a value here would replace; it is never silently flattened. The
// per-week form stays where it can be shown truthfully: the day view's Effort
// target sheet, which knows which week it is looking at.
// ---------------------------------------------------------------------------

function ExerciseSheet({
  fill,
  group,
  equipment,
  rampLine,
  includesDeload,
  onSets,
  onRir,
  onReplace,
  onRemove,
  onClose,
}: {
  fill: ViewFill;
  group: ViewGroup;
  equipment: string;
  /** the meso's own RIR ramp / schedule, in one line — the thing an assignment
   *  departs from (doc 21 §4.1: never show an assignment without its default) */
  rampLine: string;
  includesDeload: boolean;
  onSets: (sets: number) => void;
  onRir: (rir: number | null) => void;
  onReplace: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const assigned = fill.target_rir;

  const label = "text-[10px] font-semibold tracking-[0.14em] text-ink/55";
  const help = "mt-[7px] text-[11px] font-medium leading-normal text-ink/60";
  const stepBtn =
    "flex h-9 w-9 items-center justify-center border-[1.5px] border-ink text-[17px] font-semibold disabled:opacity-25";
  const rowBtn =
    "flex w-full items-center justify-between border-b border-ink/15 py-[13px] text-left";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={fill.exercise_name}
      subtitle={`${group.muscle_group.toUpperCase()}${equipment ? ` · ${equipment}` : ""}`}
    >
      <div className={label}>STARTING SETS</div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          aria-label="fewer starting sets"
          disabled={fill.initial_sets <= 1}
          onClick={() => onSets(fill.initial_sets - 1)}
          className={stepBtn}
        >
          −
        </button>
        <div className="numeral min-w-[34px] text-center text-[19px] font-extrabold">
          {fill.initial_sets}
        </div>
        <button
          type="button"
          aria-label="more starting sets"
          disabled={fill.initial_sets >= 20}
          onClick={() => onSets(fill.initial_sets + 1)}
          className={stepBtn}
        >
          +
        </button>
      </div>
      <p className={help}>
        Week 1 only — the engine takes set progression from there.
      </p>

      <div className={`mt-6 flex items-baseline justify-between ${label}`}>
        <span>TARGET RIR</span>
        <span className="numeral font-medium text-ink/45">{rampLine}</span>
      </div>
      {/* two states, each with the fewest controls that can express it: unset
          is one button, set is the stepper plus the way back. A stepper that
          reads "—" and has to be nudged off it would make "no assignment" look
          like a value. */}
      {assigned == null ? (
        <button
          type="button"
          onClick={() => onRir(DEFAULT_SLOT_RIR)}
          className="mt-2 w-full border-[1.5px] border-dashed border-ink/45 py-3 text-center text-[11px] font-bold tracking-[0.1em] text-ink/65"
        >
          + SET A TARGET RIR
        </button>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            aria-label="lower target RIR"
            disabled={assigned <= SLOT_RIR_MIN}
            onClick={() => onRir(assigned - 1)}
            className={stepBtn}
          >
            −
          </button>
          <div className="numeral min-w-[34px] text-center text-[19px] font-extrabold">
            {assigned}
          </div>
          <button
            type="button"
            aria-label="raise target RIR"
            disabled={assigned >= SLOT_RIR_MAX}
            onClick={() => onRir(assigned + 1)}
            className={stepBtn}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => onRir(null)}
            className="ml-auto border border-dashed border-ink/40 px-3 py-2 text-[9.5px] font-semibold tracking-[0.1em] text-ink/60"
          >
            FOLLOW THE RAMP
          </button>
        </div>
      )}
      {/* the note the owner asked for: what an assignment DOES, said plainly,
          before it is set rather than after */}
      <p className={help}>
        {assigned != null ? (
          <>
            This exercise runs at{" "}
            <span className="numeral font-semibold text-ink/75">
              RIR {assigned}
            </span>{" "}
            every week of this block — it <strong>overrides the weekly RIR
            target</strong> for this exercise{includesDeload ? ", the deload week included" : ""}.
            The weight is re-priced to meet it: easier means lighter, harder
            means heavier. Clear it and the ramp takes over again.
          </>
        ) : fill.has_rir_schedule ? (
          <>
            This exercise has a target RIR set <strong>per week</strong> (from
            the day view). Setting a value here replaces that with one target for
            the whole block.
          </>
        ) : (
          <>
            Unset — this exercise follows the mesocycle&apos;s weekly RIR target.
            Set one to override it for this exercise alone, every week of the
            block.
          </>
        )}
      </p>

      <div className="mt-6 border-t-[1.5px] border-ink">
        <button type="button" onClick={onReplace} className={rowBtn}>
          <span className="text-sm font-semibold">Replace exercise</span>
          <span className="text-[15px] font-bold text-ink/45">›</span>
        </button>
        <button type="button" onClick={onRemove} className={rowBtn}>
          <span className="text-sm font-semibold text-accent">
            Remove from day
          </span>
        </button>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base"
        >
          DONE
        </button>
      </div>
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
// exercise picker (fig 2.7): pre-filtered to the group's muscle, with an
// equipment filter. Two modes: multi-select over the group's slots (open-slot
// tap — the selected exercises become the group's slots), or replace-in-place
// (filled-row tap, N31 — single-select swaps that one slot's movement,
// keeping its position and starting sets).
// ---------------------------------------------------------------------------

function ExercisePicker({
  target,
  exercises,
  onSubmit,
  onReplace,
  onClose,
}: {
  target: PickerTarget | null;
  exercises: PickerExerciseLite[];
  onSubmit: (exerciseIds: string[]) => void;
  onReplace: (fill: ViewFill, exerciseId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [equip, setEquip] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [historyFor, setHistoryFor] = useState<PickerExerciseLite | null>(null);

  const groupId = target?.group.id ?? null;
  const replaceFill = target?.replaceFill ?? null;

  useEffect(() => {
    if (!target) return;
    // replace mode seeds with just the slot being swapped; add mode with the
    // group's current picks
    setSelected(
      new Set(
        replaceFill
          ? [replaceFill.exercise_id]
          : target.group.fills.map((f) => f.exercise_id),
      ),
    );
    setSearch("");
    setEquip(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, replaceFill?.id]);

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
    if (replaceFill) {
      // single-select: the new pick replaces the selection (radio behavior)
      setSelected(new Set([id]));
      return;
    }
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

  const replacePickId = replaceFill ? [...selected][0] ?? null : null;
  const replaceUnchanged =
    replaceFill != null && replacePickId === replaceFill.exercise_id;

  const save = () => {
    if (replaceFill) {
      if (replacePickId && !replaceUnchanged) onReplace(replaceFill, replacePickId);
      close();
      return;
    }
    const orderedIds = groupCandidates
      .filter((e) => selected.has(e.id))
      .map((e) => e.id);
    onSubmit(orderedIds);
    close();
  };

  return (
    <BottomSheet
      open
      fullHeight
      onClose={close}
      title={replaceFill ? "Replace exercise" : "Pick exercise"}
      subtitle={
        replaceFill
          ? `SWAPS ${replaceFill.exercise_name.toUpperCase()} — SAME SLOT & SETS`
          : `${target.group.muscle_group.toUpperCase()} · ${dayName}`
      }
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

      {/* equipment / machine-type filter — shared chip grammar (N29) */}
      {equipTypes.length > 1 && (
        <FilterBar
          className="mt-2.5"
          axes={[
            {
              key: "equip",
              label: "EQUIP",
              options: equipTypes.map((t) => ({ value: t, label: t })),
              value: equip,
            },
          ]}
          onChange={(_key, value) => setEquip(value)}
        />
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.map((e) => {
          const sel = selected.has(e.id);
          // replace mode: an exercise already filling ANOTHER slot of this
          // group can't be the swap target (it would duplicate the movement)
          const inGroupElsewhere =
            replaceFill != null &&
            target.group.fills.some(
              (f) => f.id !== replaceFill.id && f.exercise_id === e.id,
            );
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 border-b border-ink/[0.18] py-[11px] last:border-b-0"
            >
              <button
                type="button"
                aria-label={`${sel ? "deselect" : "select"} ${e.name}`}
                disabled={inGroupElsewhere}
                onClick={() => toggle(e.id)}
                className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center text-[12px] ${
                  sel
                    ? "bg-ink text-bg-base"
                    : `border-[1.5px] border-ink/40 ${inGroupElsewhere ? "opacity-30" : ""}`
                }`}
              >
                {sel ? "✓" : ""}
              </button>
              <button
                type="button"
                disabled={inGroupElsewhere}
                onClick={() => toggle(e.id)}
                className={`flex-1 text-left ${inGroupElsewhere ? "opacity-40" : ""}`}
              >
                <div className="text-[15px] font-bold">{e.name}</div>
                <div className="mt-[3px] text-[9.5px] font-medium tracking-[0.1em] text-ink/55">
                  {inGroupElsewhere
                    ? "ALREADY IN THIS GROUP"
                    : `${e.equipment_type.toUpperCase()} · ${
                        e.last_performed_at
                          ? `LAST ${shortDate(e.last_performed_at)}`
                          : "NEVER PERFORMED"
                      }`}
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
        disabled={replaceFill != null && (replacePickId == null || replaceUnchanged)}
        className="mt-4 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.1em] text-bg-base disabled:opacity-40"
      >
        {replaceFill ? "REPLACE EXERCISE" : `ADD TO ${dayName}`}
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

"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { HistorySheet } from "@/components/HistorySheet";
import type { MesoPlan, PlannedDay, PlannedGroup } from "@/lib/queries/cycles";
import type { MuscleGroupRow } from "@/lib/types/database";
import { groupByRegion } from "@/lib/planner/groups";
import {
  addDayAction,
  addGroupsAction,
  clearSlotAction,
  finalizeMesoAction,
  removeDayAction,
  removeGroupAction,
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

type PickerTarget = { group: PlannedGroup; day: PlannedDay };
type Commit = (fn: () => Promise<void>) => void;

function badge(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function dayTabLabel(day: PlannedDay): string {
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
  const [daySetupId, setDaySetupId] = useState<string | null>(null);
  const [addGroupsDayId, setAddGroupsDayId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [, startTransition] = useTransition();
  const commit: Commit = (fn) => startTransition(fn);

  // add a day: auto-assign the next weekday, then open its setup sheet (a day
  // and its setup are one view now — see DaySetupSheet)
  const addDay = () => {
    const weekday = nextWeekday(days.map((d) => d.weekday));
    commit(async () => {
      const created = await addDayAction({
        meso_id: meso.id,
        label: null,
        weekday,
      });
      setActiveDayId(created.id);
      setDaySetupId(created.id);
    });
  };

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
          <button
            type="button"
            aria-label="add day"
            onClick={addDay}
            className="flex-[0_0_40px] border-l border-ink/25 py-[9px] text-center text-sm font-semibold text-ink/60"
          >
            +
          </button>
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
              className="font-bold text-ink underline underline-offset-2"
            >
              ✎ EDIT DAY
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
                        onClick={() => setPicker({ group, day: activeDay })}
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
                      onClick={() => setPicker({ group, day: activeDay })}
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
              onClick={() => setAddGroupsDayId(activeDay.id)}
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

      {meso.status === "draft" ? (
        <>
          {(() => {
            const hasExercise = days.some((d) =>
              d.groups.some((g) => g.fills.length > 0),
            );
            return (
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
              </>
            );
          })()}
        </>
      ) : (
        <button
          type="button"
          onClick={() => router.push(`/cycles/meso/${meso.id}`)}
          className="mt-6 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base"
        >
          {meso.status === "planned" ? "DONE — REVIEW MESO" : "DONE"}
        </button>
      )}

      {(() => {
        const setupDay = daySetupId
          ? (days.find((d) => d.id === daySetupId) ?? null)
          : null;
        return setupDay ? (
          <DaySetupSheet
            key={setupDay.id}
            day={setupDay}
            mesoId={meso.id}
            onAddGroups={() => setAddGroupsDayId(setupDay.id)}
            onClose={() => setDaySetupId(null)}
            commit={commit}
          />
        ) : null;
      })()}
      {(() => {
        const addDay = addGroupsDayId
          ? (days.find((d) => d.id === addGroupsDayId) ?? null)
          : null;
        return addDay ? (
          <AddGroupsSheet
            key={addDay.id}
            day={addDay}
            mesoId={meso.id}
            muscleGroups={muscleGroups}
            onClose={() => setAddGroupsDayId(null)}
            commit={commit}
          />
        ) : null;
      })()}
      <ExercisePicker
        target={picker}
        mesoId={meso.id}
        exercises={exercises}
        onClose={() => setPicker(null)}
        commit={commit}
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
// groups & counts for one day. Reads the live `day` (props) so set steppers,
// group add, and group removal reflect immediately.
// ---------------------------------------------------------------------------

function DaySetupSheet({
  day,
  mesoId,
  onAddGroups,
  onClose,
  commit,
}: {
  day: PlannedDay;
  mesoId: string;
  onAddGroups: () => void;
  onClose: () => void;
  commit: Commit;
}) {
  const [label, setLabel] = useState(day.label ?? "");
  const [weekday, setWeekday] = useState<number | null>(day.weekday ?? null);

  const save = () => {
    commit(() =>
      updateDayAction({
        day_id: day.id,
        meso_id: mesoId,
        label: label.trim() || null,
        weekday,
      }),
    );
    onClose();
  };

  const stepBtn =
    "flex h-9 w-9 items-center justify-center border-[1.5px] border-ink text-[17px] font-semibold";

  return (
    <BottomSheet
      open
      onClose={onClose}
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

      <div className="mt-3.5 flex justify-end">
        <button
          type="button"
          onClick={() => {
            commit(() => removeDayAction({ day_id: day.id, meso_id: mesoId }));
            onClose();
          }}
          className="text-[11px] font-bold text-accent"
        >
          Remove day
        </button>
      </div>

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

          <button
            type="button"
            onClick={onAddGroups}
            className="mt-3 w-full border-[1.5px] border-dashed border-ink/45 py-[11px] text-center text-[11px] font-bold tracking-[0.12em] text-ink/65"
          >
            + ADD MUSCLE GROUP
          </button>
          <p className="mt-3 text-[11px] leading-normal text-ink/60">
            Slots are created for each group — you&apos;ll pick the exact
            exercises on the board next.
          </p>
      </>

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
// add muscle groups (fig 2.6b): region-grouped, multi-select. Groups already
// on the day show "IN DAY" and can't be re-added.
// ---------------------------------------------------------------------------

function AddGroupsSheet({
  day,
  mesoId,
  muscleGroups,
  onClose,
  commit,
}: {
  day: PlannedDay;
  mesoId: string;
  muscleGroups: MuscleGroupRow[];
  onClose: () => void;
  commit: Commit;
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
    commit(() =>
      addGroupsAction({
        day_id: day.id,
        meso_id: mesoId,
        muscle_group_ids: [...selected],
      }),
    );
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
  const [equip, setEquip] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [historyFor, setHistoryFor] = useState<PickerExerciseLite | null>(null);

  const groupId = target?.group.id ?? null;

  // (re)seed the selection from the group's current fills each time the picker
  // opens on a (new) group
  useEffect(() => {
    if (!target) return;
    setSelected(new Set(target.group.fills.map((f) => f.exercise_id)));
    setSearch("");
    setEquip(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // muscle-group-filtered candidates (before search/equip) — drives the
  // equipment chips and the stable add order
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
    // keep the muscle-group order stable regardless of search/equip filtering
    const orderedIds = groupCandidates
      .filter((e) => selected.has(e.id))
      .map((e) => e.id);
    commit(() =>
      setGroupExercisesAction({
        meso_id: mesoId,
        group_id: target.group.id,
        exercise_ids: orderedIds,
      }),
    );
    close();
  };

  const chip =
    "flex h-8 flex-shrink-0 items-center px-3 text-[10px] font-bold tracking-[0.1em]";

  return (
    <BottomSheet
      open
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

      <div className="mt-3 max-h-[42dvh] overflow-y-auto">
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

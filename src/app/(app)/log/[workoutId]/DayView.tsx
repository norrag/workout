"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomSheet, useSheetTransition } from "@/components/ui/BottomSheet";
import { useScrollLock } from "@/components/ui/useScrollLock";
import { SnapSlider } from "@/components/ui/SnapSlider";
import { LogCheckbox } from "@/components/ui/LogCheckbox";
import { useToast } from "@/components/ui/Toast";
import { HistorySheet } from "@/components/HistorySheet";
import type {
  LoggedExercise,
  NavWeek,
  WorkoutDetail,
} from "@/lib/queries/logging";
import type { Units } from "@/lib/types/database";
import { predictRepsAtWeight, type EngineParams } from "@/lib/engine";
import {
  addSetAction,
  addWorkoutExercisesAction,
  amendSetAction,
  clearPinnedNoteAction,
  completeWorkoutAction,
  deleteSetAction,
  endMesocycleAction,
  endWorkoutAction,
  listAddExerciseCandidatesAction,
  listReplacementCandidatesAction,
  logSetAction,
  updateSetWeightAction,
  moveExerciseDownAction,
  moveExerciseUpAction,
  removeExerciseAction,
  removeSetAction,
  replaceExerciseAction,
  saveFeedbackAction,
  savePinnedNoteAction,
  saveSessionNoteAction,
  skipRemainingAction,
  toggleSkipSetAction,
  unlogSetAction,
  unskipAllAction,
  type ReplacementCandidate,
} from "../actions";
import type { AddExerciseCandidate } from "@/lib/queries/exercises";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function shortDate(iso: string | null): string {
  const d = iso ? new Date(`${iso.slice(0, 10)}T12:00:00`) : new Date();
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

type Commit = (fn: () => Promise<void>) => void;

/** Which note bucket the unified note sheet (09 §8) opened from. "menu" defaults
 * to the session note; "pinned"/"session" edit that specific existing note. */
type NoteOrigin = "menu" | "pinned" | "session";

/** Planned slot count, widened to cover any logged/skipped beyond it. */
function plannedSetCount(we: LoggedExercise): number {
  const maxLogged = we.sets.length
    ? Math.max(...we.sets.map((s) => s.set_number))
    : 0;
  const maxSkipped = we.skipped_set_numbers.length
    ? Math.max(...we.skipped_set_numbers)
    : 0;
  return Math.max(we.prescribed_sets ?? 1, maxLogged, maxSkipped);
}

/** Every planned slot resolved (logged or skipped), or the whole exercise skipped. */
function exerciseDone(we: LoggedExercise): boolean {
  if (we.status === "skipped") return true;
  const planned = plannedSetCount(we);
  const logged = new Set(we.sets.map((s) => s.set_number));
  const skipped = new Set(we.skipped_set_numbers);
  for (let n = 1; n <= planned; n += 1) {
    if (!logged.has(n) && !skipped.has(n)) return false;
  }
  return true;
}

/**
 * Day view (fig 1.1) — the Workout tab itself. Brand row, meso track,
 * coordinate, exercise blocks with the LB/REPS/LOG set grid; menus per
 * figs 1.2/1.3, feedback 1.4, completion 1.5.
 */
export function DayView({
  detail,
  units,
  params,
}: {
  detail: WorkoutDetail;
  units: Units;
  params: EngineParams;
}) {
  const { workout, microcycle, mesocycle, exercises } = detail;
  const readOnly = workout.status === "completed" || workout.status === "skipped";
  const [, startTransition] = useTransition();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [setMenu, setSetMenu] = useState<{
    weId: string;
    setNumber: number;
  } | null>(null);
  const [historyFor, setHistoryFor] = useState<LoggedExercise | null>(null);
  const [replaceFor, setReplaceFor] = useState<LoggedExercise | null>(null);
  const [noteSheet, setNoteSheet] = useState<{
    we: LoggedExercise;
    origin: NoteOrigin;
  } | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<LoggedExercise | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [dropPending, setDropPending] = useState<Record<string, boolean>>({});

  const commit: Commit = (fn) => startTransition(fn);

  // progress bar denominator excludes skipped slots; an exercise is "done"
  // when every planned slot is either logged or skipped (fig 1.1/1.3)
  const loggedSets = exercises.reduce((n, we) => n + we.sets.length, 0);
  const totalSets = exercises
    .filter((we) => we.status !== "skipped")
    .reduce((n, we) => {
      const planned = plannedSetCount(we);
      const skipped = we.skipped_set_numbers.filter((s) => s <= planned).length;
      return n + Math.max(0, planned - skipped);
    }, 0);

  const allDone = exercises.length > 0 && exercises.every(exerciseDone);

  const groupSiblings = (we: LoggedExercise) =>
    exercises.filter(
      (x) => x.muscle_group_id === we.muscle_group_id && x.id !== we.id,
    );
  // first to be completed in its group → recovery/soreness prompt
  const isFirstOfGroup = (we: LoggedExercise) =>
    groupSiblings(we).every((x) => !exerciseDone(x));
  // group fully done (this exercise closed it) → joint pain + pump + workload
  const isLastOfGroup = (we: LoggedExercise) =>
    groupSiblings(we).every(exerciseDone);

  return (
    <div>
      <DayHeader
        mesoId={mesocycle.id}
        mesoName={mesocycle.name}
        workoutId={workout.id}
        workoutActive={
          workout.status === "planned" || workout.status === "in_progress"
        }
        mesoActive={mesocycle.status === "active"}
        weekNumber={microcycle.week_number}
        dayNumber={workout.day_number}
        isDeload={microcycle.is_deload}
        targetRir={microcycle.target_rir}
        dateLabel={shortDate(workout.scheduled_date ?? workout.performed_at)}
        loggedSets={loggedSets}
        totalSets={totalSets}
        navWeeks={detail.navWeeks}
      />

      {/* exercise blocks */}
      {exercises.map((we, i) => (
        <ExerciseBlock
          key={we.id}
          we={we}
          index={i}
          units={units}
          readOnly={readOnly}
          params={params}
          microTargetRir={microcycle.target_rir}
          menuOpen={menuFor === we.id}
          setMenuTarget={setMenu?.weId === we.id ? setMenu.setNumber : null}
          dropPending={dropPending[we.id] ?? false}
          isLast={i === exercises.length - 1}
          onOpenMenu={() => setMenuFor(menuFor === we.id ? null : we.id)}
          onCloseMenu={() => setMenuFor(null)}
          onOpenSetMenu={(setNumber) =>
            setSetMenu(
              setMenu?.weId === we.id && setMenu.setNumber === setNumber
                ? null
                : { weId: we.id, setNumber },
            )
          }
          onCloseSetMenu={() => setSetMenu(null)}
          onHistory={() => setHistoryFor(we)}
          onReplace={() => setReplaceFor(we)}
          onNote={(origin) => setNoteSheet({ we, origin })}
          onFeedback={() => setFeedbackFor(we)}
          onToggleDrop={() =>
            setDropPending((cur) => ({ ...cur, [we.id]: !cur[we.id] }))
          }
          onLogged={(wasLast) => {
            // only prompt on the first (soreness) and group-closing (joint
            // pain + pump + workload) exercises — middle ones don't auto-ask
            if (
              wasLast &&
              !we.feedback &&
              (isFirstOfGroup(we) || isLastOfGroup(we))
            )
              setFeedbackFor(we);
          }}
          commit={commit}
        />
      ))}

      {/* complete is offered only once every set is logged or skipped (1.5) */}
      {!readOnly && allDone && (
        <button
          type="button"
          onClick={() => setCompleteOpen(true)}
          className="mt-6 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base"
        >
          COMPLETE WORKOUT
        </button>
      )}

      <NoteSheet
        key={noteSheet ? `${noteSheet.we.id}-${noteSheet.origin}` : "none"}
        sheet={noteSheet}
        workoutId={workout.id}
        onClose={() => setNoteSheet(null)}
        commit={commit}
      />
      <ReplaceSheet
        we={replaceFor}
        onClose={() => setReplaceFor(null)}
        commit={commit}
      />
      <HistorySheet
        target={
          historyFor
            ? {
                exercise_id: historyFor.exercise_id,
                exercise_name: historyFor.exercise_name,
                equipment_type: historyFor.equipment_type,
              }
            : null
        }
        onClose={() => setHistoryFor(null)}
      />
      <FeedbackSheet
        key={feedbackFor?.id ?? "none"}
        we={feedbackFor}
        workoutId={workout.id}
        weekNumber={microcycle.week_number}
        withSoreness={feedbackFor ? isFirstOfGroup(feedbackFor) : false}
        withGroupScope={feedbackFor ? isLastOfGroup(feedbackFor) : false}
        onClose={() => setFeedbackFor(null)}
        commit={commit}
      />
      <CompleteSheet
        open={completeOpen}
        detail={detail}
        onClose={() => setCompleteOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// locked day header (fig 1.1): brand row + collapsible week/day navigator,
// coordinate with Target RIR, and the orange progress bar
// ---------------------------------------------------------------------------

function DayHeader({
  mesoId,
  mesoName,
  workoutId,
  workoutActive,
  mesoActive,
  weekNumber,
  dayNumber,
  isDeload,
  targetRir,
  dateLabel,
  loggedSets,
  totalSets,
  navWeeks,
}: {
  mesoId: string;
  mesoName: string;
  workoutId: string;
  workoutActive: boolean;
  mesoActive: boolean;
  weekNumber: number;
  dayNumber: number;
  isDeload: boolean;
  targetRir: number;
  dateLabel: string;
  loggedSets: number;
  totalSets: number;
  navWeeks: NavWeek[];
}) {
  // the navigator stays open across day navigation until the user closes it.
  // `animate` is enabled only by an explicit toggle, so hydrating the open
  // state on load (after navigation) snaps rather than re-running the reveal.
  const [open, setOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(weekNumber);
  useEffect(() => {
    setOpen(sessionStorage.getItem("dayNavOpen") === "1");
  }, []);
  const toggleOpen = () => {
    setAnimate(true);
    setOpen((v) => {
      const next = !v;
      sessionStorage.setItem("dayNavOpen", next ? "1" : "0");
      return next;
    });
  };

  const pct = totalSets > 0 ? Math.round((loggedSets / totalSets) * 100) : 0;
  const rirLabel = isDeload ? "DELOAD WEEK" : `TARGET ${targetRir} RIR`;
  const selWeek =
    navWeeks.find((w) => w.weekNumber === selectedWeek) ??
    navWeeks.find((w) => w.weekNumber === weekNumber);
  const lastIdx = navWeeks.length - 1;
  // week containing the meso's resume point — its dot always shows (#2)
  const currentWeekNumber = navWeeks.find((w) =>
    w.days.some((d) => d.status === "current"),
  )?.weekNumber;

  return (
    <div className="sticky top-0 z-20 -mx-4 bg-bg-base px-4 pb-3 pt-2 shadow-[0_8px_16px_-12px_rgba(23,20,15,0.55)]">
      {/* brand row + disclosure chevron */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggleOpen}
          className="flex items-center gap-[7px]"
          aria-expanded={open}
          aria-label="week and day navigator"
        >
          <span className="logotype text-[13px] font-semibold">workout</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className="transition-transform duration-200"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path
              d="M2.5 4.5 L6 8 L9.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="label-caps text-[10px] font-medium tracking-[0.1em] text-ink/55">
          {mesoName.toUpperCase()}
        </div>
      </div>

      {/* collapsible navigator: week selector + nested day chips */}
      <div
        className={`grid ${animate ? "transition-all duration-300" : ""}`}
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          marginTop: open ? "14px" : "0px",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-[1.5px] border-ink">
            <div className="flex">
              {navWeeks.map((w, i) => {
                const isSel = w.weekNumber === selectedWeek;
                const label = w.isDeload ? "DL" : `W${w.weekNumber}`;
                return (
                  <button
                    type="button"
                    key={w.weekNumber}
                    onClick={() => setSelectedWeek(w.weekNumber)}
                    style={{ flex: w.isDeload ? "0.82" : "1" }}
                    className={`relative flex h-9 items-center justify-center text-[11px] tracking-[0.08em] ${
                      i < lastIdx ? "border-r border-ink/[0.18]" : ""
                    } ${
                      isSel
                        ? "bg-ink font-bold text-bg-base"
                        : w.status === "completed"
                          ? "font-semibold text-ink/60"
                          : "font-medium text-ink/40"
                    }`}
                  >
                    {label}
                    {/* the active week's dot always shows, so the user can find it */}
                    {w.weekNumber === currentWeekNumber && (
                      <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-accent" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="border-t-[1.5px] border-ink bg-ink/[0.03] p-[11px]">
              <div className="flex gap-[5px]">
                {(selWeek?.days ?? []).map((d) => {
                  const viewing =
                    selectedWeek === weekNumber && d.dayNumber === dayNumber;
                  const cls = viewing
                    ? "border border-ink bg-ink font-bold text-bg-base"
                    : d.status === "completed"
                      ? "border border-ink/[0.22] bg-ink/[0.07] font-semibold text-ink/55"
                      : "border border-ink/[0.22] font-medium text-ink/45";
                  const content = (
                    <>
                      D{d.dayNumber}
                      {d.status === "completed" && !viewing && (
                        <span className="ml-[3px] text-[8px] opacity-60">✓</span>
                      )}
                      {/* active-day dot always shows, even when it's selected */}
                      {d.status === "current" && (
                        <span className="absolute right-1 top-1 h-[5px] w-[5px] rounded-full bg-accent" />
                      )}
                    </>
                  );
                  const chipClass = `relative flex h-[30px] flex-1 items-center justify-center text-[10.5px] tracking-[0.04em] ${cls}`;
                  if (viewing) {
                    return (
                      <div key={d.dayNumber} className={chipClass}>
                        {content}
                      </div>
                    );
                  }
                  // generated day → log view; not-yet-generated day → the
                  // read-only planned view (basic exercises, no projections yet)
                  const href = d.workoutId
                    ? `/log/${d.workoutId}`
                    : `/cycles/meso/${mesoId}/planned/${selWeek?.weekNumber ?? selectedWeek}/${d.dayNumber}`;
                  return (
                    <Link key={d.dayNumber} href={href} className={chipClass}>
                      {content}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* coordinate + progress bar */}
      <div className="mt-4">
        <div className="flex items-end justify-between pb-3">
          <div className="text-[46px] font-extrabold leading-[0.9] tracking-[-0.03em]">
            W{weekNumber}·D{dayNumber}
          </div>
          <div className="flex items-stretch gap-2.5">
            <div className="text-right text-[10px] font-medium leading-[1.5] tracking-[0.1em] text-ink/60">
              {dateLabel}
              <br />
              <span className="font-bold text-accent">{rirLabel}</span>
            </div>
            <WorkoutOptionsMenu
              mesoId={mesoId}
              workoutId={workoutId}
              workoutActive={workoutActive}
              mesoActive={mesoActive}
            />
          </div>
        </div>
        <div className="relative h-[3px] bg-ink">
          <div
            className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// workout / mesocycle options menu (fig 1.1 header ⋮, 09 session-5 §9)
// ---------------------------------------------------------------------------

function WorkoutOptionsMenu({
  mesoId,
  workoutId,
  workoutActive,
  mesoActive,
}: {
  mesoId: string;
  workoutId: string;
  workoutActive: boolean;
  mesoActive: boolean;
}) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "workout" | "meso">(null);
  const [addOpen, setAddOpen] = useState(false);
  const [, startEnding] = useTransition();

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const endWorkout = () =>
    startEnding(async () => {
      const res = await endWorkoutAction({ workout_id: workoutId });
      setConfirm(null);
      router.push(res.nextWorkoutId ? `/log/${res.nextWorkoutId}` : "/workout");
    });

  const endMeso = () =>
    startEnding(async () => {
      await endMesocycleAction({ workout_id: workoutId, meso_id: mesoId });
      setConfirm(null);
      router.push(`/cycles/meso/${mesoId}`);
    });

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        aria-label="workout and mesocycle options"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-6 items-center justify-center self-stretch pb-1 text-[18px] leading-none tracking-[1px] ${
          open ? "text-ink" : "text-ink/45"
        }`}
      >
        ⋮
      </button>

      <AnchoredMenu
        open={open}
        triggerRef={btnRef}
        align="right"
        label="workout and mesocycle options"
        onClose={() => setOpen(false)}
      >
        <div className="border-b border-ink/10 px-4 pb-2 pt-3 text-[9px] font-semibold tracking-[0.16em] text-ink/45">
          MESOCYCLE
        </div>
        <MenuRow
          label="Mesocycle stats"
          trailing="STATS"
          onClick={() => go(`/cycles/meso/${mesoId}/stats`)}
        />
        {mesoActive && (
          <MenuRow
            label="End mesocycle"
            destructive
            onClick={() => {
              setOpen(false);
              setConfirm("meso");
            }}
          />
        )}

        <div className="border-y border-ink/10 px-4 pb-2 pt-3 text-[9px] font-semibold tracking-[0.16em] text-ink/45">
          WORKOUT
        </div>
        {workoutActive && (
          <MenuRow
            label="Add exercise"
            trailing="PICKER"
            onClick={() => {
              setOpen(false);
              setAddOpen(true);
            }}
          />
        )}
        {workoutActive && (
          <MenuRow
            label="End workout"
            destructive
            onClick={() => {
              setOpen(false);
              setConfirm("workout");
            }}
          />
        )}
      </AnchoredMenu>

      <AddExerciseSheet
        open={addOpen}
        workoutId={workoutId}
        onClose={() => setAddOpen(false)}
      />

      <BottomSheet
        open={confirm === "workout"}
        onClose={() => setConfirm(null)}
        title="End workout"
        subtitle="SKIP REMAINING · COMPLETE"
      >
        <p className="text-[13px] leading-relaxed text-ink">
          This skips every set you haven&apos;t logged and completes the
          workout now. Anything already logged is kept. This can&apos;t be
          undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setConfirm(null)}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={endWorkout}
            className="bg-accent px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base"
          >
            END WORKOUT
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={confirm === "meso"}
        onClose={() => setConfirm(null)}
        title="End mesocycle"
        subtitle="SKIP REMAINING DAYS · COMPLETE"
      >
        <p className="text-[13px] leading-relaxed text-ink">
          This skips all remaining sets on every remaining day of the
          mesocycle and marks the whole mesocycle complete. Logged history is
          kept; nothing further is generated. This can&apos;t be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setConfirm(null)}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={endMeso}
            className="bg-accent px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base"
          >
            END MESOCYCLE
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// exercise block + set grid (fig 1.1)
// ---------------------------------------------------------------------------

function ExerciseBlock({
  we,
  index,
  units,
  readOnly,
  params,
  microTargetRir,
  menuOpen,
  setMenuTarget,
  dropPending,
  isLast,
  onOpenMenu,
  onCloseMenu,
  onOpenSetMenu,
  onCloseSetMenu,
  onHistory,
  onReplace,
  onNote,
  onFeedback,
  onToggleDrop,
  onLogged,
  commit,
}: {
  we: LoggedExercise;
  index: number;
  units: Units;
  readOnly: boolean;
  params: EngineParams;
  microTargetRir: number;
  menuOpen: boolean;
  setMenuTarget: number | null;
  dropPending: boolean;
  isLast: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onOpenSetMenu: (setNumber: number) => void;
  onCloseSetMenu: () => void;
  onHistory: () => void;
  onReplace: () => void;
  onNote: (origin: NoteOrigin) => void;
  onFeedback: () => void;
  onToggleDrop: () => void;
  onLogged: (wasLastPlannedSet: boolean) => void;
  commit: Commit;
}) {
  const skipped = we.status === "skipped";
  const plannedSets = plannedSetCount(we);
  const loggedNums = new Set(we.sets.map((s) => s.set_number));
  const skippedNums = new Set(we.skipped_set_numbers);
  let nextSetNumber = 0;
  for (let n = 1; n <= plannedSets; n += 1) {
    if (!loggedNums.has(n) && !skippedNums.has(n)) {
      nextSetNumber = n;
      break;
    }
  }
  const [removeError, setRemoveError] = useState<string | null>(null);
  const router = useRouter();
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const iconBtn =
    "flex h-7 w-7 items-center justify-center border border-ink/35";

  return (
    <div className={`relative mt-5 ${skipped ? "opacity-40" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-ink/55">
          <span className="numeral">{String(index + 1).padStart(2, "0")}</span>
          {" — "}
          {we.muscle_group.toUpperCase() || "OTHER"}
          {skipped ? " · SKIPPED" : ""}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label={`${we.exercise_name} history`} className={iconBtn} onClick={onHistory}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 4v3l2 1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <button
            type="button"
            ref={menuBtnRef}
            aria-label={`${we.exercise_name} menu`}
            onClick={onOpenMenu}
            className={`${iconBtn} pb-1 text-[13px] tracking-[1px] ${menuOpen ? "border-ink bg-ink text-bg-base" : ""}`}
          >
            …
          </button>
        </div>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between">
        <div className="text-xl font-bold tracking-[-0.01em]">
          {we.exercise_name}
        </div>
        <div className="text-[9.5px] font-medium tracking-[0.12em] text-ink/50">
          {we.equipment_type.toUpperCase()}
        </div>
      </div>
      {we.pinned_note && (
        <div className="mt-[7px] flex items-start justify-between gap-2 border-l-2 border-ink py-[5px] pl-2.5 text-[11px] font-medium text-ink/70">
          <span>PINNED — {we.pinned_note.body}</span>
          {!readOnly && (
            <button
              type="button"
              aria-label="edit pinned note"
              onClick={() => onNote("pinned")}
              className="-my-1 shrink-0 px-1.5 py-1 text-[12px] text-ink/45"
            >
              ✎
            </button>
          )}
        </div>
      )}
      {we.feedback?.notes && (
        <button
          type="button"
          disabled={readOnly}
          aria-label="edit session note"
          onClick={() => onNote("session")}
          className="mt-[7px] flex w-full items-start justify-between gap-2 border-l-2 border-ink/35 py-[5px] pl-2.5 text-left text-[11px] font-medium text-ink/60 disabled:cursor-default"
        >
          <span>NOTE — {we.feedback.notes}</span>
          {!readOnly && (
            <span aria-hidden className="shrink-0 px-1.5 text-[12px] text-ink/40">
              ✎
            </span>
          )}
        </button>
      )}

      {!skipped && (
        <>
          {/* grid header (denser rows, 09 §5) */}
          <div className="mt-2.5 grid grid-cols-[20px_1fr_1fr_44px] gap-2.5 border-b border-ink/25 pb-[5px] text-[9px] font-semibold tracking-[0.14em] text-ink/50">
            <div />
            <div className="text-center">{units.toUpperCase()}</div>
            <div className="text-center">REPS</div>
            <div className="text-center">LOG</div>
          </div>
          {Array.from({ length: plannedSets }, (_, i) => {
            const setNumber = i + 1;
            const logged = we.sets.find((s) => s.set_number === setNumber);
            const state: "logged" | "skipped" | "next" | "future" = logged
              ? "logged"
              : skippedNums.has(setNumber)
                ? "skipped"
                : setNumber === nextSetNumber && !readOnly
                  ? "next"
                  : "future";
            return (
              <SetRow
                key={`${setNumber}-${logged?.id ?? "open"}`}
                we={we}
                setNumber={setNumber}
                state={state}
                readOnly={readOnly}
                params={params}
                targetRir={we.target_rir ?? microTargetRir}
                logged={logged ?? null}
                isLastRow={setNumber === plannedSets}
                dropPending={dropPending}
                menuOpen={setMenuTarget === setNumber}
                onOpenMenu={() => onOpenSetMenu(setNumber)}
                onCloseMenu={onCloseSetMenu}
                onToggleDrop={onToggleDrop}
                onLogged={() => onLogged(setNumber >= plannedSets)}
                commit={commit}
              />
            );
          })}
        </>
      )}

      {removeError && (
        <p className="mt-2 text-xs text-accent">{removeError}</p>
      )}

      {/* exercise menu (fig 1.2) */}
      <AnchoredMenu
        open={menuOpen}
        triggerRef={menuBtnRef}
        align="right"
        label={`${we.exercise_name} menu`}
        onClose={onCloseMenu}
      >
        <div className="border-b border-ink/25 px-4 pb-[9px] pt-3 text-[9.5px] font-semibold tracking-[0.16em] text-ink/55">
          EXERCISE — {we.exercise_name.toUpperCase()}
        </div>
        {we.notes && (
          <div className="border-b border-ink/10 px-4 py-2 text-[11px] leading-[1.45] text-ink/60">
            {we.notes}
          </div>
        )}
        <MenuRow
          label="View exercise"
          trailing="›"
          onClick={() => {
            onCloseMenu();
            router.push(`/exercises/${we.exercise_id}`);
          }}
        />
        <MenuRow
          label={we.pinned_note || we.feedback?.notes ? "Notes" : "Add note"}
          trailing={we.pinned_note || we.feedback?.notes ? "›" : undefined}
          onClick={() => {
            onCloseMenu();
            onNote("menu");
          }}
        />
        {!readOnly && we.sets.length === 0 && we.muscle_group_id ? (
          <MenuRow
            label="Replace exercise"
            trailing="›"
            onClick={() => {
              onCloseMenu();
              onReplace();
            }}
          />
        ) : (
          <MenuRow label="Replace exercise" trailing="LOGGED" disabled />
        )}
        {!readOnly && (
          <>
            {index > 0 && (
              <MenuRow
                label="Move up"
                onClick={() => {
                  commit(() =>
                    moveExerciseUpAction({
                      workout_id: we.workout_id,
                      workout_exercise_id: we.id,
                    }),
                  );
                  onCloseMenu();
                }}
              />
            )}
            {!isLast && (
              <MenuRow
                label="Move down"
                onClick={() => {
                  commit(() =>
                    moveExerciseDownAction({
                      workout_id: we.workout_id,
                      workout_exercise_id: we.id,
                    }),
                  );
                  onCloseMenu();
                }}
              />
            )}
            <MenuRow
              label="Add set"
              onClick={() => {
                commit(() =>
                  addSetAction({
                    workout_id: we.workout_id,
                    workout_exercise_id: we.id,
                  }),
                );
                onCloseMenu();
              }}
            />
            <MenuRow
              label={we.feedback ? "Edit feedback" : "Add feedback"}
              onClick={() => {
                onCloseMenu();
                onFeedback();
              }}
            />
            {nextSetNumber !== 0 && (
              <MenuRow
                label="Skip remaining sets"
                onClick={() => {
                  commit(() =>
                    skipRemainingAction({
                      workout_id: we.workout_id,
                      workout_exercise_id: we.id,
                    }),
                  );
                  onCloseMenu();
                }}
              />
            )}
            {we.skipped_set_numbers.length > 0 && (
              <MenuRow
                label="Unskip all sets"
                onClick={() => {
                  commit(() =>
                    unskipAllAction({
                      workout_id: we.workout_id,
                      workout_exercise_id: we.id,
                    }),
                  );
                  onCloseMenu();
                }}
              />
            )}
            <MenuRow
              label="Remove exercise"
              destructive
              onClick={() => {
                commit(async () => {
                  const result = await removeExerciseAction({
                    workout_id: we.workout_id,
                    workout_exercise_id: we.id,
                  });
                  setRemoveError(result.error);
                });
                onCloseMenu();
              }}
            />
          </>
        )}
      </AnchoredMenu>
    </div>
  );
}

/**
 * Menu card anchored to a trigger button, fixed to the viewport so it never
 * runs off-screen: opens below the trigger when there's room, otherwise flips
 * above it (fig 1.2/1.3). Carries the offset hard shadow + ink scrim.
 */
function AnchoredMenu({
  open,
  triggerRef,
  align = "right",
  width = 248,
  label,
  onClose,
  children,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  align?: "left" | "right";
  width?: number;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      const card = cardRef.current;
      if (!trigger || !card) return;
      const t = trigger.getBoundingClientRect();
      const h = card.offsetHeight;
      const margin = 8;
      const belowTop = t.bottom + 4;
      const fitsBelow = belowTop + h <= window.innerHeight - margin;
      const top = fitsBelow
        ? belowTop
        : Math.max(margin, t.top - 4 - h);
      let left = align === "right" ? t.right - width : t.left;
      left = Math.min(
        Math.max(margin, left),
        window.innerWidth - width - margin,
      );
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, triggerRef, align, width]);

  useScrollLock(open);

  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink/35"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={cardRef}
        role="menu"
        aria-label={label}
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          width,
          visibility: pos ? "visible" : "hidden",
        }}
        className="fixed z-50 border-[1.5px] border-ink bg-bg-base shadow-menu"
      >
        {children}
      </div>
    </>
  );
}

function MenuRow({
  label,
  trailing,
  destructive = false,
  disabled = false,
  onClick,
}: {
  label: string;
  trailing?: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between border-b border-ink/10 px-4 py-[13px] text-left text-sm last:border-b-0 ${
        destructive
          ? "font-bold text-accent"
          : disabled
            ? "font-semibold text-ink/35"
            : "font-semibold text-ink"
      }`}
    >
      <span>{label}</span>
      {trailing && (
        <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/40">
          {trailing}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// set row — editable LB/REPS cells + LOG checkbox; ⋮ opens the set menu (1.3)
// ---------------------------------------------------------------------------

function SetRow({
  we,
  setNumber,
  state,
  readOnly,
  params,
  targetRir,
  logged,
  isLastRow,
  dropPending,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onToggleDrop,
  onLogged,
  commit,
}: {
  we: LoggedExercise;
  setNumber: number;
  state: "logged" | "skipped" | "next" | "future";
  readOnly: boolean;
  params: EngineParams;
  targetRir: number;
  logged: WorkoutDetail["exercises"][number]["sets"][number] | null;
  isLastRow: boolean;
  dropPending: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onToggleDrop: () => void;
  onLogged: () => void;
  commit: Commit;
}) {
  const prescribedWeight = we.prescribed_weight;
  const prescribedReps = we.prescribed_reps;
  const lastLogged = we.sets.at(-1);
  const anchor = we.e1rm_anchor;
  // per-set planned weight override (doc 11): persists an edited weight for an
  // unlogged set, and is where auto-match writes the shared weight
  const plannedWeight = we.set_weights?.[String(setNumber)] ?? null;

  // reps that land on the target RIR at a given weight, from the recency-
  // weighted strength anchor (doc 11); null when there's no usable history
  const predictReps = (w: number): number | null =>
    predictRepsAtWeight(anchor, w, targetRir, params);

  const initialWeight =
    logged?.weight ?? plannedWeight ?? lastLogged?.weight ?? prescribedWeight ?? 0;
  // unlogged rows start from the predicted reps for their weight; logged rows
  // show what was done; fall back to the prescription when there's no anchor
  const initialReps =
    logged?.reps ??
    (state !== "logged" ? predictReps(initialWeight) : null) ??
    prescribedReps ??
    lastLogged?.reps ??
    8;
  // the planned weight shown on static (future) rows
  const futureWeight = plannedWeight ?? prescribedWeight;
  const [weight, setWeight] = useState(String(initialWeight));
  const [reps, setReps] = useState(String(initialReps));
  const edited = useRef(false);
  // once the user types their own reps, stop auto-predicting for this row
  const repsManual = useRef(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  // per-row transition so the LOG box spins in isolation; the write fires in the
  // background and the box resolves via revalidatePath — no full-page refresh
  const [logging, startLogging] = useTransition();
  const [logError, setLogError] = useState(false);
  const toast = useToast();

  // fire a logging write in the background: the box shows the perimeter spinner
  // while it runs, resolves to its server state on success, or rolls back with a
  // brief shake + a quiet toast on failure (online-only, no offline outbox)
  const runLog = (action: () => Promise<void>, onOk?: () => void) => {
    setLogError(false);
    startLogging(async () => {
      try {
        await action();
        onOk?.();
      } catch {
        setLogError(true);
        toast("Couldn't save that set — check your connection");
      }
    });
  };

  // re-sync when the server state for this row changes (incl. an auto-match or
  // edited planned weight landing via set_weights)
  useEffect(() => {
    setWeight(String(initialWeight));
    setReps(String(initialReps));
    edited.current = false;
    repsManual.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged?.id, logged?.weight, logged?.reps, plannedWeight]);

  // denser rows (09 §5): 32px box, 14px value, 21px log box
  const cellBase =
    "h-[32px] w-full text-center text-[14px] focus:outline-none numeral";
  const cell =
    state === "logged"
      ? `${cellBase} border border-ink/30 bg-ink/5 font-semibold`
      : state === "next"
        ? `${cellBase} border-[1.5px] border-ink bg-paper font-semibold`
        : state === "skipped"
          ? `${cellBase} border border-ink/15 font-medium text-ink/30 line-through`
          : `${cellBase} border border-ink/25 font-medium text-ink/45`;

  // persist an edited planned weight for this unlogged set; the server scopes
  // it to just this set or every unlogged set per the auto-match setting
  const persistPlannedWeight = (w: number) => {
    if (w === (plannedWeight ?? prescribedWeight)) return;
    commit(() =>
      updateSetWeightAction({
        workout_id: we.workout_id,
        workout_exercise_id: we.id,
        set_number: setNumber,
        weight: w,
      }),
    );
  };

  const save = () => {
    const w = Number(weight);
    const r = Number(reps);
    if (Number.isNaN(w) || Number.isNaN(r)) return;
    if (state === "next") {
      // logSetAction carries the weight to the other sets itself when
      // auto-match is on (server-side, after the insert). Fire-and-forget in the
      // background; the side effects (drop reset, feedback prompt) run on success
      runLog(
        () =>
          logSetAction({
            workout_id: we.workout_id,
            workout_exercise_id: we.id,
            set_number: setNumber,
            weight: w,
            reps: r,
            rir_reported: null,
            set_type: dropPending ? "drop" : "straight",
          }),
        () => {
          if (dropPending) onToggleDrop();
          onLogged();
        },
      );
    } else if (state === "logged" && logged && edited.current) {
      commit(() =>
        amendSetAction({
          workout_id: we.workout_id,
          set_id: logged.id,
          weight: w,
          reps: r,
          rir_reported: logged.rir_reported,
        }),
      );
      if (w !== logged.weight) persistPlannedWeight(w);
      edited.current = false;
    }
  };

  const staticCells = state === "future" || state === "skipped";

  return (
    <div
      className={`relative grid grid-cols-[20px_1fr_1fr_44px] items-center gap-2.5 py-[4px] ${
        isLastRow ? "" : "border-b border-ink/15"
      }`}
    >
      <button
        type="button"
        ref={menuBtnRef}
        aria-label={`set ${setNumber} menu`}
        onClick={onOpenMenu}
        className={`text-center text-base leading-[0.5] ${menuOpen ? "font-bold text-ink" : "text-ink/40"}`}
      >
        ⋮
      </button>
      {staticCells ? (
        <>
          <div className={cell.replace("w-full", "") + " flex items-center justify-center"}>
            {futureWeight ?? "—"}
          </div>
          <div className={cell.replace("w-full", "") + " flex items-center justify-center"}>
            {/* future rows show the reps that hit target RIR at the planned
                weight, falling back to the prescription without an anchor */}
            {(futureWeight != null ? predictReps(futureWeight) : null) ??
              prescribedReps ??
              "—"}
          </div>
        </>
      ) : (
        <>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`set ${setNumber} weight`}
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              edited.current = true;
            }}
            onBlur={() => {
              // once the user finishes typing the weight (not live): persist the
              // planned weight so it survives navigation + feeds auto-match, then
              // re-estimate reps unless the user set their own. Only on unlogged
              // rows — a logged row's reps/weight are recorded actuals.
              if (state === "next") {
                const w = Number(weight);
                if (weight !== "" && !Number.isNaN(w)) {
                  if (edited.current) persistPlannedWeight(w);
                  if (!repsManual.current) {
                    const predicted = predictReps(w);
                    if (predicted != null) setReps(String(predicted));
                  }
                }
              } else if (state === "logged") {
                save();
              }
            }}
            className={cell}
          />
          <input
            type="text"
            inputMode="numeric"
            aria-label={`set ${setNumber} reps`}
            value={reps}
            onChange={(e) => {
              setReps(e.target.value);
              edited.current = true;
              repsManual.current = true;
            }}
            onBlur={() => state === "logged" && save()}
            className={cell}
          />
        </>
      )}
      {/* LOG column — ≥44px-wide tap target around the 21px visual box */}
      <div className="flex h-8 items-center justify-center">
        {state === "logged" || state === "next" ? (
          <LogCheckbox
            checked={state === "logged"}
            loading={logging}
            error={logError}
            readOnly={readOnly}
            ariaLabel={
              state === "logged"
                ? `uncheck set ${setNumber}`
                : `log set ${setNumber}`
            }
            onClick={() => {
              if (state === "logged") {
                if (logged)
                  runLog(() =>
                    unlogSetAction({
                      workout_id: we.workout_id,
                      set_id: logged.id,
                    }),
                  );
              } else {
                save();
              }
            }}
          />
        ) : state === "skipped" ? (
          <span className="text-[8px] font-bold tracking-[0.08em] text-ink/40">
            SKIP
          </span>
        ) : (
          <div className="h-[21px] w-[21px] border-[1.5px] border-ink/35" />
        )}
      </div>
      {(state === "next" && dropPending) || logged?.set_type === "drop" ? (
        <span className="absolute -top-1 left-6 text-[8px] font-bold tracking-[0.1em] text-ink/55">
          DROP
        </span>
      ) : null}

      {/* set menu (fig 1.3) */}
      <AnchoredMenu
        open={menuOpen}
        triggerRef={menuBtnRef}
        align="left"
        label={`set ${setNumber} menu`}
        onClose={onCloseMenu}
      >
        <div className="border-b border-ink/25 px-4 pb-[9px] pt-3 text-[9.5px] font-semibold tracking-[0.16em] text-ink/55">
          SET <span className="numeral">{setNumber}</span> —{" "}
          {we.exercise_name.toUpperCase()}
        </div>
        {!readOnly && (
          <MenuRow
            label="Add set below"
            onClick={() => {
              commit(() =>
                addSetAction({
                  workout_id: we.workout_id,
                  workout_exercise_id: we.id,
                }),
              );
              onCloseMenu();
            }}
          />
        )}
        {!readOnly && (state === "next" || state === "future") && (
          <>
            <MenuRow
              label="Set type"
              trailing={`${dropPending ? "DROP" : "STRAIGHT"} ›`}
              onClick={onToggleDrop}
            />
            <MenuRow
              label="Skip set"
              onClick={() => {
                commit(() =>
                  toggleSkipSetAction({
                    workout_id: we.workout_id,
                    workout_exercise_id: we.id,
                    set_number: setNumber,
                    skipped: true,
                  }),
                );
                onCloseMenu();
              }}
            />
            <MenuRow
              label="Delete set"
              destructive
              onClick={() => {
                commit(() =>
                  removeSetAction({
                    workout_id: we.workout_id,
                    workout_exercise_id: we.id,
                  }),
                );
                onCloseMenu();
              }}
            />
          </>
        )}
        {!readOnly && state === "skipped" && (
          <MenuRow
            label="Unskip set"
            onClick={() => {
              commit(() =>
                toggleSkipSetAction({
                  workout_id: we.workout_id,
                  workout_exercise_id: we.id,
                  set_number: setNumber,
                  skipped: false,
                }),
              );
              onCloseMenu();
            }}
          />
        )}
        {state === "logged" &&
          (readOnly ? (
            <MenuRow label="Logged — session locked" disabled />
          ) : (
            <MenuRow
              label="Delete set"
              destructive
              onClick={() => {
                if (logged)
                  commit(() =>
                    deleteSetAction({
                      workout_id: we.workout_id,
                      set_id: logged.id,
                    }),
                  );
                onCloseMenu();
              }}
            />
          ))}
        {readOnly && state !== "logged" && (
          <MenuRow label="Session locked" disabled />
        )}
      </AnchoredMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// note sheet (09 §8) — one sheet for both kinds of exercise note. A "Pin to
// this exercise" checkbox decides where it lands: pinned = an attribute of the
// exercise, shown in every workout; unpinned = a note saved with just this
// session's log. Flipping the pin on an existing note moves it between buckets.
// ---------------------------------------------------------------------------

function NoteSheet({
  sheet,
  workoutId,
  onClose,
  commit,
}: {
  sheet: { we: LoggedExercise; origin: NoteOrigin } | null;
  workoutId: string;
  onClose: () => void;
  commit: Commit;
}) {
  const we = sheet?.we ?? null;
  const origin = sheet?.origin ?? "menu";
  // "pinned" origin edits the pinned note; "menu"/"session" default to the
  // session note (the common mid-workout "note about today" case).
  const originBucket: "pinned" | "session" =
    origin === "pinned" ? "pinned" : "session";
  const originText =
    originBucket === "pinned"
      ? (we?.pinned_note?.body ?? "")
      : (we?.feedback?.notes ?? "");

  const [note, setNote] = useState(originText);
  const [pinned, setPinned] = useState(originBucket === "pinned");
  if (!we) return null;

  const body = note.trim();
  const wid = workoutId;
  // nothing to do only when the box is empty and there was no note here to clear
  const noop = !body && originText.trim() === "";

  const save = () => {
    commit(async () => {
      if (!body) {
        if (originBucket === "pinned")
          await clearPinnedNoteAction({
            workout_id: wid,
            exercise_id: we.exercise_id,
          });
        else
          await saveSessionNoteAction({
            workout_id: wid,
            workout_exercise_id: we.id,
            note: null,
          });
        return;
      }
      if (pinned) {
        await savePinnedNoteAction({
          workout_id: wid,
          exercise_id: we.exercise_id,
          body,
        });
        // moved up from a session note → clear the session copy
        if (originBucket === "session" && we.feedback?.notes)
          await saveSessionNoteAction({
            workout_id: wid,
            workout_exercise_id: we.id,
            note: null,
          });
      } else {
        await saveSessionNoteAction({
          workout_id: wid,
          workout_exercise_id: we.id,
          note: body,
        });
        // moved down from the pinned note → unpin it
        if (originBucket === "pinned")
          await clearPinnedNoteAction({
            workout_id: wid,
            exercise_id: we.exercise_id,
          });
      }
    });
    onClose();
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={originText ? "Edit note" : "Add note"}
      subtitle={we.exercise_name.toUpperCase()}
    >
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={3}
        autoFocus
        className="min-h-16 w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none"
        placeholder="e.g. cambered bar, strict form — or how it felt today"
      />

      {/* pin toggle: decides exercise-wide vs this-session-only */}
      <button
        type="button"
        onClick={() => setPinned((v) => !v)}
        className="mt-3.5 flex w-full items-start gap-2.5 text-left"
      >
        <div
          className={`mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[11px] ${
            pinned ? "bg-accent text-bg-base" : "border-[1.5px] border-ink/40"
          }`}
        >
          {pinned ? "✓" : ""}
        </div>
        <div>
          <div className="text-[12.5px] font-semibold">Pin to this exercise</div>
          <div className="mt-0.5 text-[11px] leading-[1.45] text-ink/55">
            {pinned
              ? "Stays on this exercise in every workout."
              : "Saved with just this session — a note on how it went today."}
          </div>
        </div>
      </button>

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
          disabled={noop}
          onClick={save}
          className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
        >
          {!body && originText ? "CLEAR" : "SAVE"}
        </button>
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// replace exercise (from the 1.2 menu) — picker filtered to the slot's group
// ---------------------------------------------------------------------------

function ReplaceSheet({
  we,
  onClose,
  commit,
}: {
  we: LoggedExercise | null;
  onClose: () => void;
  commit: Commit;
}) {
  const [candidates, setCandidates] = useState<ReplacementCandidate[] | null>(
    null,
  );
  const [search, setSearch] = useState("");
  // #4: repeat the substitution on the same day in future incomplete weeks
  const [repeat, setRepeat] = useState(false);

  useEffect(() => {
    setCandidates(null);
    setSearch("");
    setRepeat(false);
    if (!we?.muscle_group_id) return;
    listReplacementCandidatesAction(we.muscle_group_id).then(setCandidates);
  }, [we]);

  if (!we) return null;
  const q = search.trim().toLowerCase();
  const visible = (candidates ?? []).filter(
    (c) => c.id !== we.exercise_id && (!q || c.name.toLowerCase().includes(q)),
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Replace exercise"
      subtitle={`${we.muscle_group.toUpperCase()} — SWAPS ${we.exercise_name.toUpperCase()}`}
    >
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-[42px] flex-1 border-[1.5px] border-ink bg-paper px-3 text-[13px] text-ink placeholder:text-ink/45 focus:outline-none"
        />
        <div className="flex h-[42px] items-center bg-ink px-3 text-[10px] font-bold tracking-[0.1em] text-bg-base">
          {we.muscle_group.toUpperCase()}
        </div>
      </div>

      {/* #4: repeat across the same day in future weeks (incomplete only) */}
      <button
        type="button"
        onClick={() => setRepeat((r) => !r)}
        aria-pressed={repeat}
        className="mt-2.5 flex w-full items-center gap-2.5 border border-ink/30 px-3 py-2.5 text-left"
      >
        <div
          className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-[11px] ${
            repeat ? "bg-ink text-bg-base" : "border-[1.5px] border-ink/45"
          }`}
        >
          {repeat ? "✓" : ""}
        </div>
        <div className="text-[11.5px] leading-snug text-ink/70">
          Repeat this change on this day in future weeks
        </div>
      </button>

      <div className="mt-3.5 max-h-[42dvh] overflow-y-auto">
        {candidates === null ? (
          <p className="py-4 text-sm text-ink/45">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-4 text-sm text-ink/45">No matches.</p>
        ) : (
          visible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                commit(async () => {
                  await replaceExerciseAction({
                    workout_id: we.workout_id,
                    workout_exercise_id: we.id,
                    exercise_id: c.id,
                    propagate: repeat,
                  });
                });
                onClose();
              }}
              className="flex w-full items-center justify-between border-b border-ink/[0.18] px-0.5 py-[13px] text-left"
            >
              <div>
                <div className="text-[15px] font-bold">{c.name}</div>
                <div className="mt-[3px] text-[9.5px] font-medium tracking-[0.1em] text-ink/55">
                  {c.equipment_type.toUpperCase()} ·{" "}
                  {c.last_performed_at
                    ? `LAST ${shortDate(c.last_performed_at)}`
                    : "NEVER PERFORMED"}
                </div>
              </div>
              <div className="text-[15px] text-ink/40">›</div>
            </button>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// add exercise (workout ⋮ menu) — open picker with muscle-group + equipment
// filters; picks land at the bottom of the day's list and reorder as normal.
// ---------------------------------------------------------------------------

function AddExerciseSheet({
  open,
  workoutId,
  onClose,
}: {
  open: boolean;
  workoutId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    exercises: AddExerciseCandidate[];
    muscleGroups: { id: string; name: string }[];
  } | null>(null);
  const [search, setSearch] = useState("");
  const [mg, setMg] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repeat, setRepeat] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setData(null);
    setSearch("");
    setMg(null);
    setEquip(null);
    setSelected(new Set());
    setRepeat(false);
    listAddExerciseCandidatesAction().then(setData);
  }, [open]);

  if (!open) return null;

  const exercises = data?.exercises ?? [];
  const muscleGroups = data?.muscleGroups ?? [];
  const equipTypes = [...new Set(exercises.map((e) => e.equipment_type))].sort();
  const q = search.trim().toLowerCase();
  const visible = exercises
    .filter((e) => !mg || e.muscle_group_ids.includes(mg))
    .filter((e) => !equip || e.equipment_type === equip)
    .filter((e) => !q || e.name.toLowerCase().includes(q))
    .slice(0, 200);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    startTransition(async () => {
      await addWorkoutExercisesAction({
        workout_id: workoutId,
        exercise_ids: ids,
        propagate: repeat,
      });
      onClose();
    });
  };

  const chip =
    "flex h-8 flex-shrink-0 items-center px-3 text-[10px] font-bold tracking-[0.1em]";

  return (
    <BottomSheet
      open
      fullHeight
      onClose={onClose}
      title="Add exercise"
      subtitle="ADDED TO THE BOTTOM — REORDER AS NORMAL"
    >
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search"
        className="h-[42px] w-full border-[1.5px] border-ink bg-paper px-3 text-[13px] text-ink placeholder:text-ink/45 focus:outline-none"
      />

      {/* muscle-group filter */}
      <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setMg(null)}
          className={`${chip} ${mg === null ? "bg-ink text-bg-base" : "border border-ink/40 text-ink/70"}`}
        >
          ALL GROUPS
        </button>
        {muscleGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setMg(mg === g.id ? null : g.id)}
            className={`${chip} ${mg === g.id ? "bg-ink text-bg-base" : "border border-ink/40 text-ink/70"}`}
          >
            {g.name.toUpperCase()}
          </button>
        ))}
      </div>

      {/* equipment filter */}
      {equipTypes.length > 1 && (
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setEquip(null)}
            className={`${chip} ${equip === null ? "bg-ink text-bg-base" : "border border-ink/40 text-ink/70"}`}
          >
            ALL EQUIP
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
        {data === null ? (
          <p className="py-4 text-sm text-ink/45">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-4 text-sm text-ink/45">No matches.</p>
        ) : (
          visible.map((e) => {
            const sel = selected.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className="flex w-full items-center gap-3 border-b border-ink/[0.18] py-[11px] text-left last:border-b-0"
              >
                <div
                  className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center text-[12px] ${
                    sel ? "bg-ink text-bg-base" : "border-[1.5px] border-ink/40"
                  }`}
                >
                  {sel ? "✓" : ""}
                </div>
                <div className="flex-1">
                  <div className="text-[15px] font-bold">{e.name}</div>
                  <div className="mt-[3px] text-[9.5px] font-medium tracking-[0.1em] text-ink/55">
                    {e.equipment_type.toUpperCase()} ·{" "}
                    {e.last_performed_at
                      ? `LAST ${shortDate(e.last_performed_at)}`
                      : "NEVER PERFORMED"}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* repeat across the same day in future incomplete weeks */}
      <button
        type="button"
        onClick={() => setRepeat((r) => !r)}
        aria-pressed={repeat}
        className="mt-3 flex w-full items-center gap-2.5 border border-ink/30 px-3 py-2.5 text-left"
      >
        <div
          className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-[11px] ${
            repeat ? "bg-ink text-bg-base" : "border-[1.5px] border-ink/45"
          }`}
        >
          {repeat ? "✓" : ""}
        </div>
        <div className="text-[11.5px] leading-snug text-ink/70">
          Repeat this change on this day in future weeks
        </div>
      </button>

      <button
        type="button"
        disabled={selected.size === 0 || pending}
        onClick={add}
        className="mt-3 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.1em] text-bg-base disabled:opacity-40"
      >
        {pending
          ? "ADDING"
          : `ADD ${selected.size > 0 ? selected.size : ""} ${selected.size === 1 ? "EXERCISE" : "EXERCISES"}`.replace(
              "  ",
              " ",
            )}
      </button>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// feedback prompt (fig 1.4)
// ---------------------------------------------------------------------------

const PAIN_OPTIONS = ["None", "Low", "Moderate", "High"];

/**
 * Feedback prompt (fig 1.4), revised 2026-06-16:
 * - After the FIRST exercise of a muscle group → recovery: how sore the user
 *   was from the LAST time they trained that group (0–10) + how many days they
 *   stayed sore (0–5). No joint-pain question here (was redundant).
 * - When the group is COMPLETE (last exercise) → joint pain + pump + workload.
 * - A single-exercise group is both, so it shows everything at once.
 * Editing via the menu re-opens with whatever the row already holds.
 */
function FeedbackSheet({
  we,
  workoutId,
  weekNumber,
  withSoreness,
  withGroupScope,
  onClose,
  commit,
}: {
  we: LoggedExercise | null;
  workoutId: string;
  weekNumber: number;
  withSoreness: boolean;
  withGroupScope: boolean;
  onClose: () => void;
  commit: Commit;
}) {
  // prefill from any existing feedback (editing) — the sheet is keyed per
  // exercise so these initial values are correct on each open
  const existing = we?.feedback ?? null;
  const [pain, setPain] = useState<number | null>(existing?.joint_pain ?? null);
  const [pump, setPump] = useState(existing?.pump ?? 5);
  const [workload, setWorkload] = useState(existing?.workload ?? 5);
  const [soreness, setSoreness] = useState(existing?.soreness ?? 3);
  const [sorenessDays, setSorenessDays] = useState<number | null>(
    existing?.soreness_days ?? null,
  );
  const [workloadInfo, setWorkloadInfo] = useState(true);
  const [pumpInfo, setPumpInfo] = useState(false);

  if (!we) return null;
  const mg = we.muscle_group || "Session";

  // show a section when its role applies OR the row already carries that data
  const showSoreness = withSoreness || existing?.soreness != null;
  const showGroup =
    withGroupScope ||
    existing?.joint_pain != null ||
    existing?.pump != null ||
    existing?.workload != null;

  const disabled =
    (showGroup && pain === null) || (showSoreness && sorenessDays === null);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Feedback"
      subtitle={`${mg.toUpperCase()} — ${showSoreness && !showGroup ? "RECOVERY CHECK" : `AFTER ${we.exercise_name.toUpperCase()}`} · FEEDS W${weekNumber + 1} TARGETS`}
    >
      {showSoreness && (
        <div className={showGroup ? "mb-1" : ""}>
          <div className="text-[13px] font-bold">
            {mg} soreness{" "}
            <span className="text-xs font-normal text-ink/55">
              — from last {mg.toLowerCase()} session
            </span>
          </div>
          <div className="mt-3">
            <SnapSlider
              label={`${mg} soreness last session`}
              value={soreness}
              onChange={setSoreness}
              leftLabel="NONE"
              rightLabel="VERY SORE"
            />
          </div>
          <div className="mt-4 text-[13px] font-bold">
            Days sore{" "}
            <span className="text-xs font-normal text-ink/55">
              — after that session
            </span>
          </div>
          <div className="mt-2 grid grid-cols-6 gap-[6px]">
            {[0, 1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={sorenessDays === d}
                onClick={() => setSorenessDays(d)}
                className={`numeral h-[44px] text-sm ${
                  sorenessDays === d
                    ? "bg-accent font-bold text-bg-base"
                    : "border border-ink/40 font-medium text-ink"
                }`}
              >
                {d === 5 ? "5+" : d}
              </button>
            ))}
          </div>
        </div>
      )}

      {showGroup && (
        <div className={showSoreness ? "mt-5" : ""}>
          <div className="text-[13px] font-bold">
            Joint pain{" "}
            <span className="text-xs font-normal text-ink/55">
              — during {we.exercise_name.toLowerCase()}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-[7px]">
            {PAIN_OPTIONS.map((opt, i) => (
              <button
                key={opt}
                type="button"
                aria-pressed={pain === i}
                onClick={() => setPain(i)}
                className={`h-[46px] text-xs ${
                  pain === i
                    ? "bg-accent font-bold text-bg-base"
                    : "border border-ink/40 font-medium text-ink"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {showGroup && (
        <>
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <div className="text-[13px] font-bold">
                {mg} pump{" "}
                <span className="text-xs font-normal text-ink/55">— today</span>
              </div>
              <button
                type="button"
                aria-label="pump explainer"
                onClick={() => setPumpInfo((v) => !v)}
                className={`flex h-[17px] w-[17px] items-center justify-center rounded-full text-[10px] font-bold ${
                  pumpInfo
                    ? "bg-ink text-bg-base"
                    : "border border-ink/50 text-ink/60"
                }`}
              >
                i
              </button>
            </div>
            {pumpInfo && (
              <div className="mt-2 border-l-2 border-ink py-1.5 pl-2.5 text-[11.5px] leading-normal text-ink/75">
                How full the muscle felt by the last set — a rough proxy for
                whether the volume reached it.
              </div>
            )}
            <div className="mt-3">
              <SnapSlider
                label={`${mg} pump`}
                value={pump}
                onChange={setPump}
                leftLabel="NO PUMP"
                rightLabel="BEST EVER"
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2">
              <div className="text-[13px] font-bold">
                {mg} workload{" "}
                <span className="text-xs font-normal text-ink/55">
                  — whole session
                </span>
              </div>
              <button
                type="button"
                aria-label="workload explainer"
                onClick={() => setWorkloadInfo((v) => !v)}
                className={`flex h-[17px] w-[17px] items-center justify-center rounded-full text-[10px] font-bold ${
                  workloadInfo
                    ? "bg-ink text-bg-base"
                    : "border border-ink/50 text-ink/60"
                }`}
              >
                i
              </button>
            </div>
            {workloadInfo && (
              <div className="mt-2 border-l-2 border-ink py-1.5 pl-2.5 text-[11.5px] leading-normal text-ink/75">
                How taxing all of today&apos;s {mg.toLowerCase()} work felt,
                recovery included. The middle means the dose was right — this
                sets next week&apos;s set count.
              </div>
            )}
            <div className="mt-3">
              <SnapSlider
                label={`${mg} workload`}
                value={workload}
                onChange={setWorkload}
                leftLabel="TOO EASY"
                centerLabel="JUST RIGHT"
                rightLabel="TOO MUCH"
              />
            </div>
          </div>
        </>
      )}

      <div className="mt-6 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            commit(() =>
              saveFeedbackAction({
                workout_id: workoutId,
                workout_exercise_id: we.id,
                joint_pain: showGroup ? pain : null,
                muscle_group_id:
                  showGroup || showSoreness ? we.muscle_group_id : null,
                pump: showGroup ? pump : null,
                workload: showGroup ? workload : null,
                soreness: showSoreness ? soreness : null,
                soreness_days: showSoreness ? sorenessDays : null,
              }),
            );
            onClose();
          }}
          className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
        >
          SAVE
        </button>
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// workout complete (fig 1.5, redesigned per 09 2026-06-13 §2 + 2026-06-14 §1):
// counts + the three session sliders + notes + NEXT WORKOUT →. No
// autoregulation panel, no stats link — recalculation happens silently.
// ---------------------------------------------------------------------------

const SESSION_SLIDERS = [
  {
    key: "fatigue",
    title: "Overall fatigue",
    left: "FRESH",
    right: "WIPED OUT",
  },
  { key: "effort", title: "Effort", left: "EASY", right: "ALL OUT" },
  {
    key: "performance",
    title: "Performance",
    left: "OFF DAY",
    right: "STRONG",
  },
] as const;

function CompleteSheet({
  open,
  detail,
  onClose,
}: {
  open: boolean;
  detail: WorkoutDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [fatigue, setFatigue] = useState(2);
  const [effort, setEffort] = useState(2);
  const [performance, setPerformance] = useState(2);
  const [completing, startCompleting] = useTransition();
  const { render, shown } = useSheetTransition(open);
  const sliderValue = { fatigue, effort, performance };
  const setSlider = { fatigue: setFatigue, effort: setEffort, performance: setPerformance };
  useScrollLock(render);
  if (!render) return null;

  const { workout, microcycle, exercises } = detail;
  const loggedExercises = exercises.filter((we) => we.sets.length > 0);
  const loggedSets = exercises.reduce((n, we) => n + we.sets.length, 0);
  const totalSets = exercises
    .filter((we) => we.status !== "skipped")
    .reduce((n, we) => n + Math.max(we.prescribed_sets ?? 1, we.sets.length), 0);
  const skippedCount = exercises.length - loggedExercises.length;

  // single action: save session feedback, complete, advance, then move on.
  // The engine recalculation is silent (09 2026-06-13 §2).
  const finish = () =>
    startCompleting(async () => {
      const res = await completeWorkoutAction({
        workout_id: workout.id,
        notes: notes.trim() || null,
        overall_fatigue: fatigue,
        effort_rating: effort,
        performance_rating: performance,
      });
      router.push(res.nextWorkoutId ? `/log/${res.nextWorkoutId}` : "/workout");
    });

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-ink/45 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto border-t-2 border-ink bg-bg-base px-5 pb-[max(2.75rem,env(safe-area-inset-bottom))] pt-6 transition-transform duration-[280ms] ease-out ${shown ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex items-baseline justify-between">
          <div className="text-[30px] font-extrabold tracking-[-0.02em]">
            W{microcycle.week_number}·D{workout.day_number} complete.
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="-mr-2 flex min-h-11 min-w-11 items-center justify-center text-base text-ink/50"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 border-t-[1.5px] border-ink">
          <div className="flex justify-between border-b border-ink/20 py-3 text-sm">
            <span className="font-medium text-ink/70">Exercises completed</span>
            <span className="numeral font-bold">{loggedExercises.length}</span>
          </div>
          <div className="flex justify-between border-b border-ink/20 py-3 text-sm">
            <span className="font-medium text-ink/70">Sets logged</span>
            <span className="numeral font-bold">
              {loggedSets} / {totalSets}
            </span>
          </div>
          <div className="flex justify-between border-b border-ink/20 py-3 text-sm">
            <span className="font-medium text-ink/70">Skipped</span>
            <span className="numeral font-bold">{skippedCount}</span>
          </div>
        </div>

        {/* session feedback — same slider UI as the per-exercise prompt (1.4);
            feeds the engine's session-level dampener (10 §3) */}
        <div className="mt-[18px]">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            SESSION — FEEDS NEXT WEEK&apos;S TARGETS
          </div>
          {SESSION_SLIDERS.map((s) => (
            <div key={s.key} className="mt-3.5">
              <div className="text-[13px] font-bold">{s.title}</div>
              <div className="mt-2">
                <SnapSlider
                  label={s.title}
                  max={4}
                  value={sliderValue[s.key]}
                  onChange={setSlider[s.key]}
                  leftLabel={s.left}
                  rightLabel={s.right}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            WORKOUT NOTES — SAVED WITH SESSION
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
            className="mt-[7px] min-h-16 w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none"
            placeholder="Anything worth remembering about this session"
          />
        </div>

        <button
          type="button"
          disabled={completing}
          onClick={finish}
          className="mt-[22px] flex w-full items-center justify-center gap-2.5 bg-ink py-[17px] text-center text-sm font-bold tracking-[0.1em] text-bg-base disabled:opacity-60"
        >
          {completing ? (
            "SAVING…"
          ) : (
            <>
              NEXT WORKOUT <span className="text-[15px]">→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SnapSlider } from "@/components/ui/SnapSlider";
import { HistorySheet } from "@/components/HistorySheet";
import type {
  LoggedExercise,
  NavWeek,
  WorkoutDetail,
} from "@/lib/queries/logging";
import type { Units } from "@/lib/types/database";
import {
  addSetAction,
  amendSetAction,
  completeWorkoutAction,
  deleteSetAction,
  listReplacementCandidatesAction,
  logSetAction,
  moveExerciseDownAction,
  removeExerciseAction,
  removeSetAction,
  replaceExerciseAction,
  saveFeedbackAction,
  savePinnedNoteAction,
  skipRemainingAction,
  toggleSkipSetAction,
  unlogSetAction,
  type ReplacementCandidate,
} from "../actions";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function shortDate(iso: string | null): string {
  const d = iso ? new Date(`${iso.slice(0, 10)}T12:00:00`) : new Date();
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

type Commit = (fn: () => Promise<void>) => void;

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
}: {
  detail: WorkoutDetail;
  units: Units;
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
  const [noteFor, setNoteFor] = useState<LoggedExercise | null>(null);
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

  const isLastOfGroup = (we: LoggedExercise) =>
    exercises
      .filter((x) => x.muscle_group_id === we.muscle_group_id && x.id !== we.id)
      .every(exerciseDone);

  return (
    <div>
      <DayHeader
        mesoName={mesocycle.name}
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
          onNote={() => setNoteFor(we)}
          onToggleDrop={() =>
            setDropPending((cur) => ({ ...cur, [we.id]: !cur[we.id] }))
          }
          onLogged={(wasLast) => {
            if (wasLast && !we.feedback) setFeedbackFor(we);
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
        we={noteFor}
        workoutId={workout.id}
        onClose={() => setNoteFor(null)}
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
        we={feedbackFor}
        workoutId={workout.id}
        weekNumber={microcycle.week_number}
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
  mesoName,
  weekNumber,
  dayNumber,
  isDeload,
  targetRir,
  dateLabel,
  loggedSets,
  totalSets,
  navWeeks,
}: {
  mesoName: string;
  weekNumber: number;
  dayNumber: number;
  isDeload: boolean;
  targetRir: number;
  dateLabel: string;
  loggedSets: number;
  totalSets: number;
  navWeeks: NavWeek[];
}) {
  // the navigator stays open across day navigation until the user closes it
  const [open, setOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(weekNumber);
  useEffect(() => {
    setOpen(sessionStorage.getItem("dayNavOpen") === "1");
  }, []);
  const toggleOpen = () =>
    setOpen((v) => {
      const next = !v;
      sessionStorage.setItem("dayNavOpen", next ? "1" : "0");
      return next;
    });

  const pct = totalSets > 0 ? Math.round((loggedSets / totalSets) * 100) : 0;
  const rirLabel = isDeload ? "DELOAD WEEK" : `TARGET ${targetRir} RIR`;
  const selWeek =
    navWeeks.find((w) => w.weekNumber === selectedWeek) ??
    navWeeks.find((w) => w.weekNumber === weekNumber);
  const lastIdx = navWeeks.length - 1;

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
              stroke="#17140F"
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
        className="grid transition-all duration-300"
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
                const isCurrentWeek = w.weekNumber === weekNumber;
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
                    {isCurrentWeek && !isSel && (
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
                      {d.status === "current" && !viewing && (
                        <span className="absolute right-1 top-1 h-[5px] w-[5px] rounded-full bg-accent" />
                      )}
                    </>
                  );
                  const chipClass = `relative flex h-[30px] flex-1 items-center justify-center text-[10.5px] tracking-[0.04em] ${cls}`;
                  return d.workoutId && !viewing ? (
                    <Link
                      key={d.dayNumber}
                      href={`/log/${d.workoutId}`}
                      className={chipClass}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={d.dayNumber} className={chipClass}>
                      {content}
                    </div>
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
          <div className="text-right text-[10px] font-medium leading-[1.5] tracking-[0.1em] text-ink/60">
            {dateLabel}
            <br />
            <span className="font-bold text-accent">{rirLabel}</span>
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
// exercise block + set grid (fig 1.1)
// ---------------------------------------------------------------------------

function ExerciseBlock({
  we,
  index,
  units,
  readOnly,
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
  onToggleDrop,
  onLogged,
  commit,
}: {
  we: LoggedExercise;
  index: number;
  units: Units;
  readOnly: boolean;
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
  onNote: () => void;
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
              <circle cx="7" cy="7" r="5.5" fill="none" stroke="#17140F" strokeWidth="1.3" />
              <path d="M7 4v3l2 1.5" fill="none" stroke="#17140F" strokeWidth="1.3" />
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
        <div className="mt-[7px] border-l-2 border-ink py-[5px] pl-2.5 text-[11px] font-medium text-ink/70">
          PINNED — {we.pinned_note.body}
        </div>
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
          label={we.pinned_note ? "Edit pinned note" : "New note"}
          onClick={() => {
            onCloseMenu();
            onNote();
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
  const initialWeight =
    logged?.weight ?? lastLogged?.weight ?? prescribedWeight ?? 0;
  const initialReps = logged?.reps ?? prescribedReps ?? lastLogged?.reps ?? 8;
  const [weight, setWeight] = useState(String(initialWeight));
  const [reps, setReps] = useState(String(initialReps));
  const edited = useRef(false);
  const router = useRouter();
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // re-sync when the server state for this row changes
  useEffect(() => {
    setWeight(String(initialWeight));
    setReps(String(initialReps));
    edited.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged?.id, logged?.weight, logged?.reps]);

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

  const save = () => {
    const w = Number(weight);
    const r = Number(reps);
    if (Number.isNaN(w) || Number.isNaN(r)) return;
    if (state === "next") {
      commit(() =>
        logSetAction({
          workout_id: we.workout_id,
          workout_exercise_id: we.id,
          set_number: setNumber,
          weight: w,
          reps: r,
          rir_reported: null,
          set_type: dropPending ? "drop" : "straight",
        }),
      );
      if (dropPending) onToggleDrop();
      onLogged();
      router.refresh();
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
            {prescribedWeight ?? "—"}
          </div>
          <div className={cell.replace("w-full", "") + " flex items-center justify-center"}>
            {prescribedReps ?? "—"}
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
            onBlur={() => state === "logged" && save()}
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
            }}
            onBlur={() => state === "logged" && save()}
            className={cell}
          />
        </>
      )}
      {/* LOG column — ≥44px-wide tap target around the 21px visual box */}
      <div className="flex h-8 items-center justify-center">
        {state === "logged" ? (
          readOnly ? (
            <div className="flex h-[21px] w-[21px] items-center justify-center bg-ink text-[12px] text-bg-base">
              ✓
            </div>
          ) : (
            <button
              type="button"
              aria-label={`uncheck set ${setNumber}`}
              onClick={() => {
                if (logged)
                  commit(() =>
                    unlogSetAction({
                      workout_id: we.workout_id,
                      set_id: logged.id,
                    }),
                  );
              }}
              className="flex h-[21px] w-[21px] items-center justify-center bg-ink text-[12px] text-bg-base"
            >
              ✓
            </button>
          )
        ) : state === "next" ? (
          <button
            type="button"
            aria-label={`log set ${setNumber}`}
            onClick={save}
            className="h-[21px] w-[21px] border-2 border-ink"
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
// note sheet (from the 1.2 menu)
// ---------------------------------------------------------------------------

function NoteSheet({
  we,
  workoutId,
  onClose,
  commit,
}: {
  we: LoggedExercise | null;
  workoutId: string;
  onClose: () => void;
  commit: Commit;
}) {
  const [note, setNote] = useState("");
  if (!we) return null;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="New note"
      subtitle={`${we.exercise_name.toUpperCase()} — PINNED IN EVERY WORKOUT`}
    >
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={3}
        autoFocus
        className="min-h-16 w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none"
        placeholder="e.g. handle grip, underhand, strict"
      />
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
          disabled={!note.trim()}
          onClick={() => {
            commit(() =>
              savePinnedNoteAction({
                workout_id: workoutId,
                exercise_id: we.exercise_id,
                body: note.trim(),
              }),
            );
            setNote("");
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

  useEffect(() => {
    setCandidates(null);
    setSearch("");
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

      <div className="mt-3.5 max-h-[46dvh] overflow-y-auto">
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
// feedback prompt (fig 1.4)
// ---------------------------------------------------------------------------

const PAIN_OPTIONS = ["None", "Low", "Moderate", "High"];

function FeedbackSheet({
  we,
  workoutId,
  weekNumber,
  withGroupScope,
  onClose,
  commit,
}: {
  we: LoggedExercise | null;
  workoutId: string;
  weekNumber: number;
  withGroupScope: boolean;
  onClose: () => void;
  commit: Commit;
}) {
  const [pain, setPain] = useState<number | null>(null);
  const [pump, setPump] = useState(5);
  const [workload, setWorkload] = useState(5);
  const [workloadInfo, setWorkloadInfo] = useState(true);
  const [pumpInfo, setPumpInfo] = useState(false);

  if (!we) return null;
  const mg = we.muscle_group || "Session";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Feedback"
      subtitle={`${mg.toUpperCase()} — AFTER ${we.exercise_name.toUpperCase()} · FEEDS W${weekNumber + 1} TARGETS`}
    >
      <div>
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

      {withGroupScope && (
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
          disabled={pain === null}
          onClick={() => {
            commit(() =>
              saveFeedbackAction({
                workout_id: workoutId,
                workout_exercise_id: we.id,
                joint_pain: pain,
                muscle_group_id: withGroupScope ? we.muscle_group_id : null,
                pump: withGroupScope ? pump : null,
                workload: withGroupScope ? workload : null,
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
  const sliderValue = { fatigue, effort, performance };
  const setSlider = { fatigue: setFatigue, effort: setEffort, performance: setPerformance };
  if (!open) return null;

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
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto border-t-2 border-ink bg-bg-base px-5 pb-[max(2.75rem,env(safe-area-inset-bottom))] pt-6">
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

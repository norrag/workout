"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SnapSlider } from "@/components/ui/SnapSlider";
import { WeekTrack, type WeekTrackWeek } from "@/components/ui/WeekTrack";
import type { LoggedExercise, WorkoutDetail } from "@/lib/queries/logging";
import type { AdvanceResult } from "@/lib/queries/progression";
import type { Units } from "@/lib/types/database";
import {
  addSetAction,
  amendSetAction,
  completeWorkoutAction,
  getExerciseHistoryAction,
  logSetAction,
  moveExerciseDownAction,
  removeExerciseAction,
  saveFeedbackAction,
  savePinnedNoteAction,
  skipRemainingAction,
  skipSetAction,
  type HistoryEntry,
} from "../actions";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function shortDate(iso: string | null): string {
  const d = iso ? new Date(`${iso.slice(0, 10)}T12:00:00`) : new Date();
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

type Commit = (fn: () => Promise<void>) => void;

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
  const { workout, microcycle, mesocycle, microcycles, exercises } = detail;
  const readOnly = workout.status === "completed" || workout.status === "skipped";
  const [, startTransition] = useTransition();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [setMenu, setSetMenu] = useState<{
    weId: string;
    setNumber: number;
  } | null>(null);
  const [historyFor, setHistoryFor] = useState<LoggedExercise | null>(null);
  const [noteFor, setNoteFor] = useState<LoggedExercise | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<LoggedExercise | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [dropPending, setDropPending] = useState<Record<string, boolean>>({});

  const commit: Commit = (fn) => startTransition(fn);

  const weeks: WeekTrackWeek[] = microcycles.map((micro) => ({
    label: micro.is_deload ? "DL" : `W${micro.week_number}`,
    state:
      micro.status === "completed"
        ? "complete"
        : micro.id === microcycle.id
          ? "current"
          : "future",
    isDeload: micro.is_deload,
  }));

  const totalSets = exercises
    .filter((we) => we.status !== "skipped")
    .reduce((n, we) => n + Math.max(we.prescribed_sets ?? 1, we.sets.length), 0);
  const loggedSets = exercises.reduce((n, we) => n + we.sets.length, 0);

  const exerciseDone = (we: LoggedExercise) =>
    we.status === "skipped" || we.sets.length >= (we.prescribed_sets ?? 1);
  const allDone = exercises.length > 0 && exercises.every(exerciseDone);

  const isLastOfGroup = (we: LoggedExercise) =>
    exercises
      .filter((x) => x.muscle_group_id === we.muscle_group_id && x.id !== we.id)
      .every(exerciseDone);

  return (
    <div>
      {/* brand row */}
      <div className="flex items-baseline justify-between">
        <div className="logotype text-[13px] font-semibold">workout</div>
        <div className="label-caps text-[10px] font-medium tracking-[0.1em] text-ink/55">
          {mesocycle.name.toUpperCase()}
        </div>
      </div>

      {/* meso track */}
      <div className="mt-3.5">
        <WeekTrack weeks={weeks} />
      </div>
      <div className="mt-1.5 flex justify-between text-[9.5px] font-medium tracking-[0.1em] text-ink/50">
        <span>{detail.contextLabel}</span>
        <span className="font-bold text-accent">
          ● {microcycle.is_deload ? "DELOAD" : `WEEK ${microcycle.week_number}`} —
          TARGET {microcycle.target_rir} RIR
        </span>
      </div>

      {/* coordinate */}
      <div className="mt-4 flex items-end justify-between border-b-[1.5px] border-ink pb-3">
        <div className="text-[46px] font-extrabold leading-[0.9] tracking-[-0.03em]">
          W{microcycle.week_number}·D{workout.day_number}
        </div>
        <div className="text-right text-[10px] font-medium leading-[1.5] tracking-[0.1em] text-ink/60">
          {shortDate(workout.scheduled_date ?? workout.performed_at)}
          <br />
          <span className="numeral">{loggedSets}</span> OF{" "}
          <span className="numeral">{totalSets}</span> SETS LOGGED
        </div>
      </div>

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

      {!readOnly && loggedSets > 0 && (
        <button
          type="button"
          onClick={() => setCompleteOpen(true)}
          className={`mt-6 w-full py-4 text-center text-[13px] font-bold tracking-[0.12em] ${
            allDone
              ? "bg-ink text-bg-base"
              : "border-[1.5px] border-ink text-ink"
          }`}
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
      <HistorySheet we={historyFor} onClose={() => setHistoryFor(null)} />
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
  onNote: () => void;
  onToggleDrop: () => void;
  onLogged: (wasLastPlannedSet: boolean) => void;
  commit: Commit;
}) {
  const skipped = we.status === "skipped";
  const plannedSets = Math.max(we.prescribed_sets ?? 1, we.sets.length);
  const nextSetNumber = we.sets.length + 1;
  const [removeError, setRemoveError] = useState<string | null>(null);

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
          {/* grid header */}
          <div className="mt-2.5 grid grid-cols-[22px_1fr_1fr_50px] gap-2.5 border-b border-ink/25 pb-[5px] text-[9px] font-semibold tracking-[0.14em] text-ink/50">
            <div />
            <div className="text-center">{units.toUpperCase()}</div>
            <div className="text-center">REPS</div>
            <div className="text-center">LOG</div>
          </div>
          {Array.from({ length: plannedSets }, (_, i) => {
            const setNumber = i + 1;
            const logged = we.sets.find((s) => s.set_number === setNumber);
            const state: "logged" | "next" | "future" = logged
              ? "logged"
              : setNumber === nextSetNumber && !readOnly
                ? "next"
                : "future";
            return (
              <SetRow
                key={`${setNumber}-${logged?.id ?? "open"}`}
                we={we}
                setNumber={setNumber}
                state={state}
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
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/35"
            onClick={onCloseMenu}
            aria-hidden
          />
          <div className="absolute right-0 top-8 z-50 w-[248px] border-[1.5px] border-ink bg-bg-base shadow-menu">
            <div className="border-b border-ink/25 px-4 pb-[9px] pt-3 text-[9.5px] font-semibold tracking-[0.16em] text-ink/55">
              EXERCISE — {we.exercise_name.toUpperCase()}
            </div>
            {we.notes && (
              <div className="border-b border-ink/10 px-4 py-2 text-[11px] leading-[1.45] text-ink/60">
                {we.notes}
              </div>
            )}
            <MenuRow
              label="History"
              trailing="›"
              onClick={() => {
                onCloseMenu();
                onHistory();
              }}
            />
            <MenuRow
              label={we.pinned_note ? "Replace note" : "New note"}
              onClick={() => {
                onCloseMenu();
                onNote();
              }}
            />
            <MenuRow label="Replace exercise" trailing="SOON" disabled />
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
          </div>
        </>
      )}
    </div>
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
  state: "logged" | "next" | "future";
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

  // re-sync when the server state for this row changes
  useEffect(() => {
    setWeight(String(initialWeight));
    setReps(String(initialReps));
    edited.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged?.id, logged?.weight, logged?.reps]);

  const cellBase =
    "h-[42px] w-full text-center text-[17px] focus:outline-none numeral";
  const cell =
    state === "logged"
      ? `${cellBase} border border-ink/30 bg-ink/5 font-semibold`
      : state === "next"
        ? `${cellBase} border-[1.5px] border-ink bg-paper font-semibold`
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

  return (
    <div
      className={`relative grid grid-cols-[22px_1fr_1fr_50px] items-center gap-2.5 py-[7px] ${
        isLastRow ? "" : "border-b border-ink/15"
      }`}
    >
      <button
        type="button"
        aria-label={`set ${setNumber} menu`}
        onClick={onOpenMenu}
        className={`text-center text-base leading-[0.5] ${menuOpen ? "font-bold text-ink" : "text-ink/40"}`}
      >
        ⋮
      </button>
      {state === "future" ? (
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
      <div className="flex justify-center">
        {state === "logged" ? (
          <div className="flex h-[26px] w-[26px] items-center justify-center bg-ink text-sm text-bg-base">
            ✓
          </div>
        ) : state === "next" ? (
          <button
            type="button"
            aria-label={`log set ${setNumber}`}
            onClick={save}
            className="h-[26px] w-[26px] border-2 border-ink"
          />
        ) : (
          <div className="h-[26px] w-[26px] border-[1.5px] border-ink/35" />
        )}
      </div>
      {(state === "next" && dropPending) || logged?.set_type === "drop" ? (
        <span className="absolute -top-1 left-6 text-[8px] font-bold tracking-[0.1em] text-ink/55">
          DROP
        </span>
      ) : null}

      {/* set menu (fig 1.3) */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/35"
            onClick={onCloseMenu}
            aria-hidden
          />
          <div className="absolute left-0 top-12 z-50 w-[248px] border-[1.5px] border-ink bg-bg-base shadow-menu">
            <div className="border-b border-ink/25 px-4 pb-[9px] pt-3 text-[9.5px] font-semibold tracking-[0.16em] text-ink/55">
              SET <span className="numeral">{setNumber}</span> —{" "}
              {we.exercise_name.toUpperCase()}
            </div>
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
            {state !== "logged" && (
              <MenuRow
                label="Set type"
                trailing={`${dropPending ? "DROP" : "STRAIGHT"} ›`}
                onClick={onToggleDrop}
              />
            )}
            {state !== "logged" && (
              <MenuRow
                label="Skip set"
                onClick={() => {
                  commit(() =>
                    skipSetAction({
                      workout_id: we.workout_id,
                      workout_exercise_id: we.id,
                    }),
                  );
                  onCloseMenu();
                }}
              />
            )}
            {state !== "logged" ? (
              <MenuRow
                label="Delete set"
                destructive
                onClick={() => {
                  commit(() =>
                    skipSetAction({
                      workout_id: we.workout_id,
                      workout_exercise_id: we.id,
                    }),
                  );
                  onCloseMenu();
                }}
              />
            ) : (
              // logged history is append-only (hard rule) — no delete
              <MenuRow label="Logged — edit cells to amend" disabled />
            )}
          </div>
        </>
      )}
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
// history sheet (fig 3.2)
// ---------------------------------------------------------------------------

function HistorySheet({
  we,
  onClose,
}: {
  we: LoggedExercise | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (!we) {
      setEntries(null);
      return;
    }
    getExerciseHistoryAction(we.exercise_id).then(setEntries);
  }, [we]);

  if (!we) return null;

  // group consecutive entries by meso
  const groups: { meso: string; rows: HistoryEntry[] }[] = [];
  for (const e of entries ?? []) {
    const last = groups.at(-1);
    if (last && last.meso === e.meso_name) last.rows.push(e);
    else groups.push({ meso: e.meso_name, rows: [e] });
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="History"
      subtitle={`${we.exercise_name.toUpperCase()} — ${we.equipment_type.toUpperCase()}`}
    >
      {entries === null ? (
        <p className="py-4 text-sm text-ink/45">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="py-4 text-sm text-ink/45">Never logged.</p>
      ) : (
        groups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-6" : ""}>
            <div
              className={`border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em] ${gi > 0 ? "text-ink/55" : ""}`}
            >
              {group.meso.toUpperCase()}
            </div>
            {group.rows.map((row, ri) => (
              <div
                key={ri}
                className={`flex items-baseline justify-between border-b border-ink/15 py-3 ${gi > 0 ? "text-ink/55" : ""}`}
              >
                <div className="numeral text-base font-bold">
                  {row.top_weight} lb{" "}
                  <span className="text-[13px] font-normal text-ink/50">×</span>{" "}
                  {row.reps}
                  {row.is_deload && (
                    <span className="ml-1.5 border border-ink/40 px-[5px] py-[2px] align-[2px] text-[8.5px] font-bold tracking-[0.1em]">
                      DELOAD
                    </span>
                  )}
                </div>
                <div className="text-right text-[10px] font-semibold tracking-[0.1em] text-ink/55">
                  {row.coordinate} — {shortDate(row.performed_on).slice(4)}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
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
// workout complete (fig 1.5)
// ---------------------------------------------------------------------------

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
  const [completing, startCompleting] = useTransition();
  const [result, setResult] = useState<AdvanceResult | null>(null);
  if (!open) return null;

  const { workout, microcycle, exercises } = detail;
  const loggedExercises = exercises.filter((we) => we.sets.length > 0);
  const loggedSets = exercises.reduce((n, we) => n + we.sets.length, 0);
  const totalSets = exercises
    .filter((we) => we.status !== "skipped")
    .reduce((n, we) => n + Math.max(we.prescribed_sets ?? 1, we.sets.length), 0);
  const skippedCount = exercises.length - loggedExercises.length;

  const complete = () =>
    startCompleting(async () => {
      const res = await completeWorkoutAction({
        workout_id: workout.id,
        notes: notes.trim() || null,
      });
      setResult(res);
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

        <div className="mt-[18px] border border-ink/35 px-4 py-3.5">
          <div className="text-[10px] font-bold tracking-[0.14em] text-accent">
            AUTOREGULATION
          </div>
          <div className="mt-1.5 text-[13px] leading-[1.55] text-ink/80">
            {result
              ? result.summary
              : `Feedback feeds W${microcycle.week_number + 1} targets — they recalculate when you complete.`}
          </div>
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
            disabled={result !== null}
            className="mt-[7px] min-h-16 w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none disabled:text-ink/60"
            placeholder="Anything worth remembering about this session"
          />
        </div>

        <a
          href={`/cycles/meso/${detail.mesocycle.id}`}
          className="mt-5 block text-center text-xs font-semibold text-ink/70 underline underline-offset-[3px]"
        >
          View meso stats
        </a>
        {result ? (
          <button
            type="button"
            onClick={() =>
              router.push(
                result.nextWorkoutId ? `/log/${result.nextWorkoutId}` : "/workout",
              )
            }
            className="mt-3.5 w-full bg-ink py-[17px] text-center text-sm font-bold tracking-[0.1em] text-bg-base"
          >
            {result.nextLabel ? `NEXT — ${result.nextLabel}` : "DONE"}
          </button>
        ) : (
          <button
            type="button"
            disabled={completing}
            onClick={complete}
            className="mt-3.5 w-full bg-ink py-[17px] text-center text-sm font-bold tracking-[0.1em] text-bg-base disabled:opacity-60"
          >
            {completing
              ? "RECALCULATING…"
              : `COMPLETE W${microcycle.week_number}·D${workout.day_number}`}
          </button>
        )}
      </div>
    </div>
  );
}

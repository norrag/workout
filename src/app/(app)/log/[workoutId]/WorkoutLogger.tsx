"use client";

import { useMemo, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FeedbackScale } from "@/components/ui/FeedbackScale";
import { MenuCard, MenuItem } from "@/components/ui/MenuCard";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SnapSlider } from "@/components/ui/SnapSlider";
import type { LoggedExercise, WorkoutDetail } from "@/lib/queries/logging";
import type { Units } from "@/lib/types/database";
import {
  addSetAction,
  amendSetAction,
  completeWorkoutAction,
  logSetAction,
  removeExerciseAction,
  saveFeedbackAction,
  savePinnedNoteAction,
  skipRemainingAction,
  skipSetAction,
} from "../actions";

const PAIN_OPTIONS = ["NONE", "LOW", "MODERATE", "HIGH"] as const;

function weightStep(units: Units): number {
  return units === "lb" ? 5 : 2.5;
}

/** Day view (fig 1.1) with one-thumb logging, menus 1.2/1.3, feedback 1.4,
 * completion 1.5. */
export function WorkoutLogger({
  detail,
  units,
}: {
  detail: WorkoutDetail;
  units: Units;
}) {
  const { workout, exercises } = detail;
  const readOnly = workout.status === "completed" || workout.status === "skipped";
  const [pending, startTransition] = useTransition();
  const [menuFor, setMenuFor] = useState<LoggedExercise | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<LoggedExercise | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);

  // group consecutive exercises under their muscle-group headers
  const groups = useMemo(() => {
    const out: { name: string; mgId: string | null; items: LoggedExercise[] }[] =
      [];
    for (const we of exercises) {
      const name = we.muscle_group || "OTHER";
      const last = out.at(-1);
      if (last && last.name === name) last.items.push(we);
      else out.push({ name, mgId: we.muscle_group_id, items: we ? [we] : [] });
    }
    return out;
  }, [exercises]);

  const exerciseDone = (we: LoggedExercise) =>
    we.status === "skipped" || we.sets.length >= (we.prescribed_sets ?? 1);
  const allDone = exercises.length > 0 && exercises.every(exerciseDone);

  /** the exercise finishing now is the group's last open one → group-scope
   * pump/workload sliders join the prompt (fig 1.4) */
  const isLastOfGroup = (we: LoggedExercise) =>
    exercises
      .filter((x) => x.muscle_group_id === we.muscle_group_id && x.id !== we.id)
      .every(exerciseDone);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group, gi) => (
        <section key={gi}>
          <h2 className="label-caps border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
            <span className="numeral">{String(gi + 1).padStart(2, "0")}</span>
            {" — "}
            {group.name.toUpperCase()}
          </h2>
          <div className="flex flex-col divide-y divide-ink/15">
            {group.items.map((we) => (
              <ExerciseBlock
                key={we.id}
                we={we}
                units={units}
                readOnly={readOnly}
                pending={pending}
                onMenu={() => setMenuFor(we)}
                onLogged={(wasLast) => {
                  if (wasLast && !we.feedback) setFeedbackFor(we);
                }}
                commit={(fn) => startTransition(fn)}
              />
            ))}
          </div>
        </section>
      ))}

      {!readOnly && (
        <Button
          variant={allDone ? "primary" : "secondary"}
          className="w-full"
          onClick={() => setCompleteOpen(true)}
        >
          Complete workout
        </Button>
      )}

      <ExerciseMenu
        we={menuFor}
        workoutId={workout.id}
        readOnly={readOnly}
        onClose={() => setMenuFor(null)}
        commit={(fn) => startTransition(fn)}
      />

      <FeedbackSheet
        we={feedbackFor}
        workoutId={workout.id}
        withGroupScope={feedbackFor ? isLastOfGroup(feedbackFor) : false}
        onClose={() => setFeedbackFor(null)}
        commit={(fn) => startTransition(fn)}
      />

      <CompleteSheet
        open={completeOpen}
        detail={detail}
        units={units}
        pending={pending}
        onClose={() => setCompleteOpen(false)}
        commit={(fn) => startTransition(fn)}
      />
    </div>
  );
}

function ExerciseBlock({
  we,
  units,
  readOnly,
  pending,
  onMenu,
  onLogged,
  commit,
}: {
  we: LoggedExercise;
  units: Units;
  readOnly: boolean;
  pending: boolean;
  onMenu: () => void;
  onLogged: (wasLastPlannedSet: boolean) => void;
  commit: (fn: () => Promise<void>) => void;
}) {
  const plannedSets = we.prescribed_sets ?? 1;
  const nextSetNumber = we.sets.length + 1;
  const skipped = we.status === "skipped";
  const [weight, setWeight] = useState(
    we.sets.at(-1)?.weight ?? we.prescribed_weight ?? 0,
  );
  const [reps, setReps] = useState(
    we.sets.at(-1)?.reps ?? we.prescribed_reps ?? 8,
  );
  const [rir, setRir] = useState<number>(we.target_rir ?? 2);
  const [setType, setSetType] = useState<"straight" | "drop">("straight");
  const [amending, setAmending] = useState<string | null>(null);

  return (
    <div className={`py-3 ${skipped ? "opacity-40" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold">{we.exercise_name}</p>
          <p className="label-caps text-[9px] font-medium text-ink/45">
            {we.equipment_type.toUpperCase()}
            {skipped ? " · SKIPPED" : ""}
          </p>
          {we.pinned_note && (
            <p className="mt-1 border-l-2 border-ink/25 pl-2 text-xs text-ink/55">
              {we.pinned_note.body}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={`${we.exercise_name} menu`}
          onClick={onMenu}
          className="flex min-h-11 min-w-11 items-center justify-center text-lg text-ink/55"
        >
          ⋯
        </button>
      </div>

      {!skipped && (
        <div className="mt-2 flex flex-col gap-1">
          {Array.from(
            { length: Math.max(plannedSets, we.sets.length) },
            (_, i) => {
              const setNumber = i + 1;
              const logged = we.sets.find((s) => s.set_number === setNumber);
              if (logged) {
                return amending === logged.id && !readOnly ? (
                  <div
                    key={setNumber}
                    className="border-[1.5px] border-ink p-3"
                  >
                    <LogControls
                      weight={weight}
                      reps={reps}
                      rir={rir}
                      units={units}
                      setWeight={setWeight}
                      setReps={setReps}
                      setRir={setRir}
                      pending={pending}
                      submitLabel="Amend set"
                      onSubmit={() => {
                        commit(() =>
                          amendSetAction({
                            workout_id: we.workout_id,
                            set_id: logged.id,
                            weight,
                            reps,
                            rir_reported: rir,
                          }),
                        );
                        setAmending(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    key={setNumber}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      setWeight(logged.weight);
                      setReps(logged.reps);
                      setRir(logged.rir_reported ?? we.target_rir ?? 2);
                      setAmending(logged.id);
                    }}
                    className="flex min-h-11 items-center justify-between bg-ink px-3 text-bg-base"
                  >
                    <span className="label-caps text-[9px] font-semibold opacity-70">
                      SET <span className="numeral">{setNumber}</span>
                      {logged.set_type === "drop" ? " · DROP" : ""}
                    </span>
                    <span className="numeral text-sm font-semibold">
                      {logged.weight} × {logged.reps}
                      {logged.rir_reported != null && (
                        <span className="ml-2 text-[10px] opacity-70">
                          {logged.rir_reported} RIR
                        </span>
                      )}
                    </span>
                  </button>
                );
              }
              const isNext = setNumber === nextSetNumber;
              if (isNext && !readOnly) {
                return (
                  <div
                    key={setNumber}
                    className="border-[1.5px] border-accent p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="label-caps text-[9px] font-bold text-accent">
                        SET <span className="numeral">{setNumber}</span> OF{" "}
                        <span className="numeral">{plannedSets}</span>
                      </span>
                      <div className="flex gap-1">
                        <Chip
                          selected={setType === "drop"}
                          onClick={() =>
                            setSetType(setType === "drop" ? "straight" : "drop")
                          }
                          className="!min-h-8 !text-[9px]"
                        >
                          DROP
                        </Chip>
                      </div>
                    </div>
                    <LogControls
                      weight={weight}
                      reps={reps}
                      rir={rir}
                      units={units}
                      setWeight={setWeight}
                      setReps={setReps}
                      setRir={setRir}
                      pending={pending}
                      submitLabel="Log set"
                      onSubmit={() => {
                        const wasLast = nextSetNumber >= plannedSets;
                        commit(() =>
                          logSetAction({
                            workout_id: we.workout_id,
                            workout_exercise_id: we.id,
                            set_number: setNumber,
                            weight,
                            reps,
                            rir_reported: rir,
                            set_type: setType,
                          }),
                        );
                        setSetType("straight");
                        onLogged(wasLast);
                      }}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={setNumber}
                  className="flex min-h-11 items-center justify-between border border-ink/20 px-3 text-ink/45"
                >
                  <span className="label-caps text-[9px] font-medium">
                    SET <span className="numeral">{setNumber}</span>
                  </span>
                  <span className="numeral text-sm">
                    {we.prescribed_weight != null
                      ? `${we.prescribed_weight} × `
                      : ""}
                    {we.prescribed_reps ?? "—"}
                  </span>
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

function LogControls({
  weight,
  reps,
  rir,
  units,
  setWeight,
  setReps,
  setRir,
  pending,
  submitLabel,
  onSubmit,
}: {
  weight: number;
  reps: number;
  rir: number;
  units: Units;
  setWeight: (v: number) => void;
  setReps: (v: number) => void;
  setRir: (v: number) => void;
  pending: boolean;
  submitLabel: string;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between gap-2">
        <NumberStepper
          label={units.toUpperCase()}
          value={weight}
          step={weightStep(units)}
          min={0}
          onChange={setWeight}
        />
        <NumberStepper
          label="REPS"
          value={reps}
          step={1}
          min={0}
          max={100}
          onChange={setReps}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="label-caps mr-1 text-[9px] font-semibold text-ink/55">
          RIR
        </span>
        {[0, 1, 2, 3, 4, 5].map((v) => (
          <Chip
            key={v}
            selected={rir === v}
            onClick={() => setRir(v)}
            className="!min-h-9 flex-1 !px-0 !text-[10px]"
          >
            {v}
          </Chip>
        ))}
      </div>
      <Button
        variant="primary"
        className="w-full"
        disabled={pending}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

/** Exercise menu (fig 1.2). */
function ExerciseMenu({
  we,
  workoutId,
  readOnly,
  onClose,
  commit,
}: {
  we: LoggedExercise | null;
  workoutId: string;
  readOnly: boolean;
  onClose: () => void;
  commit: (fn: () => Promise<void>) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (!we) return null;

  return (
    <BottomSheet
      open
      onClose={() => {
        setNoteOpen(false);
        setRemoveError(null);
        onClose();
      }}
      title={we.exercise_name.toLowerCase()}
      subtitle={we.muscle_group.toUpperCase()}
    >
      {we.notes && (
        <p className="mb-4 border-l-2 border-ink/25 pl-2 text-xs text-ink/55">
          {we.notes}
        </p>
      )}
      {noteOpen ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Pinned under the exercise in every workout"
            className="border border-ink/30 bg-paper p-3 text-base text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
          />
          <Button
            variant="primary"
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
              setNoteOpen(false);
              onClose();
            }}
          >
            Pin note
          </Button>
        </div>
      ) : (
        <MenuCard>
          <MenuItem onClick={() => setNoteOpen(true)}>
            {we.pinned_note ? "Replace pinned note" : "New note"}
          </MenuItem>
          {!readOnly && (
            <>
              <MenuItem
                onClick={() => {
                  commit(() =>
                    addSetAction({
                      workout_id: workoutId,
                      workout_exercise_id: we.id,
                    }),
                  );
                  onClose();
                }}
              >
                Add set
              </MenuItem>
              {(we.prescribed_sets ?? 1) > 1 &&
                we.sets.length < (we.prescribed_sets ?? 1) && (
                  <MenuItem
                    onClick={() => {
                      commit(() =>
                        skipSetAction({
                          workout_id: workoutId,
                          workout_exercise_id: we.id,
                        }),
                      );
                      onClose();
                    }}
                  >
                    Skip last set
                  </MenuItem>
                )}
              <MenuItem
                onClick={() => {
                  commit(() =>
                    skipRemainingAction({
                      workout_id: workoutId,
                      workout_exercise_id: we.id,
                    }),
                  );
                  onClose();
                }}
              >
                Skip remaining
              </MenuItem>
              <MenuItem
                destructive
                onClick={() => {
                  commit(async () => {
                    const result = await removeExerciseAction({
                      workout_id: workoutId,
                      workout_exercise_id: we.id,
                    });
                    if (result.error) setRemoveError(result.error);
                    else onClose();
                  });
                }}
              >
                Remove from this workout
              </MenuItem>
            </>
          )}
        </MenuCard>
      )}
      {removeError && (
        <p className="mt-3 text-sm text-accent">{removeError}</p>
      )}
    </BottomSheet>
  );
}

/** Per-exercise feedback prompt (fig 1.4). */
function FeedbackSheet({
  we,
  workoutId,
  withGroupScope,
  onClose,
  commit,
}: {
  we: LoggedExercise | null;
  workoutId: string;
  withGroupScope: boolean;
  onClose: () => void;
  commit: (fn: () => Promise<void>) => void;
}) {
  const [pain, setPain] = useState<number | null>(null);
  const [pump, setPump] = useState(5);
  const [workload, setWorkload] = useState(5);

  if (!we) return null;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="how did it go"
      subtitle={we.exercise_name.toUpperCase()}
    >
      <div className="flex flex-col gap-6">
        <div>
          <FeedbackScale
            question="Joint pain on this exercise?"
            options={PAIN_OPTIONS}
            value={pain}
            onChange={setPain}
          />
          <p className="mt-1.5 text-xs text-ink/45">
            Pain gates load increases — high pain holds the weight down next
            week.
          </p>
        </div>

        {withGroupScope && (
          <>
            <div>
              <p className="mb-2 text-[13px] font-bold">
                {we.muscle_group} pump
              </p>
              <SnapSlider
                label={`${we.muscle_group} pump`}
                value={pump}
                onChange={setPump}
                leftLabel="NONE"
                rightLabel="EXTREME"
              />
              <p className="mt-1.5 text-xs text-ink/45">
                How full the muscle felt by the last set.
              </p>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-bold">
                {we.muscle_group} workload
              </p>
              <SnapSlider
                label={`${we.muscle_group} workload`}
                value={workload}
                onChange={setWorkload}
                leftLabel="TOO LITTLE"
                centerLabel="JUST RIGHT"
                rightLabel="TOO MUCH"
              />
              <p className="mt-1.5 text-xs text-ink/45">
                Anchored at just right — drives set counts next week.
              </p>
            </div>
          </>
        )}

        <Button
          variant="primary"
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
        >
          Save feedback
        </Button>
      </div>
    </BottomSheet>
  );
}

/** Workout complete sheet (fig 1.5). */
function CompleteSheet({
  open,
  detail,
  units,
  pending,
  onClose,
  commit,
}: {
  open: boolean;
  detail: WorkoutDetail;
  units: Units;
  pending: boolean;
  onClose: () => void;
  commit: (fn: () => Promise<void>) => void;
}) {
  const [notes, setNotes] = useState("");
  const logged = detail.exercises.filter((we) => we.sets.length > 0);
  const totalSets = logged.reduce((n, we) => n + we.sets.length, 0);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="workout complete"
      subtitle={`W${detail.microcycle.week_number} · D${detail.workout.day_number} · ${totalSets} SETS`}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col divide-y divide-ink/15">
          {logged.map((we) => {
            const top = [...we.sets].sort((a, b) => b.weight - a.weight)[0];
            return (
              <div
                key={we.id}
                className="flex min-h-11 items-center justify-between py-2 text-sm"
              >
                <span className="font-semibold">{we.exercise_name}</span>
                <span className="numeral text-ink/55">
                  {we.sets.length} × · top {top.weight}
                  {units} × {top.reps}
                </span>
              </div>
            );
          })}
          {logged.length === 0 && (
            <p className="py-3 text-sm text-ink/45">
              Nothing logged. Completing skips every exercise.
            </p>
          )}
        </div>

        <p className="text-xs text-ink/45">
          Next week&apos;s prescriptions generate from this session once the
          engine wiring lands.
        </p>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Workout notes — saved with the session"
          className="border border-ink/30 bg-paper p-3 text-base text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
        />

        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            commit(() =>
              completeWorkoutAction({
                workout_id: detail.workout.id,
                notes: notes.trim() || null,
              }),
            )
          }
        >
          {pending ? "Saving" : "Complete workout"}
        </Button>
      </div>
    </BottomSheet>
  );
}

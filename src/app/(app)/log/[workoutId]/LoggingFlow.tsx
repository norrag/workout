"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FeedbackScale } from "@/components/ui/FeedbackScale";
import { NumberStepper } from "@/components/ui/NumberStepper";
import type { Units } from "@/lib/types/database";
import type { WorkoutDetail } from "@/lib/queries/workouts";
import {
  completeWorkoutAction,
  exerciseFeedbackAction,
  logSetAction,
} from "./actions";

interface SetState {
  id: string; // client-generated uuid; stable across retries
  setNumber: number;
  weight: number;
  reps: number;
  rir: number | null;
  logged: boolean;
}

const PAIN_OPTIONS = ["none", "low", "moderate", "high"] as const;
const PUMP_OPTIONS = ["none", "low", "good", "extreme"] as const;
const FIVE_POINT = ["0", "1", "2", "3", "4"] as const;

export function LoggingFlow({
  detail,
  units,
}: {
  detail: WorkoutDetail;
  units: Units;
}) {
  const router = useRouter();
  const weightStep = units === "kg" ? 2.5 : 5;

  // resume mid-workout: first exercise without feedback
  const firstOpen = detail.exercises.findIndex((we) => !we.feedback);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [phase, setPhase] = useState<"logging" | "workout_feedback">(
    firstOpen === -1 && detail.exercises.length > 0
      ? "workout_feedback"
      : "logging",
  );
  const [error, setError] = useState<string | null>(null);

  if (phase === "workout_feedback") {
    return (
      <WorkoutFeedbackCard
        workoutId={detail.workout.id}
        onDone={() => router.push("/today")}
        onError={setError}
        error={error}
      />
    );
  }

  const we = detail.exercises[index];
  const isLast = index === detail.exercises.length - 1;

  return (
    <ExerciseLogger
      key={we.id}
      we={we}
      units={units}
      weightStep={weightStep}
      progress={`${index + 1} / ${detail.exercises.length}`}
      onDone={() => {
        setError(null);
        if (isLast) setPhase("workout_feedback");
        else setIndex(index + 1);
      }}
      onError={setError}
      error={error}
    />
  );
}

function ExerciseLogger({
  we,
  units,
  weightStep,
  progress,
  onDone,
  onError,
  error,
}: {
  we: WorkoutDetail["exercises"][number];
  units: Units;
  weightStep: number;
  progress: string;
  onDone: () => void;
  onError: (e: string | null) => void;
  error: string | null;
}) {
  const planned = Math.max(we.prescribed_sets ?? 1, we.sets.length, 1);
  const [sets, setSets] = useState<SetState[]>(() =>
    Array.from({ length: planned }, (_, i) => {
      const existing = we.sets.find((s) => s.set_number === i + 1);
      return existing
        ? {
            id: existing.id,
            setNumber: existing.set_number,
            weight: Number(existing.weight),
            reps: existing.reps,
            rir: existing.rir_reported,
            logged: true,
          }
        : {
            id: crypto.randomUUID(),
            setNumber: i + 1,
            weight: we.prescribed_weight ?? 0,
            reps: we.prescribed_reps ?? 8,
            rir: null,
            logged: false,
          };
    }),
  );
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      sets.findIndex((s) => !s.logged),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({
    joint_pain: null as number | null,
    muscle_strain: null as number | null,
    pump: null as number | null,
    fatigue: null as number | null,
  });

  const allLogged = useMemo(() => sets.every((s) => s.logged), [sets]);
  const current = sets[active];

  function patchSet(idx: number, patch: Partial<SetState>) {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  async function logCurrent() {
    if (!current) return;
    setSaving(true);
    onError(null);
    const result = await logSetAction({
      id: current.id,
      workout_exercise_id: we.id,
      set_number: current.setNumber,
      weight: current.weight,
      reps: current.reps,
      rir_reported: current.rir,
      is_warmup: false,
    });
    setSaving(false);
    if (result.error) {
      onError(result.error);
      return;
    }
    patchSet(active, { logged: true });
    const next = sets.findIndex((s, i) => i !== active && !s.logged);
    if (next !== -1) setActive(next);
  }

  function addSet() {
    setSets((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          setNumber: prev.length + 1,
          weight: last?.weight ?? we.prescribed_weight ?? 0,
          reps: last?.reps ?? we.prescribed_reps ?? 8,
          rir: null,
          logged: false,
        },
      ];
    });
  }

  function removeLastUnlogged() {
    setSets((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.logged || prev.length <= 1) return prev;
      if (active >= prev.length - 1) setActive(prev.length - 2);
      return prev.slice(0, -1);
    });
  }

  async function finishExercise() {
    setSaving(true);
    onError(null);
    const result = await exerciseFeedbackAction({
      workout_exercise_id: we.id,
      ...feedback,
    });
    setSaving(false);
    if (result.error) {
      onError(result.error);
      return;
    }
    onDone();
  }

  const prescription = [
    we.prescribed_sets,
    we.prescribed_reps != null ? `× ${we.prescribed_reps}` : null,
    we.prescribed_weight != null ? `@ ${we.prescribed_weight} ${units}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-4">
      <Card header={`Exercise ${progress}`}>
        <p className="text-base font-semibold">{we.exercise_name}</p>
        {prescription && (
          <p className="numeral mt-1 text-sm text-text-secondary">
            Prescribed {prescription}
            {we.target_rir != null ? ` · ${we.target_rir} RIR` : ""}
          </p>
        )}
      </Card>

      <Card header="Sets">
        <ul className="mb-4 flex flex-col gap-1">
          {sets.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setActive(i)}
                className={`numeral flex min-h-11 w-full items-center justify-between rounded-[6px] px-3 text-sm ${
                  i === active
                    ? "border border-accent"
                    : "border border-transparent"
                }`}
              >
                <span className="text-text-secondary">Set {s.setNumber}</span>
                <span className={s.logged ? "" : "text-text-secondary"}>
                  {s.weight} {units} × {s.reps}
                  {s.rir != null ? ` · ${s.rir} RIR` : ""}
                  {s.logged ? " ✓" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {current && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-center gap-6">
              <NumberStepper
                label={`Weight (${units})`}
                value={current.weight}
                step={weightStep}
                min={0}
                onChange={(v) => patchSet(active, { weight: v })}
              />
              <NumberStepper
                label="Reps"
                value={current.reps}
                step={1}
                min={0}
                max={200}
                onChange={(v) => patchSet(active, { reps: v })}
              />
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="label-caps text-[10px] font-semibold text-text-secondary">
                RIR
              </span>
              {[null, 0, 1, 2, 3, 4].map((r) => (
                <button
                  key={r === null ? "none" : r}
                  type="button"
                  aria-pressed={current.rir === r}
                  onClick={() => patchSet(active, { rir: r })}
                  className={`numeral min-h-11 min-w-11 rounded-[6px] border text-sm ${
                    current.rir === r
                      ? "border-accent text-accent"
                      : "border-border-subtle text-text-secondary"
                  }`}
                >
                  {r === null ? "—" : r}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={logCurrent}
              disabled={saving}
            >
              {saving
                ? "Saving"
                : current.logged
                  ? "Update set"
                  : "Log set"}
            </Button>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button type="button" onClick={addSet} className="flex-1">
            Add set
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={removeLastUnlogged}
            className="flex-1"
          >
            Remove set
          </Button>
        </div>
      </Card>

      {allLogged && (
        <Card header="Exercise feedback">
          <div className="flex flex-col gap-4">
            <FeedbackScale
              question="Joint pain?"
              options={PAIN_OPTIONS}
              value={feedback.joint_pain}
              onChange={(v) => setFeedback({ ...feedback, joint_pain: v })}
            />
            <FeedbackScale
              question="Muscle strain?"
              options={PAIN_OPTIONS}
              value={feedback.muscle_strain}
              onChange={(v) => setFeedback({ ...feedback, muscle_strain: v })}
            />
            <FeedbackScale
              question="Pump?"
              options={PUMP_OPTIONS}
              value={feedback.pump}
              onChange={(v) => setFeedback({ ...feedback, pump: v })}
            />
            <FeedbackScale
              question="Fatigue carry-over?"
              options={PAIN_OPTIONS}
              value={feedback.fatigue}
              onChange={(v) => setFeedback({ ...feedback, fatigue: v })}
            />
            {error && <p className="text-sm text-warning">{error}</p>}
            <Button type="button" onClick={finishExercise} disabled={saving}>
              {saving ? "Saving" : "Next"}
            </Button>
          </div>
        </Card>
      )}

      {!allLogged && error && <p className="text-sm text-warning">{error}</p>}
    </div>
  );
}

function WorkoutFeedbackCard({
  workoutId,
  onDone,
  onError,
  error,
}: {
  workoutId: string;
  onDone: () => void;
  onError: (e: string | null) => void;
  error: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({
    overall_fatigue: null as number | null,
    effort_rating: null as number | null,
    performance_rating: null as number | null,
  });

  async function complete() {
    setSaving(true);
    onError(null);
    const result = await completeWorkoutAction({
      workout_id: workoutId,
      ...feedback,
    });
    setSaving(false);
    if (result.error) {
      onError(result.error);
      return;
    }
    onDone();
  }

  return (
    <Card header="Session feedback">
      <div className="flex flex-col gap-4">
        <FeedbackScale
          question="Overall fatigue?"
          options={FIVE_POINT}
          value={feedback.overall_fatigue}
          onChange={(v) => setFeedback({ ...feedback, overall_fatigue: v })}
        />
        <FeedbackScale
          question="Effort?"
          options={FIVE_POINT}
          value={feedback.effort_rating}
          onChange={(v) => setFeedback({ ...feedback, effort_rating: v })}
        />
        <FeedbackScale
          question="Performance?"
          options={FIVE_POINT}
          value={feedback.performance_rating}
          onChange={(v) => setFeedback({ ...feedback, performance_rating: v })}
        />
        {error && <p className="text-sm text-warning">{error}</p>}
        <Button type="button" variant="primary" onClick={complete} disabled={saving}>
          {saving ? "Saving" : "Finish workout"}
        </Button>
      </div>
    </Card>
  );
}

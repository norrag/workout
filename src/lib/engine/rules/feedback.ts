import type { EngineParams } from "../params";
import type { EngineInputs } from "../types";

export interface FeedbackModulation {
  /** joint pain at/above the gate: load increases are blocked */
  painGated: boolean;
  /** -1 cut a set, +1 add a set, 0 hold */
  setDelta: -1 | 0 | 1;
  /** session-level feedback dampens this week's increases */
  sessionDampened: boolean;
  notes: string[];
}

/**
 * §4 feedback modulation + §5 goal bias on volume. The workload slider
 * (0–10, 5 = "just right") anchors set-count changes; pump corroborates.
 */
export function modulateFromFeedback(
  inputs: EngineInputs,
  params: EngineParams,
): FeedbackModulation {
  const fb = inputs.exerciseFeedback;
  const wfb = inputs.workoutFeedback;
  const notes: string[] = [];

  const painGated = fb?.jointPain != null && fb.jointPain >= params.pain_gate;
  if (painGated) notes.push(`joint pain ${fb!.jointPain}/3: load increase blocked`);

  let setDelta: -1 | 0 | 1 = 0;
  const workloadHot = fb?.workload != null && fb.workload >= params.workload_high;
  const workloadEasy = fb?.workload != null && fb.workload <= params.workload_low;
  const workloadOnTarget =
    fb?.workload != null && !workloadHot && !workloadEasy;
  const pumpGood = fb?.pump != null && fb.pump >= params.set_add_pump_min;
  const pumpLow = fb?.pump != null && fb.pump <= params.pump_low;

  // doc 10 §3 step 0 (gated on `pain_cut_gate`, v17+): joint pain is the hard
  // safety gate and runs FIRST — pain at/above `pain_cut_gate` cuts a set and
  // flags substitution; pain at/above `pain_gate` vetoes any addition, both
  // regardless of workload/pump. ABSENT ⇒ legacy: pain never touches set counts.
  const painCuts =
    params.pain_cut_gate != null &&
    fb?.jointPain != null &&
    fb.jointPain >= params.pain_cut_gate;
  const painVetoesAdd = params.pain_cut_gate != null && painGated;

  if (painCuts) {
    setDelta = -1;
    notes.push(
      `joint pain ${fb!.jointPain}/3: set removed — consider substituting this exercise`,
    );
  } else if (workloadHot) {
    setDelta = -1;
    notes.push(`workload ${fb!.workload}/10 past just right: set removed`);
  } else if (
    workloadEasy &&
    pumpGood &&
    (inputs.goalType === "gain" || inputs.goalType === "hypertrophy") &&
    (inputs.muscleGroupWeeklySets === null ||
      inputs.muscleGroupWeeklySets < params.mg_set_ceiling)
  ) {
    if (painVetoesAdd) {
      notes.push(`joint pain ${fb!.jointPain}/3: set addition vetoed`);
    } else {
      setDelta = 1;
      notes.push(`workload ${fb!.workload}/10 easy with strong pump: set added`);
    }
  } else if (pumpLow && workloadOnTarget) {
    // dose is right but the stimulus isn't landing — selection, not load
    notes.push("low pump at the right workload: consider a different exercise");
  }

  // §S5 (standalone-prescription investigation 2026-06-23): the legacy dampener
  // trips on a single high-fatigue OR poor-performance signal, so a fatigued-but-
  // strong session (fatigue 3, performance 3) fully blocks a warranted increase.
  // When `session_dampen_require_both` is set, require BOTH signals; absent ⇒ the
  // legacy OR (every pre-v11 row).
  const fatigueHigh =
    wfb?.overallFatigue != null &&
    wfb.overallFatigue >= params.session_fatigue_dampen_threshold;
  const performancePoor =
    wfb?.performanceRating != null &&
    wfb.performanceRating <= params.session_performance_dampen_threshold;
  const sessionDampened = params.session_dampen_require_both
    ? fatigueHigh && performancePoor
    : fatigueHigh || performancePoor;
  if (sessionDampened) notes.push("rough session reported: increases dampened");

  return { painGated, setDelta, sessionDampened, notes };
}

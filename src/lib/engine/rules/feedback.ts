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

  if (workloadHot) {
    setDelta = -1;
    notes.push(`workload ${fb!.workload}/10 past just right: set removed`);
  } else if (
    workloadEasy &&
    pumpGood &&
    inputs.goalType === "gain" &&
    (inputs.muscleGroupWeeklySets === null ||
      inputs.muscleGroupWeeklySets < params.mg_set_ceiling)
  ) {
    setDelta = 1;
    notes.push(`workload ${fb!.workload}/10 easy with strong pump: set added`);
  } else if (pumpLow && workloadOnTarget) {
    // dose is right but the stimulus isn't landing — selection, not load
    notes.push("low pump at the right workload: consider a different exercise");
  }

  const sessionDampened =
    (wfb?.overallFatigue != null &&
      wfb.overallFatigue >= params.session_fatigue_dampen_threshold) ||
    (wfb?.performanceRating != null &&
      wfb.performanceRating <= params.session_performance_dampen_threshold);
  if (sessionDampened) notes.push("rough session reported: increases dampened");

  return { painGated, setDelta, sessionDampened, notes };
}

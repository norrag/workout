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

/** §4 feedback modulation + §5 goal bias on volume. */
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
  const strained =
    (fb?.muscleStrain != null && fb.muscleStrain >= params.strain_volume_threshold) ||
    (fb?.fatigue != null && fb.fatigue >= params.fatigue_volume_threshold);
  const pumpLow = fb?.pump != null && fb.pump <= params.pump_low_threshold;
  const pumpGood = fb?.pump != null && fb.pump >= params.set_add_pump_min;
  const fatigueLow =
    fb?.fatigue != null && fb.fatigue <= params.set_add_fatigue_max;

  if (strained && pumpLow) {
    setDelta = -1;
    notes.push("high strain/fatigue with low pump: volume reduced");
  } else if (
    fatigueLow &&
    pumpGood &&
    inputs.goalType === "gain" &&
    (inputs.muscleGroupWeeklySets === null ||
      inputs.muscleGroupWeeklySets < params.mg_set_ceiling)
  ) {
    setDelta = 1;
    notes.push("low fatigue, good pump: set added");
  }

  const sessionDampened =
    (wfb?.overallFatigue != null &&
      wfb.overallFatigue >= params.session_fatigue_dampen_threshold) ||
    (wfb?.performanceRating != null &&
      wfb.performanceRating <= params.session_performance_dampen_threshold);
  if (sessionDampened) notes.push("rough session reported: increases dampened");

  return { painGated, setDelta, sessionDampened, notes };
}

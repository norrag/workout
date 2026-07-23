/**
 * doc 19 §6.1 — deterministic trigger scoring. Pure: (facts, signals) →
 * `Trigger[]`. An EMPTY array means no API call and no stored row — the
 * deterministic layers (ask + why) are the complete output. Coaching is a
 * minority of decisions by construction (§6.1); routine progression, a routine
 * load step, a routine ramp step, and a normal deload with no other signal
 * produce no trigger.
 *
 * Each trigger gates on DETERMINISTIC metadata only (§2 A2) — existence,
 * recency, a pinned flag, a pain rating, a fired feedback modulation. The model
 * still classifies a note's relevance and may abstain; the trigger only gets it
 * to the plate.
 */
import type { AuditTraceStep } from "@/lib/queries/audit";
import type { ExplanationFacts } from "./explanation-facts";

export type Trigger =
  | "pain"
  | "note"
  | "plateau"
  | "completion_pattern"
  | "block_intent"
  | "unusual_prescription"
  | "increment_coarse";

/** Engine/DB-derived signals the facts object doesn't itself carry — kept
 *  separate so `scoreTriggers` stays a pure function of explicit inputs. */
export interface TriggerSignals {
  /** the recorded decision trace — read for fired feedback modulations */
  trace: AuditTraceStep[];
  /** consecutive comparable sessions where an earned ask went unmet */
  consecutiveEarnedMisses?: number;
  /** a repeated shortfall on later sets (the completion pattern) */
  repeatedLaterSetShortfall?: boolean;
  /** an out-of-band (hand-adjusted) deviation repeated across sessions */
  outOfBandRepeated?: boolean;
  /** the exercise's smallest weight step exceeds the paced monthly budget
   *  (the N56 step-cadence situation — a hold that will recur) */
  incrementCoarse?: boolean;
}

/** How recent a joint-pain report stays trigger-worthy before it decays
 *  (never auto-resolving from silence — recurring pain always fires). */
const PAIN_RECENCY_SESSIONS = 2;
/** A session note is fresh enough to coach on within ~3 exposures (§6.1). */
const NOTE_RECENCY_SESSIONS = 3;

const PAIN_WORDS = /\b(pain|hurt|hurts|hurting|ache|aching|aches|joint|tweak|tweaked|twinge|pinch|pinching)\b/i;

/** Does a fenced note read as pain? Keyword-only — the model still classifies
 *  authoritatively; this just decides whether the pain trigger should fire. */
export function noteReadsAsPain(text: string | undefined): boolean {
  return text != null && PAIN_WORDS.test(text);
}

/** Any engine feedback modulation on this decision (set removed/added/vetoed,
 *  load capped, increases dampened) — the "unusual prescription" signal. */
export function hasFeedbackModulation(trace: AuditTraceStep[]): boolean {
  return trace.some((s) => s.rule === "feedback");
}

function painFires(facts: ExplanationFacts): boolean {
  if (facts.pain.recurring) return true;
  const ago = facts.pain.last_report_sessions_ago;
  if (ago != null && ago <= PAIN_RECENCY_SESSIONS) return true;
  // a pinned pain note is a standing concern; a fresh session pain note counts
  if (facts.note && noteReadsAsPain(facts.note.text)) {
    return facts.note.source === "pinned" || facts.note.age_sessions <= NOTE_RECENCY_SESSIONS;
  }
  return false;
}

function noteFires(facts: ExplanationFacts): boolean {
  if (!facts.note) return false;
  return facts.note.source === "pinned" || facts.note.age_sessions <= NOTE_RECENCY_SESSIONS;
}

function blockIntentFires(facts: ExplanationFacts): boolean {
  const week = facts.week;
  if (!week) return false;
  return week.deload || week.n === 1 || week.target_rir <= 0;
}

function completionFires(signals: TriggerSignals): boolean {
  return (signals.consecutiveEarnedMisses ?? 0) >= 2 || signals.repeatedLaterSetShortfall === true;
}

function unusualFires(signals: TriggerSignals): boolean {
  return hasFeedbackModulation(signals.trace) || signals.outOfBandRepeated === true;
}

/**
 * Score the triggers for one decision. Order is stable (audit-friendly) but
 * not significant — the presence of ANY trigger routes the decision to the
 * generation call; an empty array short-circuits it entirely (§6.1, §7.1).
 */
export function scoreTriggers(
  facts: ExplanationFacts,
  signals: TriggerSignals,
): Trigger[] {
  const triggers: Trigger[] = [];
  if (painFires(facts)) triggers.push("pain");
  if (noteFires(facts)) triggers.push("note");
  if (facts.trend_status === "plateau") triggers.push("plateau");
  if (completionFires(signals)) triggers.push("completion_pattern");
  if (blockIntentFires(facts)) triggers.push("block_intent");
  if (unusualFires(signals)) triggers.push("unusual_prescription");
  if (signals.incrementCoarse === true) triggers.push("increment_coarse");
  return triggers;
}

/** Convenience for the trigger gate (§7.1): does this decision reach the API? */
export function shouldGenerate(
  facts: ExplanationFacts,
  signals: TriggerSignals,
): boolean {
  return scoreTriggers(facts, signals).length > 0;
}

/**
 * doc 19 §5 — the semantic facts projection: a deterministic, pure projection
 * of (decision, context) into an APPROVED fact object that is the model's
 * entire worldview. It replaces `buildExplanationPayload`'s raw-trace shape
 * (doc 18 §3) as what the model is allowed to know.
 *
 * The guiding principle (§5): the model never sees a raw trace string, a
 * governor name, or a pair of rates. Every axis is projected to ONE verdict
 * the model receives as a conclusion — never numbers to reconcile (that was
 * v2 failure mode 2). The §5.1 reliability gates live here, as code, not as
 * prompt prose: single-session e1RM values, cross-phase comparisons, and
 * one-off ratings never enter the object at all — the strongest gate is
 * absence. The ONE free-text field is the note, clearly fenced with provenance.
 *
 * Pure: no I/O, no env, no dates-from-now. Unit-tested exactly like the engine.
 * The engine (never this module, never the model) computes every number; this
 * layer only selects and labels what already exists on the recorded decision.
 *
 * 2026-07-24 amendment (owner, doc 19 §5.2–§5.3):
 * - §5.2 `source_session` — `week` describes the UPCOMING prescription only;
 *   the session that produced `previous_work` (and usually the note) now
 *   carries its OWN week / target RIR / deload flag, and the note names which
 *   session it was written in. Without the split, a note left at 1 RIR read as
 *   if it had happened during the 0 RIR peak week being prescribed.
 * - §5.3 `macro` — the macrocycle goal layer (goal, block placement, phase, the
 *   target as one estimate sentence, the lifter's goal note) so coaching can
 *   speak to the arc the block serves. Qualitative by construction: no rates,
 *   no measured-vs-planned pair — the §5 "one verdict per axis" rule stands.
 */
import type { AuditTraceStep } from "@/lib/queries/audit";

// ---------------------------------------------------------------------------
// the approved fact object (§5)
// ---------------------------------------------------------------------------

/** Which axis moved, up/down/hold — plus the deload/seed overrides. The single
 *  most salient change is chosen (load ≻ sets ≻ reps ≻ rir); a week that only
 *  ramps RIR reads as `rir_decreased` (harder), never `hold`. */
export type PrescriptionChange =
  | "load_increased"
  | "load_decreased"
  | "sets_increased"
  | "sets_decreased"
  | "reps_increased"
  | "reps_decreased"
  | "rir_decreased" // ramp: same numbers, closer to failure ⇒ harder
  | "rir_increased" // further from failure ⇒ easier
  | "hold"
  | "deload"
  | "seed";

/** The headline reason, projected from the trace (never verbatim trace prose). */
export type PrimaryReason =
  | "completed_prescribed_work"
  | "target_not_met"
  | "joint_pain"
  | "high_workload"
  | "rough_session"
  | "not_recently_trained"
  | "low_confidence"
  | "deload"
  | "seed"
  | "routine";

/** The ONE approved statement about the LOAD decision specifically (§5) —
 *  selected from a fixed set, never free text. Null when the load simply moved
 *  with nothing to explain about it. */
export type LoadReason =
  | "ahead_of_planned_pace" // paced: an earned step held to hold the monthly rate
  | "below_smallest_jump" // vanished: earned step under the smallest weight increment
  | "capped_by_joint_pain"
  | "held_by_high_workload"
  | "held_after_rough_session"
  | "target_not_met"
  | "not_recently_trained"
  | "low_confidence"
  | "earned_step_included"; // stepped: the load rose because the work was earned

/** One verdict per axis (§5.1). Never two numbers for the model to reconcile. */
export type PaceStatus = "ahead" | "on" | "behind" | "insufficient_data";
export type TrendStatus = "plateau" | "no_actionable_trend" | "insufficient_data";
export type EffortStatus = "observed" | "inferred" | "unknown";

/**
 * §5.2 (2026-07-24 amendment) — the session that produced `previous_work` and,
 * usually, the note. Kept STRICTLY separate from `week`, which describes the
 * UPCOMING prescription: without this split a note left at 1 RIR in week 3 read
 * as if it had happened during the 0 RIR peak week being prescribed.
 */
export interface SourceSession {
  /** the week number that session was performed in (1-based), when known */
  week_n?: number;
  /** the RIR target that session was performed under */
  target_rir: number | null;
  /** whether that session fell in a deload week */
  deload: boolean;
}

/** The macrocycle goal a mesocycle sits under (§5.3, 2026-07-24 amendment) —
 *  the standing intent behind this block. Qualitative by design: the model gets
 *  the goal, where the block sits in the arc, and the stated target as ONE
 *  already-formatted estimate sentence — never rates to reconcile. */
export interface MacroFacts {
  goal: "hypertrophy" | "strength" | "cut" | "maintain";
  /** which block of the macro this meso is, when it has been placed */
  block?: { n: number; of: number };
  phase?: "accumulation" | "intensification" | "peak";
  /** the macro's stated target as a plain sentence, always flagged an estimate */
  target?: string;
  /** the lifter's own words about the goal, when they recorded any */
  goal_notes?: string;
}

export interface ExplanationFacts {
  exercise: string;
  muscle_group?: string;
  /** the week the UPCOMING prescription belongs to (never the source session) */
  week?: { n?: number; of?: number; target_rir: number; deload: boolean };
  /** §5.2 — the session `previous_work` (and usually the note) came from */
  source_session?: SourceSession;
  /** §5.3 — the macrocycle goal this block serves, when the meso has one */
  macro?: MacroFacts;
  prescription_change: PrescriptionChange;
  previous_work?: string;
  next_work: string;
  primary_reason: PrimaryReason;
  program_context?: string;
  load_reason?: LoadReason;
  effort_status: EffortStatus;
  pace_status: PaceStatus;
  trend_status: TrendStatus;
  pain: { recurring: boolean; last_report_sessions_ago: number | null };
  /** the ONE unstructured field — the model's actual job (§5). Its provenance
   *  names the SESSION it was written in (§5.2), never the upcoming week. */
  note?: {
    /** `source_session` = written in the session that produced `previous_work` */
    source: "pinned" | "source_session" | "recent_session";
    age_sessions: number;
    text: string;
    /** the session the note was written in, when known — repeated here so the
     *  note can never be read against the upcoming week's conditions */
    session?: SourceSession;
  };
}

// ---------------------------------------------------------------------------
// inputs — everything the projection needs, none of it raw trace for the model
// ---------------------------------------------------------------------------

/** The recorded decision, distilled to the tuples + trace the projection reads. */
export interface FactsDecision {
  /** engine_decisions.kind — "seed" | "advance" (others pass through as routine) */
  kind: string;
  /** the week's deload flag (deloads neither earn nor step) */
  isDeload: boolean;
  loadType: string;
  ask: {
    weight: number | null;
    reps: number | null;
    sets: number | null;
    targetRir: number | null;
  };
  previous: {
    weight: number | null;
    reps: number | null;
    sets: number | null;
    targetRir: number | null;
  } | null;
  trace: AuditTraceStep[];
}

/**
 * The distilled trend the projection consumes to emit ONE verdict per axis —
 * NOT surfaced to the model. The two gains are read here and collapsed; the
 * comparability gates (§5.1) that need session-level data are folded into
 * `comparable` + `comparableSessions` + `e1rmConfidence` by the caller (the
 * strongest gate — absence — then stays local and testable).
 */
export interface FactsTrend {
  window_days: number;
  /** trailing measured vs prescribed e1RM gain, %/30d (null when uncomputable) */
  measuredGainPctPer30d: number | null;
  prescribedGainPctPer30d: number | null;
  /** count of comparable non-deload sessions in the window (§5.1 gate) */
  comparableSessions: number;
  /** aggregate e1RM confidence over the window (§5.1 gate) */
  e1rmConfidence: "low" | "moderate" | "high";
  /** the caller-folded comparability gates (same phase/equipment, RIR within
   *  1, no single-session outlier); false ⇒ never plateau */
  comparable: boolean;
}

/** §5.3 inputs — the macro row's goal layer, as the caller reads it off
 *  `macrocycles` + the meso's placement. All optional: a standalone meso has no
 *  macro, and a macro may have no target snapshot or notes. */
export interface MacroContext {
  goalType: "hypertrophy" | "strength" | "cut" | "maintain";
  /** meso placement within the macro (M1…Mn) and the macro's block count */
  blockPosition?: number | null;
  blockCount?: number | null;
  phase?: string | null;
  goalNotes?: string | null;
  /** the cached `planMacrocycle` target snapshot (doc 17 §2) */
  target?: {
    low: number | null;
    high: number | null;
    unit: string | null;
    direction: "gain" | "loss" | "none" | null;
    durationMonths: number | null;
  } | null;
}

export interface FactsContext {
  exerciseName: string;
  muscleGroup: string | null;
  weekNumber: number | null;
  mesoWeeks: number | null;
  /** §5.2 — the week the SOURCE session (the one that produced `previous_work`)
   *  was performed in. Null/absent ⇒ the source session's week is unknown and
   *  only its target RIR (carried on the decision) is reported. */
  sourceSession?: { weekNumber?: number | null; targetRir?: number | null; deload?: boolean | null } | null;
  /** §5.2 — true when the last session note was written in that SAME source
   *  session (matched by workout_exercise), false when it is merely recent. */
  lastSessionNoteFromSource?: boolean | null;
  /** §5.3 — the macrocycle goal this meso serves, when it has one */
  macro?: MacroContext | null;
  /** doc 19 §4.3 — did the previous session actually report RIR on a working
   *  set? true ⇒ observed, false ⇒ inferred, null/undefined ⇒ unknown. */
  effortObserved?: boolean | null;
  /** doc 19 §5.1 — joint-pain history (PR #199 attribution + repeated ratings) */
  pain?: { recurring: boolean; lastReportSessionsAgo: number | null } | null;
  /** the user's own words (§5): a pinned note takes provenance precedence */
  pinnedNote?: string | null;
  lastSessionNote?: string | null;
  /** how many exposures ago the last session note was left (default 1) */
  lastSessionNoteAgeSessions?: number | null;
  trend?: FactsTrend | null;
}

// ---------------------------------------------------------------------------
// the projection
// ---------------------------------------------------------------------------

const NOTE_MAX_CHARS = 200;
/** The goal note is standing intent, not a session event — a tighter cap than
 *  the session note keeps it context, never a second story to coach off. */
const GOAL_NOTE_MAX_CHARS = 140;

function findProgression(trace: AuditTraceStep[]): AuditTraceStep | undefined {
  return trace.find((s) => s.rule === "progression");
}

function hasFeedbackPainCap(trace: AuditTraceStep[]): boolean {
  return trace.some(
    (s) =>
      s.rule === "feedback" &&
      s.detail.includes("joint pain") &&
      (s.detail.includes("load increase blocked") ||
        s.detail.includes("set removed") ||
        s.detail.includes("set addition vetoed")),
  );
}

/** The single most salient axis move (load ≻ sets ≻ reps ≻ rir), with the
 *  deload/seed overrides. A pure RIR ramp reads as harder/easier, never hold. */
export function projectChange(decision: FactsDecision): PrescriptionChange {
  if (decision.isDeload) return "deload";
  if (decision.kind === "seed") return "seed";
  const { ask, previous } = decision;
  if (!previous) return "hold";
  const moved = (a: number | null, b: number | null): number =>
    a != null && b != null ? a - b : 0;
  const dLoad = moved(ask.weight, previous.weight);
  if (dLoad > 0) return "load_increased";
  if (dLoad < 0) return "load_decreased";
  const dSets = moved(ask.sets, previous.sets);
  if (dSets > 0) return "sets_increased";
  if (dSets < 0) return "sets_decreased";
  const dReps = moved(ask.reps, previous.reps);
  if (dReps > 0) return "reps_increased";
  if (dReps < 0) return "reps_decreased";
  const dRir = moved(ask.targetRir, previous.targetRir);
  if (dRir < 0) return "rir_decreased"; // closer to failure ⇒ harder
  if (dRir > 0) return "rir_increased";
  return "hold";
}

/** Format a prescription tuple in the facts' plain shape: "112.5 lb × 11 × 3",
 *  respecting bodyweight load types. */
export function formatWork(
  loadType: string,
  t: { weight: number | null; reps: number | null; sets: number | null },
): string | null {
  if (t.reps == null) return null;
  const setsPart = t.sets != null ? ` × ${t.sets}` : "";
  switch (loadType) {
    case "bodyweight_only":
      return `bodyweight × ${t.reps}${setsPart}`;
    case "bodyweight_loadable":
      return `+${t.weight ?? 0} lb × ${t.reps}${setsPart}`;
    case "bodyweight_assisted":
      return `−${t.weight ?? 0} lb assist × ${t.reps}${setsPart}`;
    default:
      if (t.weight == null) return null;
      return `${t.weight} lb × ${t.reps}${setsPart}`;
  }
}

/** The headline reason (§5) — projected from the progression status/predicate
 *  (or feedback pain), never the verbatim trace. */
export function projectPrimaryReason(decision: FactsDecision): PrimaryReason {
  if (decision.isDeload) return "deload";
  if (decision.kind === "seed") return "seed";
  const step = findProgression(decision.trace);
  if (!step) {
    return hasFeedbackPainCap(decision.trace) ? "joint_pain" : "routine";
  }
  switch (step.status) {
    case "stepped":
    case "vanished":
    case "paced":
      return "completed_prescribed_work";
    case "not_earned":
      switch (step.predicate) {
        case "compliance":
          return "target_not_met";
        case "pain":
          return "joint_pain";
        case "workload":
          return "high_workload";
        case "dampener":
          return "rough_session";
        case "stale":
          return "not_recently_trained";
        case "confidence":
          return "low_confidence";
        default:
          return "routine";
      }
    default:
      return "routine";
  }
}

/** The ONE approved load statement (§5), or null when the load simply moved
 *  with nothing to explain. Feedback pain caps outrank the earn-gate echo. */
export function projectLoadReason(decision: FactsDecision): LoadReason | undefined {
  if (decision.isDeload || decision.kind === "seed") return undefined;
  if (hasFeedbackPainCap(decision.trace)) return "capped_by_joint_pain";
  const step = findProgression(decision.trace);
  if (!step) return undefined;
  switch (step.status) {
    case "paced":
      return "ahead_of_planned_pace";
    case "vanished":
      return "below_smallest_jump";
    case "stepped":
      return "earned_step_included";
    case "not_earned":
      switch (step.predicate) {
        case "pain":
          return "capped_by_joint_pain";
        case "workload":
          return "held_by_high_workload";
        case "dampener":
          return "held_after_rough_session";
        case "compliance":
          return "target_not_met";
        case "stale":
          return "not_recently_trained";
        case "confidence":
          return "low_confidence";
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

/** A single template-selected program-context sentence from the week (§5). */
export function projectProgramContext(
  week: { n?: number; of?: number; target_rir: number; deload: boolean } | undefined,
): string | undefined {
  if (!week) return undefined;
  if (week.deload) return "a deload week; deliberately light to shed fatigue";
  if (week.n === 1) return "first week of the block; building the base";
  if (week.target_rir <= 0) return "peak week; sets taken to failure";
  if (week.n != null && week.of != null && week.n === week.of)
    return "final hard week of the block";
  return undefined;
}

/**
 * §5.1 pace verdict. Requires the pacer to have actually evaluated — a v20+
 * progression step in the trace — otherwise `insufficient_data`. A paced step
 * is definitionally ahead (the pacer held an earned increase because measured
 * gain met/exceeded the planned rate). Otherwise the two gains are compared
 * with a modest tolerance, and the model receives only the conclusion.
 */
export function projectPaceStatus(decision: FactsDecision, trend?: FactsTrend | null): PaceStatus {
  const step = findProgression(decision.trace);
  if (!step) return "insufficient_data";
  if (step.status === "paced" && step.governor === "rate_pacer") return "ahead";
  if (
    !trend ||
    trend.measuredGainPctPer30d == null ||
    trend.prescribedGainPctPer30d == null
  ) {
    return "insufficient_data";
  }
  const diff = trend.measuredGainPctPer30d - trend.prescribedGainPctPer30d;
  // a modest relative tolerance so measurement noise doesn't read as a verdict
  const band = Math.max(0.3, Math.abs(trend.prescribedGainPctPer30d) * 0.15);
  if (diff >= band) return "ahead";
  if (diff <= -band) return "behind";
  return "on";
}

/**
 * §5.1 trend verdict. `plateau` only when the full comparability set holds
 * (≥4 comparable non-deload sessions, moderate+ e1RM confidence, the caller-
 * folded same-phase/equipment/RIR gates) AND measured gain is genuinely flat.
 * Anything short reads as `no_actionable_trend`, and truly thin evidence
 * (no trend, low confidence, or too few sessions) as `insufficient_data` —
 * which the model may name as such (the review's "no conclusion warranted").
 */
export function projectTrendStatus(trend?: FactsTrend | null): TrendStatus {
  if (!trend || trend.measuredGainPctPer30d == null) return "insufficient_data";
  if (trend.comparableSessions < 4 || trend.e1rmConfidence === "low") {
    return "insufficient_data";
  }
  if (!trend.comparable) return "no_actionable_trend";
  // flat measured gain over a comparable, confident window ⇒ a real plateau
  if (Math.abs(trend.measuredGainPctPer30d) < 0.5) return "plateau";
  return "no_actionable_trend";
}

function projectEffort(effortObserved: boolean | null | undefined): EffortStatus {
  if (effortObserved === true) return "observed";
  if (effortObserved === false) return "inferred";
  return "unknown";
}

function truncateNote(body: string, max = NOTE_MAX_CHARS): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * §5.2 — the session that produced `previous_work`. Its target RIR comes off
 * the recorded decision first (`previous.targetRir` IS the source session's own
 * ask, per-exercise override included; the microcycle target is the coarser
 * fallback), so the block is reportable even when the week lookup finds
 * nothing. Undefined for a seed (no upstream session) — there is then nothing
 * to disambiguate.
 */
export function projectSourceSession(
  decision: FactsDecision,
  context: FactsContext,
): SourceSession | undefined {
  if (!decision.previous) return undefined;
  const src = context.sourceSession;
  const targetRir = decision.previous.targetRir ?? src?.targetRir ?? null;
  return {
    ...(src?.weekNumber != null ? { week_n: src.weekNumber } : {}),
    target_rir: targetRir,
    deload: src?.deload === true,
  };
}

/** §5.3 — the macro goal layer, qualitative plus ONE formatted target sentence. */
export function projectMacro(context: FactsContext): MacroFacts | undefined {
  const macro = context.macro;
  if (!macro) return undefined;
  const phase =
    macro.phase === "accumulation" || macro.phase === "intensification" || macro.phase === "peak"
      ? macro.phase
      : undefined;
  const notes = macro.goalNotes?.trim();
  const target = formatMacroTarget(macro.target);
  return {
    goal: macro.goalType,
    ...(macro.blockPosition != null && macro.blockCount != null && macro.blockCount > 0
      ? { block: { n: macro.blockPosition, of: macro.blockCount } }
      : {}),
    ...(phase ? { phase } : {}),
    ...(target ? { target } : {}),
    ...(notes ? { goal_notes: truncateNote(notes, GOAL_NOTE_MAX_CHARS) } : {}),
  };
}

/**
 * The macro's stated target as ONE plain sentence, always flagged an estimate
 * (doc 10 §9 honesty guardrail). Directionless or unpriced targets return
 * undefined rather than an empty claim — absence is the strongest gate (§5.1).
 */
export function formatMacroTarget(
  target: MacroContext["target"],
): string | undefined {
  if (!target) return undefined;
  const { low, high, unit, direction, durationMonths } = target;
  if (direction == null || direction === "none") return undefined;
  if (low == null && high == null) return undefined;
  const band = low != null && high != null && low !== high ? `${low}–${high}` : `${high ?? low}`;
  const measure = unit === "%" ? `${band}%` : `${band}${unit ? ` ${unit}` : ""}`;
  const verb = direction === "loss" ? "lose" : "gain";
  const span = durationMonths != null ? ` over ${durationMonths} months` : "";
  return `${verb} ${measure}${span} (an estimate)`;
}

/** The note — the ONE free-text field, pinned taking provenance precedence.
 *  A session note names the SESSION it was written in (§5.2): `source_session`
 *  when it came from the very session that produced `previous_work`, else
 *  `recent_session` with its age. */
export function projectNote(
  context: FactsContext,
  sourceSession?: SourceSession,
): ExplanationFacts["note"] {
  const pinned = context.pinnedNote?.trim();
  if (pinned) {
    return { source: "pinned", age_sessions: 0, text: truncateNote(pinned) };
  }
  const last = context.lastSessionNote?.trim();
  if (last) {
    const fromSource = context.lastSessionNoteFromSource === true;
    return {
      source: fromSource ? "source_session" : "recent_session",
      age_sessions: fromSource ? 1 : (context.lastSessionNoteAgeSessions ?? 1),
      text: truncateNote(last),
      ...(fromSource && sourceSession ? { session: sourceSession } : {}),
    };
  }
  return undefined;
}

/** The full §5 projection. */
export function buildExplanationFacts(
  decision: FactsDecision,
  context: FactsContext,
): ExplanationFacts {
  const week: ExplanationFacts["week"] =
    decision.ask.targetRir != null
      ? {
          ...(context.weekNumber != null ? { n: context.weekNumber } : {}),
          ...(context.mesoWeeks != null ? { of: context.mesoWeeks } : {}),
          target_rir: decision.ask.targetRir,
          deload: decision.isDeload,
        }
      : undefined;

  const previousWork = decision.previous
    ? formatWork(decision.loadType, decision.previous)
    : null;
  const nextWork = formatWork(decision.loadType, decision.ask);
  const loadReason = projectLoadReason(decision);
  const sourceSession = projectSourceSession(decision, context);
  const note = projectNote(context, sourceSession);
  const macro = projectMacro(context);

  return {
    exercise: context.exerciseName,
    ...(context.muscleGroup ? { muscle_group: context.muscleGroup } : {}),
    ...(week ? { week } : {}),
    ...(sourceSession ? { source_session: sourceSession } : {}),
    ...(macro ? { macro } : {}),
    prescription_change: projectChange(decision),
    ...(previousWork ? { previous_work: previousWork } : {}),
    next_work: nextWork ?? "unpriced",
    primary_reason: projectPrimaryReason(decision),
    ...(projectProgramContext(week)
      ? { program_context: projectProgramContext(week) }
      : {}),
    ...(loadReason ? { load_reason: loadReason } : {}),
    effort_status: projectEffort(context.effortObserved),
    pace_status: projectPaceStatus(decision, context.trend),
    trend_status: projectTrendStatus(context.trend),
    pain: {
      recurring: context.pain?.recurring ?? false,
      last_report_sessions_ago: context.pain?.lastReportSessionsAgo ?? null,
    },
    ...(note ? { note } : {}),
  };
}

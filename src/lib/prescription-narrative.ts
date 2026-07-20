/**
 * Deterministic prescription quick-read (owner request 2026-07-19; the
 * PH30-adjacent non-LLM layer). Pure composition of a short, plain-language
 * explanation of a prescription from the row's numbers + the recorded engine
 * decision — what to do, how it compares to last session, and what the
 * progression engine decided (incl. the previously invisible `paced` /
 * `not_earned` states, the N56 §8.5 residual).
 *
 * Copy voice per doc 06/08: plain sentences, no hype, no exclamation marks.
 * The LLM variant (doc 18) is a drop-in replacement for `lines` — keep this
 * composer's shape (one ask line + up to three short body lines) in sync with
 * that spec's output contract.
 *
 * Client-safe: zod-free, type-only imports, no I/O (rides the day-view chunk
 * under the WS-J bundle split).
 */
import type { LoadType } from "@/lib/engine/load";
import type {
  AuditTraceStep,
  DecisionOutputNumbers,
} from "@/lib/queries/audit";

export interface PrescriptionNarrativeInput {
  /** the live row's prescription tuple (engine-written; overrides excluded) */
  weight: number | null;
  reps: number | null;
  sets: number | null;
  targetRir: number | null;
  loadType: LoadType;
  /** the week's deload flag (deloads neither earn nor step — doc 16 §3.4) */
  isDeload: boolean;
  /** the recorded decision, when loaded; null = not yet fetched / none */
  kind: "seed" | "advance" | null;
  trace: AuditTraceStep[];
  /** the previous session's prescription the decision advanced from */
  previous: DecisionOutputNumbers | null;
  /** live row ≠ decision numbers (N33 S4) — numbers were set by hand */
  outOfBand: boolean;
  /** the decision's own numbers, named when `outOfBand` */
  decisionOutput: DecisionOutputNumbers | null;
}

export interface PrescriptionNarrative {
  /** the ask, composable from the row alone (renders before the audit loads) */
  ask: string | null;
  /** the why — delta vs last session, progression state, caveats */
  lines: string[];
}

/** "2 reps short of failure" / "1 rep short of failure" / "right at failure". */
function rirPhrase(targetRir: number): string {
  if (targetRir <= 0) return "taken right to failure";
  if (targetRir === 1) return "stopped 1 rep short of failure";
  return `stopped ${targetRir} reps short of failure`;
}

/** The load half of the ask, per load type. */
function loadPhrase(loadType: LoadType, weight: number): string {
  switch (loadType) {
    case "bodyweight_only":
      return "at bodyweight";
    case "bodyweight_loadable":
      return `with ${weight} lb added`;
    case "bodyweight_assisted":
      return `with ${weight} lb of assistance`;
    default:
      return `at ${weight} lb`;
  }
}

/**
 * The ask line — needs only the row, so it renders instantly. Null when the
 * row carries no priced prescription (cold slot).
 */
export function composeAsk(
  input: Pick<
    PrescriptionNarrativeInput,
    "weight" | "reps" | "sets" | "targetRir" | "loadType"
  >,
): string | null {
  const { weight, reps, sets, targetRir, loadType } = input;
  const bwOnly = loadType === "bodyweight_only";
  if ((weight == null && !bwOnly) || reps == null || targetRir == null)
    return null;
  const setCount = sets ?? 1;
  const setsPart = setCount === 1 ? "1 set" : `${setCount} sets`;
  return `${setsPart} of ${reps} ${loadPhrase(loadType, weight ?? 0)}, each ${rirPhrase(targetRir)}.`;
}

/** Signed lb difference phrase: "up 5 lb" / "down 10 lb" / null when equal. */
function weightDelta(cur: number | null, prev: number | null): string | null {
  if (cur == null || prev == null || cur === prev) return null;
  const d = Math.round(Math.abs(cur - prev) * 10) / 10;
  return cur > prev ? `up ${d} lb` : `down ${d} lb`;
}

/** "one more rep per set" / "2 more reps per set" / "one fewer rep per set". */
function repsDelta(cur: number | null, prev: number | null): string | null {
  if (cur == null || prev == null || cur === prev) return null;
  const d = Math.abs(cur - prev);
  const n = d === 1 ? (cur > prev ? "one more rep" : "one fewer rep") : `${d} ${cur > prev ? "more" : "fewer"} reps`;
  return `${n} per set`;
}

/** The delta-vs-last-session sentence for an advance. Null when incomparable. */
export function composeDelta(
  input: Pick<
    PrescriptionNarrativeInput,
    "weight" | "reps" | "sets" | "targetRir" | "previous"
  >,
): string | null {
  const prev = input.previous;
  if (!prev) return null;
  const dW = weightDelta(input.weight, prev.weight);
  const dR = repsDelta(input.reps, prev.reps);
  // RIR moving DOWN week to week is the ramp: same numbers get harder
  const closer =
    input.targetRir != null &&
    prev.targetRir != null &&
    input.targetRir < prev.targetRir
      ? `${prev.targetRir - input.targetRir === 1 ? "1 rep" : `${prev.targetRir - input.targetRir} reps`} closer to failure`
      : null;
  const easier =
    input.targetRir != null &&
    prev.targetRir != null &&
    input.targetRir > prev.targetRir
      ? "further from failure"
      : null;
  const setsChanged =
    input.sets != null && prev.sets != null && input.sets !== prev.sets
      ? `${input.sets > prev.sets ? "a set added" : "a set dropped"} (${prev.sets} to ${input.sets})`
      : null;

  const movement = [dW, dR].filter((p): p is string => p != null);
  let base: string;
  if (movement.length > 0) {
    base = `Versus last session: ${movement.join(", ")}`;
  } else if (closer || easier || setsChanged) {
    base = "Same weight and reps as last session";
  } else {
    return "Holding last session's numbers at the same effort target.";
  }
  const effort = closer
    ? `, and ${closer} — a step up even where the numbers match`
    : easier
      ? ", at an easier effort target"
      : "";
  const setsPart = setsChanged ? `, with ${setsChanged}` : "";
  return `${base}${effort}${setsPart}.`;
}

/**
 * Plain-language translations of the engine's feedback-modulation notes
 * (rules/feedback.ts — engine-authored stable strings, keyword-matched and
 * pinned by tests). These are the "backed down / shaped by how last session
 * felt" half of the why; anything unrecognized falls through verbatim so a
 * new engine note is surfaced rather than silently dropped.
 */
export function composeFeedbackLine(detail: string): string {
  if (detail.includes("set removed") && detail.includes("joint pain"))
    return "A set was removed because of the joint pain you reported — worth considering a substitute for this movement.";
  if (detail.includes("load increase blocked"))
    return "Reported joint pain is capping the load — no increases while it persists.";
  if (detail.includes("set removed"))
    return "A set was removed — last session's workload ran past just right.";
  if (detail.includes("set addition vetoed"))
    return "A planned extra set was skipped because of reported joint pain.";
  if (detail.includes("set added"))
    return "A set was added — the workload read easy with a strong pump.";
  if (detail.includes("increases dampened"))
    return "Increases are dampened after the rough session you reported.";
  if (detail.includes("consider a different exercise"))
    return "Pump has read low here at the right dose — a different movement for this muscle may fit better.";
  const line = detail.charAt(0).toUpperCase() + detail.slice(1);
  return line.endsWith(".") ? line : `${line}.`;
}

/** The legacy grade-based why (pre-v20 decisions with no progression step). */
function composeGradeLine(trace: AuditTraceStep[]): string | null {
  const grade = trace.find((s) => s.rule === "grade");
  if (!grade) return null;
  if (grade.detail.includes("harder than asked"))
    return "Last session ran harder than asked, so the load holds rather than climbs.";
  if (grade.detail.includes("easier than asked"))
    return "Last session read easier than asked — that feeds the estimate this ask is priced from.";
  return null;
}

/** The progression-state sentence (doc 16 §3.6 status vocabulary). */
export function composeProgressionLine(
  trace: AuditTraceStep[],
): string | null {
  const step = trace.find((s) => s.rule === "progression");
  if (!step) return null;
  switch (step.status) {
    case "stepped":
      return "This includes an earned increase — you completed your last prescription, so the engine is asking for slightly more.";
    case "vanished":
      return "You earned an increase, but it is smaller than this exercise's smallest weight step — the engine retries it next session.";
    case "paced":
      return "You have earned an increase; it is deferred for now so your strength gain stays on its planned monthly pace.";
    case "not_earned":
      switch (step.predicate) {
        case "compliance":
          return "No increase this time — last session didn't fully meet its prescription.";
        case "stale":
          return "No increase — this exercise hasn't been trained in a while, so the engine wants the current target reproduced first.";
        case "pain":
          return "Held steady — joint pain was reported last session.";
        case "workload":
          return "Held steady — last session's workload ran hot, so the engine isn't adding demand.";
        case "dampener":
          return "Held steady — last session was reported as a rough one.";
        case "confidence":
          return "No increase — the strength estimate behind this exercise isn't confident enough yet.";
        default:
          // no_previous_session and unnamed predicates: nothing worth a line
          return null;
      }
    default:
      return null;
  }
}

/**
 * The why, with room for MORE THAN ONE contributing factor (owner 2026-07-19
 * follow-up): a hold can be a pacer deferral AND sit on top of a pain-capped
 * load — every cause the trace records gets its sentence, capped at three so
 * the strip stays a quick-read. Order: feedback modulation (how last session
 * felt shaped the dose), then the progression state (earn/pace/miss), then
 * the legacy grade fallback for pre-progression decisions.
 *
 * Dedup: a `not_earned` line whose predicate is pain/workload/dampener is the
 * earn-gate echo of a feedback note already rendered — it is skipped when the
 * feedback line said it first, so one cause never reads as two.
 */
export function composeWhyLines(
  input: Pick<PrescriptionNarrativeInput, "trace">,
): string[] {
  const lines: string[] = [];
  const feedbackSteps = input.trace.filter((s) => s.rule === "feedback");
  for (const step of feedbackSteps.slice(0, 2)) {
    lines.push(composeFeedbackLine(step.detail));
  }

  const progressionStep = input.trace.find((s) => s.rule === "progression");
  const progression = composeProgressionLine(input.trace);
  const feedbackAlreadySaidIt =
    progressionStep?.status === "not_earned" &&
    ["pain", "workload", "dampener"].includes(progressionStep.predicate ?? "") &&
    feedbackSteps.length > 0;
  if (progression && !feedbackAlreadySaidIt) lines.push(progression);

  // pre-v20 decisions carry no progression step — the grade colors the why
  if (!progressionStep && feedbackSteps.length === 0) {
    const grade = composeGradeLine(input.trace);
    if (grade) lines.push(grade);
  }

  return lines.slice(0, 3);
}

/**
 * N58 / doc 18 §6 — the LLM drop-in seam: a stored explanation replaces ONLY
 * the composed body lines; the ask line stays deterministic so the numbers on
 * screen are never model-rendered. No explanation ⇒ the composed lines render
 * (the composer is the permanent fallback). An out-of-band row keeps the
 * composed lines too: the stored explanation narrates the DECISION's numbers,
 * and the hand-adjusted caveat (N33 S4) must win over a story that no longer
 * matches the row.
 */
export function substituteExplanation(
  narrative: PrescriptionNarrative,
  explanation: string | null | undefined,
  outOfBand: boolean,
): PrescriptionNarrative {
  if (!explanation || outOfBand || narrative.ask == null) return narrative;
  return { ask: narrative.ask, lines: [explanation] };
}

/**
 * The full quick-read. The ask is always composable from the row; the body
 * lines want the recorded decision (pass `kind: null` while it loads and only
 * the ask renders).
 */
export function composePrescriptionNarrative(
  input: PrescriptionNarrativeInput,
): PrescriptionNarrative {
  const ask = composeAsk(input);
  const lines: string[] = [];

  if (ask == null) {
    return {
      ask: null,
      lines: [
        "No prescription yet — log this exercise once and the engine prices the next session from it.",
      ],
    };
  }

  if (input.isDeload) {
    // deloads neither earn nor step — the deload explanation IS the story
    lines.push(
      "A deload — deliberately light to shed the block's fatigue. Extra reps aren't the goal this week.",
    );
    return { ask, lines };
  }

  if (input.kind === "seed") {
    lines.push(
      "A starting point for this block, estimated from your recent history at this week's effort target.",
    );
  } else if (input.kind === "advance") {
    const delta = composeDelta(input);
    if (delta) lines.push(delta);
    lines.push(...composeWhyLines(input));
  }

  if (input.outOfBand && input.decisionOutput) {
    const d = input.decisionOutput;
    const engineAsk =
      d.weight != null && d.reps != null
        ? `${d.weight} lb for ${d.reps}`
        : "different numbers";
    lines.push(
      `These numbers were adjusted by hand — the engine's last computed target was ${engineAsk}${d.targetRir != null ? ` at ${d.targetRir} in reserve` : ""}.`,
    );
  }

  return { ask, lines };
}

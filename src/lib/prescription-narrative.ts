/**
 * Deterministic prescription quick-read (owner request 2026-07-19; the
 * PH30-adjacent non-LLM layer). Pure composition of a short, plain-language
 * explanation of a prescription from the row's numbers + the recorded engine
 * decision — what to do, how it compares to last session, and what the
 * progression engine decided (incl. the previously invisible `paced` /
 * `not_earned` states, the N56 §8.5 residual).
 *
 * v3 (doc 19): the composed lines ALWAYS render. An optional LLM coaching line
 * is *appended* beneath them (`appendCoaching`), never substituted for them —
 * one author per layer (§3). The ask and why are the complete output; a coach
 * line is additive when a stored row exists.
 *
 * ---------------------------------------------------------------------------
 * The copy system (N63, 2026-07-24). This layer and the coaching layer are one
 * voice, so the composer follows the same rules the coaching prompt is held to
 * (doc 19 §2 A4 / §6.2, from the owner review's tone table):
 *
 * 1. **The program is the actor.** "the program" writes the prescription. The
 *    word "engine" lives only in the Engine audit sheet (doc 19 §4.2); "we"
 *    and "I" appear nowhere.
 * 2. **Second person only for what the lifter actually did or reported** — you
 *    completed, you reported, you rated. Never for praise (doing the work is
 *    the baseline), never for effort that was assumed rather than logged (§4.3).
 * 3. **Cause, then consequence, in one sentence.** "You completed last
 *    session's target, so …" — not a stack of em-dashed clauses.
 * 4. **The lifter's own vocabulary**, taken from the surfaces they already see:
 *    weight (lb), reps, sets, short of failure, effort target, workload
 *    (`past just right` is the slider's own anchor), pump, joint pain,
 *    fatigue, performance. Never: step up, earned, paced, pacer, governor,
 *    quantum, anchor, dose, price, e1RM, engine.
 * 5. **Parallel construction over variety.** A held load always reads "the
 *    weight holds because …", so a ledger of causes reads as one system.
 * 6. **No conclusion is a fine conclusion** — thin data says so plainly.
 * 7. **No hype, no exclamation marks** (doc 06/08).
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
  /**
   * doc 19 §4.3 — was last session's effort actually reported, or inferred?
   * "observed" ⇒ some `rir_reported` on the previous session's working sets;
   * "inferred" (the safe default) ⇒ the engine assumed the prescribed target,
   * so no line may state last session's effort as observed. Derived where the
   * audit is assembled; undefined is treated as inferred.
   */
  effortStatus?: "observed" | "inferred";
  /**
   * N63 — where this week sits in the block, for the program-intent line (the
   * review's content hierarchy ranks program intent second, right after
   * exercise-specific constraints). Same template set the coaching facts use
   * (`projectProgramContext`, doc 19 §5) so both layers frame a week the same
   * way. Optional: absent ⇒ no intent line.
   */
  weekNumber?: number | null;
  mesoWeeks?: number | null;
}

export interface PrescriptionNarrative {
  /** the ask, composable from the row alone (renders before the audit loads) */
  ask: string | null;
  /** the why — delta vs last session, progression state, caveats */
  lines: string[];
  /**
   * doc 19 §3 — the LLM coaching line, appended beneath the deterministic why
   * as a visually distinct `COACH` line. Null unless a stored row exists AND
   * the row is servable (§3: prompt_version ≥ 3, not out-of-band). Additive,
   * never a replacement for `lines`.
   */
  coach: string | null;
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

/** "a", "a and b", "a, b, and c" — the delta line's clause list. */
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
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

/** "1 more rep per set" / "2 fewer reps per set" — digits throughout, matching
 *  the ask (the ledger sets numerals in the numeral face). */
function repsDelta(cur: number | null, prev: number | null): string | null {
  if (cur == null || prev == null || cur === prev) return null;
  const d = Math.abs(cur - prev);
  const noun = d === 1 ? "rep" : "reps";
  return `${d} ${cur > prev ? "more" : "fewer"} ${noun} per set`;
}

/**
 * The delta-vs-last-session sentence for an advance. Null when incomparable.
 *
 * The RIR ramp is the line's real work: when the weight and reps are unchanged
 * and the target moves closer to failure, the numbers look identical and the
 * session is harder — that clarifier renders ONLY in that case (a week that
 * also added weight or reps needs no explaining, and claiming "the numbers
 * match" there would be false).
 */
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
  const rampSteps =
    input.targetRir != null && prev.targetRir != null
      ? prev.targetRir - input.targetRir
      : 0;
  const closer =
    rampSteps > 0
      ? `${rampSteps === 1 ? "1 rep" : `${rampSteps} reps`} closer to failure`
      : null;
  const easier = rampSteps < 0 ? "an easier effort target" : null;
  const setsChanged =
    input.sets != null && prev.sets != null && input.sets !== prev.sets
      ? `${input.sets > prev.sets ? "a set added" : "a set dropped"} (${prev.sets} to ${input.sets})`
      : null;

  const moved = [dW, dR].filter((p): p is string => p != null);
  const rest = [closer, easier, setsChanged].filter(
    (p): p is string => p != null,
  );

  if (moved.length > 0) {
    return `Versus last session: ${joinClauses([...moved, ...rest])}.`;
  }
  if (rest.length > 0) {
    // same weight, same reps — the ramp is the whole story worth naming
    const clarifier = closer ? " — the same numbers, asked harder" : "";
    return `Same weight and reps as last session, ${joinClauses(rest)}${clarifier}.`;
  }
  return "The same work as last session, at the same effort target.";
}

/**
 * Plain-language translations of the engine's feedback-modulation notes
 * (rules/feedback.ts — engine-authored stable strings, keyword-matched and
 * pinned by tests). These are the "shaped by how last session felt" half of
 * the why, and every one of them names the rating the lifter themselves gave
 * ("you rated … past just right" is the workload slider's own anchor label);
 * anything unrecognized falls through verbatim so a new engine note is
 * surfaced rather than silently dropped.
 */
export function composeFeedbackLine(detail: string): string {
  if (detail.includes("set removed") && detail.includes("joint pain"))
    return "A set was removed because you reported joint pain here. If it keeps coming back, a different movement for this muscle may fit better.";
  if (detail.includes("load increase blocked"))
    return "The weight is capped while you are reporting joint pain here, and stays there until the pain stops.";
  if (detail.includes("set removed"))
    return "A set was removed because you rated last session's workload past just right.";
  if (detail.includes("set addition vetoed"))
    return "An extra set was planned but skipped, because you reported joint pain here.";
  if (detail.includes("set added"))
    return "A set was added because you rated the workload easy with a strong pump.";
  if (detail.includes("increases dampened"))
    return "Increases are held back after the fatigue and performance you reported for last session.";
  if (detail.includes("consider a different exercise"))
    return "The pump here has read low at a workload that is already right, so a different movement for this muscle may fit better.";
  const line = detail.charAt(0).toUpperCase() + detail.slice(1);
  return line.endsWith(".") ? line : `${line}.`;
}

/**
 * The legacy grade-based why (pre-v20 decisions with no progression step).
 * doc 19 §4.3: the grade's "~N vs M RIR" reading is *inferred* from performance,
 * never reported — so its effort framing renders only when effort was observed.
 * When inferred, the material fact (the weight held) is stated without an effort
 * claim, and a pure effort-feeds-the-target line is dropped.
 */
function composeGradeLine(
  trace: AuditTraceStep[],
  effortStatus: "observed" | "inferred",
): string | null {
  const grade = trace.find((s) => s.rule === "grade");
  if (!grade) return null;
  if (grade.detail.includes("harder than asked"))
    return effortStatus === "observed"
      ? "You worked harder than asked last session, so the weight holds rather than climbing."
      : "The weight holds rather than climbing this session.";
  if (grade.detail.includes("easier than asked"))
    return effortStatus === "observed"
      ? "Last session came in easier than asked, and that carries into the target this session is set from."
      : null;
  return null;
}

/**
 * The progression-state sentence (doc 16 §3.6 status vocabulary), in the copy
 * system above: cause first, consequence second, and one parallel construction
 * ("the weight holds because …") across every held state so the causes read as
 * one ledger rather than seven voices.
 *
 * The `paced` line carries the §4.1 difficulty framing — a load increase was
 * *held back*, which agrees with the delta line's "the same numbers, asked
 * harder" and must never be read as "no progress". It says where the added
 * difficulty went instead, which is the review's approved statement for this
 * state (reps and effort, not another weight jump).
 */
export function composeProgressionLine(
  trace: AuditTraceStep[],
): string | null {
  const step = trace.find((s) => s.rule === "progression");
  if (!step) return null;
  switch (step.status) {
    case "stepped":
      return "The weight goes up because you completed last session's target in full.";
    case "vanished":
      return "An increase came due, but it is smaller than this movement's smallest weight change, so it carries over to next session.";
    case "paced":
      // N63 — a held-back increase has FOUR possible reasons (doc 16 §3.5
      // governors), and every one of them was previously narrated as the rate
      // pacer's. Each governor gets its own true sentence; an unnamed one
      // states the hold without inventing a cause for it.
      switch (step.governor) {
        case "rate_pacer":
          return "Your recent gains are already ahead of the planned pace, so the added difficulty comes from reps and effort rather than more weight.";
        case "cadence":
          return "The weight already went up once this week, so this session builds through reps and effort instead.";
        case "miss_throttle":
          return "Recent increases here have not stuck, so the weight holds until a couple of sessions land clean.";
        case "peak_week":
          return "Weight increases are paused for the peak week — the added difficulty comes from taking the sets to failure.";
        default:
          return "An increase came due, but the weight holds this session, so the added difficulty comes from reps and effort.";
      }
    case "not_earned":
      switch (step.predicate) {
        case "compliance":
          return "The weight holds because last session's target was not fully met.";
        case "stale":
          return "This movement has not been trained in a while, so the program repeats the last target before adding to it.";
        case "pain":
          return "The weight holds because you reported joint pain here last session.";
        case "workload":
          return "The weight holds because you rated last session's workload past just right.";
        case "dampener":
          return "The weight holds because you rated last session high on fatigue or low on performance.";
        case "confidence":
          return "There is not enough recent data here to justify more weight yet, so the target repeats.";
        default:
          // no_previous_session and unnamed predicates: nothing worth a line
          return null;
      }
    default:
      return null;
  }
}

/**
 * N63 — the program-intent line: what this WEEK is for. The review's content
 * hierarchy puts program intent right behind exercise-specific constraints,
 * and these are the same three weeks the coaching layer treats as the story
 * (`block_intent` trigger, doc 19 §6.1) framed with the same templates the
 * facts payload uses — so a week reads the same whichever layer speaks.
 *
 * Null on a deload (the deload line IS the intent) and on ordinary weeks —
 * a routine week has no intent worth a sentence.
 */
export function composeProgramContextLine(
  input: Pick<
    PrescriptionNarrativeInput,
    "targetRir" | "isDeload" | "weekNumber" | "mesoWeeks" | "kind"
  >,
): string | null {
  if (input.isDeload) return null;
  if (input.targetRir != null && input.targetRir <= 0)
    return "This is the block's peak week — the sets are meant to end at failure.";
  // a seed already says "a starting point for this block"; don't say it twice
  if (input.weekNumber === 1 && input.kind !== "seed")
    return "First week of the block — it sets the baseline the rest of the block builds from.";
  if (
    input.weekNumber != null &&
    input.mesoWeeks != null &&
    input.weekNumber === input.mesoWeeks
  )
    return "The last week of this block.";
  return null;
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
  input: Pick<PrescriptionNarrativeInput, "trace" | "effortStatus">,
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
    const grade = composeGradeLine(input.trace, input.effortStatus ?? "inferred");
    if (grade) lines.push(grade);
  }

  return lines.slice(0, 3);
}

/**
 * doc 19 §3 — the v3 seam inversion: the composed why lines ALWAYS render; a
 * stored LLM coaching line is *appended* beneath them, never substituted for
 * them. The ask and why stay deterministic (one author per layer); the coach
 * line is additive context.
 *
 * The guards carry over from the retired `substituteExplanation`: no coaching
 * ⇒ the deterministic layers stand alone (the common path — coaching is a
 * minority of decisions, §6.1). An out-of-band row drops the coach line: its
 * story matches the DECISION, not the hand-adjusted numbers now on the row
 * (N33 S4), and the hand-adjusted caveat is the line that must win. An
 * unpriced row (null ask) never carries coaching.
 */
export function appendCoaching(
  narrative: PrescriptionNarrative,
  coaching: string | null | undefined,
  outOfBand: boolean,
): PrescriptionNarrative {
  if (!coaching || outOfBand || narrative.ask == null) return narrative;
  return { ...narrative, coach: coaching };
}

/** How many body lines may render before the program-intent frame is dropped:
 *  when a week already has two things to say, the frame is not the third. */
const INTENT_LINE_BUDGET = 2;

/**
 * The full quick-read. The ask is always composable from the row; the body
 * lines want the recorded decision (pass `kind: null` while it loads and only
 * the ask renders).
 *
 * Body order is change → cause → frame: what moved versus last session, why it
 * moved (every recorded cause), then what the week itself is for — and last of
 * all the hand-adjusted caveat when the live row diverges from the decision.
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
        "No prescription yet. Log this exercise once and the program will set the next session from it.",
      ],
      coach: null,
    };
  }

  if (input.isDeload) {
    // deloads neither earn nor step — the deload explanation IS the story
    lines.push(
      "A deload week, deliberately light to shed the block's fatigue. Extra reps are not the goal here.",
    );
    return { ask, lines, coach: null };
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

  if (input.kind != null && lines.length <= INTENT_LINE_BUDGET) {
    const context = composeProgramContextLine(input);
    if (context) lines.push(context);
  }

  if (input.outOfBand && input.decisionOutput) {
    const d = input.decisionOutput;
    const computed = composeAsk({ ...d, loadType: input.loadType });
    lines.push(
      computed
        ? `These numbers were set by hand. The program's own target was ${computed.replace(/\.$/, "")}.`
        : "These numbers were set by hand, and are not what the program last computed.",
    );
  }

  return { ask, lines, coach: null };
}

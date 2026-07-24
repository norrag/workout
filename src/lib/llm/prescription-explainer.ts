/**
 * N58 / doc 18 §§3–4 — the pure half of the LLM prescription explanation:
 * the payload projection (what the model sees), the static system prompt
 * (what the model is), and the deterministic post-check (what makes the
 * drop-in safe). No I/O, no env, no dates-from-now — everything comes from
 * the recorded decision + caller-supplied context, so this module is
 * unit-testable exactly like the engine.
 *
 * The engine — never the model — computes every number (root rule 3). The
 * model renders the recorded decision as 2–4 plain sentences answering what
 * changed AND why, naming every contributing cause (§1), then — v2, the §10
 * coaching layer — at most a clause or two of focus direction grounded in
 * the payload's trend, notes, or feedback.
 *
 * doc 19 / N60 (v3) SUPERSEDES the payload + prompt + post-check below: the
 * generation path now feeds the model the semantic FACTS projection
 * (`explanation-facts.ts`) and the trigger-gated coaching contract
 * (`coaching.ts`), not this raw-trace payload. What this module STILL provides
 * on the live path is the trend projection (`projectTrend`/`projectTrace`) and
 * `monthDay` used by `explanations.ts` context assembly; the v2
 * `buildExplanationPayload` / `EXPLANATION_SYSTEM_PROMPT` /
 * `postCheckExplanation` are retained as the doc-18 record (and their tests),
 * no longer called by generation.
 */

/** Bumped on any change to the system prompt or payload shape, and stored on
 *  every generated row so generations are comparable across revisions (§10).
 *  v2 = the §10 coaching layer: notes + trend + workout feedback in the
 *  payload, the 480-char coach-register output contract. */
export const EXPLANATION_PROMPT_VERSION = 2;

/** §10 output contract: ≤480 chars / 2–4 sentences (~120 output tokens). */
export const EXPLANATION_MAX_CHARS = 480;
export const EXPLANATION_MAX_OUTPUT_TOKENS = 160;

/** §10 input budget: v1's ~350-token payload plus the coaching additions
 *  (notes, trend, workout feedback), comfortably under 600 tokens. */
export const PAYLOAD_TOKEN_CEILING = 600;

/** Per-note truncation cap — a note is context, not the payload's spine. */
export const NOTE_MAX_CHARS = 200;

// ---------------------------------------------------------------------------
// payload (§3) — a trimmed projection of the recorded decision
// ---------------------------------------------------------------------------

/** One step of the decision trace, trimmed to what explains (rule + prose +
 *  the doc-16 §3.6 status coding). Numeric quanta stay out — the detail prose
 *  already carries the numbers the engine wants surfaced. */
export interface PayloadTraceStep {
  rule: string;
  detail: string;
  status?: string;
  governor?: string;
  predicate?: string;
}

/** §10 trend block — the progression-history aggregate trimmed to what the
 *  coach register can ground a focus direction in. Zero counts are omitted. */
export interface PayloadTrend {
  window_days: number;
  /** status mix over the window (stepped / vanished / paced / not_earned) */
  statuses: Record<string, number>;
  /** `paced` decisions by the governor that declined the earned step */
  governors?: Record<string, number>;
  /** earned asks answered by the next session: met vs missed */
  asks_met?: number;
  asks_missed?: number;
  /** trailing prescribed-vs-measured e1RM gain, normalized to %/30 days */
  prescribed_gain_pct_per_30d?: number;
  measured_gain_pct_per_30d?: number;
}

export interface ExplanationPayload {
  exercise: string;
  muscle_group?: string;
  equipment?: string;
  week?: { n?: number; of?: number; target_rir: number; deload: boolean };
  goal?: string;
  ask: { weight: number | null; reps: number | null; sets: number | null };
  previous?: {
    weight: number | null;
    reps: number | null;
    target_rir: number | null;
  };
  decision: { kind: string; trace: PayloadTraceStep[] };
  anchor?: { e1rm: number; from?: string };
  recent?: string[];
  feedback?: {
    pump: number | null;
    workload: number | null;
    joint_pain: number | null;
  };
  /** §10: last workout-level feedback (the session as a whole, 0–10 scales) */
  workout_feedback?: {
    fatigue?: number;
    effort?: number;
    performance?: number;
  };
  /** §10: the user's own words — pinned exercise note + last session note.
   *  The one v1 privacy exclusion, admitted deliberately here; these strings
   *  must never appear in any log or failure row. */
  notes?: { pinned?: string; last_session?: string };
  /** §10: the progression-history trend over the trailing window */
  trend?: PayloadTrend;
}

/** The recorded decision row, as stored (jsonb is untyped — read defensively). */
export interface ExplanationDecision {
  kind: string;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
}

/** Caller-assembled context the decision row doesn't carry itself. */
export interface ExplanationContext {
  exerciseName: string;
  muscleGroup: string | null;
  /** microcycle week number (1-based) */
  weekNumber: number | null;
  /** meso length in weeks */
  mesoWeeks: number | null;
  /** ≤3 preformatted history lines, newest first: "Jul 15 · 255 × 8, 7, 7" */
  recent: string[];
  /** §10: pinned exercise note, when one exists */
  pinnedNote?: string | null;
  /** §10: the exercise's most recent session note (`exercise_feedback.notes`) */
  lastSessionNote?: string | null;
  /** §10: last workout-level feedback (fatigue/effort/performance) */
  workoutFeedback?: {
    fatigue: number | null;
    effort: number | null;
    performance: number | null;
  } | null;
  /** §10: the pre-projected trend block, when the history supports one */
  trend?: PayloadTrend | null;
  /** doc 19 §5.2 — the session that produced the decision's `previous` tuple
   *  (and usually the note): its week, target RIR, and deload flag. Absent for
   *  a seed, or when the source session's week can't be resolved. */
  sourceSession?: {
    weekNumber?: number | null;
    targetRir?: number | null;
    deload?: boolean | null;
  } | null;
  /** doc 19 §5.2 — whether `lastSessionNote` was written in that same source
   *  session (matched by workout_exercise) rather than merely being recent. */
  lastSessionNoteFromSource?: boolean | null;
  /** doc 19 §5.3 — the macrocycle goal this meso serves, when it has one */
  macro?: {
    goalType: "hypertrophy" | "strength" | "cut" | "maintain";
    blockPosition?: number | null;
    blockCount?: number | null;
    phase?: string | null;
    goalNotes?: string | null;
    target?: {
      low: number | null;
      high: number | null;
      unit: string | null;
      direction: "gain" | "loss" | "none" | null;
      durationMonths: number | null;
    } | null;
  } | null;
}

/** Structural subset of `ProgressionAuditSummary`
 *  (`queries/progression-history.ts`) — kept structural so this module stays
 *  a pure leaf; the caller passes the aggregate it already computes. */
export interface TrendSummaryInput {
  decisions: number;
  statusCounts: Record<string, number>;
  governorFirings: Record<string, number>;
  earnedThenMet: number;
  earnedThenMissed: number;
  prescribedGain: { gainPctPer30d: number } | null;
  measuredGain: { gainPctPer30d: number } | null;
}

/** §10: trim the audit aggregate into the payload's trend block — zero counts
 *  and empty maps omitted so the token budget is spent only on signal. Null
 *  when the window recorded nothing (the block is then omitted entirely). */
export function projectTrend(
  summary: TrendSummaryInput,
  windowDays: number,
): PayloadTrend | null {
  if (summary.decisions === 0) return null;
  const statuses: Record<string, number> = {};
  for (const [status, count] of Object.entries(summary.statusCounts)) {
    if (count > 0) statuses[status] = count;
  }
  const governors = Object.keys(summary.governorFirings).length
    ? summary.governorFirings
    : undefined;
  return {
    window_days: windowDays,
    statuses,
    ...(governors ? { governors } : {}),
    ...(summary.earnedThenMet > 0 ? { asks_met: summary.earnedThenMet } : {}),
    ...(summary.earnedThenMissed > 0
      ? { asks_missed: summary.earnedThenMissed }
      : {}),
    ...(summary.prescribedGain
      ? { prescribed_gain_pct_per_30d: summary.prescribedGain.gainPctPer30d }
      : {}),
    ...(summary.measuredGain
      ? { measured_gain_pct_per_30d: summary.measuredGain.gainPctPer30d }
      : {}),
  };
}

/** Truncate a note to its budget cap on a word boundary where possible. */
export function truncateNote(body: string): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= NOTE_MAX_CHARS) return trimmed;
  const cut = trimmed.slice(0, NOTE_MAX_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > NOTE_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "Jul 12" from an ISO timestamp/date, UTC — deterministic, locale-free. */
export function monthDay(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(m[3])}`;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Trim the stored trace to the §3 shape (rule/detail/status/governor/
 *  predicate, verbatim), bounded so a pathological trace can't blow the
 *  token budget. */
export function projectTrace(output: Record<string, unknown>): PayloadTraceStep[] {
  const raw = output.trace;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(rec)
    .filter((s): s is Record<string, unknown> => s != null)
    .slice(0, 8)
    .map((s) => {
      const status = str(s.status);
      const governor = str(s.governor);
      const predicate = str(s.predicate);
      return {
        rule: str(s.rule) ?? "",
        detail: str(s.detail) ?? "",
        ...(status !== undefined ? { status } : {}),
        ...(governor !== undefined ? { governor } : {}),
        ...(predicate !== undefined ? { predicate } : {}),
      };
    });
}

/**
 * The §3 payload: everything engine-derived, no PII (names/emails/ids never
 * enter; free-text session notes are a v2 decision with its own privacy
 * review). Optional blocks are omitted — not nulled — to spend the token
 * budget only on what exists.
 */
export function buildExplanationPayload(
  decision: ExplanationDecision,
  context: ExplanationContext,
): ExplanationPayload {
  const inputs = decision.inputs;
  const output = decision.output;

  const week = rec(inputs.week);
  const previous = rec(inputs.previous);
  const feedback = rec(inputs.exerciseFeedback);
  const anchor = rec(inputs.strengthAnchor);
  const anchorSource = anchor ? rec(anchor.source) : null;
  const exercise = rec(inputs.exercise);
  const equipment = exercise ? str(exercise.equipmentType) : undefined;
  const loadType = exercise ? str(exercise.loadType) : undefined;

  const anchorValue = anchor ? num(anchor.value) : null;
  const anchorFromDate = anchorSource?.performedAt
    ? monthDay(String(anchorSource.performedAt))
    : null;
  const anchorFrom =
    anchorSource && num(anchorSource.weight) != null && num(anchorSource.reps) != null
      ? `${num(anchorSource.weight)} × ${num(anchorSource.reps)}${anchorFromDate ? ` on ${anchorFromDate}` : ""}`
      : undefined;

  return {
    exercise: context.exerciseName,
    ...(context.muscleGroup ? { muscle_group: context.muscleGroup } : {}),
    // bodyweight phrasing matters more than the equipment word (§3): a
    // non-external load type replaces it so "0 lb added" reads correctly
    ...(equipment
      ? { equipment: loadType && loadType !== "external" ? loadType : equipment }
      : {}),
    ...(week
      ? {
          week: {
            ...(context.weekNumber != null ? { n: context.weekNumber } : {}),
            ...(context.mesoWeeks != null ? { of: context.mesoWeeks } : {}),
            target_rir: num(week.targetRir) ?? 0,
            deload: week.isDeload === true,
          },
        }
      : {}),
    ...(str(inputs.goalType) ? { goal: str(inputs.goalType) } : {}),
    ask: {
      weight: num(output.weight),
      reps: num(output.reps),
      sets: num(output.sets),
    },
    ...(previous
      ? {
          previous: {
            weight: num(previous.weight),
            reps: num(previous.reps),
            target_rir: num(previous.targetRir),
          },
        }
      : {}),
    decision: { kind: decision.kind, trace: projectTrace(output) },
    ...(anchorValue != null
      ? { anchor: { e1rm: anchorValue, ...(anchorFrom ? { from: anchorFrom } : {}) } }
      : {}),
    ...(context.recent.length > 0 ? { recent: context.recent.slice(0, 3) } : {}),
    ...(feedback
      ? {
          feedback: {
            pump: num(feedback.pump),
            workload: num(feedback.workload),
            joint_pain: num(feedback.jointPain),
          },
        }
      : {}),
    ...buildWorkoutFeedbackBlock(context),
    ...buildNotesBlock(context),
    ...(context.trend ? { trend: context.trend } : {}),
  };
}

/** §10: the last workout's overall feedback — null fields dropped, the block
 *  omitted when nothing was recorded. */
function buildWorkoutFeedbackBlock(
  context: ExplanationContext,
): Pick<ExplanationPayload, "workout_feedback"> {
  const wf = context.workoutFeedback;
  if (!wf) return {};
  const block = {
    ...(wf.fatigue != null ? { fatigue: wf.fatigue } : {}),
    ...(wf.effort != null ? { effort: wf.effort } : {}),
    ...(wf.performance != null ? { performance: wf.performance } : {}),
  };
  return Object.keys(block).length > 0 ? { workout_feedback: block } : {};
}

/** §10: the user's own words, truncated to their budget caps. */
function buildNotesBlock(
  context: ExplanationContext,
): Pick<ExplanationPayload, "notes"> {
  const pinned = context.pinnedNote?.trim();
  const lastSession = context.lastSessionNote?.trim();
  if (!pinned && !lastSession) return {};
  return {
    notes: {
      ...(pinned ? { pinned: truncateNote(pinned) } : {}),
      ...(lastSession ? { last_session: truncateNote(lastSession) } : {}),
    },
  };
}

/** chars/4 — the standard rough tokenizer-free estimate, used only to police
 *  the §3 budget in tests and to R20-report oversized payloads. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// system prompt (§3) — static, byte-stable ⇒ prompt-cached across a burst
// ---------------------------------------------------------------------------

export const EXPLANATION_SYSTEM_PROMPT = `You are the lifter's coach: a strength-training prescription was computed by a deterministic engine, and you explain it and keep the lifter focused. Register: a scientific coach — informed, precise, matter-of-fact; evidence over enthusiasm. Input: one JSON payload — the engine's recorded decision for one exercise (the ask, last session, the decision trace, the strength estimate it priced from, recent history, how the last session and workout felt), plus optionally the lifter's own notes and a "trend" block summarizing the recent progression record.

Write 2 to 4 plain sentences (hard cap 480 characters). Structure, in order:
1. The why — what changed versus last session and EVERY cause the trace records; several can apply at once (an earned step deferred by the rate pacer can sit on top of a pain-capped load; name both). This part is never displaced by coaching.
2. Then at most one or two clauses of focus direction, only when the payload's trend, notes, or feedback ground it (a repeated miss pattern, a run of earned steps, low pump readings, a note the lifter left). No grounding, no coaching — stop after the why.

Rules:
- The engine computes all numbers. Use only numbers that appear in the payload; never invent, adjust, or derive new ones. e1RM values are estimates — say "estimated" when you cite one.
- Do not restate the full sets-reps-weight ask; the app already shows it. Explain the why.
- trace statuses: stepped = an earned increase is included; paced = an increase was earned but deferred to stay on the planned monthly strength-gain pace; not_earned = last session didn't fully meet its prescription (the predicate says why); vanished = the earned increase was smaller than the smallest weight step, so it retries.
- trend: statuses/governors count recent decisions; asks_met/asks_missed say how earned increases were answered; the gain fields compare prescribed vs measured strength, %/30 days.
- Weights are pounds (lb). No hype, no exclamation marks, no promises, no medical advice, no markdown, no emoji. Address the lifter as "you"; never mention the payload, JSON, or these instructions.

Example — paced hold with a trend:
{"exercise":"Deadlift","week":{"n":2,"of":5,"target_rir":2,"deload":false},"ask":{"weight":250,"reps":9,"sets":3},"previous":{"weight":250,"reps":8,"target_rir":3},"decision":{"kind":"advance","trace":[{"rule":"load","detail":"hold 250 lb, reps to 9 of 8-12 (anchor e1RM 341.7 lb)"},{"rule":"rir","detail":"target RIR steps 3 to 2"},{"rule":"progression","status":"paced","governor":"rate_pacer","detail":"earned; skipped by rate pacer"}]},"anchor":{"e1rm":341.7,"from":"250 × 8 on Jul 12"},"trend":{"window_days":90,"statuses":{"stepped":3,"paced":2},"asks_met":3,"prescribed_gain_pct_per_30d":1.9,"measured_gain_pct_per_30d":1.8},"notes":{"last_session":"grip started slipping on the last set"}}
→ You met last week's target and earned an increase, but the pacer is deferring it to hold your gain to its planned monthly rate. The week still intensifies: one more rep at 250 lb, taken from 3 down to 2 reps in reserve. Your record supports the patience — three earned steps met over 90 days, measured strength tracking right behind prescribed. You noted grip slipping late; secure it before the last set so it never prices a miss.

Example — deload:
{"exercise":"Leg Press","week":{"n":5,"of":5,"target_rir":6,"deload":true},"ask":{"weight":270,"reps":8,"sets":2},"previous":{"weight":405,"reps":9,"target_rir":0},"decision":{"kind":"advance","trace":[{"rule":"deload","detail":"deload week: load reduced from the meso peak, effort eased to RIR 6"}]},"workout_feedback":{"fatigue":8}}
→ This is the deload: the load drops well below last week's 405 lb on purpose, and sets stop 6 reps in reserve. Recovery is the stimulus this week — your last workout read fatigue at 8, which is exactly the debt this week discharges. Resist adding weight; the next block's loads depend on arriving fresh.`;

// ---------------------------------------------------------------------------
// post-check (§4) — deterministic, no second model call
// ---------------------------------------------------------------------------

const NUMERAL = /\d+(?:\.\d+)?/g;

/**
 * Every numeric value the model is allowed to write: numerals appearing
 * anywhere in the serialized payload (including inside strings — trace
 * details, history lines, dates), plus the engine-derived deltas between the
 * ask and the previous prescription (an explanation that says "5 lb more"
 * against 250→255 is restating the payload, not inventing).
 */
export function payloadNumberSet(payload: ExplanationPayload): Set<number> {
  const allowed = new Set<number>();
  for (const token of JSON.stringify(payload).match(NUMERAL) ?? []) {
    allowed.add(Number(token));
  }
  const pairs: Array<[number | null | undefined, number | null | undefined]> = [
    [payload.ask.weight, payload.previous?.weight],
    [payload.ask.reps, payload.previous?.reps],
    [payload.week?.target_rir, payload.previous?.target_rir],
  ];
  for (const [a, b] of pairs) {
    if (a != null && b != null) allowed.add(Math.round(Math.abs(a - b) * 10) / 10);
  }
  return allowed;
}

export type PostCheckResult =
  | { ok: true; body: string }
  | { ok: false; reason: string };

/**
 * §4: (a) non-empty; (b) length ≤ 320 (one whitespace-normalize pass first —
 * the model sometimes pads with newlines); (c) every numeral in the text is
 * in the payload's allowed set. Any failure ⇒ the caller discards, reports,
 * and the deterministic composer renders — this is what makes the drop-in
 * safe (§4).
 */
export function postCheckExplanation(
  text: string,
  payload: ExplanationPayload,
): PostCheckResult {
  const body = text.replace(/\s+/g, " ").trim();
  if (body.length === 0) return { ok: false, reason: "empty" };
  if (body.length > EXPLANATION_MAX_CHARS) {
    return { ok: false, reason: `too long (${body.length} chars)` };
  }
  const allowed = payloadNumberSet(payload);
  for (const token of body.match(NUMERAL) ?? []) {
    if (!allowed.has(Number(token))) {
      return { ok: false, reason: `number not in payload: ${token}` };
    }
  }
  return { ok: true, body };
}

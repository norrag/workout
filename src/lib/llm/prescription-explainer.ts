/**
 * N58 / doc 18 §§3–4 — the pure half of the LLM prescription explanation:
 * the payload projection (what the model sees), the static system prompt
 * (what the model is), and the deterministic post-check (what makes the
 * drop-in safe). No I/O, no env, no dates-from-now — everything comes from
 * the recorded decision + caller-supplied context, so this module is
 * unit-testable exactly like the engine.
 *
 * The engine — never the model — computes every number (root rule 3). The
 * model's only job is to render the recorded decision as 1–3 plain sentences
 * answering what changed AND why, naming every contributing cause (§1).
 */

/** Bumped on any change to the system prompt or payload shape, and stored on
 *  every generated row so generations are comparable across revisions (§10). */
export const EXPLANATION_PROMPT_VERSION = 1;

/** §4 output contract. */
export const EXPLANATION_MAX_CHARS = 320;
export const EXPLANATION_MAX_OUTPUT_TOKENS = 120;

/** §3 input budget: ~350 tokens hard target for the payload half. */
export const PAYLOAD_TOKEN_CEILING = 380;

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

export const EXPLANATION_SYSTEM_PROMPT = `You explain a strength-training prescription that a deterministic engine already computed. Input: one JSON payload — the engine's recorded decision for one exercise (the ask, last session, the decision trace, the strength estimate it priced from, recent history, how last session felt).

Write 1 to 3 plain sentences (hard cap 320 characters) telling the lifter why today's ask is what it is: what changed versus last session and every cause the trace records — several can apply at once (an earned step deferred by the rate pacer can sit on top of a pain-capped load; name both).

Rules:
- The engine computes all numbers. Use only numbers that appear in the payload; never invent, adjust, or derive new ones. e1RM values are estimates — say "estimated" when you cite one.
- Do not restate the full sets-reps-weight ask; the app already shows it. Explain the why.
- trace statuses: stepped = an earned increase is included; paced = an increase was earned but deferred to stay on the planned monthly strength-gain pace; not_earned = last session didn't fully meet its prescription (the predicate says why); vanished = the earned increase was smaller than the smallest weight step, so it retries.
- Weights are pounds (lb). No hype, no exclamation marks, no promises, no medical advice, no markdown, no emoji.

Example — paced hold:
{"exercise":"Deadlift","week":{"n":2,"of":5,"target_rir":2,"deload":false},"ask":{"weight":250,"reps":9,"sets":3},"previous":{"weight":250,"reps":8,"target_rir":3},"decision":{"kind":"advance","trace":[{"rule":"load","detail":"hold 250 lb, reps to 9 of 8-12 (anchor e1RM 341.7 lb)"},{"rule":"rir","detail":"target RIR steps 3 to 2"},{"rule":"progression","status":"paced","governor":"rate_pacer","detail":"earned; skipped by rate pacer"}]},"anchor":{"e1rm":341.7,"from":"250 × 8 on Jul 12"}}
→ You met last week's target, which earned an increase, but the pacer is deferring it to keep your strength gain on its planned monthly rate. The week itself steps up instead: one more rep at 250 lb, and the target drops from 3 to 2 reps in reserve, so the same load is taken closer to failure.

Example — deload:
{"exercise":"Leg Press","week":{"n":5,"of":5,"target_rir":6,"deload":true},"ask":{"weight":270,"reps":8,"sets":2},"previous":{"weight":405,"reps":9,"target_rir":0},"decision":{"kind":"advance","trace":[{"rule":"deload","detail":"deload week: load reduced from the meso peak, effort eased to RIR 6"}]}}
→ This is the deload: the load drops well below last week's 405 lb on purpose, and sets stop 6 reps in reserve. The point is to shed the fatigue the block built up, not to push numbers — recovery here is what makes the next block's loads productive.`;

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

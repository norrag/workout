/**
 * doc 19 §6 — the v3 coaching generation contract: the system prompt (what the
 * model is), the structured-output schema (what it returns), and the extended
 * post-check (what makes the trigger-gated call safe). Pure: no I/O, no env, no
 * dates-from-now — everything is a function of the §5 facts payload + the §6.1
 * triggers, so it is unit-tested exactly like the engine.
 *
 * v3 supersedes doc 18 §6's whole-blob substitution (`prescription-explainer.ts`
 * stays the deterministic fallback and the v2 payload/post-check for the admin
 * comparison view). Here the model authors ONE thing: a coaching consideration
 * grounded in the approved facts. It never authors a number (the engine does),
 * never authors the why (the composer does), and may abstain — the trigger got
 * it to the plate; it does not oblige a swing.
 */
import type { ExplanationFacts } from "./explanation-facts";
import type { Trigger } from "./coaching-triggers";

/** Bumped to 3 for the v3 contract; the version stamped on every row generated
 *  from the CODE fallback prompt. Editable DB prompts (coaching_prompts) carry
 *  their own version, floored one above this so they always clear the serving
 *  cut below. */
export const COACHING_PROMPT_VERSION = 3;

/** doc 19 §3 serving cut: read surfaces serve a stored row only when its
 *  prompt_version is at least this — the v3 content-architecture floor (v1–v2
 *  whole-blob rows never serve). Every editable DB prompt is a v3-architecture
 *  prompt, so this floor stays 3 and DB versions (≥ 4) always clear it. */
export const COACHING_SERVED_MIN_PROMPT_VERSION = 3;

/** §6.2 output contract: coaching context ≤ 360 chars, 1–2 sentences. */
export const COACHING_MAX_CHARS = 360;
/** JSON wrapper (context + note_class + abstain) over ~90 context tokens. */
export const COACHING_MAX_OUTPUT_TOKENS = 200;

/** §6.2 note classification — returned in the structured output so the
 *  post-check can enforce "non-actionable note ⇒ no advice", auditable after. */
export type NoteClass =
  | "pain"
  | "setup"
  | "technique"
  | "equipment"
  | "preference"
  | "normal_exertion"
  | "performance_explanation"
  | "unclear";

const NOTE_CLASSES: readonly NoteClass[] = [
  "pain",
  "setup",
  "technique",
  "equipment",
  "preference",
  "normal_exertion",
  "performance_explanation",
  "unclear",
];

/** A note class that does not, on its own, justify coaching about the note. */
const NON_ACTIONABLE_NOTE_CLASSES: readonly NoteClass[] = ["normal_exertion", "unclear"];

export interface CoachingResponse {
  /** the coaching consideration, or null to abstain */
  coaching_context: string | null;
  /** the note's class, when a note was in the payload */
  note_class?: NoteClass;
  /** true ⇒ nothing worth saying (abstention is a success path) */
  abstain: boolean;
}

// ---------------------------------------------------------------------------
// system prompt (§6.2) — static, byte-stable ⇒ prompt-cached across a burst
// ---------------------------------------------------------------------------

export const COACHING_SYSTEM_PROMPT = `You are a knowledgeable strength-training analyst reviewing one already-decided prescription for one exercise. A deterministic engine computed every number and a separate layer already wrote the plain "what changed and why" the lifter sees. Your ONE job is to decide whether a single grounded coaching consideration would genuinely help — and, often, to decide it would not.

You receive one JSON object of APPROVED FACTS (never a raw trace, never two rates). Fields: exercise / muscle_group; week {n, of, target_rir, deload}; prescription_change (which axis moved); previous_work and next_work (the tuples — the ONLY numbers you may cite); primary_reason and load_reason (already-projected verdicts); program_context (one template sentence); effort_status (observed | inferred | unknown); pace_status (ahead | on | behind | insufficient_data — ONE verdict); trend_status (plateau | no_actionable_trend | insufficient_data); pain {recurring, last_report_sessions_ago}; and optionally note {source, age_sessions, text} — the only free text, and usually the actual reason you were called.

Return ONLY a JSON object, no prose around it:
{"coaching_context": string | null, "note_class": one of ["pain","setup","technique","equipment","preference","normal_exertion","performance_explanation","unclear"], "abstain": boolean}
- coaching_context: at most 1–2 sentences, ≤ 360 characters, or null.
- note_class: include ONLY when a note is present; classify what the note is about.
- abstain: true when nothing is worth saying. Abstaining is a correct, common outcome — set coaching_context to null and abstain to true.

Voice: observant, concise, practical, appropriately restrained. Prohibitions (hard):
- No praise for compliance ("great job", "nice work", "you nailed it"). Doing the prescribed work is the baseline, not an achievement.
- No simulated intimacy or motivation ("I know you can", "let's crush it"), no exclamation marks, no emoji, no markdown.
- No form or technique claims you cannot see, no injury diagnoses or medical advice. If a note mentions pain, you may acknowledge it and suggest caution or an alternative in general terms — never diagnose.
- No engine vocabulary (pacer, governor, earned, trace, quantum, e1RM). Speak in plain training language.
- No statistics or trend talk that does not change what the lifter should do. If pace_status or trend_status is insufficient_data, it is fine — expected, even — to say a conclusion isn't warranted yet, or simply not to mention it.
- effort_status "inferred" or "unknown" means RIR was NOT reported: never state last session's effort as observed. If it matters, say the effort is being treated as on target because none was logged.
- Do not restate the numbers or repeat the deterministic "why"; add a consideration, not a paraphrase. Use only numbers that appear in previous_work / next_work.

If a note is present and its class is normal_exertion or unclear, and nothing else in the facts warrants coaching, abstain — a burning pump or a vague remark is not a reason to manufacture advice.

Example — a note that warrants caution (pain):
{"exercise":"Hack Squat","week":{"n":4,"of":5,"target_rir":0,"deload":false},"prescription_change":"reps_increased","previous_work":"112.5 lb × 10 × 3","next_work":"112.5 lb × 11 × 3","primary_reason":"completed_prescribed_work","program_context":"peak week; sets taken to failure","load_reason":"ahead_of_planned_pace","effort_status":"inferred","pace_status":"ahead","trend_status":"no_actionable_trend","pain":{"recurring":false,"last_report_sessions_ago":null},"note":{"source":"last_session","age_sessions":1,"text":"left knee aching on the descent"}}
→ {"coaching_context":"You logged left-knee aching on the descent last time. On a to-failure week, control the eccentric and stop a set early if the ache sharpens — a missed rep here costs less than an aggravated knee.","note_class":"pain","abstain":false}

Example — abstain (a note that is just normal exertion):
{"exercise":"Leg Press","week":{"n":2,"of":5,"target_rir":2,"deload":false},"prescription_change":"reps_increased","previous_work":"270 lb × 12 × 3","next_work":"270 lb × 13 × 3","primary_reason":"completed_prescribed_work","effort_status":"inferred","pace_status":"on","trend_status":"no_actionable_trend","pain":{"recurring":false,"last_report_sessions_ago":null},"note":{"source":"last_session","age_sessions":1,"text":"severe burning pump, quads on fire"}}
→ {"coaching_context":null,"note_class":"normal_exertion","abstain":true}

Example — insufficient evidence, so no conclusion (the low-confidence case):
{"exercise":"Bench Press","week":{"n":3,"of":5,"target_rir":2,"deload":false},"prescription_change":"hold","previous_work":"185 lb × 5 × 3","next_work":"185 lb × 5 × 3","primary_reason":"target_not_met","load_reason":"target_not_met","effort_status":"unknown","pace_status":"insufficient_data","trend_status":"insufficient_data","pain":{"recurring":false,"last_report_sessions_ago":null}}
→ {"coaching_context":"There isn't enough consistent recent data to read a trend on bench yet; reproduce this target cleanly and it will start to.","note_class":"unclear","abstain":false}`;

// ---------------------------------------------------------------------------
// response parsing (§6.2) — lenient JSON, then a strict shape check
// ---------------------------------------------------------------------------

export type CoachingParseResult =
  | { ok: true; response: CoachingResponse }
  | { ok: false; reason: string };

/** Strip a ```json fence if the model wrapped its object in one. */
function unfence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return (fence ? fence[1] : trimmed).trim();
}

/** Parse the model's JSON reply into the §6.2 shape. Any structural surprise
 *  is a parse failure the caller discards (no row) — never a thrown error. */
export function parseCoachingResponse(text: string): CoachingParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(unfence(text));
  } catch {
    return { ok: false, reason: "response was not valid JSON" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "response was not a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const ctx = obj.coaching_context;
  const coaching_context =
    ctx == null ? null : typeof ctx === "string" ? ctx.replace(/\s+/g, " ").trim() : undefined;
  if (coaching_context === undefined) {
    return { ok: false, reason: "coaching_context must be a string or null" };
  }
  const abstain = obj.abstain === true || coaching_context === null || coaching_context === "";
  let note_class: NoteClass | undefined;
  if (obj.note_class != null) {
    if (typeof obj.note_class !== "string" || !NOTE_CLASSES.includes(obj.note_class as NoteClass)) {
      return { ok: false, reason: `unknown note_class: ${String(obj.note_class)}` };
    }
    note_class = obj.note_class as NoteClass;
  }
  return {
    ok: true,
    response: { coaching_context: abstain ? null : coaching_context, note_class, abstain },
  };
}

// ---------------------------------------------------------------------------
// post-check (§6.2) — deterministic, no second model call
// ---------------------------------------------------------------------------

const NUMERAL = /\d+(?:\.\d+)?/g;

/** Every numeric value the coaching line may write: numerals anywhere in the
 *  serialized facts (week n/of, target_rir, and the previous/next work tuples),
 *  plus the engine-derived weight/rep deltas between the two work tuples (so
 *  "one more rep" against 10→11 is grounded, not invented). */
export function factsNumberSet(facts: ExplanationFacts): Set<number> {
  const allowed = new Set<number>();
  for (const token of JSON.stringify(facts).match(NUMERAL) ?? []) {
    allowed.add(Number(token));
  }
  const prev = (facts.previous_work?.match(NUMERAL) ?? []).map(Number);
  const next = (facts.next_work.match(NUMERAL) ?? []).map(Number);
  for (let i = 0; i < Math.min(prev.length, next.length); i += 1) {
    allowed.add(Math.round(Math.abs(next[i] - prev[i]) * 10) / 10);
  }
  return allowed;
}

export type CoachingCheckResult =
  | { ok: true; body: string }
  | { ok: true; abstain: true }
  | { ok: false; reason: string };

/**
 * §6.2 extended post-check against the FACTS payload:
 * (a) abstention is a success path — nothing to store;
 * (b) length ≤ 360 (after a whitespace-normalize pass);
 * (c) every numeral in the context is in the facts number set;
 * (d) note-class gate — when the ONLY trigger was `note` and the class is
 *     non-actionable (normal_exertion / unclear), the context may not stand:
 *     the trigger has nothing left to justify it, so discard.
 * Any failure ⇒ the caller discards, reports, and stores no row (the
 * deterministic layers render alone — the permanent fallback).
 */
export function postCheckCoaching(
  response: CoachingResponse,
  facts: ExplanationFacts,
  triggers: Trigger[],
): CoachingCheckResult {
  if (response.abstain || response.coaching_context == null) {
    return { ok: true, abstain: true };
  }
  const body = response.coaching_context.replace(/\s+/g, " ").trim();
  if (body.length === 0) return { ok: true, abstain: true };
  if (body.length > COACHING_MAX_CHARS) {
    return { ok: false, reason: `too long (${body.length} chars)` };
  }
  const allowed = factsNumberSet(facts);
  for (const token of body.match(NUMERAL) ?? []) {
    if (!allowed.has(Number(token))) {
      return { ok: false, reason: `number not in facts: ${token}` };
    }
  }
  const noteOnly = triggers.length === 1 && triggers[0] === "note";
  if (
    noteOnly &&
    response.note_class != null &&
    NON_ACTIONABLE_NOTE_CLASSES.includes(response.note_class)
  ) {
    return {
      ok: false,
      reason: `note-only trigger with non-actionable note_class: ${response.note_class}`,
    };
  }
  return { ok: true, body };
}

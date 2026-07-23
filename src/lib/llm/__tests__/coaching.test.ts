/**
 * doc 19 §6.2 — the v3 coaching contract: structured-output parsing + the
 * extended post-check. The load-bearing guarantees are the safety ones:
 * abstention is a success path (no row), invented numbers are rejected against
 * the FACTS number set, and a note-only trigger with a non-actionable class is
 * discarded (no manufactured advice).
 */
import { describe, expect, it } from "vitest";
import type { ExplanationFacts } from "../explanation-facts";
import {
  COACHING_MAX_CHARS,
  factsNumberSet,
  parseCoachingResponse,
  postCheckCoaching,
} from "../coaching";

const facts: ExplanationFacts = {
  exercise: "Hack Squat",
  muscle_group: "quads",
  week: { n: 4, of: 5, target_rir: 0, deload: false },
  prescription_change: "reps_increased",
  previous_work: "112.5 lb × 10 × 3",
  next_work: "112.5 lb × 11 × 3",
  primary_reason: "completed_prescribed_work",
  load_reason: "ahead_of_planned_pace",
  effort_status: "inferred",
  pace_status: "ahead",
  trend_status: "no_actionable_trend",
  pain: { recurring: false, last_report_sessions_ago: null },
  note: { source: "last_session", age_sessions: 1, text: "left knee aching on the descent" },
};

describe("parseCoachingResponse", () => {
  it("parses a normal coaching object", () => {
    const r = parseCoachingResponse(
      '{"coaching_context":"Control the eccentric on a to-failure week.","note_class":"pain","abstain":false}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.response.coaching_context).toContain("eccentric");
      expect(r.response.note_class).toBe("pain");
      expect(r.response.abstain).toBe(false);
    }
  });

  it("treats null context as abstention regardless of the flag", () => {
    const r = parseCoachingResponse('{"coaching_context":null,"note_class":"normal_exertion","abstain":false}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.response.abstain).toBe(true);
      expect(r.response.coaching_context).toBeNull();
    }
  });

  it("unwraps a ```json fence", () => {
    const r = parseCoachingResponse('```json\n{"coaching_context":"ok","abstain":false}\n```');
    expect(r.ok).toBe(true);
  });

  it("fails on non-JSON, non-object, or an unknown note_class", () => {
    expect(parseCoachingResponse("not json").ok).toBe(false);
    expect(parseCoachingResponse('["a","b"]').ok).toBe(false);
    expect(parseCoachingResponse('{"coaching_context":"x","note_class":"vibes"}').ok).toBe(false);
    expect(parseCoachingResponse('{"coaching_context":42}').ok).toBe(false);
  });
});

describe("factsNumberSet", () => {
  it("collects tuple numbers and the earned deltas", () => {
    const set = factsNumberSet(facts);
    expect(set.has(112.5)).toBe(true); // the load
    expect(set.has(11)).toBe(true); // next reps
    expect(set.has(10)).toBe(true); // previous reps
    expect(set.has(1)).toBe(true); // the rep delta (11 - 10)
    expect(set.has(4)).toBe(true); // week n
  });
});

describe("postCheckCoaching (§6.2)", () => {
  const good = { coaching_context: "Control the eccentric and stop early if the ache sharpens.", note_class: "pain" as const, abstain: false };

  it("passes a grounded, in-length coaching line", () => {
    const r = postCheckCoaching(good, facts, ["pain", "note"]);
    expect(r.ok).toBe(true);
    if (r.ok && !("abstain" in r)) expect(r.body).toContain("eccentric");
  });

  it("abstention stores nothing (success path)", () => {
    const r = postCheckCoaching({ coaching_context: null, abstain: true }, facts, ["note"]);
    expect(r).toEqual({ ok: true, abstain: true });
  });

  it("rejects an invented number not in the facts", () => {
    const r = postCheckCoaching(
      { coaching_context: "Add 20 lb next week for a real challenge.", abstain: false },
      facts,
      ["block_intent"],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("number not in facts");
  });

  it("allows a number that IS in the facts or is an earned delta", () => {
    expect(
      postCheckCoaching(
        { coaching_context: "One more rep than the 10 you hit, at the same 112.5 lb.", abstain: false },
        facts,
        ["block_intent"],
      ).ok,
    ).toBe(true);
  });

  it("rejects an over-length context", () => {
    const r = postCheckCoaching(
      { coaching_context: "x".repeat(COACHING_MAX_CHARS + 1), abstain: false },
      facts,
      ["block_intent"],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("too long");
  });

  it("discards a note-only trigger when the note is non-actionable (no manufactured advice)", () => {
    const pumpFacts: ExplanationFacts = {
      ...facts,
      note: { source: "last_session", age_sessions: 1, text: "severe burning pump" },
    };
    const r = postCheckCoaching(
      { coaching_context: "That burning pump shows controlled execution — great patience.", note_class: "normal_exertion", abstain: false },
      pumpFacts,
      ["note"],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("non-actionable note_class");
  });

  it("keeps a non-actionable note class when ANOTHER trigger justifies the call", () => {
    const r = postCheckCoaching(
      { coaching_context: "First week back — ease into the loads and rebuild the groove.", note_class: "normal_exertion", abstain: false },
      facts,
      ["note", "block_intent"],
    );
    expect(r.ok).toBe(true);
  });
});

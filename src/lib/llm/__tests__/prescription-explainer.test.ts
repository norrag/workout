/**
 * N58 / doc 18 §§3–4 — payload projection, token budget, and the post-check
 * that makes the LLM drop-in safe. The N56 W2·D4 deadlift decision is the
 * canonical fixture, same as the deterministic composer's suite.
 */
import { describe, expect, it } from "vitest";
import {
  EXPLANATION_MAX_CHARS,
  EXPLANATION_SYSTEM_PROMPT,
  PAYLOAD_TOKEN_CEILING,
  buildExplanationPayload,
  estimateTokens,
  monthDay,
  payloadNumberSet,
  postCheckExplanation,
  projectTrace,
  type ExplanationContext,
  type ExplanationDecision,
} from "../prescription-explainer";

/** The N56 field decision, in its stored jsonb shape. */
const w2d4Decision: ExplanationDecision = {
  kind: "advance",
  inputs: {
    exercise: { equipmentType: "barbell", loadType: "external" },
    goalType: "hypertrophy",
    week: { targetRir: 2, isDeload: false },
    previous: { weight: 250, reps: 8, sets: 3, targetRir: 3 },
    exerciseFeedback: { jointPain: 0, pump: 6, workload: 5 },
    strengthAnchor: {
      value: 341.7,
      confidence: "moderate",
      source: {
        weight: 250,
        reps: 8,
        ageDays: 7,
        sessionKey: "s1",
        performedAt: "2026-07-12T14:03:00Z",
      },
    },
  },
  output: {
    weight: 250,
    reps: 9,
    sets: 3,
    targetRir: 2,
    rationale: "hold",
    trace: [
      {
        rule: "load",
        detail: "hold 250 lb, reps to 9 of 8–12 (anchor e1RM 341.7 lb)",
      },
      { rule: "rir", detail: "target RIR steps 3 to 2" },
      {
        rule: "progression",
        detail: "earned; skipped by rate pacer (trailing 3.4%/mo ≥ target 1.7%/mo)",
        status: "paced",
        governor: "rate_pacer",
        deltaTarget: 6.7,
        deltaRealized: null,
      },
    ],
  },
};

const w2d4Context: ExplanationContext = {
  exerciseName: "Deadlift",
  muscleGroup: "glutes",
  weekNumber: 2,
  mesoWeeks: 5,
  recent: [
    "Jul 15 · 255 × 8, 7, 7",
    "Jul 12 · 250 × 8, 8, 8",
    "Jul 8 · 265 × 7, 7, 4",
  ],
};

describe("buildExplanationPayload (§3)", () => {
  const payload = buildExplanationPayload(w2d4Decision, w2d4Context);

  it("projects the N56 decision into the §3 shape", () => {
    expect(payload.exercise).toBe("Deadlift");
    expect(payload.muscle_group).toBe("glutes");
    expect(payload.equipment).toBe("barbell");
    expect(payload.week).toEqual({ n: 2, of: 5, target_rir: 2, deload: false });
    expect(payload.goal).toBe("hypertrophy");
    expect(payload.ask).toEqual({ weight: 250, reps: 9, sets: 3 });
    expect(payload.previous).toEqual({ weight: 250, reps: 8, target_rir: 3 });
    expect(payload.anchor).toEqual({ e1rm: 341.7, from: "250 × 8 on Jul 12" });
    expect(payload.recent).toHaveLength(3);
    expect(payload.feedback).toEqual({ pump: 6, workload: 5, joint_pain: 0 });
  });

  it("keeps the trace's why fields and drops the numeric quanta", () => {
    const progression = payload.decision.trace.find(
      (s) => s.rule === "progression",
    );
    expect(progression).toEqual({
      rule: "progression",
      detail:
        "earned; skipped by rate pacer (trailing 3.4%/mo ≥ target 1.7%/mo)",
      status: "paced",
      governor: "rate_pacer",
    });
    expect(progression).not.toHaveProperty("deltaTarget");
  });

  it("stays under the §3 token ceiling", () => {
    expect(estimateTokens(JSON.stringify(payload))).toBeLessThanOrEqual(
      PAYLOAD_TOKEN_CEILING,
    );
  });

  it("omits absent blocks instead of nulling them", () => {
    const bare = buildExplanationPayload(
      { kind: "seed", inputs: {}, output: { weight: 100, reps: 10, sets: 3 } },
      {
        exerciseName: "Row",
        muscleGroup: null,
        weekNumber: null,
        mesoWeeks: null,
        recent: [],
      },
    );
    expect(bare).toEqual({
      exercise: "Row",
      ask: { weight: 100, reps: 10, sets: 3 },
      decision: { kind: "seed", trace: [] },
    });
  });

  it("speaks the bodyweight load's language in the equipment slot", () => {
    const bw = buildExplanationPayload(
      {
        kind: "advance",
        inputs: {
          exercise: {
            equipmentType: "bodyweight",
            loadType: "bodyweight_loadable",
          },
        },
        output: { weight: 25, reps: 8, sets: 3 },
      },
      { ...w2d4Context, exerciseName: "Pull-up", recent: [] },
    );
    expect(bw.equipment).toBe("bodyweight_loadable");
  });

  it("caps recent lines at three and trace steps at eight", () => {
    const many = buildExplanationPayload(
      {
        kind: "advance",
        inputs: {},
        output: {
          trace: Array.from({ length: 12 }, (_, i) => ({
            rule: `r${i}`,
            detail: "d",
          })),
        },
      },
      { ...w2d4Context, recent: Array.from({ length: 6 }, (_, i) => `L${i}`) },
    );
    expect(many.recent).toHaveLength(3);
    expect(many.decision.trace).toHaveLength(8);
  });
});

describe("monthDay", () => {
  it("formats ISO timestamps and dates, UTC, locale-free", () => {
    expect(monthDay("2026-07-12T14:03:00Z")).toBe("Jul 12");
    expect(monthDay("2026-01-05")).toBe("Jan 5");
    expect(monthDay("not a date")).toBeNull();
  });
});

describe("projectTrace", () => {
  it("is defensive against malformed stored jsonb", () => {
    expect(projectTrace({})).toEqual([]);
    expect(projectTrace({ trace: "nope" })).toEqual([]);
    expect(projectTrace({ trace: [null, 42, { rule: "load" }] })).toEqual([
      { rule: "load", detail: "" },
    ]);
  });
});

describe("postCheckExplanation (§4)", () => {
  const payload = buildExplanationPayload(w2d4Decision, w2d4Context);

  it("accepts a grounded explanation and normalizes whitespace", () => {
    const result = postCheckExplanation(
      "You met last week's target, which earned an increase, but the pacer is\nholding it. One more rep at 250 lb, from 3 to 2 reps in reserve.",
      payload,
    );
    expect(result).toEqual({
      ok: true,
      body: "You met last week's target, which earned an increase, but the pacer is holding it. One more rep at 250 lb, from 3 to 2 reps in reserve.",
    });
  });

  it("rejects empty and over-length output", () => {
    expect(postCheckExplanation("   ", payload).ok).toBe(false);
    const long = "a".repeat(EXPLANATION_MAX_CHARS + 1);
    const result = postCheckExplanation(long, payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("too long");
  });

  it("rejects a number the payload never stated", () => {
    const result = postCheckExplanation(
      "Your estimated max moved to 355 lb, so the load holds.",
      payload,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("355");
  });

  it("allows engine-derived ask-vs-previous deltas", () => {
    // 9 vs 8 reps and RIR 2 vs 3 both differ by 1 — restating the payload
    const result = postCheckExplanation(
      "That is 1 more rep than last session, 1 rep closer to failure.",
      payload,
    );
    expect(result.ok).toBe(true);
  });

  it("reads numerals inside payload strings (dates, history lines)", () => {
    const result = postCheckExplanation(
      "Priced from an estimated 341.7 lb max set on Jul 12; you have been between 250 and 265 lb recently.",
      payload,
    );
    expect(result.ok).toBe(true);
  });
});

describe("payloadNumberSet", () => {
  it("includes payload numerals and computed deltas", () => {
    const payload = buildExplanationPayload(w2d4Decision, w2d4Context);
    const set = payloadNumberSet(payload);
    expect(set.has(341.7)).toBe(true); // anchor
    expect(set.has(250)).toBe(true); // ask weight
    expect(set.has(1)).toBe(true); // rep delta 9−8
    expect(set.has(3.4)).toBe(true); // inside the trace detail string
    expect(set.has(355)).toBe(false);
  });
});

describe("system prompt (§3)", () => {
  it("stays near its ~250-token cache budget", () => {
    // few-shots included; the whole prefix must stay cheap enough that a
    // cache miss is noise (§8). Generous ceiling — the point is drift alarm.
    expect(estimateTokens(EXPLANATION_SYSTEM_PROMPT)).toBeLessThanOrEqual(700);
  });

  it("binds the §1 multi-cause requirement and the house voice", () => {
    expect(EXPLANATION_SYSTEM_PROMPT).toContain("name both");
    expect(EXPLANATION_SYSTEM_PROMPT).toContain("no exclamation marks");
    expect(EXPLANATION_SYSTEM_PROMPT).toContain("pounds (lb)");
  });
});

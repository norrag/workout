/**
 * Deterministic prescription quick-read (2026-07-19 owner request). The N56
 * field case is the canonical fixture: W2·D4 deadlift 250×9×3 @ 2 RIR advanced
 * from 250×8×3 @ 3 RIR with the earned step paced — the exact "same weight,
 * why is this different" confusion the quick-read exists to explain.
 */
import { describe, expect, it } from "vitest";
import {
  composeAsk,
  composeDelta,
  composeFeedbackLine,
  composePrescriptionNarrative,
  composeProgressionLine,
  composeWhyLines,
  substituteExplanation,
} from "../prescription-narrative";

const w2d4 = {
  weight: 250,
  reps: 9,
  sets: 3,
  targetRir: 2,
  loadType: "external" as const,
  isDeload: false,
  kind: "advance" as const,
  trace: [
    { rule: "load", detail: "hold 250 lb, reps to 9 of 8–12" },
    { rule: "rir", detail: "target RIR steps 3 to 2" },
    {
      rule: "progression",
      detail: "earned; skipped by rate pacer",
      status: "paced",
      governor: "rate_pacer",
    },
  ],
  previous: { weight: 250, reps: 8, sets: 3, targetRir: 3 },
  outOfBand: false,
  decisionOutput: { weight: 250, reps: 9, sets: 3, targetRir: 2 },
};

describe("composeAsk", () => {
  it("translates the tuple into plain language", () => {
    expect(composeAsk(w2d4)).toBe(
      "3 sets of 9 at 250 lb, each stopped 2 reps short of failure.",
    );
  });

  it("names failure plainly at 0 RIR and singular at 1", () => {
    expect(composeAsk({ ...w2d4, targetRir: 0 })).toContain(
      "taken right to failure",
    );
    expect(composeAsk({ ...w2d4, targetRir: 1 })).toContain(
      "stopped 1 rep short of failure",
    );
  });

  it("speaks each load type's language", () => {
    expect(
      composeAsk({ ...w2d4, loadType: "bodyweight_only", weight: null }),
    ).toContain("at bodyweight");
    expect(
      composeAsk({ ...w2d4, loadType: "bodyweight_loadable", weight: 25 }),
    ).toContain("with 25 lb added");
    expect(
      composeAsk({ ...w2d4, loadType: "bodyweight_assisted", weight: 40 }),
    ).toContain("with 40 lb of assistance");
  });

  it("is null for an unpriced row", () => {
    expect(composeAsk({ ...w2d4, weight: null })).toBeNull();
    expect(composeAsk({ ...w2d4, reps: null })).toBeNull();
  });
});

describe("composeDelta", () => {
  it("explains the RIR ramp when the numbers move", () => {
    expect(composeDelta(w2d4)).toBe(
      "Versus last session: one more rep per set, and 1 rep closer to failure — a step up even where the numbers match.",
    );
  });

  it("explains a pure RIR step with unchanged numbers", () => {
    expect(
      composeDelta({ ...w2d4, reps: 8, previous: { ...w2d4.previous } }),
    ).toBe(
      "Same weight and reps as last session, and 1 rep closer to failure — a step up even where the numbers match.",
    );
  });

  it("names weight moves in both directions", () => {
    expect(
      composeDelta({
        ...w2d4,
        weight: 255,
        reps: 8,
        targetRir: 3,
      }),
    ).toBe("Versus last session: up 5 lb.");
    expect(
      composeDelta({
        ...w2d4,
        weight: 240,
        reps: 8,
        targetRir: 3,
      }),
    ).toBe("Versus last session: down 10 lb.");
  });

  it("names a set-count change", () => {
    expect(
      composeDelta({ ...w2d4, reps: 8, targetRir: 3, sets: 4 }),
    ).toBe(
      "Same weight and reps as last session, with a set added (3 to 4).",
    );
  });

  it("calls a true hold a hold", () => {
    expect(composeDelta({ ...w2d4, reps: 8, targetRir: 3 })).toBe(
      "Holding last session's numbers at the same effort target.",
    );
  });

  it("is null without a comparable previous session", () => {
    expect(composeDelta({ ...w2d4, previous: null })).toBeNull();
  });
});

describe("composeProgressionLine", () => {
  it("surfaces the paced state plainly (the N56 §8.5 residual)", () => {
    expect(composeProgressionLine(w2d4.trace)).toBe(
      "You have earned an increase; it is deferred for now so your strength gain stays on its planned monthly pace.",
    );
  });

  it("covers stepped and vanished", () => {
    expect(
      composeProgressionLine([
        { rule: "progression", detail: "", status: "stepped" },
      ]),
    ).toContain("earned increase");
    expect(
      composeProgressionLine([
        { rule: "progression", detail: "", status: "vanished" },
      ]),
    ).toContain("smallest weight step");
  });

  it("names each not-earned predicate without judgement", () => {
    const line = (predicate: string) =>
      composeProgressionLine([
        { rule: "progression", detail: "", status: "not_earned", predicate },
      ]);
    expect(line("compliance")).toContain("didn't fully meet");
    expect(line("stale")).toContain("hasn't been trained in a while");
    expect(line("pain")).toContain("joint pain");
    expect(line("workload")).toContain("workload ran hot");
    expect(line("dampener")).toContain("rough one");
    expect(line("confidence")).toContain("isn't confident enough");
  });

  it("stays silent on no_previous_session and without a progression step", () => {
    expect(
      composeProgressionLine([
        {
          rule: "progression",
          detail: "",
          status: "not_earned",
          predicate: "no_previous_session",
        },
      ]),
    ).toBeNull();
    expect(composeProgressionLine([{ rule: "load", detail: "x" }])).toBeNull();
  });
});

describe("composeFeedbackLine", () => {
  it("translates each engine feedback note into plain language", () => {
    expect(
      composeFeedbackLine("joint pain 2/3: load increase blocked"),
    ).toContain("capping the load");
    expect(
      composeFeedbackLine(
        "joint pain 2/3: set removed — consider substituting this exercise",
      ),
    ).toContain("A set was removed because of the joint pain");
    expect(
      composeFeedbackLine("workload 9/10 past just right: set removed"),
    ).toContain("workload ran past just right");
    expect(
      composeFeedbackLine("workload 3/10 easy with strong pump: set added"),
    ).toContain("A set was added");
    expect(
      composeFeedbackLine("joint pain 2/3: set addition vetoed"),
    ).toContain("extra set was skipped");
    expect(
      composeFeedbackLine("rough session reported: increases dampened"),
    ).toContain("dampened");
    expect(
      composeFeedbackLine("low pump at the right workload: consider a different exercise"),
    ).toContain("different movement");
  });

  it("surfaces an unrecognized note verbatim rather than dropping it", () => {
    expect(composeFeedbackLine("a brand new engine note")).toBe(
      "A brand new engine note.",
    );
  });
});

describe("composeWhyLines — multiple contributing factors", () => {
  it("renders feedback AND progression causes together", () => {
    const lines = composeWhyLines({
      trace: [
        { rule: "feedback", detail: "joint pain 2/3: load increase blocked" },
        {
          rule: "progression",
          detail: "earned; skipped by rate pacer",
          status: "paced",
          governor: "rate_pacer",
        },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("capping the load");
    expect(lines[1]).toContain("deferred");
  });

  it("dedups the earn-gate echo of a feedback cause (one cause, one line)", () => {
    const lines = composeWhyLines({
      trace: [
        { rule: "feedback", detail: "joint pain 2/3: load increase blocked" },
        {
          rule: "progression",
          detail: "not earned: joint pain reported last session",
          status: "not_earned",
          predicate: "pain",
        },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("capping the load");
  });

  it("keeps the not-earned line when no feedback note carried the cause", () => {
    const lines = composeWhyLines({
      trace: [
        {
          rule: "progression",
          detail: "not earned: joint pain reported last session",
          status: "not_earned",
          predicate: "pain",
        },
      ],
    });
    expect(lines).toEqual(["Held steady — joint pain was reported last session."]);
  });

  it("falls back to the grade for pre-progression decisions only", () => {
    const legacy = composeWhyLines({
      trace: [
        { rule: "load", detail: "hold 250 lb" },
        {
          rule: "grade",
          detail: "harder than asked (~1 vs 2 RIR) — held, not a miss",
        },
      ],
    });
    expect(legacy).toEqual([
      "Last session ran harder than asked, so the load holds rather than climbs.",
    ]);
    const modern = composeWhyLines({
      trace: [
        { rule: "grade", detail: "harder than asked (~1 vs 2 RIR) — held, not a miss" },
        { rule: "progression", detail: "", status: "stepped" },
      ],
    });
    expect(modern).toHaveLength(1);
    expect(modern[0]).toContain("earned increase");
  });
});

describe("composePrescriptionNarrative", () => {
  it("the N56 fixture reads as ask + delta + paced state", () => {
    const n = composePrescriptionNarrative(w2d4);
    expect(n.ask).toBe(
      "3 sets of 9 at 250 lb, each stopped 2 reps short of failure.",
    );
    expect(n.lines).toEqual([
      "Versus last session: one more rep per set, and 1 rep closer to failure — a step up even where the numbers match.",
      "You have earned an increase; it is deferred for now so your strength gain stays on its planned monthly pace.",
    ]);
  });

  it("a deload explains itself and suppresses progression talk", () => {
    const n = composePrescriptionNarrative({ ...w2d4, isDeload: true });
    expect(n.lines).toHaveLength(1);
    expect(n.lines[0]).toContain("deload");
  });

  it("a seed explains its provenance", () => {
    const n = composePrescriptionNarrative({
      ...w2d4,
      kind: "seed",
      previous: null,
    });
    expect(n.lines[0]).toContain("starting point");
  });

  it("renders the ask alone while the decision loads", () => {
    const n = composePrescriptionNarrative({
      ...w2d4,
      kind: null,
      trace: [],
      previous: null,
    });
    expect(n.ask).not.toBeNull();
    expect(n.lines).toEqual([]);
  });

  it("an unpriced row says so", () => {
    const n = composePrescriptionNarrative({
      ...w2d4,
      weight: null,
      reps: null,
    });
    expect(n.ask).toBeNull();
    expect(n.lines[0]).toContain("No prescription yet");
  });

  it("hand-adjusted numbers are flagged with the engine's target", () => {
    const n = composePrescriptionNarrative({ ...w2d4, outOfBand: true });
    expect(n.lines.at(-1)).toBe(
      "These numbers were adjusted by hand — the engine's last computed target was 250 lb for 9 at 2 in reserve.",
    );
  });
});

describe("substituteExplanation (doc 18 §6 — the LLM drop-in seam)", () => {
  const composed = composePrescriptionNarrative(w2d4);
  const explanation =
    "You met last week's target and earned an increase, but the pacer is deferring it.";

  it("replaces the body lines only — the ask stays deterministic", () => {
    const n = substituteExplanation(composed, explanation, false);
    expect(n.ask).toBe(composed.ask);
    expect(n.lines).toEqual([explanation]);
  });

  it("falls back to the composed lines when no explanation is stored", () => {
    expect(substituteExplanation(composed, null, false)).toBe(composed);
    expect(substituteExplanation(composed, undefined, false)).toBe(composed);
    expect(substituteExplanation(composed, "", false)).toBe(composed);
  });

  it("keeps the composed lines on an out-of-band row (the N33 S4 caveat wins)", () => {
    const outOfBand = composePrescriptionNarrative({ ...w2d4, outOfBand: true });
    const n = substituteExplanation(outOfBand, explanation, true);
    expect(n).toBe(outOfBand);
    expect(n.lines.at(-1)).toContain("adjusted by hand");
  });

  it("never substitutes onto an unpriced row", () => {
    const cold = composePrescriptionNarrative({
      ...w2d4,
      weight: null,
      reps: null,
    });
    expect(substituteExplanation(cold, explanation, false)).toBe(cold);
  });
});

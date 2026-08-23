/**
 * Deterministic prescription quick-read (2026-07-19 owner request; hardened for
 * doc 19 §4, copy system reworked in N63). The N56 field case is the canonical
 * fixture: W2·D4 deadlift 250×9×3 @ 2 RIR advanced from 250×8×3 @ 3 RIR with
 * the earned step paced — the exact "same weight, why is this different"
 * confusion the quick-read exists to explain. v3 (doc 19): the composed lines
 * always render and an LLM coaching line is appended (`appendCoaching`), never
 * substituted.
 *
 * The N63 additions pin the COPY SYSTEM itself, not just individual strings:
 * one voice with the coaching layer (no engine vocabulary anywhere, no hype,
 * the lifter's own rating words), parallel construction across held-weight
 * causes, and the program-intent frame.
 */
import { describe, expect, it } from "vitest";
import {
  appendCoaching,
  composeAsk,
  composeDelta,
  composeFeedbackLine,
  composePrescriptionNarrative,
  composeProgramContextLine,
  composeProgressionLine,
  composeWhyLines,
} from "../prescription-narrative";
import type { AuditTraceStep } from "@/lib/queries/audit";

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
  weekNumber: 2,
  mesoWeeks: 5,
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
  it("lists every axis that moved in one sentence", () => {
    expect(composeDelta(w2d4)).toBe(
      "Versus last session: 1 more rep per set and 1 rep closer to failure.",
    );
  });

  it("explains a pure RIR step with unchanged numbers", () => {
    expect(
      composeDelta({ ...w2d4, reps: 8, previous: { ...w2d4.previous } }),
    ).toBe(
      "Same weight and reps as last session, 1 rep closer to failure — the same numbers, asked harder.",
    );
  });

  it("claims 'the same numbers' ONLY when the numbers really match", () => {
    // the ramp clarifier is the line's whole job, and a false one is worse
    // than none: this week added a rep, so the numbers did NOT match
    expect(composeDelta(w2d4)).not.toContain("the same numbers");
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
      "Same weight and reps as last session, a set added (3 to 4).",
    );
  });

  it("names an easier effort target without calling it a step up", () => {
    const line = composeDelta({ ...w2d4, reps: 8, targetRir: 3, previous: { ...w2d4.previous, targetRir: 2 } });
    expect(line).toBe(
      "Same weight and reps as last session, an easier effort target.",
    );
    expect(line).not.toContain("asked harder");
  });

  it("calls a true hold a hold", () => {
    expect(composeDelta({ ...w2d4, reps: 8, targetRir: 3 })).toBe(
      "The same work as last session, at the same effort target.",
    );
  });

  it("is null without a comparable previous session", () => {
    expect(composeDelta({ ...w2d4, previous: null })).toBeNull();
  });
});

describe("composeProgressionLine — program-language, no engine vocab (§4.2)", () => {
  it("frames the paced hold as a load increase HELD BACK, and says where the difficulty went (§4.1)", () => {
    expect(composeProgressionLine(w2d4.trace)).toBe(
      "Your recent gains are already ahead of the planned pace, so the added difficulty comes from reps and effort rather than more weight.",
    );
  });

  it("tells the four paced governors apart instead of blaming the rate pacer (N63)", () => {
    const paced = (governor?: string) =>
      composeProgressionLine([
        {
          rule: "progression",
          detail: "earned; held",
          status: "paced",
          ...(governor ? { governor } : {}),
        },
      ]);
    expect(paced("cadence")).toContain("already went up once this week");
    expect(paced("miss_throttle")).toContain("have not stuck");
    expect(paced("peak_week")).toContain("paused for the peak week");
    // an unnamed governor names the hold without inventing a cause for it
    expect(paced()).toContain("the weight holds this session");
    for (const governor of [undefined, "cadence", "miss_throttle", "peak_week"]) {
      expect(paced(governor)).not.toContain("planned pace");
    }
  });

  it("covers stepped and vanished", () => {
    expect(
      composeProgressionLine([
        { rule: "progression", detail: "", status: "stepped" },
      ]),
    ).toBe(
      "The weight goes up because you completed last session's target in full.",
    );
    // N89 — an earned step is a target STRENGTH, and the load rule may spend it
    // on reps at a held weight. Each move gets its own true sentence; `unknown`
    // (no baseline recorded) keeps the wording it always had, above.
    const stepped = (loadMove: "up" | "hold" | "down") =>
      composeProgressionLine(
        [{ rule: "progression", detail: "", status: "stepped" }],
        loadMove,
      );
    expect(stepped("up")).toContain("The weight goes up because");
    expect(stepped("hold")).toBe(
      "You completed last session's target in full, so the session gets harder through reps and effort rather than more weight.",
    );
    expect(stepped("down")).toBe(
      "You completed last session's target in full, and the program builds on it this session.",
    );
    for (const move of ["hold", "down"] as const) {
      expect(stepped(move)).not.toContain("weight goes up");
    }
    expect(
      composeProgressionLine([
        { rule: "progression", detail: "", status: "vanished" },
      ]),
    ).toContain("smallest weight change");
  });

  it("names each not-earned predicate without judgement", () => {
    const line = (predicate: string) =>
      composeProgressionLine([
        { rule: "progression", detail: "", status: "not_earned", predicate },
      ]);
    expect(line("compliance")).toContain("not fully met");
    expect(line("stale")).toContain("not been trained in a while");
    expect(line("pain")).toContain("joint pain");
    expect(line("workload")).toContain("past just right");
    expect(line("dampener")).toContain("fatigue or low on performance");
    expect(line("confidence")).toContain("not enough recent data");
  });

  it("holds one parallel construction across every held-weight cause (N63 copy rule 5)", () => {
    for (const predicate of ["compliance", "pain", "workload", "dampener"]) {
      expect(
        composeProgressionLine([
          { rule: "progression", detail: "", status: "not_earned", predicate },
        ]),
      ).toMatch(/^The weight holds because /);
    }
  });

  it("never uses the word 'engine' (§4.2 — it lives only in Prescription details)", () => {
    const statuses = ["stepped", "vanished", "paced"];
    for (const status of statuses) {
      expect(
        composeProgressionLine([{ rule: "progression", detail: "", status }]),
      ).not.toMatch(/engine/i);
    }
    for (const predicate of [
      "compliance",
      "stale",
      "pain",
      "workload",
      "dampener",
      "confidence",
    ]) {
      expect(
        composeProgressionLine([
          { rule: "progression", detail: "", status: "not_earned", predicate },
        ]),
      ).not.toMatch(/engine/i);
    }
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
  it("translates each engine feedback note into the lifter's own rating words", () => {
    expect(
      composeFeedbackLine("joint pain 2/3: load increase blocked"),
    ).toContain("The weight is capped while you are reporting joint pain");
    expect(
      composeFeedbackLine(
        "joint pain 2/3: set removed — consider substituting this exercise",
      ),
    ).toContain("A set was removed because you reported joint pain");
    expect(
      composeFeedbackLine("workload 9/10 past just right: set removed"),
    ).toContain("you rated last session's workload past just right");
    expect(
      composeFeedbackLine("workload 3/10 easy with strong pump: set added"),
    ).toContain("A set was added because you rated the workload easy");
    expect(
      composeFeedbackLine("joint pain 2/3: set addition vetoed"),
    ).toContain("An extra set was planned but skipped");
    expect(
      composeFeedbackLine("rough session reported: increases dampened"),
    ).toContain("the fatigue and performance you reported");
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

describe("composeProgramContextLine — program intent (N63)", () => {
  it("names the peak week when the target reaches failure", () => {
    expect(
      composeProgramContextLine({
        targetRir: 0,
        isDeload: false,
        weekNumber: 4,
        mesoWeeks: 5,
        kind: "advance",
      }),
    ).toBe("This is the block's peak week — the sets are meant to end at failure.");
  });

  it("names the first week of a block, but never on a seed (which already says it)", () => {
    const first = {
      targetRir: 3,
      isDeload: false,
      weekNumber: 1,
      mesoWeeks: 5,
    };
    expect(
      composeProgramContextLine({ ...first, kind: "advance" }),
    ).toContain("First week of the block");
    expect(composeProgramContextLine({ ...first, kind: "seed" })).toBeNull();
  });

  it("names the block's last week", () => {
    expect(
      composeProgramContextLine({
        targetRir: 1,
        isDeload: false,
        weekNumber: 5,
        mesoWeeks: 5,
        kind: "advance",
      }),
    ).toBe("The last week of this block.");
  });

  it("stays silent on an ordinary week and on a deload", () => {
    expect(
      composeProgramContextLine({
        targetRir: 2,
        isDeload: false,
        weekNumber: 2,
        mesoWeeks: 5,
        kind: "advance",
      }),
    ).toBeNull();
    expect(
      composeProgramContextLine({
        targetRir: 3,
        isDeload: true,
        weekNumber: 5,
        mesoWeeks: 5,
        kind: "advance",
      }),
    ).toBeNull();
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
    expect(lines[0]).toContain("capped while you are reporting joint pain");
    expect(lines[1]).toContain("ahead of the planned pace");
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
    expect(lines[0]).toContain("capped while you are reporting joint pain");
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
    expect(lines).toEqual([
      "The weight holds because you reported joint pain here last session.",
    ]);
  });

  it("caps at three lines under any stack of trace steps (§4.4 suppression)", () => {
    const lines = composeWhyLines({
      trace: [
        { rule: "feedback", detail: "joint pain 2/3: load increase blocked" },
        { rule: "feedback", detail: "workload 9/10 past just right: set removed" },
        { rule: "feedback", detail: "rough session reported: increases dampened" },
        {
          rule: "progression",
          detail: "earned; skipped by rate pacer",
          status: "paced",
          governor: "rate_pacer",
        },
      ],
    });
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  describe("effort honesty (§4.3) — the grade line", () => {
    const harderTrace = [
      { rule: "load", detail: "hold 250 lb" },
      {
        rule: "grade",
        detail: "harder than asked (~1 vs 2 RIR) — held, not a miss",
      },
    ];

    it("states last session's effort only when it was observed", () => {
      expect(
        composeWhyLines({ trace: harderTrace, effortStatus: "observed" }),
      ).toEqual([
        "You worked harder than asked last session, so the weight holds rather than climbing.",
      ]);
    });

    it("drops the effort claim when RIR was not reported (inferred)", () => {
      const inferred = composeWhyLines({
        trace: harderTrace,
        effortStatus: "inferred",
      });
      expect(inferred).toEqual([
        "The weight holds rather than climbing this session.",
      ]);
      expect(inferred[0]).not.toMatch(/harder than asked|RIR/);
    });

    it("defaults to inferred when effort status is unknown", () => {
      expect(composeWhyLines({ trace: harderTrace })).toEqual([
        "The weight holds rather than climbing this session.",
      ]);
    });

    it("suppresses a pure effort-feeds-target line entirely when inferred", () => {
      const easierTrace = [
        { rule: "load", detail: "hold 250 lb" },
        {
          rule: "grade",
          detail: "easier than asked (~3 vs 2 RIR)",
        },
      ];
      expect(
        composeWhyLines({ trace: easierTrace, effortStatus: "inferred" }),
      ).toEqual([]);
      expect(
        composeWhyLines({ trace: easierTrace, effortStatus: "observed" }),
      ).toEqual([
        "Last session came in easier than asked, and that carries into the target this session is set from.",
      ]);
    });
  });

  it("uses the grade fallback only for pre-progression decisions", () => {
    const modern = composeWhyLines({
      trace: [
        { rule: "grade", detail: "harder than asked (~1 vs 2 RIR) — held, not a miss" },
        { rule: "progression", detail: "", status: "stepped" },
      ],
      effortStatus: "observed",
    });
    expect(modern).toHaveLength(1);
    expect(modern[0]).toContain("The weight goes up");
  });
});

describe("composePrescriptionNarrative", () => {
  it("the N56 fixture reads as ask + delta + paced state, coach absent", () => {
    const n = composePrescriptionNarrative(w2d4);
    expect(n.ask).toBe(
      "3 sets of 9 at 250 lb, each stopped 2 reps short of failure.",
    );
    expect(n.lines).toEqual([
      "Versus last session: 1 more rep per set and 1 rep closer to failure.",
      "Your recent gains are already ahead of the planned pace, so the added difficulty comes from reps and effort rather than more weight.",
    ]);
    expect(n.coach).toBeNull();
  });

  it("the paced line never renders as the only line in a week that intensified (§4.1)", () => {
    const n = composePrescriptionNarrative(w2d4);
    // the delta line is ordered first and names the intensification the paced
    // line then explains, so a held weight never reads as "nothing happened"
    expect(n.lines.length).toBeGreaterThan(1);
    expect(n.lines[0]).toContain("closer to failure");
  });

  it("frames the week when there is room for it (change → cause → frame)", () => {
    const n = composePrescriptionNarrative({
      ...w2d4,
      weight: 250,
      reps: 9,
      targetRir: 0,
      previous: { weight: 250, reps: 9, sets: 3, targetRir: 1 },
      weekNumber: 5,
      mesoWeeks: 5,
    });
    expect(n.lines.at(-1)).toContain("peak week");
    expect(n.lines[0]).toContain("the same numbers, asked harder");
  });

  it("drops the frame when the week already has two things to say", () => {
    const n = composePrescriptionNarrative({
      ...w2d4,
      targetRir: 0,
      previous: { weight: 250, reps: 8, sets: 3, targetRir: 1 },
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
    expect(n.lines).toHaveLength(3);
    expect(n.lines.join(" ")).not.toContain("peak week");
  });

  it("a deload explains itself and suppresses progression talk", () => {
    const n = composePrescriptionNarrative({ ...w2d4, isDeload: true });
    expect(n.lines).toHaveLength(1);
    expect(n.lines[0]).toContain("deload");
    expect(n.coach).toBeNull();
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
    expect(n.coach).toBeNull();
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

  it("hand-adjusted numbers name the program's own target in the ask's own words", () => {
    const n = composePrescriptionNarrative({ ...w2d4, outOfBand: true });
    expect(n.lines.at(-1)).toBe(
      "These numbers were set by hand. The program's own target was 3 sets of 9 at 250 lb, each stopped 2 reps short of failure.",
    );
    expect(n.lines.at(-1)).not.toMatch(/engine/i);
  });

  it("never stacks the why past three lines (§4.4 suppression)", () => {
    const n = composePrescriptionNarrative({
      ...w2d4,
      trace: [
        { rule: "feedback", detail: "joint pain 2/3: load increase blocked" },
        { rule: "feedback", detail: "workload 9/10 past just right: set removed" },
        {
          rule: "progression",
          detail: "earned; skipped by rate pacer",
          status: "paced",
          governor: "rate_pacer",
        },
      ],
      outOfBand: true,
    });
    // delta + up to three why lines + out-of-band caveat, still bounded and
    // never contradicting the delta line ordered first
    expect(n.lines[0]).toContain("Versus last session");
    expect(n.lines.length).toBeLessThanOrEqual(5);
  });
});

describe("the copy system holds across every composed line (N63)", () => {
  const traces: AuditTraceStep[][] = [
    w2d4.trace,
    [{ rule: "progression", detail: "", status: "stepped" }],
    [{ rule: "progression", detail: "", status: "vanished" }],
    ...["compliance", "stale", "pain", "workload", "dampener", "confidence"].map(
      (predicate) => [
        { rule: "progression", detail: "", status: "not_earned", predicate },
      ],
    ),
    [{ rule: "feedback", detail: "joint pain 2/3: load increase blocked" }],
    [{ rule: "feedback", detail: "joint pain 2/3: set removed — consider substituting this exercise" }],
    [{ rule: "feedback", detail: "workload 9/10 past just right: set removed" }],
    [{ rule: "feedback", detail: "workload 3/10 easy with strong pump: set added" }],
    [{ rule: "feedback", detail: "joint pain 2/3: set addition vetoed" }],
    [{ rule: "feedback", detail: "rough session reported: increases dampened" }],
    [{ rule: "feedback", detail: "low pump at the right workload: consider a different exercise" }],
    [{ rule: "grade", detail: "harder than asked (~1 vs 2 RIR) — held, not a miss" }],
  ];

  const everyLine = (): string[] => {
    const lines: string[] = [];
    for (const trace of traces) {
      for (const isDeload of [false, true]) {
        for (const kind of ["advance", "seed"] as const) {
          for (const outOfBand of [false, true]) {
            lines.push(
              ...composePrescriptionNarrative({
                ...w2d4,
                trace,
                isDeload,
                kind,
                outOfBand,
                effortStatus: "observed",
              }).lines,
            );
          }
        }
      }
    }
    lines.push(
      ...composePrescriptionNarrative({ ...w2d4, weight: null, reps: null }).lines,
    );
    return lines;
  };

  it("never leaks engine vocabulary into a user-facing line", () => {
    // "engine" itself is checked per-composer above; these are the doc 19 §1
    // terms the v2 output leaked. The verbatim fallthrough is excluded by
    // construction — no fixture here relies on it.
    const banned =
      /\b(pacer|governor|earned|quantum|anchor|e1RM|trace|predicate|params|dose|prescribed gain)\b/i;
    for (const line of everyLine()) expect(line).not.toMatch(banned);
  });

  it("never uses hype, exclamation marks, or praise for compliance", () => {
    for (const line of everyLine()) {
      expect(line).not.toContain("!");
      expect(line).not.toMatch(/\b(great|awesome|nice work|crush|nailed|keep it up)\b/i);
    }
  });

  it("writes whole sentences that end in a period", () => {
    for (const line of everyLine()) expect(line.trim()).toMatch(/\.$/);
  });
});

describe("appendCoaching (doc 19 §3 — the v3 additive seam)", () => {
  const composed = composePrescriptionNarrative(w2d4);
  const coaching =
    "Grip slipping late has priced misses before — set it before the last rep.";

  it("appends the coaching line and leaves the why untouched", () => {
    const n = appendCoaching(composed, coaching, false);
    expect(n.ask).toBe(composed.ask);
    expect(n.lines).toEqual(composed.lines);
    expect(n.coach).toBe(coaching);
  });

  it("stands the deterministic layers alone when there is no coaching", () => {
    expect(appendCoaching(composed, null, false)).toBe(composed);
    expect(appendCoaching(composed, undefined, false)).toBe(composed);
    expect(appendCoaching(composed, "", false)).toBe(composed);
  });

  it("drops the coach line on an out-of-band row (the N33 S4 caveat wins)", () => {
    const outOfBand = composePrescriptionNarrative({ ...w2d4, outOfBand: true });
    const n = appendCoaching(outOfBand, coaching, true);
    expect(n).toBe(outOfBand);
    expect(n.coach).toBeNull();
    expect(n.lines.at(-1)).toContain("set by hand");
  });

  it("never appends coaching onto an unpriced row", () => {
    const cold = composePrescriptionNarrative({
      ...w2d4,
      weight: null,
      reps: null,
    });
    expect(appendCoaching(cold, coaching, false)).toBe(cold);
  });
});

// ---------------------------------------------------------------------------
// doc 21 Phase 6 — the authored effort level leads the why (§8)
// ---------------------------------------------------------------------------

const assigned = {
  rir: 4,
  assignedRir: 4,
  weekRir: 1,
  isDeload: false,
  setCap: null,
  repPosition: null,
  reason: "nerve flare — easing the lumbar load",
  backedOff: true,
  measuring: true,
};

describe("doc 21 §8 — an effort assignment leads the why", () => {
  it("puts the assignment and its reason above every engine-authored line", () => {
    const n = composePrescriptionNarrative({ ...w2d4, effort: assigned });
    expect(n.lines[0]).toMatch(/^This exercise is set to 4 reps short of failure/);
    expect(n.lines[1]).toBe("Noted: nerve flare — easing the lumbar load.");
    // the engine's own reasoning still renders — beneath it, never instead
    expect(n.lines.some((l) => /weight/i.test(l))).toBe(true);
  });

  it("does not credit the RIR move to the ramp when a person assigned it", () => {
    const delta = composeDelta({
      weight: 250,
      reps: 9,
      sets: 3,
      targetRir: 4,
      previous: { weight: 250, reps: 9, sets: 3, targetRir: 1 },
      effort: assigned,
    });
    expect(delta).not.toMatch(/easier effort target/);
    // without the assignment the same numbers DO read as the ramp easing
    expect(
      composeDelta({
        weight: 250,
        reps: 9,
        sets: 3,
        targetRir: 4,
        previous: { weight: 250, reps: 9, sets: 3, targetRir: 1 },
      }),
    ).toMatch(/easier effort target/);
  });

  it("drops the program-intent frame — the assignment is the frame now", () => {
    const framed = { ...w2d4, targetRir: 0, weekNumber: 4, mesoWeeks: 5 };
    expect(
      composePrescriptionNarrative(framed).lines.some((l) =>
        /peak week/i.test(l),
      ),
    ).toBe(true);
    expect(
      composePrescriptionNarrative({
        ...framed,
        effort: { ...assigned, assignedRir: 0, rir: 0, weekRir: 1, backedOff: false },
      }).lines.some((l) => /peak week/i.test(l)),
    ).toBe(false);
  });

  it("discloses an assignment on a DELOAD week instead of the deload boilerplate", () => {
    const deload = { ...w2d4, isDeload: true, targetRir: 3 };
    expect(composePrescriptionNarrative(deload).lines[0]).toMatch(/deload week/i);
    const overridden = composePrescriptionNarrative({
      ...deload,
      effort: {
        ...assigned,
        assignedRir: 3,
        rir: 3,
        weekRir: 6,
        isDeload: true,
        backedOff: false,
      },
    });
    expect(overridden.lines[0]).toMatch(/harder than the deload week's/);
    expect(overridden.lines.some((l) => /shed the block's fatigue/.test(l))).toBe(
      false,
    );
  });

  it("§9.4 — the ask states the band, not the number, past the measuring band", () => {
    const deep = {
      ...w2d4,
      weight: 171,
      targetRir: 21,
      effort: { ...assigned, assignedRir: 21, rir: 21, measuring: false },
    };
    const ask = composeAsk(deep)!;
    expect(ask).toBe("3 sets of 9 at 171 lb, each kept well short of failure.");
    expect(ask).not.toMatch(/21/);
  });

  it("an UNASSIGNED row is byte-identical to the pre-lever narrative", () => {
    const before = composePrescriptionNarrative(w2d4);
    expect(composePrescriptionNarrative({ ...w2d4, effort: null })).toEqual(before);
    expect(composePrescriptionNarrative({ ...w2d4, effort: undefined })).toEqual(
      before,
    );
  });
});

/**
 * N89 — the owner's field case, transcribed from the recorded decision
 * (Kneeling Hamstring Curl, W2·D4 of *August '26 - Bulk*, decision
 * 26755ebf…, params v27). The seed asked for 30 lb × 7; the lifter loaded 40
 * and did 8, 8, 8; the engine anchored on that 40 × 8 and prescribed 40 × 10.
 *
 * On screen, three surfaces then disagreed at once: the strip said "up 10 lb,
 * 3 more reps per set", the trace right below it said "hold 40 lb", and the
 * history sheet one tap away said 40 lb × 8, 8, 8. Two of the three were the
 * explanation layer reading the previous TARGET as if it were the previous
 * SESSION.
 */
describe("N89 — 'versus last session' means what was performed", () => {
  const hamstringCurl = {
    weight: 40,
    reps: 10,
    sets: 3,
    targetRir: 1,
    loadType: "external" as const,
    isDeload: false,
    kind: "advance" as const,
    trace: [
      {
        rule: "load",
        detail: "hold 40 lb, reps to 10 of 8–12 (anchor e1RM 54.6 lb)",
      },
      { rule: "grade", detail: "on target at ~2 RIR" },
      { rule: "rir", detail: "target RIR steps 2 to 1" },
      {
        rule: "progression",
        detail: "earned overload: targeting e1RM 54.6 (measured 53.3 + 1.3)",
        status: "stepped",
      },
    ],
    previous: { weight: 30, reps: 7, sets: 3, targetRir: 2 },
    performed: { weight: 40, reps: 8, sets: 3, uniformReps: true },
    outOfBand: false,
    decisionOutput: { weight: 40, reps: 10, sets: 3, targetRir: 1 },
    weekNumber: 2,
    mesoWeeks: 5,
  };

  it("reads the delta off the logged work, not the prescription it ignored", () => {
    expect(composeDelta(hamstringCurl)).toBe(
      "Versus last session: 2 more reps per set and 1 rep closer to failure.",
    );
  });

  it("no longer announces a weight rise the row itself denies", () => {
    const n = composePrescriptionNarrative(hamstringCurl);
    expect(n.ask).toBe(
      "3 sets of 10 at 40 lb, each stopped 1 rep short of failure.",
    );
    for (const line of n.lines) {
      expect(line).not.toContain("up 10 lb");
      expect(line).not.toContain("The weight goes up");
    }
    expect(n.lines).toContain(
      "You completed last session's target in full, so the session gets harder through reps and effort rather than more weight.",
    );
  });

  it("keeps the whole strip consistent with the trace's own load move", () => {
    // the invariant the bug broke: a trace that says `hold` may not be
    // narrated as a weight increase, in any line, ever.
    const held = composePrescriptionNarrative(hamstringCurl).lines.join(" ");
    expect(held).not.toMatch(/\bup \d+(\.\d+)? lb\b/);
    expect(held).not.toMatch(/weight goes up/);
    // and the mirror case still says so plainly when the weight really moves
    const rose = composePrescriptionNarrative({
      ...hamstringCurl,
      weight: 45,
      trace: hamstringCurl.trace.map((t) =>
        t.rule === "load"
          ? { ...t, detail: "+5 lb to 10 reps at 1 RIR (anchor e1RM 54.6 lb)" }
          : t,
      ),
    }).lines.join(" ");
    expect(rose).toContain("up 5 lb");
    expect(rose).toContain(
      "The weight goes up because you completed last session's target in full.",
    );
  });

  it("compares against work even when last session fell SHORT of its target", () => {
    // symmetric: prescribed 250 x 9, managed 250 x 7, asked for 250 x 9 again
    const shortfall = composeDelta({
      ...w2d4,
      targetRir: 3,
      previous: { weight: 250, reps: 9, sets: 3, targetRir: 3 },
      performed: { weight: 250, reps: 7, sets: 3, uniformReps: true },
    });
    expect(shortfall).toBe("Versus last session: 2 more reps per set.");
  });

  it("drops 'per set' when the session's sets were not all the same", () => {
    expect(
      composeDelta({
        ...hamstringCurl,
        performed: { weight: 40, reps: 8, sets: 3, uniformReps: false },
      }),
    ).toBe(
      "Versus last session: 2 more reps than your best set and 1 rep closer to failure.",
    );
  });

  it("still reads the set count and the effort target off the PROGRAM's axes", () => {
    // a set the lifter did not finish is not the program dropping one
    expect(
      composeDelta({
        ...hamstringCurl,
        reps: 8,
        targetRir: 2,
        performed: { weight: 40, reps: 8, sets: 2, uniformReps: true },
      }),
    ).toBe("The same work as last session, at the same effort target.");
  });

  it("falls back to the prescription for a decision with no logged actuals", () => {
    // what a decision written before actuals were captured looks like
    expect(composeDelta({ ...hamstringCurl, performed: null })).toBe(
      "Versus last session: up 10 lb, 3 more reps per set, and 1 rep closer to failure.",
    );
  });
});

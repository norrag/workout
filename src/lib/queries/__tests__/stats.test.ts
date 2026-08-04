/**
 * Pure-helper tests for the meso-stats screens (figs 4.1–4.3): the volume
 * matrix states, balance aggregation/copy, and PR detection. (The key-lift
 * grid was retired by N10.) Data assembly itself is covered by integration
 * smoke.
 */
import { describe, expect, it } from "vitest";
import {
  balanceCategory,
  buildBalance,
  buildPrs,
  buildVolumeMatrix,
  dropE1rmOutliers,
  foldProgressScores,
  volumeWeightedStrengthTotal,
  qualifyingScores,
  rollupMuscleProgress,
  strengthComparabilityNote,
  E1RM_OUTLIER_RATIO,
  MIN_PROGRESS_SESSIONS,
  type ExerciseProgressScore,
  type MesoStatsWeek,
} from "../stats";
import type { ProjectedCell } from "../volume-projection";
import { templateEmphasis } from "../templates";

const weeks: MesoStatsWeek[] = [
  { week_number: 1, is_deload: false, status: "completed" },
  { week_number: 2, is_deload: false, status: "active" },
  { week_number: 3, is_deload: false, status: "pending" },
  { week_number: 4, is_deload: true, status: "pending" },
];

function viewRow(
  week_number: number,
  muscle_group: string,
  planned_sets: number | null,
  logged_sets: number,
) {
  return { week_number, muscle_group, planned_sets, logged_sets };
}

describe("buildVolumeMatrix", () => {
  const rows = [
    viewRow(1, "quads", 6, 6),
    viewRow(2, "quads", 7, 3),
    viewRow(1, "back", 4, 4),
    viewRow(2, "back", 4, 0),
  ];
  // projection for the two ungenerated future weeks (W3 working, W4 deload).
  const cell = (
    week_number: number,
    muscle_group: string,
    projected_sets: number,
    is_deload = false,
  ): ProjectedCell => ({
    week_number,
    muscle_group,
    muscle_group_id: muscle_group,
    projected_sets,
    is_deload,
  });
  const projected: ProjectedCell[] = [
    cell(3, "quads", 7),
    cell(4, "quads", 4, true),
    cell(3, "back", 4),
    cell(4, "back", 2, true),
  ];

  it("shows logged for closed weeks, logged-so-far for the active week", () => {
    const volume = buildVolumeMatrix(weeks, rows, projected);
    const quads = volume.groups.find((g) => g.name === "quads")!;
    expect(quads.cells[0]).toEqual({ value: 6, kind: "logged" });
    expect(quads.cells[1]).toEqual({ value: 3, kind: "current" });
  });

  it("uses the engine projection for ungenerated future weeks", () => {
    const volume = buildVolumeMatrix(weeks, rows, projected);
    const quads = volume.groups.find((g) => g.name === "quads")!;
    expect(quads.cells[2]).toEqual({ value: 7, kind: "planned" });
  });

  it("projects ungenerated deload weeks (deload-scaled) rather than leaving them empty", () => {
    const volume = buildVolumeMatrix(weeks, rows, projected);
    const quads = volume.groups.find((g) => g.name === "quads")!;
    expect(quads.cells[3]).toEqual({ value: 4, kind: "planned" });
  });

  it("leaves a future week with no projection basis empty", () => {
    const volume = buildVolumeMatrix(weeks, rows, []);
    const quads = volume.groups.find((g) => g.name === "quads")!;
    expect(quads.cells[2]).toEqual({ value: null, kind: "empty" });
    expect(quads.cells[3]).toEqual({ value: null, kind: "empty" });
  });

  it("uses the materialized autoregulated plan when a future week is generated", () => {
    const volume = buildVolumeMatrix(
      weeks,
      [...rows, viewRow(3, "quads", 8, 0)],
      projected,
    );
    const quads = volume.groups.find((g) => g.name === "quads")!;
    // a real generated row wins over the projection
    expect(quads.cells[2]).toEqual({ value: 8, kind: "planned" });
  });

  it("totals per week and reports the current-week footer", () => {
    const volume = buildVolumeMatrix(weeks, rows, projected);
    expect(volume.totals[0].value).toBe(10);
    expect(volume.currentLogged).toBe(3);
    expect(volume.currentPlanned).toBe(11);
  });
});

describe("buildBalance", () => {
  it("classifies the seeded vocabulary", () => {
    expect(balanceCategory("chest")).toBe("push");
    expect(balanceCategory("back")).toBe("pull");
    expect(balanceCategory("glutes")).toBe("legs");
    expect(balanceCategory("abs")).toBeNull();
  });

  it("averages non-deload weeks into cards and bars, and writes the note", () => {
    const rows = [
      viewRow(1, "chest", 10, 10),
      viewRow(2, "chest", 12, 5),
      viewRow(1, "back", 8, 8),
      viewRow(2, "back", 8, 2),
      viewRow(1, "quads", 4, 4),
      viewRow(2, "quads", 4, 1),
    ];
    const volume = buildVolumeMatrix(weeks, rows, []);
    const balance = buildBalance(volume, weeks);
    // chest avg over W1 logged 10, W2 logged 5, W3 — no projection → 2 weeks.
    // R14: fractional counting keeps 1 dp — (10+5)/2 = 7.5, no integer rounding
    expect(balance.push).toBe(7.5);
    expect(balance.pull).toBe(5);
    expect(balance.legs).toBe(2.5);
    expect(balance.note).toContain("Push : pull is 1.5 : 1");
    expect(balance.note).toContain("Quads");
  });
});

describe("buildPrs", () => {
  const mesoBest = [
    { exercise_id: "hack", name: "Hack Squat", weight: 250, reps: 8, coordinate: "W2·D1", e1rm: 316.7 },
    { exercise_id: "curl", name: "Lying Leg Curl", weight: 120, reps: 10, coordinate: "W2·D1", e1rm: 160 },
    { exercise_id: "press", name: "Incline DB Press", weight: 80, reps: 9, coordinate: "W1·D2", e1rm: 104 },
  ];

  it("labels heavier top weight ALL-TIME and better e1RM at old weight REP PR", () => {
    const prs = buildPrs(
      mesoBest,
      new Map([
        ["hack", { weight: 245, e1rm: 310 }],
        ["curl", { weight: 120, e1rm: 150 }],
        ["press", { weight: 85, e1rm: 110 }],
      ]),
    );
    expect(prs).toEqual([
      { label: "Hack Squat — 250 × 8", coordinate: "W2·D1", kind: "ALL-TIME" },
      { label: "Lying Leg Curl — 120 × 10", coordinate: "W2·D1", kind: "REP PR" },
    ]);
  });

  it("never PRs a lift without prior history", () => {
    expect(buildPrs(mesoBest, new Map())).toEqual([]);
  });
});

describe("templateEmphasis", () => {
  it("classifies saved templates within the schema vocabulary", () => {
    expect(templateEmphasis(["chest", "quads"])).toBe("full_body");
    expect(templateEmphasis(["chest", "back", "biceps"])).toBe("upper");
    expect(templateEmphasis(["quads", "glutes"])).toBe("lower");
    expect(templateEmphasis(["abs"])).toBe("other");
  });
});

// --- I11/PH37: progress-score fold, qualifying rule, muscle rollup ----------

function historyRow(
  exercise_id: string,
  microcycle_id: string,
  e1rm: number | null,
  backed_off = false,
) {
  return {
    exercise_id,
    exercise_name: exercise_id.toUpperCase(),
    microcycle_id,
    e1rm,
    backed_off,
  };
}

describe("foldProgressScores", () => {
  it("scores recent-best vs baseline-best and excludes deloads from the count", () => {
    const scores = foldProgressScores(
      [
        historyRow("bench", "w1", 200),
        historyRow("bench", "w2", 205),
        historyRow("bench", "w3", 210),
        historyRow("bench", "dl", 180), // deload — excluded from trend AND count
      ],
      new Set(["dl"]),
    );
    // n=3 ⇒ k=1: baseline = first session, current = last session
    expect(scores).toEqual([
      {
        exercise_id: "bench",
        exercise_name: "BENCH",
        baseline_e1rm: 200,
        current_e1rm: 210,
        score_pct: 5,
        sessions: 3,
        trend: "improving",
        backed_off_sessions: 0,
      },
    ]);
  });

  it("skips sessions without an e1RM (bodyweight) entirely", () => {
    const scores = foldProgressScores(
      [
        historyRow("row", "w0", null),
        historyRow("row", "w1", 100),
        historyRow("row", "w2", 105),
        historyRow("row", "w3", 110),
      ],
      new Set(),
    );
    // the null session is dropped: 3 real points remain
    expect(scores[0]).toMatchObject({ baseline_e1rm: 100, sessions: 3 });
  });

  it("N14: a mis-logged endpoint session cannot define the denominator", () => {
    // the field case: one 7-lb "session" on a ~200-lb lift made the rollup
    // read a massive gain; the outlier drop removes it before scoring
    const scores = foldProgressScores(
      [
        historyRow("hack", "w1", 7),
        historyRow("hack", "w2", 200),
        historyRow("hack", "w3", 205),
        historyRow("hack", "w4", 210),
      ],
      new Set(),
    );
    // [200,205,210] survive ⇒ n=3, k=1: baseline 200 → current 210
    expect(scores[0]).toMatchObject({
      baseline_e1rm: 200,
      current_e1rm: 210,
      score_pct: 5,
      sessions: 3,
      trend: "improving",
    });
  });

  it("a fresh block's light opener does not crater a continuing lift", () => {
    // the reported bug: an old block ends near peak (250), then a new block
    // opens light + high-RIR (210, 215). A first→last fold reads the opener as
    // the endpoint and craters the number. Recent-best over the last window
    // still catches the old block's strong final session, so it HOLDS.
    const scores = foldProgressScores(
      [
        historyRow("squat", "w1", 230),
        historyRow("squat", "w2", 240),
        historyRow("squat", "w3", 250),
        historyRow("squat", "w4", 250), // end of the old block (near peak)
        historyRow("squat", "w5", 210), // new meso opener (light, high RIR)
        historyRow("squat", "w6", 215),
      ],
      new Set(),
    );
    // n=6 ⇒ k=3: baseline = max(230,240,250)=250, current = max(250,210,215)=250
    expect(scores[0]).toMatchObject({
      baseline_e1rm: 250,
      current_e1rm: 250,
      score_pct: 0,
      trend: "holding",
    });
  });
});

describe("dropE1rmOutliers (N14)", () => {
  it("drops sessions beyond the ratio band around the window median", () => {
    expect(dropE1rmOutliers([7, 200, 205, 210, 900])).toEqual([200, 205, 210]);
  });

  it("keeps a genuine beginner run that doubles within the window", () => {
    const run = [100, 120, 150, 180, 200];
    expect(dropE1rmOutliers(run)).toEqual(run);
  });

  it("keeps everything below 3 sessions — no median worth trusting", () => {
    expect(dropE1rmOutliers([7, 200])).toEqual([7, 200]);
  });

  it("band is symmetric at the documented ratio", () => {
    const median = 100;
    const values = [
      median / E1RM_OUTLIER_RATIO,
      median,
      median * E1RM_OUTLIER_RATIO,
    ];
    expect(dropE1rmOutliers(values)).toEqual(values);
  });
});

describe("volumeWeightedStrengthTotal (N16 — the macro EST. STRENGTH tile)", () => {
  const muscle = (
    muscle_group: string,
    score_pct: number | null,
  ): Parameters<typeof volumeWeightedStrengthTotal>[0][number] => ({
    muscle_group,
    score_pct,
    lifts: 1,
    contributors: [],
  });

  it("weights each muscle by its fractional set volume over the scope", () => {
    // legs (+3% over 40 sets) should dominate traps (+15% over 4 sets)
    const total = volumeWeightedStrengthTotal(
      [muscle("legs", 3), muscle("traps", 15)],
      new Map([
        ["legs", 40],
        ["traps", 4],
      ]),
    );
    // (3·40 + 15·4) / 44 = 4.09 → 4.1
    expect(total).toBeCloseTo(4.1, 1);
  });

  it("skips muscles with no score or no volume", () => {
    expect(
      volumeWeightedStrengthTotal(
        [muscle("legs", 5), muscle("back", null)],
        new Map([
          ["legs", 20],
          ["back", 10],
        ]),
      ),
    ).toBe(5);
  });

  it("returns null when nothing qualifies", () => {
    expect(volumeWeightedStrengthTotal([muscle("legs", null)], new Map())).toBeNull();
  });

  it("N16 regression: a deload tail is excluded from the fold (T-A2)", () => {
    // the -36.3% case: deload sessions never reach the scores — the tile reads
    // the same qualified scores the Performance tab renders, so both agree.
    const scores = foldProgressScores(
      [
        historyRow("squat", "w1", 300),
        historyRow("squat", "w2", 310),
        historyRow("squat", "w3", 315),
        historyRow("squat", "dl", 190), // final week is a deload
      ],
      new Set(["dl"]),
    );
    expect(scores[0].score_pct).toBe(5);
    expect(scores[0].trend).toBe("improving");
  });
});

describe("qualifyingScores (I11 — logged ≥3× in the window)", () => {
  const score = (
    id: string,
    sessions: number,
    score_pct: number | null = 4,
  ): ExerciseProgressScore => ({
    exercise_id: id,
    exercise_name: id,
    baseline_e1rm: 100,
    current_e1rm: 104,
    score_pct,
    sessions,
    trend: "improving",
    backed_off_sessions: 0,
  });

  it("keeps only exercises with enough sessions and a computable score", () => {
    const out = qualifyingScores([
      score("consistent", MIN_PROGRESS_SESSIONS),
      score("subbed-in", 1),
      score("two-timer", 2),
      score("no-score", 5, null),
    ]);
    expect(out.map((s) => s.exercise_id)).toEqual(["consistent"]);
  });
});

describe("rollupMuscleProgress (PH37)", () => {
  const W = { direct: 1.0, indirect: 0.5 };
  const scores: ExerciseProgressScore[] = [
    {
      exercise_id: "bench",
      exercise_name: "Bench",
      baseline_e1rm: 200,
      current_e1rm: 220,
      score_pct: 10,
      sessions: 4,
      trend: "improving",
      backed_off_sessions: 0,
    },
    {
      exercise_id: "fly",
      exercise_name: "Fly",
      baseline_e1rm: 60,
      current_e1rm: 62,
      score_pct: 4,
      sessions: 3,
      trend: "improving",
      backed_off_sessions: 0,
    },
  ];

  it("role-weights each exercise's %-change into its muscle groups", () => {
    const out = rollupMuscleProgress(
      scores,
      [
        { exercise_id: "bench", muscle_group: "chest", role: "primary" },
        { exercise_id: "bench", muscle_group: "triceps", role: "secondary" },
        { exercise_id: "fly", muscle_group: "chest", role: "primary" },
      ],
      W,
    );
    // chest: (10×1.0 + 4×1.0) / 2.0 = 7; triceps: only bench's secondary = 10
    expect(out).toEqual([
      {
        muscle_group: "triceps",
        score_pct: 10,
        lifts: 1,
        contributors: [{ ...scores[0], role: "secondary" }],
      },
      {
        muscle_group: "chest",
        score_pct: 7,
        lifts: 2,
        // N9 drill-down: every rolled-in exercise is carried, best score first
        contributors: [
          { ...scores[0], role: "primary" },
          { ...scores[1], role: "primary" },
        ],
      },
    ]);
  });

  it("ignores links to exercises without a score and unknown exercises", () => {
    const out = rollupMuscleProgress(
      scores,
      [
        { exercise_id: "ghost", muscle_group: "back", role: "primary" },
        { exercise_id: "bench", muscle_group: "chest", role: "primary" },
      ],
      W,
    );
    expect(out).toEqual([
      {
        muscle_group: "chest",
        score_pct: 10,
        lifts: 1,
        contributors: [{ ...scores[0], role: "primary" }],
      },
    ]);
  });
});

describe("buildBalance scope wording (M8)", () => {
  const rows = [viewRow(1, "chest", 10, 10), viewRow(1, "back", 8, 8)];
  it("names the window in the note", () => {
    const volume = buildVolumeMatrix(weeks, rows, []);
    expect(buildBalance(volume, weeks).note).toContain("this meso");
    expect(
      buildBalance(volume, weeks, "across this macrocycle").note,
    ).toContain("across this macrocycle");
  });
});

// ---------------------------------------------------------------------------
// doc 21 §6.2 (Phase 5) — intent-keyed exclusion from the strength surfaces
// ---------------------------------------------------------------------------

describe("foldProgressScores — backed-off sessions (§6.2)", () => {
  it("excludes a backed-off session from the trend AND the count, exactly like a deload", () => {
    const backedOff = foldProgressScores(
      [
        historyRow("bench", "w1", 200),
        historyRow("bench", "w2", 205),
        historyRow("bench", "w3", 210),
        historyRow("bench", "w4", 150, true), // rehab week — priced ~25% lighter
      ],
      new Set(),
    );
    const deloaded = foldProgressScores(
      [
        historyRow("bench", "w1", 200),
        historyRow("bench", "w2", 205),
        historyRow("bench", "w3", 210),
        historyRow("bench", "dl", 150),
      ],
      new Set(["dl"]),
    );
    // the two exclusions produce the same trend — that parity IS the policy
    expect(backedOff[0]).toMatchObject({
      baseline_e1rm: deloaded[0].baseline_e1rm,
      current_e1rm: deloaded[0].current_e1rm,
      score_pct: deloaded[0].score_pct,
      sessions: 3,
    });
    // …and the back-off is counted rather than silently dropped
    expect(backedOff[0].backed_off_sessions).toBe(1);
    expect(deloaded[0].backed_off_sessions).toBe(0);
  });

  it("without the exclusion a rehab block reads as a collapse; with it, the trend holds", () => {
    // the failure this policy exists to prevent: three weeks of prescribed
    // back-off fill the recent window, so the rolling best drops with it and
    // complying with the plan looks exactly like regression
    const rows = [200, 205, 210].map((v, i) => historyRow("bench", `w${i + 1}`, v));
    const rehab = [150, 148, 152].map((v, i) =>
      historyRow("bench", `w${i + 4}`, v, true),
    );
    const asIfCounted = foldProgressScores(
      [...rows, ...rehab.map((r) => ({ ...r, backed_off: false }))],
      new Set(),
    );
    expect(asIfCounted[0].score_pct).toBeLessThan(0);

    const scored = foldProgressScores([...rows, ...rehab], new Set());
    expect(scored[0].score_pct).toBe(5);
    expect(scored[0].backed_off_sessions).toBe(3);
  });

  it("keeps an exercise trained ONLY in backed-off sessions visible, with no trend", () => {
    // it has no comparable points, so it cannot score — but the surface must
    // still be able to say why it is missing, which needs the entry to exist
    const scores = foldProgressScores(
      [
        historyRow("rehab-row", "w1", 90, true),
        historyRow("rehab-row", "w2", 92, true),
      ],
      new Set(),
    );
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({
      sessions: 0,
      score_pct: null,
      backed_off_sessions: 2,
    });
    // …and it still fails the I11 display rule, so no trend is ever shown
    expect(qualifyingScores(scores)).toEqual([]);
  });
});

describe("strengthComparabilityNote (§6.2)", () => {
  const score = (
    id: string,
    backed_off_sessions: number,
  ): ExerciseProgressScore => ({
    exercise_id: id,
    exercise_name: id,
    baseline_e1rm: 100,
    current_e1rm: 104,
    score_pct: 4,
    sessions: 3,
    trend: "improving",
    backed_off_sessions,
  });

  it("is null when nothing was set aside — the pre-doc-21 state", () => {
    expect(strengthComparabilityNote([score("bench", 0)])).toBeNull();
    expect(strengthComparabilityNote([])).toBeNull();
  });

  it("names the single lift and reads as one session", () => {
    const note = strengthComparabilityNote([score("Bench Press", 1)])!;
    expect(note).toContain("1 session");
    expect(note).toContain("Bench Press");
    expect(note).toContain("still count toward volume");
  });

  it("counts sessions across lifts and stops naming them past one", () => {
    const note = strengthComparabilityNote([
      score("Bench Press", 2),
      score("Incline Press", 1),
      score("Row", 0),
    ])!;
    expect(note).toContain("3 sessions");
    expect(note).toContain("2 exercises");
  });
});

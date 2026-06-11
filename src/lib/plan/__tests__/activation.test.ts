import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine";
import { addDays, buildActivationPlan } from "../activation";

const params = DEFAULT_ENGINE_PARAMS;

const meso = {
  weeks: 5,
  days_per_week: 2,
  includes_deload: true,
  rir_start: 3,
  rir_end: 0,
};

const planItems = [
  {
    exercise_id: "ex-squat",
    day_of_week: 1,
    position: 2,
    initial_weight: 101, // off-step on purpose: must round to 100 (barbell 2.5kg step)
    initial_reps: 8,
    initial_sets: 3,
  },
  {
    exercise_id: "ex-curl",
    day_of_week: 1,
    position: 1,
    initial_weight: null,
    initial_reps: 12,
    initial_sets: 3,
  },
  {
    exercise_id: "ex-row",
    day_of_week: 2,
    position: 1,
    initial_weight: 60,
    initial_reps: 10,
    initial_sets: 4,
  },
];

const equipment = {
  "ex-squat": "barbell",
  "ex-curl": "dumbbell",
  "ex-row": "machine",
} as const;

const user = { units: "kg", experienceLevel: "intermediate" } as const;

describe("buildActivationPlan", () => {
  const plan = buildActivationPlan(
    meso,
    planItems,
    equipment,
    user,
    params,
    "2026-06-15",
  );

  it("generates one microcycle per week with the RIR ramp", () => {
    expect(plan.microcycles.map((m) => m.target_rir)).toEqual([
      3,
      2,
      1,
      0,
      params.deload.target_rir,
    ]);
    expect(plan.microcycles.map((m) => m.is_deload)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("marks only week 1 active and staggers start dates by 7 days", () => {
    expect(plan.microcycles[0].status).toBe("active");
    expect(plan.microcycles.slice(1).every((m) => m.status === "pending")).toBe(
      true,
    );
    expect(plan.microcycles.map((m) => m.start_date)).toEqual([
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
    ]);
  });

  it("creates a week-1 workout per planned day with slots in position order", () => {
    expect(plan.week1Workouts.map((w) => w.day_number)).toEqual([1, 2]);
    expect(plan.week1Workouts[0].exercises.map((e) => e.exercise_id)).toEqual([
      "ex-curl",
      "ex-squat",
    ]);
  });

  it("seeds week-1 prescriptions from plan initials at the start RIR", () => {
    const squat = plan.week1Workouts[0].exercises[1].prescription;
    expect(squat).toMatchObject({ weight: 100, reps: 8, sets: 3, targetRir: 3 });
    const curl = plan.week1Workouts[0].exercises[0].prescription;
    expect(curl.weight).toBeNull();
    expect(curl.reps).toBe(12);
  });

  it("throws when an exercise has no equipment mapping", () => {
    expect(() =>
      buildActivationPlan(meso, planItems, {}, user, params, "2026-06-15"),
    ).toThrow(/equipment/);
  });
});

describe("addDays", () => {
  it("crosses month boundaries", () => {
    expect(addDays("2026-06-29", 7)).toBe("2026-07-06");
  });
  it("rejects junk", () => {
    expect(() => addDays("not-a-date", 7)).toThrow();
  });
});

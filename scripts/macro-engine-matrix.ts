/**
 * Exploration harness (not shipped): prints planMacrocycle outputs across a
 * matrix of profiles, goals, and durations so the engine's realistic-target
 * model can be reviewed/tuned. Run: `npx tsx scripts/macro-engine-matrix.ts`.
 */
import {
  DEFAULT_ENGINE_PARAMS,
  planMacrocycle,
  suggestMesoLength,
  type MacroGoal,
  type MacroProfile,
  type MacroRange,
} from "../src/lib/engine";

const P = DEFAULT_ENGINE_PARAMS;

function range(r: MacroRange): string {
  const u = r.unit === "%" ? "%" : ` ${r.unit}`;
  const s = r.direction === "loss" ? "-" : "+";
  if (r.direction === "none") return "—";
  const body = r.low === r.high ? `${r.low}${u}` : `${r.low}–${r.high}${u}`;
  return `${s}${body}`;
}

const profiles: { name: string; p: MacroProfile }[] = [
  {
    name: "Beginner M 180lb, 25yo, 0.5yr",
    p: { sex: "male", age: 25, bodyweight: 180, bodyweightUnit: "lb", heightCm: 178, experienceLevel: "beginner", trainingYears: 0.5, bodyFatPct: null },
  },
  {
    name: "Intermediate M 198lb, 34yo, 2.5yr",
    p: { sex: "male", age: 34, bodyweight: 198, bodyweightUnit: "lb", heightCm: 180, experienceLevel: "intermediate", trainingYears: 2.5, bodyFatPct: null },
  },
  {
    name: "Intermediate M 198lb, 34yo, 4yr (mockup)",
    p: { sex: "male", age: 34, bodyweight: 198, bodyweightUnit: "lb", heightCm: 180, experienceLevel: "intermediate", trainingYears: 4, bodyFatPct: null },
  },
  {
    name: "Advanced M 200lb, 30yo, 7yr",
    p: { sex: "male", age: 30, bodyweight: 200, bodyweightUnit: "lb", heightCm: 180, experienceLevel: "advanced", trainingYears: 7, bodyFatPct: null },
  },
  {
    name: "Elite M 198lb, 40yo, 13yr (user)",
    p: { sex: "male", age: 40, bodyweight: 198, bodyweightUnit: "lb", heightCm: 180, experienceLevel: "intermediate", trainingYears: 13, bodyFatPct: null },
  },
  {
    name: "Intermediate F 140lb, 30yo, 3yr",
    p: { sex: "female", age: 30, bodyweight: 140, bodyweightUnit: "lb", heightCm: 165, experienceLevel: "intermediate", trainingYears: 3, bodyFatPct: null },
  },
  {
    name: "Older M 210lb, 55yo, 6yr",
    p: { sex: "male", age: 55, bodyweight: 210, bodyweightUnit: "lb", heightCm: 178, experienceLevel: "advanced", trainingYears: 6, bodyFatPct: null },
  },
];

const goals: MacroGoal[] = ["hypertrophy", "strength", "cut", "maintain"];
const durations = [3, 6, 12];

for (const { name, p } of profiles) {
  console.log("\n=== " + name + " ===");
  for (const goal of goals) {
    const cells = durations.map((d) => {
      const plan = planMacrocycle(
        { goal, profile: p, durationMonths: d, mesoLengthWeeks: suggestMesoLength(d) },
        P,
      );
      return `${d}mo: ${range(plan.target)} (${range(plan.perMonthRate)}/mo, ${plan.mesoCount}×${suggestMesoLength(d)}wk)`;
    });
    const rec = planMacrocycle({ goal, profile: p, durationMonths: null }, P).recommendedDurationMonths;
    console.log(`  ${goal.padEnd(11)} rec ${rec}mo | ${cells.join("  |  ")}`);
  }
}

console.log("\n=== suggestMesoLength(months) ===");
for (const m of [2, 3, 4, 5, 6, 8, 9, 12]) {
  console.log(`  ${m}mo (${(m * 4.33).toFixed(1)}wk) → ${suggestMesoLength(m)}wk`);
}

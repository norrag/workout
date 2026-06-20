import type { MacroGoalType } from "@/lib/types/database";

/** The progression-engine goal vocabulary (a subset/mapping of the macro goal). */
export type EngineGoal = "cut" | "strength" | "hypertrophy" | "maintain";

/**
 * Map the macrocycle goal onto a progression-engine goal. Strength and
 * hypertrophy are kept distinct (doc 13 §9.1) so the engine can pick a rep
 * window per goal; both still drive progressive overload, cut/maintain pass
 * through. Standalone mesos (no macro goal) default to the hypertrophy window.
 *
 * Lives in its own leaf module so the freshness check (regeneration.ts), the
 * generation/seed writers (generation.ts), and the advance path (progression.ts)
 * all resolve `goalType` identically — the value feeds the dependency fingerprint
 * (doc 14 §3), so it MUST be derived the same way at write and at check.
 */
export function engineGoal(macroGoal: MacroGoalType | null): EngineGoal {
  switch (macroGoal) {
    case "cut":
      return "cut";
    case "maintain":
      return "maintain";
    case "strength":
      return "strength";
    case "hypertrophy":
    default:
      return "hypertrophy";
  }
}

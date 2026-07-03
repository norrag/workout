/**
 * Plan-time weekly-set fold (I12) — pure aggregation of a planner board into
 * fractional weekly working sets per muscle group. Relocated from
 * `mcp/tools/authoring.ts` so the in-app planner board and the MCP
 * `preview_mesocycle_volume` tool share ONE counting definition (root
 * CLAUDE.md convention), the same 1.0/0.5 weights as the stats views (R14).
 *
 * CLIENT-SAFE by design: type-only engine imports, no zod — the planner board
 * runs this per keystroke and must not pull the params schema into its chunk
 * (the PR #93 bundle discipline). The landmark zoning over these numbers
 * (`previewVolume`) lives with its server-side callers.
 */
import type { VolumeCountingWeights } from "@/lib/engine/volume";

export interface GroupSets {
  muscle_group: string;
  sets: number;
}

/**
 * Aggregate a plan's slots into fractional weekly working sets per muscle
 * group (doc 10 §2, R14): when a slot's exercise roles are known, its
 * `initial_sets` credit 1.0 to each primary and 0.5 to each secondary muscle
 * (weights from `engine_params.volume`); slots without roles (proposed `days`
 * specs with no exercise ids, or unlinked exercises) credit the block's group
 * at the direct weight — matching the weekly-volume view's fallback. Pure.
 */
export function weeklySetsByGroup(
  days: {
    groups: {
      muscle_group: string;
      fills: { initial_sets: number | null; exercise_id?: string | null }[];
    }[];
  }[],
  rolesByExercise: Map<
    string,
    { name: string; role: "primary" | "secondary" }[]
  > = new Map(),
  weights: VolumeCountingWeights = { direct: 1.0, indirect: 0.5 },
): GroupSets[] {
  const byGroup = new Map<string, number>();
  const credit = (group: string, amount: number) =>
    byGroup.set(
      group,
      Math.round(((byGroup.get(group) ?? 0) + amount) * 100) / 100,
    );
  for (const day of days)
    for (const g of day.groups)
      for (const f of g.fills) {
        const sets = f.initial_sets ?? 0;
        const roles = f.exercise_id
          ? rolesByExercise.get(f.exercise_id)
          : undefined;
        if (roles && roles.length > 0) {
          for (const r of roles)
            credit(
              r.name,
              sets * (r.role === "primary" ? weights.direct : weights.indirect),
            );
        } else {
          credit(g.muscle_group, sets * weights.direct);
        }
      }
  return [...byGroup.entries()]
    .map(([muscle_group, sets]) => ({ muscle_group, sets }))
    .sort((a, b) => b.sets - a.sets);
}

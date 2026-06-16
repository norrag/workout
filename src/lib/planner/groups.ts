// Planner helpers for the day-setup "Add groups" picker (fig 2.6b) and the
// group-centric "Pick exercise" multi-select (fig 2.7). Pure + testable: no IO.

export type MuscleRegion = "LEGS" | "PUSH" | "PULL" | "CORE" | "OTHER";

/** Region a muscle group renders under in the 2.6b picker. By name (the DB has
 *  no region column); unknown names fall to OTHER so nothing is ever dropped. */
const REGION_BY_NAME: Record<string, MuscleRegion> = {
  quads: "LEGS",
  hamstrings: "LEGS",
  glutes: "LEGS",
  calves: "LEGS",
  chest: "PUSH",
  shoulders: "PUSH",
  triceps: "PUSH",
  back: "PULL",
  biceps: "PULL",
  forearms: "PULL",
  traps: "PULL",
  abs: "CORE",
};

export const REGION_ORDER: MuscleRegion[] = [
  "LEGS",
  "PUSH",
  "PULL",
  "CORE",
  "OTHER",
];

export function regionForMuscle(name: string): MuscleRegion {
  return REGION_BY_NAME[name.toLowerCase()] ?? "OTHER";
}

export interface RegionedGroup {
  id: string;
  name: string;
  region: MuscleRegion;
}

export interface RegionSection {
  region: MuscleRegion;
  groups: RegionedGroup[];
}

/** Group muscle groups into the canonical regions, in REGION_ORDER, each
 *  section alphabetised. Empty regions are omitted. */
export function groupByRegion(
  muscleGroups: { id: string; name: string }[],
): RegionSection[] {
  const byRegion = new Map<MuscleRegion, RegionedGroup[]>();
  for (const mg of muscleGroups) {
    const region = regionForMuscle(mg.name);
    const arr = byRegion.get(region) ?? [];
    arr.push({ id: mg.id, name: mg.name, region });
    byRegion.set(region, arr);
  }
  return REGION_ORDER.filter((r) => byRegion.has(r)).map((region) => ({
    region,
    groups: (byRegion.get(region) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }));
}

export interface GroupFillPlan {
  slot_number: number;
  exercise_id: string;
  initial_sets: number;
}

/**
 * Lay out a muscle-group's exercise slots from a multi-select (fig 2.7).
 * Selected exercises become consecutive slots (1..n) in the given order;
 * an exercise already in the group keeps its `initial_sets`, a newly added
 * one gets `defaultSets`. Duplicates are dropped.
 */
export function planGroupExercises(
  current: { exercise_id: string; initial_sets: number }[],
  selectedIds: string[],
  defaultSets: number,
): GroupFillPlan[] {
  const setsByExercise = new Map(
    current.map((c) => [c.exercise_id, c.initial_sets]),
  );
  const seen = new Set<string>();
  const out: GroupFillPlan[] = [];
  for (const id of selectedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      slot_number: out.length + 1,
      exercise_id: id,
      initial_sets: setsByExercise.get(id) ?? defaultSets,
    });
  }
  return out;
}

/**
 * Move the item identified by `id` by `delta` positions (−1 up / +1 down)
 * within an ordered list of ids, returning the new id order. A move that would
 * fall off either end is a no-op (returns the original order). Pure: drives
 * both the staged (local) and live (server) reorder paths for muscle groups
 * within a day and exercises within a group.
 */
export function moveInOrder(
  ids: string[],
  id: string,
  delta: number,
): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const to = from + delta;
  if (to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}


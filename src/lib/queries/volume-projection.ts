import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, VMesoWeekMuscleSetsRow } from "@/lib/types/database";
import {
  fractionalSetCount,
  volumeCountingWeights,
  type VolumeCountingWeights,
} from "@/lib/engine";
import { getActiveEngineParams } from "./generation";

type Client = SupabaseClient<Database>;

/**
 * Weighted weekly set numbers per (week × muscle group) — the shape every
 * volume surface consumes. Produced from the role-grain
 * `v_meso_week_muscle_sets` facts by `weightWeekMuscleSets` (R14, doc 10 §2):
 * planned/logged counts credit 1.0 per primary + 0.5 per secondary muscle
 * link (weights from `engine_params.volume.direct/indirect`), and the logged
 * side counts *hard* sets only (non-warmup, rir ≤ 4 or unreported — baked in
 * the view). Field names/types deliberately mirror the legacy
 * `v_meso_week_sets` row so the matrix/projection pipeline is unchanged.
 */
export interface WeightedWeekSets {
  week_number: number;
  is_deload: boolean;
  muscle_group_id: string | null;
  muscle_group: string | null;
  planned_sets: number | null;
  logged_sets: number;
}

/**
 * Fold role-grain view rows into fractional per-(week, muscle) numbers.
 * Pure: one definition of weekly volume shared by the stats matrix/balance,
 * the MCP volume + balance tools, and the set projection.
 */
export function weightWeekMuscleSets(
  rows: VMesoWeekMuscleSetsRow[],
  weights: VolumeCountingWeights,
): WeightedWeekSets[] {
  const byCell = new Map<string, { row: WeightedWeekSets; planned: { role: VMesoWeekMuscleSetsRow["role"]; sets: number }[]; logged: { role: VMesoWeekMuscleSetsRow["role"]; sets: number }[] }>();
  for (const r of rows) {
    const key = `${r.week_number}:${r.muscle_group_id ?? r.muscle_group ?? "unassigned"}`;
    let cell = byCell.get(key);
    if (!cell) {
      cell = {
        row: {
          week_number: r.week_number,
          is_deload: r.is_deload,
          muscle_group_id: r.muscle_group_id,
          muscle_group: r.muscle_group,
          planned_sets: null,
          logged_sets: 0,
        },
        planned: [],
        logged: [],
      };
      byCell.set(key, cell);
    }
    if (r.planned_sets != null)
      cell.planned.push({ role: r.role, sets: r.planned_sets });
    cell.logged.push({ role: r.role, sets: r.logged_hard_sets });
  }
  return [...byCell.values()].map((cell) => ({
    ...cell.row,
    planned_sets:
      cell.planned.length > 0
        ? fractionalSetCount(cell.planned, weights)
        : null,
    logged_sets: fractionalSetCount(cell.logged, weights),
  }));
}

/**
 * Projected planned sets for an unmaterialized meso week × muscle group (PH34).
 *
 * Future weeks are materialized lazily — `workout_exercises` rows are only
 * created once the prior week's same day is completed — so the weekly-set view
 * has no rows for them and the meso-stats "planned" figure used to fall back to
 * the static planner baseline (UI) or `null` (MCP), which disagree and ignore
 * autoregulation. The owner's ruling (2026-06-30) is to show the engine's own
 * projection instead.
 *
 * The engine's set-count model is single-step: each week carries the prior
 * week's `prescribed_sets` forward, nudged ±1 by *that week's* feedback
 * (`modulateFromFeedback`) and scaled on deload weeks (`deload.set_pct`). An
 * unmaterialized week has no feedback, so its nudge is 0 by construction — the
 * faithful projection is the most-recent materialized week's count carried
 * forward, deload-scaled. (There is no forward MEV→MAV→MRV ramp to project; that
 * model is unbuilt — backlog T-A5. So the projection is flat across accumulation
 * weeks, which is honest, not a climbing plan.)
 */
export interface ProjectedCell {
  week_number: number;
  muscle_group_id: string | null;
  muscle_group: string;
  projected_sets: number;
  is_deload: boolean;
}

export interface BaselineSeed {
  muscle_group: string;
  muscle_group_id: string | null;
  /** planner-board fractional weekly sets for the group (weighted `initial_sets`). */
  sets: number;
}

/**
 * Pure projection: carry each muscle group's last *known* weekly set count
 * forward across the meso's unmaterialized weeks, scaling deload weeks the same
 * way the engine does (`max(min_sets, round(sets × deload.set_pct))`). The base
 * is the group's `planned_sets` at its most recent materialized week (which
 * already baked in its own feedback), falling back to the planner baseline when
 * a group has never materialized. Mirrors `prescribe()`'s set logic
 * (`engine/index.ts` carry-forward + `rules/deload.ts`) under neutral feedback.
 * Counts are fractional since R14 — deload scaling rounds to 1 dp so half-set
 * credits survive the scale.
 */
export function projectWeekSets(args: {
  weeks: { week_number: number; is_deload: boolean }[];
  viewRows: Pick<
    WeightedWeekSets,
    "week_number" | "muscle_group_id" | "muscle_group" | "planned_sets"
  >[];
  baseline: BaselineSeed[];
  deloadSetPct: number;
  minSets: number;
}): ProjectedCell[] {
  const { weeks, viewRows, baseline, deloadSetPct, minSets } = args;
  const materialized = new Set(viewRows.map((r) => r.week_number));
  const ordered = [...weeks].sort((a, b) => a.week_number - b.week_number);
  const future = ordered.filter((w) => !materialized.has(w.week_number));
  if (future.length === 0) return [];

  // per-group seed = planned_sets at the group's most recent materialized week;
  // baseline fills groups that never materialized (week 0 = lowest precedence).
  const seed = new Map<
    string,
    { muscle_group: string; muscle_group_id: string | null; week: number; sets: number }
  >();
  for (const r of viewRows) {
    if (r.planned_sets == null || r.muscle_group == null) continue;
    const cur = seed.get(r.muscle_group);
    if (!cur || r.week_number > cur.week) {
      seed.set(r.muscle_group, {
        muscle_group: r.muscle_group,
        muscle_group_id: r.muscle_group_id,
        week: r.week_number,
        sets: r.planned_sets,
      });
    }
  }
  for (const b of baseline) {
    if (!seed.has(b.muscle_group)) {
      seed.set(b.muscle_group, {
        muscle_group: b.muscle_group,
        muscle_group_id: b.muscle_group_id,
        week: 0,
        sets: b.sets,
      });
    }
  }

  const cells: ProjectedCell[] = [];
  for (const g of seed.values()) {
    // chain forward: a deload reduces the running count, so a (rare) working
    // week after a deload carries the reduced count, matching the engine.
    let running = g.sets;
    for (const w of future) {
      if (w.is_deload) {
        running = Math.max(
          minSets,
          Math.round(running * deloadSetPct * 10) / 10,
        );
      }
      cells.push({
        week_number: w.week_number,
        muscle_group_id: g.muscle_group_id,
        muscle_group: g.muscle_group,
        projected_sets: running,
        is_deload: w.is_deload,
      });
    }
  }
  return cells;
}

/**
 * Planner-board fractional weekly sets per muscle group, the seed of last
 * resort for the projection. R14: each slot's `initial_sets` credit every
 * muscle its exercise links, weighted primary/secondary; slots whose exercise
 * has no links fall back to the planner group they sit in (direct weight).
 * Shared by the stats query and the MCP volume tool so both read one
 * definition.
 */
export async function loadPlannerBaseline(
  supabase: Client,
  mesoId: string,
  weights: VolumeCountingWeights,
): Promise<BaselineSeed[]> {
  const { data: days, error: dayError } = await supabase
    .from("meso_days")
    .select("id")
    .eq("mesocycle_id", mesoId);
  if (dayError) throw dayError;
  if (!days || days.length === 0) return [];

  const [
    { data: groups, error: groupError },
    { data: fills, error: fillError },
    { data: mgs, error: mgError },
  ] = await Promise.all([
    supabase
      .from("meso_day_groups")
      .select("*")
      .in("meso_day_id", days.map((d) => d.id)),
    supabase.from("meso_exercises").select("*").eq("mesocycle_id", mesoId),
    supabase.from("muscle_groups").select("*"),
  ]);
  if (groupError) throw groupError;
  if (fillError) throw fillError;
  if (mgError) throw mgError;

  const { data: links, error: linkError } = await supabase
    .from("exercise_muscle_groups")
    .select("exercise_id, muscle_group_id, role")
    .in("exercise_id", [
      ...new Set((fills ?? []).map((f) => f.exercise_id)),
    ]);
  if (linkError) throw linkError;
  const rolesByExercise = new Map<
    string,
    { muscle_group_id: string; role: "primary" | "secondary" }[]
  >();
  for (const l of links ?? []) {
    const arr = rolesByExercise.get(l.exercise_id) ?? [];
    arr.push({ muscle_group_id: l.muscle_group_id, role: l.role });
    rolesByExercise.set(l.exercise_id, arr);
  }

  const mgName = new Map((mgs ?? []).map((g) => [g.id, g.name]));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const byName = new Map<string, BaselineSeed>();
  const credit = (
    muscleGroupId: string,
    amount: number,
  ) => {
    const name = mgName.get(muscleGroupId);
    if (!name) return;
    const cur = byName.get(name) ?? {
      muscle_group: name,
      muscle_group_id: muscleGroupId,
      sets: 0,
    };
    cur.sets = Math.round((cur.sets + amount) * 100) / 100;
    byName.set(name, cur);
  };
  for (const fill of fills ?? []) {
    const group = fill.meso_day_group_id
      ? groupById.get(fill.meso_day_group_id)
      : null;
    if (!group) continue;
    const roles = rolesByExercise.get(fill.exercise_id);
    if (roles && roles.length > 0) {
      for (const r of roles) {
        credit(
          r.muscle_group_id,
          fill.initial_sets *
            (r.role === "primary" ? weights.direct : weights.indirect),
        );
      }
    } else {
      credit(group.muscle_group_id, fill.initial_sets * weights.direct);
    }
  }
  return [...byName.values()];
}

/**
 * Full I/O assembler for the MCP volume tool: loads the meso's weeks, the
 * role-grain view rows (weighted here), the planner baseline, and active engine
 * params, then runs the pure projection. The stats query assembles the same
 * inputs inline (it already has most loaded) and calls `projectWeekSets`
 * directly.
 */
export async function loadMesoSetProjection(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<{ projected: ProjectedCell[]; weighted: WeightedWeekSets[] }> {
  const [
    { data: meso, error: mesoError },
    { data: micros, error: microError },
    { data: viewRows, error: viewError },
    { params },
  ] = await Promise.all([
    supabase
      .from("mesocycles")
      .select("weeks, includes_deload")
      .eq("id", mesoId)
      .maybeSingle(),
    supabase
      .from("microcycles")
      .select("week_number, is_deload, status")
      .eq("mesocycle_id", mesoId)
      .eq("user_id", userId)
      .order("week_number"),
    supabase
      .from("v_meso_week_muscle_sets")
      .select("*")
      .eq("user_id", userId)
      .eq("mesocycle_id", mesoId),
    getActiveEngineParams(supabase),
  ]);
  if (mesoError) throw mesoError;
  if (microError) throw microError;
  if (viewError) throw viewError;

  const weights = volumeCountingWeights(params);
  const weighted = weightWeekMuscleSets(viewRows ?? [], weights);
  const baseline = await loadPlannerBaseline(supabase, mesoId, weights);

  // weeks: prefer the real microcycles; synthesize from the meso length when a
  // meso hasn't been started (no micros yet), so a planned-but-unstarted meso
  // still projects from the baseline.
  const weeks =
    micros && micros.length > 0
      ? micros.map((m) => ({ week_number: m.week_number, is_deload: m.is_deload }))
      : Array.from({ length: meso?.weeks ?? 0 }, (_, i) => ({
          week_number: i + 1,
          is_deload: (meso?.includes_deload ?? false) && i === (meso?.weeks ?? 0) - 1,
        }));

  const projected = projectWeekSets({
    weeks,
    viewRows: weighted,
    baseline,
    deloadSetPct: params.deload.set_pct,
    minSets: params.min_sets,
  });
  return { projected, weighted };
}

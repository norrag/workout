import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, VMesoWeekSetsRow } from "@/lib/types/database";
import { getActiveEngineParams } from "./generation";

type Client = SupabaseClient<Database>;

/**
 * Projected planned sets for an unmaterialized meso week × muscle group (PH34).
 *
 * Future weeks are materialized lazily — `workout_exercises` rows are only
 * created once the prior week's same day is completed — so `v_meso_week_sets`
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
  /** planner-board weekly sets for the group (sum of `initial_sets`). */
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
 */
export function projectWeekSets(args: {
  weeks: { week_number: number; is_deload: boolean }[];
  viewRows: Pick<
    VMesoWeekSetsRow,
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
        running = Math.max(minSets, Math.round(running * deloadSetPct));
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
 * Planner-board weekly sets per muscle group (sum of `meso_exercises.initial_sets`
 * over the board), the seed of last resort for the projection. Shared by the
 * stats query and the MCP volume tool so both read one definition.
 */
export async function loadPlannerBaseline(
  supabase: Client,
  mesoId: string,
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

  const mgName = new Map((mgs ?? []).map((g) => [g.id, g.name]));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const byName = new Map<string, BaselineSeed>();
  for (const fill of fills ?? []) {
    const group = fill.meso_day_group_id
      ? groupById.get(fill.meso_day_group_id)
      : null;
    if (!group) continue;
    const name = mgName.get(group.muscle_group_id);
    if (!name) continue;
    const cur = byName.get(name) ?? {
      muscle_group: name,
      muscle_group_id: group.muscle_group_id,
      sets: 0,
    };
    cur.sets += fill.initial_sets;
    byName.set(name, cur);
  }
  return [...byName.values()];
}

/**
 * Full I/O assembler for the MCP volume tool: loads the meso's weeks, the
 * materialized view rows, the planner baseline, and active engine params, then
 * runs the pure projection. The stats query assembles the same inputs inline
 * (it already has most loaded) and calls `projectWeekSets` directly.
 */
export async function loadMesoSetProjection(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<ProjectedCell[]> {
  const [
    { data: meso, error: mesoError },
    { data: micros, error: microError },
    { data: viewRows, error: viewError },
    baseline,
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
      .from("v_meso_week_sets")
      .select("week_number, muscle_group_id, muscle_group, planned_sets")
      .eq("user_id", userId)
      .eq("mesocycle_id", mesoId),
    loadPlannerBaseline(supabase, mesoId),
    getActiveEngineParams(supabase),
  ]);
  if (mesoError) throw mesoError;
  if (microError) throw microError;
  if (viewError) throw viewError;

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

  return projectWeekSets({
    weeks,
    viewRows: viewRows ?? [],
    baseline,
    deloadSetPct: params.deload.set_pct,
    minSets: params.min_sets,
  });
}

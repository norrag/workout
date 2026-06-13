import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreProgress } from "@/lib/engine";
import type {
  Database,
  MesocycleRow,
  VMesoWeekSetsRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

/**
 * Progress scoring v1 (07 Phase 4): per-exercise e1RM trend across a meso,
 * read from `v_exercise_history` so the UI and MCP report the same numbers.
 */
export interface ExerciseProgressScore {
  exercise_id: string;
  exercise_name: string;
  first_e1rm: number | null;
  last_e1rm: number | null;
  /** percentage e1RM change first → last session of the meso */
  score_pct: number | null;
}

export async function getMesoProgressScores(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<ExerciseProgressScore[]> {
  const { data, error } = await supabase
    .from("v_exercise_history")
    .select("*")
    .eq("user_id", userId)
    .eq("mesocycle_id", mesoId)
    .order("performed_on");
  if (error) throw error;

  const byExercise = new Map<
    string,
    { name: string; first: number | null; last: number | null }
  >();
  for (const row of data ?? []) {
    if (row.e1rm == null) continue;
    const cur = byExercise.get(row.exercise_id);
    if (!cur) {
      byExercise.set(row.exercise_id, {
        name: row.exercise_name,
        first: row.e1rm,
        last: row.e1rm,
      });
    } else {
      cur.last = row.e1rm;
    }
  }

  return [...byExercise.entries()].map(([exercise_id, v]) => ({
    exercise_id,
    exercise_name: v.name,
    first_e1rm: v.first,
    last_e1rm: v.last,
    score_pct: scoreProgress(v.first, v.last),
  }));
}

// ---------------------------------------------------------------------------
// meso stats (figs 4.1–4.3) — volume / balance / performance, one definition
// of progress: everything reads v_meso_week_sets, v_exercise_history and
// v_exercise_prs (07 conventions)
// ---------------------------------------------------------------------------

export type VolumeCellKind = "logged" | "current" | "planned" | "empty";

export interface VolumeCell {
  value: number | null;
  kind: VolumeCellKind;
}

export interface MesoStatsWeek {
  week_number: number;
  is_deload: boolean;
  status: "completed" | "active" | "pending";
}

export interface MesoVolume {
  groups: { name: string; cells: VolumeCell[] }[];
  totals: VolumeCell[];
  /** current-week footer: logged of planned */
  currentLogged: number | null;
  currentPlanned: number | null;
}

export interface MesoBalance {
  push: number;
  pull: number;
  legs: number;
  bars: { name: string; avg: number }[];
  note: string;
}

export interface KeyLiftWeekCell {
  weight: number;
  reps: number;
  isCurrent: boolean;
}

export interface KeyLift {
  exercise_id: string;
  name: string;
  badge: string | null;
  cells: (KeyLiftWeekCell | null)[];
}

export interface MacroChartBar {
  label: string;
  e1rm: number | null;
  state: "past" | "current" | "future";
}

export interface MesoPr {
  label: string;
  coordinate: string;
  kind: "ALL-TIME" | "REP PR";
}

export interface MesoPerformance {
  keyLifts: KeyLift[];
  macroLiftName: string | null;
  macroChart: MacroChartBar[];
  prs: MesoPr[];
}

export interface MesoStats {
  meso: MesocycleRow;
  contextLine: string;
  weeks: MesoStatsWeek[];
  currentWeek: number | null;
  volume: MesoVolume;
  balance: MesoBalance;
  performance: MesoPerformance;
}

/** push/pull/legs classification of the seeded muscle-group vocabulary. */
export function balanceCategory(
  group: string,
): "push" | "pull" | "legs" | null {
  const g = group.toLowerCase();
  if (["chest", "shoulders", "triceps"].includes(g)) return "push";
  if (["back", "biceps", "traps", "forearms"].includes(g)) return "pull";
  if (["quads", "hamstrings", "glutes", "calves"].includes(g)) return "legs";
  return null; // abs and anything unmapped stay out of the cards
}

/**
 * Build the 4.1 volume matrix. Completed weeks show logged sets, the active
 * week shows logged-so-far, generated future weeks show the autoregulated
 * plan, ungenerated weeks fall back to the planner baseline (deload weeks
 * stay empty until the engine sizes them).
 */
export function buildVolumeMatrix(
  weeks: MesoStatsWeek[],
  viewRows: Pick<
    VMesoWeekSetsRow,
    "week_number" | "muscle_group" | "planned_sets" | "logged_sets"
  >[],
  baseline: Map<string, number>,
): MesoVolume {
  const generatedWeeks = new Set(viewRows.map((r) => r.week_number));
  const names = [
    ...new Set([
      ...viewRows.map((r) => r.muscle_group).filter((g): g is string => !!g),
      ...baseline.keys(),
    ]),
  ];

  const cellFor = (name: string, week: MesoStatsWeek): VolumeCell => {
    const row = viewRows.find(
      (r) => r.week_number === week.week_number && r.muscle_group === name,
    );
    if (week.status === "completed")
      return { value: row?.logged_sets ?? 0, kind: "logged" };
    if (week.status === "active")
      return { value: row?.logged_sets ?? 0, kind: "current" };
    if (row) return { value: row.planned_sets, kind: "planned" };
    if (week.is_deload) return { value: null, kind: "empty" };
    const base = baseline.get(name);
    return base != null
      ? { value: base, kind: "planned" }
      : { value: null, kind: "empty" };
  };

  const groups = names
    .map((name) => ({ name, cells: weeks.map((w) => cellFor(name, w)) }))
    .filter((g) => g.cells.some((c) => c.value != null && c.value > 0))
    .sort((a, b) => sumCells(b.cells) - sumCells(a.cells));

  const totals: VolumeCell[] = weeks.map((w, i) => {
    const vals = groups.map((g) => g.cells[i]);
    if (vals.every((c) => c.kind === "empty")) return { value: null, kind: "empty" };
    return {
      value: vals.reduce((n, c) => n + (c.value ?? 0), 0),
      kind: vals[0]?.kind ?? "empty",
    };
  });

  const activeIdx = weeks.findIndex((w) => w.status === "active");
  let currentLogged: number | null = null;
  let currentPlanned: number | null = null;
  if (activeIdx >= 0 && generatedWeeks.has(weeks[activeIdx].week_number)) {
    const rows = viewRows.filter(
      (r) => r.week_number === weeks[activeIdx].week_number,
    );
    currentLogged = rows.reduce((n, r) => n + r.logged_sets, 0);
    currentPlanned = rows.reduce((n, r) => n + (r.planned_sets ?? 0), 0);
  }

  return { groups, totals, currentLogged, currentPlanned };
}

function sumCells(cells: VolumeCell[]): number {
  return cells.reduce((n, c) => n + (c.value ?? 0), 0);
}

/**
 * Balance (4.2): average planned sets per non-deload week per group — the
 * push/pull/legs cards sum their groups; the note states the push:pull ratio
 * and the lowest-volume group.
 */
export function buildBalance(volume: MesoVolume, weeks: MesoStatsWeek[]): MesoBalance {
  const idx = weeks
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !w.is_deload)
    .map(({ i }) => i);

  const bars = volume.groups
    .map((g) => {
      const vals = idx
        .map((i) => g.cells[i])
        .filter((c) => c.value != null)
        .map((c) => c.value as number);
      return {
        name: g.name,
        avg: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
      };
    })
    .sort((a, b) => b.avg - a.avg);

  const byCat = { push: 0, pull: 0, legs: 0 };
  for (const bar of bars) {
    const cat = balanceCategory(bar.name);
    if (cat) byCat[cat] += bar.avg;
  }

  const ratio = byCat.pull > 0 ? byCat.push / byCat.pull : null;
  const lowest = bars.filter((b) => b.avg > 0).at(-1);
  const parts: string[] = [];
  if (ratio != null)
    parts.push(`Push : pull is ${ratio.toFixed(1)} : 1 this meso.`);
  if (lowest)
    parts.push(
      `${capitalize(lowest.name)} carries the lowest weekly volume at ${lowest.avg} sets.`,
    );
  return { ...byCat, bars, note: parts.join(" ") };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface TopSetRow {
  exercise_id: string;
  exercise_name: string;
  week_number: number;
  weight: number;
  reps: number;
  e1rm: number;
}

/** Key-lift grid (4.3): top set per week for the meso's biggest movers. */
export function buildKeyLifts(
  topSets: TopSetRow[],
  weeks: MesoStatsWeek[],
  currentWeek: number | null,
  limit = 3,
): KeyLift[] {
  const byExercise = new Map<string, TopSetRow[]>();
  for (const row of topSets) {
    const cur = byExercise.get(row.exercise_id) ?? [];
    cur.push(row);
    byExercise.set(row.exercise_id, cur);
  }

  return [...byExercise.values()]
    .sort(
      (a, b) =>
        Math.max(...b.map((r) => r.e1rm)) - Math.max(...a.map((r) => r.e1rm)),
    )
    .slice(0, limit)
    .map((rows) => {
      const cells = weeks.map((w) => {
        const best = rows
          .filter((r) => r.week_number === w.week_number)
          .sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
        return best
          ? {
              weight: best.weight,
              reps: best.reps,
              isCurrent: w.week_number === currentWeek,
            }
          : null;
      });
      const w1 = cells[0];
      const latest = [...cells].reverse().find((c) => c != null);
      let badge: string | null = null;
      if (w1 && latest && latest !== w1) {
        const delta = latest.weight - w1.weight;
        if (delta !== 0)
          badge = `${delta > 0 ? "+" : "−"}${Math.abs(delta)} LB VS W1`;
      }
      return {
        exercise_id: rows[0].exercise_id,
        name: rows[0].exercise_name,
        badge,
        cells,
      };
    });
}

/**
 * PRs this meso (4.3): a lift PRs when its best set beats everything logged
 * before the meso — heavier top weight = ALL-TIME, better e1RM at or below
 * the old top weight = REP PR. Lifts without prior history can't PR.
 */
export function buildPrs(
  mesoBest: {
    exercise_id: string;
    name: string;
    weight: number;
    reps: number;
    coordinate: string;
    e1rm: number;
  }[],
  priorBest: Map<string, { weight: number; e1rm: number }>,
): MesoPr[] {
  const prs: MesoPr[] = [];
  for (const best of mesoBest) {
    const prior = priorBest.get(best.exercise_id);
    if (!prior) continue;
    let kind: MesoPr["kind"] | null = null;
    if (best.weight > prior.weight) kind = "ALL-TIME";
    else if (best.e1rm > prior.e1rm) kind = "REP PR";
    if (kind)
      prs.push({
        label: `${best.name} — ${best.weight} × ${best.reps}`,
        coordinate: best.coordinate,
        kind,
      });
  }
  return prs;
}

export async function getMesoStats(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<MesoStats | null> {
  const { data: meso, error: mesoError } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("id", mesoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (mesoError) throw mesoError;
  if (!meso) return null;

  const [
    { data: micros, error: microError },
    { data: weekSets, error: weekSetsError },
    { data: history, error: historyError },
  ] = await Promise.all([
    supabase
      .from("microcycles")
      .select("*")
      .eq("mesocycle_id", mesoId)
      .order("week_number"),
    supabase
      .from("v_meso_week_sets")
      .select("*")
      .eq("user_id", userId)
      .eq("mesocycle_id", mesoId),
    supabase
      .from("v_exercise_history")
      .select("*")
      .eq("user_id", userId)
      .eq("mesocycle_id", mesoId)
      .order("performed_on"),
  ]);
  if (microError) throw microError;
  if (weekSetsError) throw weekSetsError;
  if (historyError) throw historyError;

  const weeks: MesoStatsWeek[] =
    (micros ?? []).length > 0
      ? (micros ?? []).map((m) => ({
          week_number: m.week_number,
          is_deload: m.is_deload,
          status: m.status,
        }))
      : Array.from({ length: meso.weeks }, (_, i) => ({
          week_number: i + 1,
          is_deload: meso.includes_deload && i === meso.weeks - 1,
          status: "pending" as const,
        }));
  const currentWeek =
    weeks.find((w) => w.status === "active")?.week_number ?? null;

  // planner baseline: weekly sets per group from the board structure
  const { data: days, error: dayError } = await supabase
    .from("meso_days")
    .select("id")
    .eq("mesocycle_id", mesoId);
  if (dayError) throw dayError;
  const baseline = new Map<string, number>();
  if ((days ?? []).length > 0) {
    const [
      { data: groups, error: groupError },
      { data: fills, error: fillError },
      { data: mgs, error: mgError },
    ] = await Promise.all([
      supabase
        .from("meso_day_groups")
        .select("*")
        .in("meso_day_id", (days ?? []).map((d) => d.id)),
      supabase.from("meso_exercises").select("*").eq("mesocycle_id", mesoId),
      supabase.from("muscle_groups").select("*"),
    ]);
    if (groupError) throw groupError;
    if (fillError) throw fillError;
    if (mgError) throw mgError;
    const mgName = new Map((mgs ?? []).map((g) => [g.id, g.name]));
    const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
    for (const fill of fills ?? []) {
      const group = fill.meso_day_group_id
        ? groupById.get(fill.meso_day_group_id)
        : null;
      const name = group ? mgName.get(group.muscle_group_id) : null;
      if (!name) continue;
      baseline.set(name, (baseline.get(name) ?? 0) + fill.initial_sets);
    }
  }

  const volume = buildVolumeMatrix(weeks, weekSets ?? [], baseline);
  const balance = buildBalance(volume, weeks);

  // performance — top set per exercise per week needs set-level reps
  const microWeek = new Map((micros ?? []).map((m) => [m.id, m.week_number]));
  const { data: sets, error: setsError } = await supabase
    .from("logged_sets")
    .select("*")
    .eq("user_id", userId)
    .eq("mesocycle_id", mesoId)
    .eq("is_warmup", false);
  if (setsError) throw setsError;

  const exerciseNames = new Map(
    (history ?? []).map((h) => [h.exercise_id, h.exercise_name]),
  );
  const topSets: TopSetRow[] = [];
  const bestByExerciseWeek = new Map<string, (typeof sets)[number]>();
  for (const s of sets ?? []) {
    const week = microWeek.get(s.microcycle_id);
    if (week == null) continue;
    const key = `${s.exercise_id}:${week}`;
    const cur = bestByExerciseWeek.get(key);
    if (!cur || s.weight > cur.weight || (s.weight === cur.weight && s.reps > cur.reps))
      bestByExerciseWeek.set(key, s);
  }
  for (const [key, s] of bestByExerciseWeek) {
    topSets.push({
      exercise_id: s.exercise_id,
      exercise_name: exerciseNames.get(s.exercise_id) ?? "",
      week_number: Number(key.split(":")[1]),
      weight: s.weight,
      reps: s.reps,
      e1rm: s.weight * (1 + s.reps / 30),
    });
  }
  const keyLifts = buildKeyLifts(topSets, weeks, currentWeek);

  // macro chart: best e1RM of the lead key lift per meso across the macro
  let macroChart: MacroChartBar[] = [];
  let macroLiftName: string | null = null;
  let macroName: string | null = null;
  let mesoPosition: string | null = null;
  if (meso.macrocycle_id) {
    const [
      { data: macro, error: macroError },
      { data: slots, error: slotError },
      { data: macroMesos, error: macroMesoError },
    ] = await Promise.all([
      supabase
        .from("macrocycles")
        .select("*")
        .eq("id", meso.macrocycle_id)
        .maybeSingle(),
      supabase
        .from("macro_slots")
        .select("*")
        .eq("macrocycle_id", meso.macrocycle_id)
        .order("slot_number"),
      supabase
        .from("mesocycles")
        .select("*")
        .eq("macrocycle_id", meso.macrocycle_id),
    ]);
    if (macroError) throw macroError;
    if (slotError) throw slotError;
    if (macroMesoError) throw macroMesoError;
    macroName = macro?.name ?? null;

    const lead = keyLifts[0] ?? null;
    if (lead && (slots ?? []).length > 0) {
      macroLiftName = lead.name;
      const mesoBySlot = new Map(
        (macroMesos ?? [])
          .filter((m) => m.macro_slot_id)
          .map((m) => [m.macro_slot_id!, m]),
      );
      const slotMesoIds = (slots ?? [])
        .map((s) => mesoBySlot.get(s.id)?.id)
        .filter((id): id is string => !!id);
      let liftHistory: { mesocycle_id: string; e1rm: number | null }[] = [];
      if (slotMesoIds.length > 0) {
        const { data, error } = await supabase
          .from("v_exercise_history")
          .select("mesocycle_id, e1rm")
          .eq("user_id", userId)
          .eq("exercise_id", lead.exercise_id)
          .in("mesocycle_id", slotMesoIds);
        if (error) throw error;
        liftHistory = data ?? [];
      }
      macroChart = (slots ?? []).map((slot, i) => {
        const slotMeso = mesoBySlot.get(slot.id);
        if (slotMeso?.id === meso.id) mesoPosition = `MESO ${i + 1} OF ${(slots ?? []).length}`;
        const best = slotMeso
          ? liftHistory
              .filter((h) => h.mesocycle_id === slotMeso.id && h.e1rm != null)
              .reduce<number | null>(
                (max, h) => (max == null || h.e1rm! > max ? h.e1rm : max),
                null,
              )
          : null;
        return {
          label: `M${i + 1}`,
          e1rm: best != null ? Math.round(best) : null,
          state:
            slotMeso?.id === meso.id
              ? ("current" as const)
              : best != null
                ? ("past" as const)
                : ("future" as const),
        };
      });
    }
  }

  // PRs this meso vs everything before it
  const mesoExerciseIds = [...new Set((sets ?? []).map((s) => s.exercise_id))];
  const priorBest = new Map<string, { weight: number; e1rm: number }>();
  if (mesoExerciseIds.length > 0) {
    const { data: prior, error: priorError } = await supabase
      .from("v_exercise_history")
      .select("*")
      .eq("user_id", userId)
      .neq("mesocycle_id", mesoId)
      .in("exercise_id", mesoExerciseIds);
    if (priorError) throw priorError;
    const firstMesoDate = (history ?? [])[0]?.performed_on ?? null;
    for (const row of prior ?? []) {
      if (firstMesoDate && row.performed_on >= firstMesoDate) continue;
      const cur = priorBest.get(row.exercise_id);
      priorBest.set(row.exercise_id, {
        weight: Math.max(cur?.weight ?? 0, row.top_weight ?? 0),
        e1rm: Math.max(cur?.e1rm ?? 0, row.e1rm ?? 0),
      });
    }
  }

  const workoutDay = new Map<string, number>();
  if ((sets ?? []).length > 0) {
    const { data: workouts, error: workoutError } = await supabase
      .from("workouts")
      .select("id, day_number")
      .in("id", [...new Set((sets ?? []).map((s) => s.workout_id))]);
    if (workoutError) throw workoutError;
    for (const w of workouts ?? []) workoutDay.set(w.id, w.day_number);
  }
  const mesoBest = mesoExerciseIds
    .map((exerciseId) => {
      const best = (sets ?? [])
        .filter((s) => s.exercise_id === exerciseId)
        .sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
      if (!best) return null;
      return {
        exercise_id: exerciseId,
        name: exerciseNames.get(exerciseId) ?? "",
        weight: best.weight,
        reps: best.reps,
        coordinate: `W${microWeek.get(best.microcycle_id) ?? "?"}·D${workoutDay.get(best.workout_id) ?? "?"}`,
        e1rm: best.weight * (1 + best.reps / 30),
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);
  const prs = buildPrs(mesoBest, priorBest);

  const contextParts = [
    macroName ? macroName.toUpperCase() : "STANDALONE",
    mesoPosition,
    meso.status === "active" && currentWeek != null
      ? `W${currentWeek} IN PROGRESS`
      : meso.status.toUpperCase(),
  ].filter((p): p is string => !!p);

  return {
    meso,
    contextLine: contextParts.join(" · "),
    weeks,
    currentWeek,
    volume,
    balance,
    performance: { keyLifts, macroLiftName, macroChart, prs },
  };
}

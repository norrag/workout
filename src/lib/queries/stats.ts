import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scoreProgress,
  pplCategory,
  volumeCountingWeights,
  type VolumeCountingWeights,
} from "@/lib/engine";
import type {
  Database,
  MesocycleRow,
  VExerciseHistoryRow,
} from "@/lib/types/database";
import { getActiveEngineParams } from "./generation";
import {
  loadPlannerBaseline,
  projectWeekSets,
  weightWeekMuscleSets,
  type ProjectedCell,
  type WeightedWeekSets,
} from "./volume-projection";
import { getMuscleGroupsCached } from "./reference";

type Client = SupabaseClient<Database>;

/**
 * Progress scoring v1 (07 Phase 4): per-exercise e1RM trend across a meso,
 * read from `v_exercise_history` so the UI and MCP report the same numbers.
 * Deload sessions are excluded from the trend (T-A2, owner 2026-07-02): a
 * deliberately light week is recovery, not regression — it must not depress
 * the first→last score. Deloads still count toward volume and PR stats.
 */
export interface ExerciseProgressScore {
  exercise_id: string;
  exercise_name: string;
  first_e1rm: number | null;
  last_e1rm: number | null;
  /** percentage e1RM change first → last non-deload session of the window */
  score_pct: number | null;
  /** non-deload sessions with an e1RM — the points the trend is computed over */
  sessions: number;
}

/**
 * An exercise "counts" for the strength lists once it has this many trend
 * points (I11, owner 2026-07-02: "logged at least 3 times in the mesocycle" —
 * excludes subbed-in / inconsistent lifts). Sessions are counted the same way
 * the trend is computed: non-deload, with a stored e1RM.
 */
export const MIN_PROGRESS_SESSIONS = 3;

/** The I11 display rule: enough sessions to trend, and a computable score. */
export function qualifyingScores(
  scores: ExerciseProgressScore[],
): ExerciseProgressScore[] {
  return scores.filter(
    (s) => s.sessions >= MIN_PROGRESS_SESSIONS && s.score_pct != null,
  );
}

/**
 * N16: the macro "EST. STRENGTH · KEY LIFTS" tile — mean e1RM %-change of the
 * key lifts, where key lifts = the most-logged **qualifying** exercises
 * (doc 10 §7 frequency rule). Derived from the same deload-filtered,
 * ≥3-session scores as the Performance tab so the tile and the tab can never
 * tell different stories about the same window.
 */
export function keyLiftStrengthPct(
  scores: ExerciseProgressScore[],
  topN = 3,
): number | null {
  const key = qualifyingScores(scores)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, topN)
    .map((s) => s.score_pct)
    .filter((s): s is number => s != null);
  if (key.length === 0) return null;
  return Math.round((key.reduce((a, b) => a + b, 0) / key.length) * 10) / 10;
}

/**
 * N14: a single mis-logged session (reps typed into the weight field, a
 * technique set) must not define a trend endpoint — one 7-lb "session" on an
 * otherwise ~200-lb lift turned a macro rollup wildly positive. Sessions whose
 * e1RM is more than this ratio away from the exercise's window median (either
 * direction) are dropped before the first→last fold. 3× is deliberately
 * generous: a real beginner run can double within a window and must survive;
 * only order-of-magnitude mis-logs are outliers.
 */
export const E1RM_OUTLIER_RATIO = 3;

/** Drop sessions implausibly far from the window median (N14). Needs ≥3
 *  sessions to establish a median worth trusting; below that, keep all. */
export function dropE1rmOutliers(e1rms: number[]): number[] {
  if (e1rms.length < 3) return e1rms;
  const sorted = [...e1rms].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median =
    sorted.length % 2 === 1
      ? sorted[Math.floor(mid)]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  if (median <= 0) return e1rms;
  return e1rms.filter(
    (v) => v >= median / E1RM_OUTLIER_RATIO && v <= median * E1RM_OUTLIER_RATIO,
  );
}

/** Pure first→last e1RM fold shared by the meso and macro scopes (rows must
 *  arrive ordered by performed_on; deload sessions are skipped — T-A2;
 *  outlier sessions are dropped from the endpoints and the count — N14). */
export function foldProgressScores(
  rows: Pick<
    VExerciseHistoryRow,
    "exercise_id" | "exercise_name" | "microcycle_id" | "e1rm"
  >[],
  deloadMicroIds: Set<string>,
): ExerciseProgressScore[] {
  const byExercise = new Map<string, { name: string; e1rms: number[] }>();
  for (const row of rows) {
    if (row.e1rm == null) continue;
    if (deloadMicroIds.has(row.microcycle_id)) continue;
    let cur = byExercise.get(row.exercise_id);
    if (!cur) {
      cur = { name: row.exercise_name, e1rms: [] };
      byExercise.set(row.exercise_id, cur);
    }
    cur.e1rms.push(row.e1rm);
  }

  return [...byExercise.entries()].map(([exercise_id, v]) => {
    const kept = dropE1rmOutliers(v.e1rms);
    const first = kept.length > 0 ? kept[0] : null;
    const last = kept.length > 0 ? kept[kept.length - 1] : null;
    return {
      exercise_id,
      exercise_name: v.name,
      first_e1rm: first,
      last_e1rm: last,
      score_pct: scoreProgress(first, last),
      sessions: kept.length,
    };
  });
}

/** Progress scores across one or more mesocycles (macro scope = all its mesos). */
export async function getProgressScores(
  supabase: Client,
  userId: string,
  mesoIds: string[],
): Promise<ExerciseProgressScore[]> {
  if (mesoIds.length === 0) return [];
  const [{ data, error }, { data: micros, error: microError }] =
    await Promise.all([
      supabase
        .from("v_exercise_history")
        .select("*")
        .eq("user_id", userId)
        .in("mesocycle_id", mesoIds)
        .order("performed_on"),
      supabase
        .from("microcycles")
        .select("id, is_deload")
        .in("mesocycle_id", mesoIds)
        .eq("user_id", userId),
    ]);
  if (error) throw error;
  if (microError) throw microError;
  const deloadMicroIds = new Set(
    (micros ?? []).filter((m) => m.is_deload).map((m) => m.id),
  );
  return foldProgressScores(data ?? [], deloadMicroIds);
}

export async function getMesoProgressScores(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<ExerciseProgressScore[]> {
  return getProgressScores(supabase, userId, [mesoId]);
}

// ---------------------------------------------------------------------------
// PH37 — strength gains rolled up per muscle group (meso + macro scopes)
// ---------------------------------------------------------------------------

/** N9: one exercise's contribution to a muscle group's rollup number. */
export interface MuscleGroupContributor extends ExerciseProgressScore {
  /** how the exercise credits this group (primary 1.0 / secondary 0.5) */
  role: "primary" | "secondary";
}

export interface MuscleGroupProgress {
  muscle_group: string;
  /** role-weighted mean of the qualifying exercises' e1RM %-changes */
  score_pct: number | null;
  /** contributing exercises */
  lifts: number;
  /** N9: the exercises that rolled into this number, best score first —
   *  the macro Performance drill-down. An exercise linked to several groups
   *  appears under each (fractional credit is expected). */
  contributors: MuscleGroupContributor[];
}

export interface ExerciseMuscleLink {
  exercise_id: string;
  muscle_group: string;
  role: "primary" | "secondary";
}

/**
 * Roll per-exercise e1RM %-changes (I11) up to muscle groups: each exercise
 * credits every muscle it's linked to, weighted by role through the same
 * `engine_params.volume.direct/indirect` weights the volume counting uses
 * (doc 10 §2) — a primary link counts 1.0, a secondary 0.5. Pure.
 */
export function rollupMuscleProgress(
  scores: ExerciseProgressScore[],
  links: ExerciseMuscleLink[],
  weights: VolumeCountingWeights,
): MuscleGroupProgress[] {
  const byExercise = new Map(scores.map((s) => [s.exercise_id, s]));
  const byGroup = new Map<
    string,
    {
      weighted: number;
      weightSum: number;
      lifts: number;
      contributors: MuscleGroupContributor[];
    }
  >();
  for (const link of links) {
    const score = byExercise.get(link.exercise_id);
    if (!score || score.score_pct == null) continue;
    const w = link.role === "primary" ? weights.direct : weights.indirect;
    if (w <= 0) continue;
    let cur = byGroup.get(link.muscle_group);
    if (!cur) {
      cur = { weighted: 0, weightSum: 0, lifts: 0, contributors: [] };
      byGroup.set(link.muscle_group, cur);
    }
    cur.weighted += score.score_pct * w;
    cur.weightSum += w;
    cur.lifts += 1;
    cur.contributors.push({ ...score, role: link.role });
  }
  return [...byGroup.entries()]
    .map(([muscle_group, v]) => ({
      muscle_group,
      score_pct:
        v.weightSum > 0 ? Math.round((v.weighted / v.weightSum) * 10) / 10 : null,
      lifts: v.lifts,
      contributors: [...v.contributors].sort(
        (a, b) => (b.score_pct ?? -Infinity) - (a.score_pct ?? -Infinity),
      ),
    }))
    .sort(
      (a, b) => (b.score_pct ?? -Infinity) - (a.score_pct ?? -Infinity),
    );
}

/** Muscle links (with group names + roles) for a set of exercises. */
export async function getExerciseMuscleLinks(
  supabase: Client,
  exerciseIds: string[],
): Promise<ExerciseMuscleLink[]> {
  if (exerciseIds.length === 0) return [];
  const [{ data: links, error }, groups] = await Promise.all([
    supabase
      .from("exercise_muscle_groups")
      .select("exercise_id, muscle_group_id, role")
      .in("exercise_id", exerciseIds),
    getMuscleGroupsCached(),
  ]);
  if (error) throw error;
  const nameById = new Map(groups.map((g) => [g.id, g.name]));
  return (links ?? []).flatMap((l) => {
    const muscle_group = nameById.get(l.muscle_group_id);
    if (!muscle_group) return [];
    return [
      {
        exercise_id: l.exercise_id,
        muscle_group,
        role: (l.role === "secondary" ? "secondary" : "primary") as
          | "primary"
          | "secondary",
      },
    ];
  });
}

/** The I11 + PH37 strength block for one scope (meso or macro). */
export interface StrengthProgress {
  /** qualifying exercises (≥3 non-deload sessions), best score first */
  exercises: ExerciseProgressScore[];
  muscles: MuscleGroupProgress[];
}

export async function buildStrengthProgress(
  supabase: Client,
  scores: ExerciseProgressScore[],
  weights: VolumeCountingWeights,
): Promise<StrengthProgress> {
  const exercises = qualifyingScores(scores).sort(
    (a, b) => (b.score_pct ?? 0) - (a.score_pct ?? 0),
  );
  const links = await getExerciseMuscleLinks(
    supabase,
    exercises.map((s) => s.exercise_id),
  );
  return { exercises, muscles: rollupMuscleProgress(exercises, links, weights) };
}

// ---------------------------------------------------------------------------
// meso stats (figs 4.1–4.3) — volume / balance / performance, one definition
// of progress: everything reads v_meso_week_muscle_sets, v_exercise_history and
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

export interface MesoPr {
  label: string;
  coordinate: string;
  kind: "ALL-TIME" | "REP PR";
}

// N10: the "TOP SET BY WEEK — KEY LIFTS" grid and the "ACROSS MACRO" chart were
// retired from the meso Performance tab (macro-scope content on a meso view);
// what remains is the strength block + PRs.
export interface MesoPerformance {
  prs: MesoPr[];
  /** I11 + PH37: per-exercise e1RM %-change (≥3 sessions) + muscle rollup */
  strength: StrengthProgress;
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

/**
 * push/pull/legs classification of the seeded muscle-group vocabulary. Delegates
 * to the engine's canonical 10 §7 PPL map (`pplCategory`) so the in-app balance
 * cards and the connector's per-day classification share one definition.
 */
export function balanceCategory(
  group: string,
): "push" | "pull" | "legs" | null {
  return pplCategory(group);
}

/**
 * Build the 4.1 volume matrix. Completed weeks show logged sets, the active
 * week shows logged-so-far, generated future weeks show the materialized
 * autoregulated plan, and ungenerated future weeks (incl. deloads) show the
 * engine's set-count projection (PH34) — see `projectWeekSets`.
 * Cells are fractional since R14 (doc 10 §2 1.0/0.5 counting; logged cells
 * count hard sets only) — `weightWeekMuscleSets` produces the rows.
 */
export function buildVolumeMatrix(
  weeks: MesoStatsWeek[],
  viewRows: Pick<
    WeightedWeekSets,
    "week_number" | "muscle_group" | "planned_sets" | "logged_sets"
  >[],
  projected: ProjectedCell[],
): MesoVolume {
  const generatedWeeks = new Set(viewRows.map((r) => r.week_number));
  const projectedByWeek = new Map<number, Map<string, number>>();
  for (const c of projected) {
    let m = projectedByWeek.get(c.week_number);
    if (!m) {
      m = new Map();
      projectedByWeek.set(c.week_number, m);
    }
    m.set(c.muscle_group, c.projected_sets);
  }
  const names = [
    ...new Set([
      ...viewRows.map((r) => r.muscle_group).filter((g): g is string => !!g),
      ...projected.map((c) => c.muscle_group),
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
    const proj = projectedByWeek.get(week.week_number)?.get(name);
    return proj != null
      ? { value: proj, kind: "planned" }
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
      // fractional cells: round the column sum to 1 dp so 0.5-credits can't
      // accumulate float noise in the totals row
      value: Math.round(vals.reduce((n, c) => n + (c.value ?? 0), 0) * 10) / 10,
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
    currentLogged =
      Math.round(rows.reduce((n, r) => n + r.logged_sets, 0) * 10) / 10;
    currentPlanned =
      Math.round(rows.reduce((n, r) => n + (r.planned_sets ?? 0), 0) * 10) / 10;
  }

  return { groups, totals, currentLogged, currentPlanned };
}

function sumCells(cells: VolumeCell[]): number {
  return cells.reduce((n, c) => n + (c.value ?? 0), 0);
}

/**
 * Balance (4.2): average fractional sets per non-deload week per group — the
 * push/pull/legs cards sum their groups; the note states the push:pull ratio
 * and the lowest-volume group. Averages keep 1 dp since R14 (half-set credits
 * are real signal against MEV/MAV/MRV, not rounding noise). `scope` only
 * changes the note's wording ("this meso" / "this macrocycle" — M8).
 */
export function buildBalance(
  volume: MesoVolume,
  weeks: MesoStatsWeek[],
  scope = "this meso",
): MesoBalance {
  const idx = weeks
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !w.is_deload)
    .map(({ i }) => i);

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const bars = volume.groups
    .map((g) => {
      const vals = idx
        .map((i) => g.cells[i])
        .filter((c) => c.value != null)
        .map((c) => c.value as number);
      return {
        name: g.name,
        avg: vals.length > 0 ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
      };
    })
    .sort((a, b) => b.avg - a.avg);

  const byCat = { push: 0, pull: 0, legs: 0 };
  for (const bar of bars) {
    const cat = balanceCategory(bar.name);
    if (cat) byCat[cat] = round1(byCat[cat] + bar.avg);
  }

  const ratio = byCat.pull > 0 ? byCat.push / byCat.pull : null;
  const lowest = bars.filter((b) => b.avg > 0).at(-1);
  const parts: string[] = [];
  if (ratio != null)
    parts.push(`Push : pull is ${ratio.toFixed(1)} : 1 ${scope}.`);
  if (lowest)
    parts.push(
      `${capitalize(lowest.name)} carries the lowest weekly volume at ${lowest.avg} sets.`,
    );
  return { ...byCat, bars, note: parts.join(" ") };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
    { data: weekMuscleSets, error: weekSetsError },
    { data: history, error: historyError },
    { params },
  ] = await Promise.all([
    supabase
      .from("microcycles")
      .select("*")
      .eq("mesocycle_id", mesoId)
      .order("week_number"),
    supabase
      .from("v_meso_week_muscle_sets")
      .select("*")
      .eq("user_id", userId)
      .eq("mesocycle_id", mesoId),
    supabase
      .from("v_exercise_history")
      .select("*")
      .eq("user_id", userId)
      .eq("mesocycle_id", mesoId)
      .order("performed_on"),
    getActiveEngineParams(supabase),
  ]);
  if (microError) throw microError;
  if (weekSetsError) throw weekSetsError;
  if (historyError) throw historyError;

  // R14: fold the role-grain facts into fractional per-(week, muscle) numbers
  // (1.0 primary / 0.5 secondary; logged = hard sets) — one shared definition
  // with the MCP volume/balance tools.
  const weights = volumeCountingWeights(params);
  const weekSets = weightWeekMuscleSets(weekMuscleSets ?? [], weights);

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

  // future-week set projection (PH34): carry the last materialized week's
  // autoregulated count forward (deload-scaled), seeded by the planner baseline
  // where a group hasn't materialized. Shared with the MCP volume tool.
  const baseline = await loadPlannerBaseline(supabase, mesoId, weights);
  const projected: ProjectedCell[] = projectWeekSets({
    weeks,
    viewRows: weekSets,
    baseline,
    deloadSetPct: params.deload.set_pct,
    minSets: params.min_sets,
  });

  const volume = buildVolumeMatrix(weeks, weekSets, projected);
  const balance = buildBalance(volume, weeks);

  // I11 + PH37: per-exercise e1RM %-change over the meso (≥3 non-deload
  // sessions) + the role-weighted muscle-group rollup, folded from the same
  // history rows fetched above — one definition with the MCP summary tools.
  const deloadMicroIds = new Set(
    (micros ?? []).filter((m) => m.is_deload).map((m) => m.id),
  );
  const strength = await buildStrengthProgress(
    supabase,
    foldProgressScores(history ?? [], deloadMicroIds),
    weights,
  );

  // performance — the PR scan needs set-level reps/weights
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

  // macro context for the header line (N10: the key-lift grid + across-macro
  // chart left this view — the context caption is all that still needs the macro)
  let macroName: string | null = null;
  let mesoPosition: string | null = null;
  if (meso.macrocycle_id) {
    const [
      { data: macro, error: macroError },
      { data: macroMesos, error: macroMesoError },
    ] = await Promise.all([
      supabase
        .from("macrocycles")
        .select("name")
        .eq("id", meso.macrocycle_id)
        .maybeSingle(),
      supabase
        .from("mesocycles")
        .select("id")
        .eq("macrocycle_id", meso.macrocycle_id)
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at"),
    ]);
    if (macroError) throw macroError;
    if (macroMesoError) throw macroMesoError;
    macroName = macro?.name ?? null;
    const orderedMesos = macroMesos ?? [];
    const idx = orderedMesos.findIndex((m) => m.id === meso.id);
    if (idx >= 0) mesoPosition = `MESO ${idx + 1} OF ${orderedMesos.length}`;
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
        // T-A1: compare set-grain engine numbers — the session's best per-set
        // e1RM, not the session average (which understated the prior bar and
        // inflated REP PR detection)
        e1rm: Math.max(cur?.e1rm ?? 0, row.best_set_e1rm ?? 0),
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
        // T-A1: stored per-set engine e1RM (0 when null, e.g. bodyweight)
        e1rm: best.e1rm ?? 0,
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
    performance: { prs, strength },
  };
}

// ---------------------------------------------------------------------------
// macro stats (M8) — Balance + Performance at macrocycle scope. Same views,
// same folds as the meso stats: v_meso_week_muscle_sets weighted through
// engine_params.volume + v_exercise_history first→last scores, concatenated
// across the macro's mesocycles.
// ---------------------------------------------------------------------------

export interface MacroStatsData {
  balance: MesoBalance;
  /** true when at least one materialized week exists to average over */
  hasVolume: boolean;
  strength: StrengthProgress;
}

export async function getMacroStats(
  supabase: Client,
  userId: string,
  macroId: string,
): Promise<MacroStatsData> {
  const { data: mesos, error: mesoError } = await supabase
    .from("mesocycles")
    .select("id, position, created_at")
    .eq("user_id", userId)
    .eq("macrocycle_id", macroId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at");
  if (mesoError) throw mesoError;
  const mesoIds = (mesos ?? []).map((m) => m.id);
  const empty: MacroStatsData = {
    balance: { push: 0, pull: 0, legs: 0, bars: [], note: "" },
    hasVolume: false,
    strength: { exercises: [], muscles: [] },
  };
  if (mesoIds.length === 0) return empty;

  const [
    { data: micros, error: microError },
    { data: weekMuscleSets, error: weekSetsError },
    scores,
    { params },
  ] = await Promise.all([
    supabase
      .from("microcycles")
      .select("id, mesocycle_id, week_number, is_deload, status")
      .eq("user_id", userId)
      .in("mesocycle_id", mesoIds)
      .order("week_number"),
    supabase
      .from("v_meso_week_muscle_sets")
      .select("*")
      .eq("user_id", userId)
      .in("mesocycle_id", mesoIds),
    getProgressScores(supabase, userId, mesoIds),
    getActiveEngineParams(supabase),
  ]);
  if (microError) throw microError;
  if (weekSetsError) throw weekSetsError;

  const weights = volumeCountingWeights(params);
  const strength = await buildStrengthProgress(supabase, scores, weights);

  // Concatenate materialized weeks across mesos (meso position order, then
  // week number) into one global week axis so the meso balance fold applies
  // unchanged. Unmaterialized future weeks are skipped — no cross-meso
  // projection; the macro average is honest to what exists.
  const mesoOrder = new Map(mesoIds.map((id, i) => [id, i]));
  const orderedMicros = [...(micros ?? [])].sort(
    (a, b) =>
      (mesoOrder.get(a.mesocycle_id) ?? 0) - (mesoOrder.get(b.mesocycle_id) ?? 0) ||
      a.week_number - b.week_number,
  );
  const globalWeekByMicro = new Map<string, number>();
  const weeks: MesoStatsWeek[] = orderedMicros.map((m, i) => {
    globalWeekByMicro.set(`${m.mesocycle_id}:${m.week_number}`, i + 1);
    return {
      week_number: i + 1,
      is_deload: m.is_deload,
      status: m.status,
    };
  });
  if (weeks.length === 0) return { ...empty, strength };

  const weekSets = weightWeekMuscleSets(weekMuscleSets ?? [], weights, (row) =>
    globalWeekByMicro.get(`${row.mesocycle_id}:${row.week_number}`),
  );
  const volume = buildVolumeMatrix(weeks, weekSets, []);
  const balance = buildBalance(volume, weeks, "across this macrocycle");
  return { balance, hasVolume: volume.groups.length > 0, strength };
}

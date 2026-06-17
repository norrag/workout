import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planMacrocycle,
  scoreProgress,
  type EngineParams,
  type MacroGoal,
  type MacroPlan,
  type MacroProfile,
  type PhaseName,
} from "@/lib/engine";
import type {
  Database,
  MacrocycleRow,
  MacroGoalType,
  MesocycleRow,
  ProfileRow,
  VMacroSummaryRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Map a stored profile onto the engine's pure macro-profile inputs. */
export function profileToMacroProfile(
  profile: ProfileRow,
  now: Date = new Date(),
): MacroProfile {
  let trainingYears: number | null = null;
  if (profile.training_since) {
    const since = new Date(`${profile.training_since}T12:00:00`);
    if (!Number.isNaN(since.getTime())) {
      trainingYears = Math.max(0, (now.getTime() - since.getTime()) / MS_PER_YEAR);
    }
  }
  return {
    sex: profile.gender ?? null,
    age: profile.age,
    bodyweight: profile.bodyweight,
    bodyweightUnit: profile.units,
    heightCm: profile.height_cm,
    experienceLevel: profile.experience_level,
    trainingYears,
    bodyFatPct: profile.body_fat_pct,
  };
}

/**
 * The realistic-target plan for a macro: the engine is re-run from the macro's
 * goal + chosen duration/block length + current profile. Live recompute keeps
 * the Overview honest when the profile changes; the macro's cached `target_*`
 * columns are only a fallback snapshot (fig 2.2).
 */
export function planForMacro(
  macro: Pick<
    MacrocycleRow,
    "goal_type" | "duration_months" | "meso_length_weeks"
  >,
  profile: ProfileRow,
  params: EngineParams,
  now: Date = new Date(),
): MacroPlan {
  return planMacrocycle(
    {
      goal: macro.goal_type as MacroGoal,
      profile: profileToMacroProfile(profile, now),
      durationMonths: macro.duration_months,
      mesoLengthWeeks: macro.meso_length_weeks,
    },
    params,
  );
}

const PHASE_LABEL: Record<PhaseName, string> = {
  accumulation: "ACCUMULATION",
  intensification: "INTENSIFICATION",
  peak: "PEAK",
};

export function phaseLabel(phase: string | null): string {
  return phase ? (PHASE_LABEL[phase as PhaseName] ?? phase.toUpperCase()) : "";
}

// ---------------------------------------------------------------------------
// create a macrocycle + its unplanned mesocycle placeholders (fig 2.3 engine)
// ---------------------------------------------------------------------------

export interface CreateMacroInput {
  name: string;
  goal_type: MacroGoalType;
  duration_months: number | null;
  meso_length_weeks: number;
  start_date: string;
  goal_notes: string | null;
}

export async function createMacrocycleWithMesos(
  supabase: Client,
  userId: string,
  input: CreateMacroInput,
  profile: ProfileRow,
  params: EngineParams,
  now: Date = new Date(),
): Promise<MacrocycleRow> {
  const plan = planForMacro(
    {
      goal_type: input.goal_type,
      duration_months: input.duration_months,
      meso_length_weeks: input.meso_length_weeks,
    },
    profile,
    params,
    now,
  );

  // target_end_date = start + chosen/recommended months
  const start = new Date(`${input.start_date}T12:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + plan.durationMonths);
  const targetEnd = end.toISOString().slice(0, 10);

  const { data: macro, error } = await supabase
    .from("macrocycles")
    .insert({
      user_id: userId,
      name: input.name,
      goal_type: input.goal_type,
      goal_notes: input.goal_notes,
      target_metrics: {},
      duration_months: plan.durationMonths,
      meso_length_weeks: input.meso_length_weeks,
      recommended_duration_months: plan.recommendedDurationMonths,
      target_low: plan.target.low,
      target_high: plan.target.high,
      target_unit: plan.target.unit,
      target_direction: plan.target.direction,
      rate_low: plan.perMonthRate.low,
      rate_high: plan.perMonthRate.high,
      start_date: input.start_date,
      target_end_date: targetEnd,
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;

  // pre-create the computed number of unplanned mesos with position + phase
  if (plan.mesoCount > 0) {
    const rows = plan.phases.map((phase, i) => ({
      user_id: userId,
      macrocycle_id: macro.id,
      position: i + 1,
      phase,
      name: `Mesocycle ${i + 1}`,
      weeks: input.meso_length_weeks,
      days_per_week: 1,
      includes_deload: true,
      rir_start: 3,
      rir_end: 0,
      status: "unplanned" as const,
      template_id: null,
      start_date: null,
    }));
    const { error: mesoError } = await supabase.from("mesocycles").insert(rows);
    if (mesoError) throw mesoError;
  }

  return macro;
}

export interface EditMacroInput {
  name: string;
  goal_type: MacroGoalType;
  duration_months: number | null;
  meso_length_weeks: number;
  goal_notes: string | null;
}

/**
 * How an edit will reconcile the macro's mesocycle slots — surfaced to the
 * edit form so the user knows what re-planning touches before they save.
 * Only `unplanned` placeholders are ever added, removed, or re-phased;
 * planned/active/completed mesos (and their logged history) are immutable.
 */
export interface MacroEditImpact {
  /** mesos that won't be touched (anything past `unplanned`) */
  lockedCount: number;
  /** unplanned placeholders currently on the macro */
  unplannedCount: number;
}

export function macroEditImpact(mesos: MesocycleRow[]): MacroEditImpact {
  let locked = 0;
  let unplanned = 0;
  for (const m of mesos) {
    if (m.status === "unplanned") unplanned += 1;
    else locked += 1;
  }
  return { lockedCount: locked, unplannedCount: unplanned };
}

export interface SlotReconcile {
  /** unplanned placeholder ids to delete (surplus, highest position first) */
  removeIds: string[];
  /** new unplanned placeholders to insert to reach the target count */
  addCount: number;
}

/**
 * Pure decision for reconciling a macro's mesocycle slots to a new plan size.
 * Locked mesos (anything past `unplanned`) are never removed, so the final
 * count can't drop below them; only unplanned placeholders are added/removed.
 * `mesos` must be in position order (lowest first) — surplus is trimmed from
 * the tail so the earliest open slots survive.
 */
export function reconcileMacroSlots(
  mesos: Pick<MesocycleRow, "id" | "status">[],
  mesoCount: number,
): SlotReconcile {
  const unplanned = mesos.filter((m) => m.status === "unplanned");
  const lockedCount = mesos.length - unplanned.length;
  const desiredUnplanned = Math.max(0, mesoCount - lockedCount);
  const removeIds = unplanned.slice(desiredUnplanned).map((m) => m.id);
  const addCount = Math.max(0, desiredUnplanned - unplanned.length);
  return { removeIds, addCount };
}

/** Matches the auto-generated placeholder name pattern ("Mesocycle" / "Mesocycle 4"). */
const AUTO_PLACEHOLDER_NAME = /^Mesocycle( \d+)?$/;

/**
 * Name an unplanned placeholder for its (1-based) position. Auto-generated names
 * are re-aligned so a re-sequence can't leave "Mesocycle 4" at slot 3 or two
 * "Mesocycle 5"s; user-renamed slots and planned/locked mesos keep their name.
 * Pure.
 */
export function placeholderName(name: string, status: string, position: number): string {
  const isAutoName = AUTO_PLACEHOLDER_NAME.test(name);
  return status === "unplanned" && isAutoName ? `Mesocycle ${position}` : name;
}

/**
 * Edit a macrocycle: rename, adjust goal/duration/block-length/notes, then
 * re-plan its **unplanned** mesocycle slots to the recomputed plan. Locked
 * mesos (planned/active/completed/abandoned) and every logged set are never
 * touched — only unplanned placeholders are added, removed, or re-phased, and
 * positions are re-sequenced to stay contiguous.
 */
export async function updateMacrocycle(
  supabase: Client,
  userId: string,
  macroId: string,
  input: EditMacroInput,
  profile: ProfileRow,
  params: EngineParams,
  now: Date = new Date(),
): Promise<void> {
  const { data: macro, error: macroErr } = await supabase
    .from("macrocycles")
    .select("*")
    .eq("id", macroId)
    .eq("user_id", userId)
    .maybeSingle();
  if (macroErr) throw macroErr;
  if (!macro) throw new Error("Macrocycle not found");

  const plan = planForMacro(
    {
      goal_type: input.goal_type,
      duration_months: input.duration_months,
      meso_length_weeks: input.meso_length_weeks,
    },
    profile,
    params,
    now,
  );

  // target_end_date = start + chosen/recommended months
  const start = new Date(`${macro.start_date}T12:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + plan.durationMonths);
  const targetEnd = end.toISOString().slice(0, 10);

  const { error: updErr } = await supabase
    .from("macrocycles")
    .update({
      name: input.name,
      goal_type: input.goal_type,
      goal_notes: input.goal_notes,
      duration_months: plan.durationMonths,
      meso_length_weeks: input.meso_length_weeks,
      recommended_duration_months: plan.recommendedDurationMonths,
      target_low: plan.target.low,
      target_high: plan.target.high,
      target_unit: plan.target.unit,
      target_direction: plan.target.direction,
      rate_low: plan.perMonthRate.low,
      rate_high: plan.perMonthRate.high,
      target_end_date: targetEnd,
    })
    .eq("id", macroId)
    .eq("user_id", userId);
  if (updErr) throw updErr;

  // --- reconcile the unplanned slots to the new plan ---
  const { data: mesos, error: mesoErr } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("macrocycle_id", macroId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at");
  if (mesoErr) throw mesoErr;

  const ordered = mesos ?? [];
  const { removeIds, addCount } = reconcileMacroSlots(ordered, plan.mesoCount);
  const removeSet = new Set(removeIds);
  const locked = ordered.filter((m) => m.status !== "unplanned");
  const keptUnplanned = ordered.filter(
    (m) => m.status === "unplanned" && !removeSet.has(m.id),
  );

  // drop the surplus unplanned placeholders (highest position first)
  if (removeIds.length > 0) {
    const { error } = await supabase
      .from("mesocycles")
      .delete()
      .in("id", removeIds)
      .eq("user_id", userId)
      .eq("status", "unplanned");
    if (error) throw error;
  }

  // add new unplanned placeholders to reach the desired count
  let added: MesocycleRow[] = [];
  if (addCount > 0) {
    const rows = Array.from({ length: addCount }, () => ({
      user_id: userId,
      macrocycle_id: macroId,
      // position/phase set in the re-sequence pass below
      position: null,
      phase: null,
      name: "Mesocycle",
      weeks: input.meso_length_weeks,
      days_per_week: 1,
      includes_deload: true,
      rir_start: 3,
      rir_end: 0,
      status: "unplanned" as const,
      template_id: null,
      start_date: null,
    }));
    const { data: ins, error } = await supabase
      .from("mesocycles")
      .insert(rows)
      .select();
    if (error) throw error;
    added = ins ?? [];
  }

  // re-sequence positions contiguously; re-phase + resize unplanned slots only
  const survivors = [...locked, ...keptUnplanned, ...added].sort((a, b) => {
    // locked + kept keep their relative order; new ones fall to the end
    const pa = a.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.position ?? Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });

  for (let i = 0; i < survivors.length; i++) {
    const m = survivors[i];
    const pos = i + 1;
    const isUnplanned = m.status === "unplanned";
    const phase = isUnplanned ? (plan.phases[i] ?? m.phase) : m.phase;
    const weeks = isUnplanned ? input.meso_length_weeks : m.weeks;
    const name = placeholderName(m.name, m.status, pos);
    if (
      m.position === pos &&
      m.phase === phase &&
      m.weeks === weeks &&
      m.name === name
    )
      continue;
    const { error } = await supabase
      .from("mesocycles")
      .update({ position: pos, phase, weeks, name })
      .eq("id", m.id)
      .eq("user_id", userId);
    if (error) throw error;
  }
}

/**
 * Flip an unplanned placeholder to `planned` so it can be filled on the board
 * (the macro's `+ PLAN` action). Weeks/RIR were seeded at macro creation.
 */
export async function planUnplannedMeso(
  supabase: Client,
  mesoId: string,
): Promise<void> {
  const { error } = await supabase
    .from("mesocycles")
    .update({ status: "planned" })
    .eq("id", mesoId)
    .eq("status", "unplanned");
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// macrocycle overview (fig 2.2) — macro + ordered mesos + plan + stats
// ---------------------------------------------------------------------------

export interface MacroStats {
  estStrengthPct: number | null;
  totalVolume: number;
  sessionsLogged: number;
  adherencePct: number | null;
}

export interface MacroOverview {
  macro: MacrocycleRow;
  mesos: MesocycleRow[];
  plan: MacroPlan;
  stats: MacroStats;
}

export async function getMacroOverview(
  supabase: Client,
  userId: string,
  macroId: string,
  profile: ProfileRow,
  params: EngineParams,
  now: Date = new Date(),
): Promise<MacroOverview | null> {
  const { data: macro, error } = await supabase
    .from("macrocycles")
    .select("*")
    .eq("id", macroId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!macro) return null;

  const [{ data: mesos, error: mesoError }, { data: summary, error: sumError }] =
    await Promise.all([
      supabase
        .from("mesocycles")
        .select("*")
        .eq("macrocycle_id", macroId)
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at"),
      supabase
        .from("v_macro_summary")
        .select("*")
        .eq("macrocycle_id", macroId)
        .maybeSingle(),
    ]);
  if (mesoError) throw mesoError;
  if (sumError) throw sumError;

  const stats = await buildMacroStats(
    supabase,
    userId,
    (mesos ?? []).map((m) => m.id),
    summary ?? null,
  );

  return {
    macro,
    mesos: mesos ?? [],
    plan: planForMacro(macro, profile, params, now),
    stats,
  };
}

/** Est. strength = mean e1RM trend on the macro's key lifts (by frequency). */
async function buildMacroStats(
  supabase: Client,
  userId: string,
  mesoIds: string[],
  summary: VMacroSummaryRow | null,
): Promise<MacroStats> {
  const totalVolume = summary?.total_volume ?? 0;
  const sessionsLogged = summary?.sessions_logged ?? 0;
  // adherence = attended / due over working (non-deload) weeks, counting only
  // decided days (completed|skipped); planned/in_progress and deload are excluded
  const adherencePct =
    summary && summary.sessions_due > 0
      ? Math.round((summary.sessions_attended / summary.sessions_due) * 100)
      : null;

  let estStrengthPct: number | null = null;
  if (mesoIds.length > 0) {
    const { data, error } = await supabase
      .from("v_exercise_history")
      .select("exercise_id, e1rm, working_sets, performed_on")
      .eq("user_id", userId)
      .in("mesocycle_id", mesoIds)
      .order("performed_on");
    if (error) throw error;

    const byExercise = new Map<
      string,
      { first: number | null; last: number | null; sessions: number }
    >();
    for (const row of data ?? []) {
      const cur = byExercise.get(row.exercise_id) ?? {
        first: null,
        last: null,
        sessions: 0,
      };
      cur.sessions += 1;
      if (row.e1rm != null) {
        if (cur.first == null) cur.first = row.e1rm;
        cur.last = row.e1rm;
      }
      byExercise.set(row.exercise_id, cur);
    }

    // key lifts = the three most-logged exercises (10 §7 frequency rule)
    const keyLifts = [...byExercise.entries()]
      .sort((a, b) => b[1].sessions - a[1].sessions)
      .slice(0, 3);
    const scores = keyLifts
      .map(([, v]) => scoreProgress(v.first, v.last))
      .filter((s): s is number => s != null);
    if (scores.length > 0) {
      estStrengthPct =
        Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    }
  }

  return { estStrengthPct, totalVolume, sessionsLogged, adherencePct };
}

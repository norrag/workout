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

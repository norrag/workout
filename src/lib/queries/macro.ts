import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planMacrocycle,
  type EngineParams,
  type MacroGoal,
  type MacroPlan,
  type MacroProfile,
  type PhaseName,
} from "@/lib/engine";
import { getMacroStrength } from "./stats";
import { profileAge } from "./profiles";
import type {
  Database,
  MacrocycleRow,
  MacroGoalType,
  MesocycleRow,
  MesoPhase,
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
    // birthdate-derived age preferred (doc 17 §2.5 — a static int goes stale
    // a year at a time); the legacy `age` int is the fallback until re-saved
    age: profileAge(profile, now),
    bodyweight: profile.bodyweight,
    heightIn: profile.height_in,
    experienceLevel: profile.experience_level,
    trainingYears,
    bodyFatPct: profile.body_fat_pct,
  };
}

/**
 * The §2.5 contract snapshot stamped into `macrocycles.plan_inputs` whenever
 * `target_*` is written: the resolved engine inputs + the params version the
 * plan ran under, so any contract can later be explained ("set when you were
 * 205 lb / 22% bf under v21"). Display-only provenance — no read path
 * depends on it in Phase 1.
 */
export type PlanInputsSnapshot = {
  profile: MacroProfile;
  params_version: number | null;
  stamped_at: string;
};

export function planInputsSnapshot(
  profile: MacroProfile,
  paramsVersion: number | null,
  now: Date,
): PlanInputsSnapshot {
  return {
    profile,
    params_version: paramsVersion,
    stamped_at: now.toISOString(),
  };
}

/**
 * Whether an edit re-contracts the macro's goals (doc 17 principle 3): only a
 * change to the plan inputs — goal, duration, block length — rewrites
 * `target_*`/`rate_*` and restamps `plan_inputs`. Rename/notes edits leave
 * the stored contract untouched (the live Overview recompute keeps display
 * honest; the contract moves only on a conscious re-contract). A null
 * duration is "let the engine recommend" — always a re-contract. Pure.
 */
export function isGoalsEdit(
  macro: Pick<
    MacrocycleRow,
    "goal_type" | "duration_months" | "meso_length_weeks"
  >,
  input: Pick<
    EditMacroInput,
    "goal_type" | "duration_months" | "meso_length_weeks"
  >,
): boolean {
  return (
    input.goal_type !== macro.goal_type ||
    input.meso_length_weeks !== macro.meso_length_weeks ||
    input.duration_months == null ||
    input.duration_months !== macro.duration_months
  );
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
  paramsVersion: number | null = null,
  now: Date = new Date(),
): Promise<MacrocycleRow> {
  const macroProfile = profileToMacroProfile(profile, now);
  const plan = planMacrocycle(
    {
      goal: input.goal_type as MacroGoal,
      profile: macroProfile,
      durationMonths: input.duration_months,
      mesoLengthWeeks: input.meso_length_weeks,
    },
    params,
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
      // §2.5 contract snapshot: the inputs this contract was priced from
      plan_inputs: planInputsSnapshot(macroProfile, paramsVersion, now),
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
  paramsVersion: number | null = null,
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

  // §2.5 / principle 3: the stored target is the CONTRACT — only a goals edit
  // (goal / duration / block length) re-prices and restamps it. A rename or
  // notes edit leaves target_*/rate_*/plan_inputs untouched (previously any
  // edit silently refreshed the contract from the current profile).
  if (!isGoalsEdit(macro, input)) {
    const { error: updErr } = await supabase
      .from("macrocycles")
      .update({ name: input.name, goal_notes: input.goal_notes })
      .eq("id", macroId)
      .eq("user_id", userId);
    if (updErr) throw updErr;
    return;
  }

  const macroProfile = profileToMacroProfile(profile, now);
  const plan = planMacrocycle(
    {
      goal: input.goal_type as MacroGoal,
      profile: macroProfile,
      durationMonths: input.duration_months,
      mesoLengthWeeks: input.meso_length_weeks,
    },
    params,
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
      // the re-contract restamps the §2.5 snapshot
      plan_inputs: planInputsSnapshot(macroProfile, paramsVersion, now),
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
// place a mesocycle into a macro slot & manage a macro's slots (MCP authoring,
// 05 §Write). The connector can author a plan into the macro timeline instead
// of only ever producing a standalone draft the human must place by hand.
// ---------------------------------------------------------------------------

export interface SlotMeso {
  id: string;
  status: MesocycleRow["status"];
  position: number | null;
  phase: MesoPhase | null;
}

export interface PlacementPlan {
  /** the position the placed meso lands in (1-based) */
  targetPosition: number;
  /** an unplanned placeholder whose slot the placed meso takes (deleted), or null */
  consumePlaceholderId: string | null;
  /** phase the placed meso inherits when it has none of its own */
  inheritedPhase: MesoPhase | null;
  /** final, contiguous positions for every meso on the macro incl. the placed one */
  resequence: { id: string; position: number }[];
}

/**
 * Pure: decide where a meso lands when placed into a macro and how the macro's
 * remaining mesos re-sequence. `existing` is the macro's current mesos EXCLUDING
 * the one being placed, in any order. With no requested position the meso fills
 * the earliest unplanned placeholder (or appends); a placeholder sitting exactly
 * at the target slot is consumed (deleted) and its phase inherited so the plan
 * matches the macro's intent for that slot. With a requested position that has
 * no placeholder, the meso is inserted and later mesos shift down (grow the macro).
 */
export function planMacroPlacement(
  existing: SlotMeso[],
  placedMesoId: string,
  placedPhase: MesoPhase | null,
  requestedPosition: number | null,
): PlacementPlan {
  const sorted = [...existing].sort(
    (a, b) => (a.position ?? 99) - (b.position ?? 99) || a.id.localeCompare(b.id),
  );
  const placeholders = sorted.filter((m) => m.status === "unplanned");

  const consume =
    requestedPosition != null
      ? (placeholders.find((m) => m.position === requestedPosition) ?? null)
      : (placeholders[0] ?? null);

  const remaining = sorted.filter((m) => m.id !== consume?.id);
  const target =
    requestedPosition != null
      ? Math.min(Math.max(1, requestedPosition), remaining.length + 1)
      : (consume?.position ?? remaining.length + 1);

  const ordered = remaining.map((m) => m.id);
  const insertAt = Math.min(target - 1, ordered.length);
  ordered.splice(insertAt, 0, placedMesoId);

  return {
    targetPosition: insertAt + 1,
    consumePlaceholderId: consume?.id ?? null,
    inheritedPhase: placedPhase ?? consume?.phase ?? null,
    resequence: ordered.map((id, i) => ({ id, position: i + 1 })),
  };
}

export interface AttachResult {
  ok: boolean;
  error?: string;
  position?: number;
  consumed_placeholder?: boolean;
}

/**
 * Attach an existing standalone `planned`/`draft` mesocycle into a macrocycle at
 * a chosen (or the next open) slot. A `draft` is finalized to `planned` on the
 * way in — it stays a review-and-approve plan, never auto-activated. Logged
 * history is untouchable: only a plan-only meso can be placed.
 */
export async function attachMesoToMacro(
  supabase: Client,
  userId: string,
  mesoId: string,
  macroId: string,
  requestedPosition: number | null,
): Promise<AttachResult> {
  const { data: meso, error: mesoErr } = await supabase
    .from("mesocycles")
    .select("id, status, phase, macrocycle_id")
    .eq("id", mesoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (mesoErr) throw mesoErr;
  if (!meso) return { ok: false, error: "Mesocycle not found." };
  if (meso.macrocycle_id)
    return {
      ok: false,
      error:
        "That mesocycle already belongs to a macrocycle — reorder it with manage_macrocycle_slots instead.",
    };
  if (meso.status !== "planned" && meso.status !== "draft")
    return {
      ok: false,
      error: `Only a planned or draft mesocycle can be placed into a macrocycle (this one is ${meso.status}).`,
    };

  const { data: macro, error: macroErr } = await supabase
    .from("macrocycles")
    .select("id")
    .eq("id", macroId)
    .eq("user_id", userId)
    .maybeSingle();
  if (macroErr) throw macroErr;
  if (!macro) return { ok: false, error: "Macrocycle not found." };

  const { data: siblings, error: sibErr } = await supabase
    .from("mesocycles")
    .select("id, status, position, phase")
    .eq("macrocycle_id", macroId)
    .eq("user_id", userId);
  if (sibErr) throw sibErr;

  const plan = planMacroPlacement(
    (siblings ?? []) as SlotMeso[],
    mesoId,
    meso.phase,
    requestedPosition,
  );

  if (plan.consumePlaceholderId) {
    const { error } = await supabase
      .from("mesocycles")
      .delete()
      .eq("id", plan.consumePlaceholderId)
      .eq("user_id", userId)
      .eq("status", "unplanned");
    if (error) throw error;
  }

  const { error: attachErr } = await supabase
    .from("mesocycles")
    .update({
      macrocycle_id: macroId,
      position: plan.targetPosition,
      phase: plan.inheritedPhase,
      status: "planned",
    })
    .eq("id", mesoId)
    .eq("user_id", userId);
  if (attachErr) throw attachErr;

  await applyResequence(supabase, userId, plan.resequence);

  return {
    ok: true,
    position: plan.targetPosition,
    consumed_placeholder: plan.consumePlaceholderId != null,
  };
}

/** Rewrite each meso's `position`, re-aligning auto-generated placeholder names. */
async function applyResequence(
  supabase: Client,
  userId: string,
  resequence: { id: string; position: number }[],
): Promise<void> {
  if (resequence.length === 0) return;
  const { data: rows, error } = await supabase
    .from("mesocycles")
    .select("id, name, status")
    .in(
      "id",
      resequence.map((r) => r.id),
    )
    .eq("user_id", userId);
  if (error) throw error;
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  for (const r of resequence) {
    const row = byId.get(r.id);
    if (!row) continue;
    const name = placeholderName(row.name, row.status, r.position);
    const { error: updErr } = await supabase
      .from("mesocycles")
      .update({ position: r.position, name })
      .eq("id", r.id)
      .eq("user_id", userId);
    if (updErr) throw updErr;
  }
}

export type MacroSlotAction =
  | { action: "add" }
  | { action: "remove"; mesocycle_id: string }
  | { action: "reorder"; ordered_ids: string[] };

export interface SlotActionResult {
  ok: boolean;
  error?: string;
  summary?: string;
}

/**
 * Add, remove, or reorder a macrocycle's mesocycle slots. Only unplanned
 * placeholders can be added or removed; reorder rewrites every slot's position
 * from the given full ordering. Planned/active/completed mesos and their logged
 * history are never destroyed — a remove targeting one is refused.
 */
export async function manageMacroSlots(
  supabase: Client,
  userId: string,
  macroId: string,
  op: MacroSlotAction,
  mesoLengthWeeks: number,
): Promise<SlotActionResult> {
  const { data: macro, error: macroErr } = await supabase
    .from("macrocycles")
    .select("id")
    .eq("id", macroId)
    .eq("user_id", userId)
    .maybeSingle();
  if (macroErr) throw macroErr;
  if (!macro) return { ok: false, error: "Macrocycle not found." };

  const { data: mesos, error: mesoErr } = await supabase
    .from("mesocycles")
    .select("id, status, position, phase, name")
    .eq("macrocycle_id", macroId)
    .eq("user_id", userId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at");
  if (mesoErr) throw mesoErr;
  const ordered = mesos ?? [];

  if (op.action === "add") {
    const nextPos = Math.max(0, ...ordered.map((m) => m.position ?? 0)) + 1;
    const { error } = await supabase.from("mesocycles").insert({
      user_id: userId,
      macrocycle_id: macroId,
      position: nextPos,
      phase: null,
      name: `Mesocycle ${nextPos}`,
      weeks: mesoLengthWeeks,
      days_per_week: 1,
      includes_deload: true,
      rir_start: 3,
      rir_end: 0,
      status: "unplanned" as const,
      template_id: null,
      start_date: null,
    });
    if (error) throw error;
    return { ok: true, summary: `added an unplanned slot at position ${nextPos}` };
  }

  if (op.action === "remove") {
    const target = ordered.find((m) => m.id === op.mesocycle_id);
    if (!target) return { ok: false, error: "That slot is not in this macrocycle." };
    if (target.status !== "unplanned")
      return {
        ok: false,
        error: `Only an unplanned placeholder can be removed (this one is ${target.status}). Delete a planned meso with delete_mesocycle, or leave started/completed history alone.`,
      };
    const { error } = await supabase
      .from("mesocycles")
      .delete()
      .eq("id", op.mesocycle_id)
      .eq("user_id", userId)
      .eq("status", "unplanned");
    if (error) throw error;
    await applyResequence(
      supabase,
      userId,
      ordered
        .filter((m) => m.id !== op.mesocycle_id)
        .map((m, i) => ({ id: m.id, position: i + 1 })),
    );
    return { ok: true, summary: "removed an unplanned slot" };
  }

  // reorder
  const currentIds = new Set(ordered.map((m) => m.id));
  const wanted = op.ordered_ids;
  if (
    wanted.length !== ordered.length ||
    !wanted.every((id) => currentIds.has(id)) ||
    new Set(wanted).size !== wanted.length
  )
    return {
      ok: false,
      error: `reorder must list each of this macrocycle's ${ordered.length} slot id(s) exactly once.`,
    };
  await applyResequence(
    supabase,
    userId,
    wanted.map((id, i) => ({ id, position: i + 1 })),
  );
  return { ok: true, summary: "reordered the macrocycle slots" };
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
    params,
  );

  return {
    macro,
    mesos: mesos ?? [],
    plan: planForMacro(macro, profile, params, now),
    stats,
  };
}

// ---------------------------------------------------------------------------
// delete a macrocycle (MCP undo for create_macrocycle, §5.8). Deleting a macro
// cascades to its mesocycles (FK on delete cascade) and would in turn destroy
// any logged history under them — so this is refused whenever the macro holds
// logged sets or an active/completed meso. Only an all-placeholder/planned
// macro with no logged work is deletable (the fat-fingered create the review
// asked to be able to undo). RLS `macrocycles_all_own` covers the delete.
// ---------------------------------------------------------------------------

export interface MacroDeletionImpact {
  found: boolean;
  loggedSets: number;
  hasHistory: boolean;
  mesoCount: number;
  /** mesos that block deletion because they hold real training, not just plans */
  blockingMesos: { id: string; name: string; status: string }[];
}

export async function getMacroDeletionImpact(
  supabase: Client,
  userId: string,
  macroId: string,
): Promise<MacroDeletionImpact> {
  const { data: macro, error: macroError } = await supabase
    .from("macrocycles")
    .select("id")
    .eq("id", macroId)
    .eq("user_id", userId)
    .maybeSingle();
  if (macroError) throw macroError;
  if (!macro)
    return { found: false, loggedSets: 0, hasHistory: false, mesoCount: 0, blockingMesos: [] };

  const [{ data: mesos, error: mesoError }, { count, error: setError }] = await Promise.all([
    supabase.from("mesocycles").select("id, name, status").eq("macrocycle_id", macroId),
    supabase
      .from("logged_sets")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("macrocycle_id", macroId),
  ]);
  if (mesoError) throw mesoError;
  if (setError) throw setError;

  const loggedSets = count ?? 0;
  const blockingMesos = (mesos ?? [])
    .filter((m) => m.status === "active" || m.status === "completed")
    .map((m) => ({ id: m.id, name: m.name, status: m.status }));
  return {
    found: true,
    loggedSets,
    hasHistory: loggedSets > 0,
    mesoCount: (mesos ?? []).length,
    blockingMesos,
  };
}

export async function deleteMacrocycle(
  supabase: Client,
  userId: string,
  macroId: string,
): Promise<void> {
  const { error } = await supabase
    .from("macrocycles")
    .delete()
    .eq("id", macroId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Est. strength = volume-weighted mean of the macro's muscle-group e1RM
 *  changes, rolled up from every qualifying lift (10 §6). */
async function buildMacroStats(
  supabase: Client,
  userId: string,
  mesoIds: string[],
  summary: VMacroSummaryRow | null,
  params: EngineParams,
): Promise<MacroStats> {
  const totalVolume = summary?.total_volume ?? 0;
  const sessionsLogged = summary?.sessions_logged ?? 0;
  // adherence = attended / due over working (non-deload) weeks, counting only
  // decided days (completed|skipped); planned/in_progress and deload are excluded
  const adherencePct =
    summary && summary.sessions_due > 0
      ? Math.round((summary.sessions_attended / summary.sessions_due) * 100)
      : null;

  // N16: one definition with the Performance tab. `getMacroStrength` folds the
  // SAME deload-filtered, ≥3-session, recent-vs-baseline lift scores up through
  // the muscle rollup and volume-weights them — so the Overview tile and the
  // Performance tab render the identical number. (The old path here meaned the
  // top-3 most-logged lifts, a separate calculation that could and did disagree
  // with the tab.)
  const { estStrengthPct } = await getMacroStrength(
    supabase,
    userId,
    mesoIds,
    params,
  );

  return { estStrengthPct, totalVolume, sessionsLogged, adherencePct };
}

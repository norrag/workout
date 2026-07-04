"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  addDayGroups,
  addMesoDay,
  clearSlot,
  copyMesoStructure,
  createDraftMeso,
  deleteMesocycle,
  duplicateMesocycle,
  finalizeDraftMeso,
  removeDayGroup,
  removeMesoDay,
  reorderDayExercises,
  reorderDayGroups,
  saveMesoPlan,
  setGroupExercises,
  updateDayGroup,
  updateMesoExerciseSets,
  updateMesoDay,
  updateMesocycleAttrs,
} from "@/lib/queries/cycles";
import type { MesoDayRow } from "@/lib/types/database";
import {
  attachMesoToMacro,
  createMacrocycleWithMesos,
  manageMacroSlots,
  planUnplannedMeso,
  updateMacrocycle,
} from "@/lib/queries/macro";
import {
  getActiveEngineParams,
  regenerateOpenWorkouts,
  startMeso,
} from "@/lib/queries/generation";
import { getProfile } from "@/lib/queries/profiles";
import {
  applyTemplateToMeso,
  saveMesoAsTemplate,
} from "@/lib/queries/templates";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

export interface FormState {
  error: string | null;
}

// ---------------------------------------------------------------------------
// macrocycle creation — the engine (fig 2.3): goal + duration + block length →
// realistic target + the right number of unplanned, phased mesocycles
// ---------------------------------------------------------------------------

const macroSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  goal_type: z.enum(["hypertrophy", "strength", "cut", "maintain"]),
  // null ⇒ use the engine's recommended timeframe
  duration_months: z.coerce.number().int().min(1).max(60).nullable(),
  meso_length_weeks: z.coerce.number().int().min(4).max(6),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goal_notes: z.string().max(280).nullable(),
});

export async function createMacrocycleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawDuration = formData.get("duration_months");
  const parsed = macroSchema.safeParse({
    name: formData.get("name"),
    goal_type: formData.get("goal_type"),
    duration_months: rawDuration ? rawDuration : null,
    meso_length_weeks: formData.get("meso_length_weeks"),
    start_date: formData.get("start_date"),
    goal_notes: formData.get("goal_notes") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");
  const { params } = await getActiveEngineParams(supabase);

  await createMacrocycleWithMesos(supabase, user.id, parsed.data, profile, params);
  revalidatePath("/cycles");
  redirect("/cycles");
}

const editMacroSchema = z.object({
  macro_id: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(80),
  goal_type: z.enum(["hypertrophy", "strength", "cut", "maintain"]),
  duration_months: z.coerce.number().int().min(1).max(60).nullable(),
  meso_length_weeks: z.coerce.number().int().min(4).max(6),
  goal_notes: z.string().max(280).nullable(),
});

/** Edit an existing macrocycle (rename · goal · duration · notes · re-plan). */
export async function editMacrocycleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawDuration = formData.get("duration_months");
  const parsed = editMacroSchema.safeParse({
    macro_id: formData.get("macro_id"),
    name: formData.get("name"),
    goal_type: formData.get("goal_type"),
    duration_months: rawDuration ? rawDuration : null,
    meso_length_weeks: formData.get("meso_length_weeks"),
    goal_notes: formData.get("goal_notes") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");
  const { params } = await getActiveEngineParams(supabase);

  const { macro_id, ...input } = parsed.data;
  await updateMacrocycle(supabase, user.id, macro_id, input, profile, params);
  revalidatePath("/cycles");
  revalidatePath(`/cycles/macro/${macro_id}`);
  redirect(`/cycles/macro/${macro_id}`);
}

/** `+ PLAN` on an unplanned placeholder (figs 2.1/2.2) → planner board. */
export async function planMesoAction(formData: FormData): Promise<void> {
  const mesoId = z.string().uuid().parse(formData.get("meso_id"));
  const { supabase } = await requireUser();
  await planUnplannedMeso(supabase, mesoId);
  revalidatePath("/cycles");
  redirect(`/cycles/meso/${mesoId}/plan`);
}

// ---------------------------------------------------------------------------
// plan-a-meso (fig 2.4) — every path creates a DRAFT and drops the user onto
// the planner board; "create mesocycle" (name + weeks) is the final stage
// (finalizeMesoAction). One draft at a time: createDraftMeso clears any
// existing draft first (the entry UI surfaces "continue editing" beforehand).
// ---------------------------------------------------------------------------

/** From scratch → a blank draft. */
export async function startScratchDraftAction(): Promise<void> {
  const { supabase, user } = await requireUser();
  const meso = await createDraftMeso(supabase, user.id);
  revalidatePath("/cycles");
  redirect(`/cycles/meso/${meso.id}/plan`);
}

/** From a template → a draft prefilled with the template's structure. */
export async function startTemplateDraftAction(formData: FormData): Promise<void> {
  const templateId = z.string().uuid().parse(formData.get("template_id"));
  const { supabase, user } = await requireUser();
  const { data: template } = await supabase
    .from("templates")
    .select("name")
    .eq("id", templateId)
    .maybeSingle();
  const meso = await createDraftMeso(supabase, user.id, {
    name: template?.name ?? "",
  });
  await applyTemplateToMeso(supabase, user.id, meso.id, templateId);
  revalidatePath("/cycles");
  redirect(`/cycles/meso/${meso.id}/plan`);
}

/** Copy a meso → a draft prefilled from a source meso's structure + settings. */
export async function startCopyDraftAction(formData: FormData): Promise<void> {
  const sourceId = z.string().uuid().parse(formData.get("source_meso_id"));
  const { supabase, user } = await requireUser();
  const { data: source } = await supabase
    .from("mesocycles")
    .select("name, weeks, includes_deload, rir_start, rir_end")
    .eq("id", sourceId)
    .maybeSingle();
  const meso = await createDraftMeso(supabase, user.id, {
    name: source ? `${source.name} II` : "",
    weeks: source?.weeks,
    includes_deload: source?.includes_deload,
    rir_start: source?.rir_start,
    rir_end: source?.rir_end,
  });
  await copyMesoStructure(supabase, user.id, sourceId, meso.id);
  revalidatePath("/cycles");
  redirect(`/cycles/meso/${meso.id}/plan`);
}

const finalizeSchema = z
  .object({
    meso_id: z.string().uuid(),
    name: z.string().min(1, "Name is required").max(80),
    weeks: z.coerce.number().int().min(3).max(8),
    // N18-A: the sheet's collapsed ADVANCED disclosure — optional create-time
    // RIR ramp + deload override (same bounds as the edit-details sheet)
    rir_start: z.coerce.number().int().min(0).max(5).optional(),
    rir_end: z.coerce.number().int().min(0).max(5).optional(),
    includes_deload: z.enum(["true", "false"]).optional(),
  })
  .refine(
    (v) =>
      v.rir_start === undefined ||
      v.rir_end === undefined ||
      v.rir_start >= v.rir_end,
    { message: "The RIR ramp must descend (start ≥ end)." },
  );

/** Create-mesocycle final stage — name the draft + confirm weeks → planned. */
export async function finalizeMesoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = Object.fromEntries(
    ["meso_id", "name", "weeks", "rir_start", "rir_end", "includes_deload"]
      .map((k) => [k, formData.get(k)])
      .filter(([, v]) => v != null),
  );
  const parsed = finalizeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { supabase, user } = await requireUser();
  await finalizeDraftMeso(supabase, user.id, parsed.data.meso_id, {
    name: parsed.data.name,
    weeks: parsed.data.weeks,
    rir_start: parsed.data.rir_start,
    rir_end: parsed.data.rir_end,
    includes_deload:
      parsed.data.includes_deload === undefined
        ? undefined
        : parsed.data.includes_deload === "true",
  });
  revalidatePath("/cycles");
  redirect(`/cycles/meso/${parsed.data.meso_id}`);
}

// ---------------------------------------------------------------------------
// save meso as template (07 Phase 5) — template_day_groups round-trip
// ---------------------------------------------------------------------------

export async function saveMesoAsTemplateAction(
  formData: FormData,
): Promise<void> {
  const mesoId = z.string().uuid().parse(formData.get("meso_id"));
  const { supabase, user } = await requireUser();
  const { template, error } = await saveMesoAsTemplate(supabase, user.id, mesoId);
  if (error || !template) {
    redirect(`/cycles/meso/${mesoId}?error=template`);
  }
  revalidatePath("/templates");
  redirect(`/templates/${template.id}`);
}

// ---------------------------------------------------------------------------
// planner board (figs 2.4/2.5/2.6)
// ---------------------------------------------------------------------------

const dayInputSchema = z.object({
  meso_id: z.string().uuid(),
  label: z.string().max(40).nullable(),
  weekday: z.coerce.number().int().min(1).max(7).nullable(),
});

export async function addDayAction(input: {
  meso_id: string;
  label: string | null;
  weekday: number | null;
}): Promise<MesoDayRow> {
  const parsed = dayInputSchema.parse(input);
  const { supabase, user } = await requireUser();
  const day = await addMesoDay(supabase, user.id, parsed.meso_id, {
    label: parsed.label,
    weekday: parsed.weekday,
  });
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
  return day;
}

const dayPatchSchema = z.object({
  day_id: z.string().uuid(),
  meso_id: z.string().uuid(),
  label: z.string().max(40).nullable(),
  weekday: z.coerce.number().int().min(1).max(7).nullable(),
});

export async function updateDayAction(input: {
  day_id: string;
  meso_id: string;
  label: string | null;
  weekday: number | null;
}): Promise<void> {
  const parsed = dayPatchSchema.parse(input);
  const { supabase } = await requireUser();
  await updateMesoDay(supabase, parsed.day_id, {
    label: parsed.label,
    weekday: parsed.weekday,
  });
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

export async function removeDayAction(input: {
  day_id: string;
  meso_id: string;
}): Promise<void> {
  const parsed = z
    .object({ day_id: z.string().uuid(), meso_id: z.string().uuid() })
    .parse(input);
  const { supabase } = await requireUser();
  await removeMesoDay(supabase, parsed.day_id, parsed.meso_id);
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

const groupsAddSchema = z.object({
  day_id: z.string().uuid(),
  meso_id: z.string().uuid(),
  muscle_group_ids: z.array(z.string().uuid()).min(1).max(20),
});

/** Add several muscle groups to a day at once (fig 2.6b "ADD N GROUPS"). */
export async function addGroupsAction(input: {
  day_id: string;
  meso_id: string;
  muscle_group_ids: string[];
}): Promise<void> {
  const parsed = groupsAddSchema.parse(input);
  const { supabase } = await requireUser();
  await addDayGroups(supabase, parsed.day_id, parsed.muscle_group_ids);
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

const setGroupExercisesSchema = z.object({
  meso_id: z.string().uuid(),
  group_id: z.string().uuid(),
  exercise_ids: z.array(z.string().uuid()).max(20),
});

/** Set a group's exercises from the fig 2.7 multi-select picker. */
export async function setGroupExercisesAction(input: {
  meso_id: string;
  group_id: string;
  exercise_ids: string[];
}): Promise<void> {
  const parsed = setGroupExercisesSchema.parse(input);
  const { supabase } = await requireUser();
  await setGroupExercises(supabase, {
    mesocycle_id: parsed.meso_id,
    meso_day_group_id: parsed.group_id,
    exercise_ids: parsed.exercise_ids,
  });
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

export async function updateGroupAction(input: {
  group_id: string;
  meso_id: string;
  exercise_slots: number;
}): Promise<void> {
  const parsed = z
    .object({
      group_id: z.string().uuid(),
      meso_id: z.string().uuid(),
      exercise_slots: z.coerce.number().int().min(1).max(10),
    })
    .parse(input);
  const { supabase } = await requireUser();
  await updateDayGroup(supabase, parsed.group_id, {
    exercise_slots: parsed.exercise_slots,
  });
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

/** N17: live (draft) write of one planned exercise's starting set count. */
export async function updateFillSetsAction(input: {
  fill_id: string;
  meso_id: string;
  initial_sets: number;
}): Promise<void> {
  const parsed = z
    .object({
      fill_id: z.string().uuid(),
      meso_id: z.string().uuid(),
      // matches the meso_exercises initial_sets 1–20 check constraint
      initial_sets: z.coerce.number().int().min(1).max(20),
    })
    .parse(input);
  const { supabase } = await requireUser();
  await updateMesoExerciseSets(supabase, parsed.fill_id, parsed.initial_sets);
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

export async function removeGroupAction(input: {
  group_id: string;
  meso_id: string;
}): Promise<void> {
  const parsed = z
    .object({ group_id: z.string().uuid(), meso_id: z.string().uuid() })
    .parse(input);
  const { supabase } = await requireUser();
  await removeDayGroup(supabase, parsed.group_id);
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

const reorderGroupsSchema = z.object({
  meso_id: z.string().uuid(),
  day_id: z.string().uuid(),
  ordered_group_ids: z.array(z.string().uuid()).min(1).max(20),
});

/** Live (draft) reorder of a day's muscle groups (fig 2.5). */
export async function reorderDayGroupsAction(input: {
  meso_id: string;
  day_id: string;
  ordered_group_ids: string[];
}): Promise<void> {
  const parsed = reorderGroupsSchema.parse(input);
  const { supabase } = await requireUser();
  await reorderDayGroups(supabase, parsed.day_id, parsed.ordered_group_ids);
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

const reorderDayExercisesSchema = z.object({
  meso_id: z.string().uuid(),
  day_id: z.string().uuid(),
  ordered_fill_ids: z.array(z.string().uuid()).min(1).max(70),
});

/** Live (draft) reorder of a day's exercises across all groups (#2 flat list). */
export async function reorderDayExercisesAction(input: {
  meso_id: string;
  day_id: string;
  ordered_fill_ids: string[];
}): Promise<void> {
  const parsed = reorderDayExercisesSchema.parse(input);
  const { supabase } = await requireUser();
  await reorderDayExercises(supabase, parsed.ordered_fill_ids);
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

// ---------------------------------------------------------------------------
// staged plan save (fig 2.5): editing a non-draft meso stages changes locally;
// SAVE CHANGES commits the whole plan in one write. For an active meso, open
// (not-yet-started) workouts are regenerated to match — logged history and
// started/completed workouts are never touched.
// ---------------------------------------------------------------------------

const planSaveSchema = z.object({
  meso_id: z.string().uuid(),
  days: z
    .array(
      z.object({
        // a week is 7 days (DB checks: day_number ≤ 7, days_per_week ≤ 7)
        day_number: z.number().int().min(1).max(7),
        label: z.string().max(40).nullable(),
        weekday: z.number().int().min(1).max(7).nullable(),
        groups: z.array(
          z.object({
            muscle_group_id: z.string().uuid(),
            exercise_slots: z.number().int().min(1).max(10),
            fills: z.array(
              z.object({
                slot_number: z.number().int().min(1).max(10),
                exercise_id: z.string().uuid(),
                initial_sets: z.number().int().min(1).max(10),
                day_position: z.number().int().min(1).max(70),
              }),
            ),
          }),
        ),
      }),
    )
    .max(7),
});

export async function saveMesoPlanAction(input: {
  meso_id: string;
  days: {
    day_number: number;
    label: string | null;
    weekday: number | null;
    groups: {
      muscle_group_id: string;
      exercise_slots: number;
      fills: {
        slot_number: number;
        exercise_id: string;
        initial_sets: number;
        day_position: number;
      }[];
    }[];
  }[];
}): Promise<void> {
  const parsed = planSaveSchema.parse(input);
  const { supabase, user } = await requireUser();

  await saveMesoPlan(supabase, user.id, parsed.meso_id, parsed.days);

  const { data: meso } = await supabase
    .from("mesocycles")
    .select("status")
    .eq("id", parsed.meso_id)
    .single();
  if (meso?.status === "active") {
    const profile = await getProfile(supabase, user.id);
    if (profile) {
      await regenerateOpenWorkouts(supabase, user.id, parsed.meso_id, profile);
    }
  }

  revalidatePath("/cycles");
  revalidatePath(`/cycles/meso/${parsed.meso_id}`);
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
  revalidatePath("/workout");
  redirect(`/cycles/meso/${parsed.meso_id}`);
}

export async function clearSlotAction(input: {
  meso_id: string;
  meso_exercise_id: string;
}): Promise<void> {
  const parsed = z
    .object({ meso_id: z.string().uuid(), meso_exercise_id: z.string().uuid() })
    .parse(input);
  const { supabase } = await requireUser();
  await clearSlot(supabase, parsed.meso_exercise_id);
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

// ---------------------------------------------------------------------------
// meso activation — microcycles + week-1 workouts (07 Phase 2)
// ---------------------------------------------------------------------------

export async function startMesoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const mesoId = z.string().uuid().parse(formData.get("meso_id"));
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");

  const { error } = await startMeso(supabase, user.id, mesoId, profile);
  if (error) return { error };
  revalidatePath("/cycles");
  revalidatePath(`/cycles/meso/${mesoId}`);
  redirect("/workout");
}

/**
 * Place a standalone planned/draft meso into a macrocycle (I12): fills the
 * earliest unplanned placeholder (consuming it and inheriting its phase) or
 * appends after the last block — the same default `attachMesoToMacro` gives
 * the MCP tool. Lands on the macro's timeline so the placement is visible.
 */
export async function placeMesoAction(input: {
  meso_id: string;
  macro_id: string;
}): Promise<FormState> {
  const parsed = z
    .object({ meso_id: z.string().uuid(), macro_id: z.string().uuid() })
    .parse(input);
  const { supabase, user } = await requireUser();
  const result = await attachMesoToMacro(
    supabase,
    user.id,
    parsed.meso_id,
    parsed.macro_id,
    null,
  );
  if (!result.ok)
    return { error: result.error ?? "Couldn't place the mesocycle." };
  revalidatePath("/cycles");
  revalidatePath(`/cycles/meso/${parsed.meso_id}`);
  revalidatePath(`/cycles/macro/${parsed.macro_id}`);
  redirect(`/cycles/macro/${parsed.macro_id}`);
}

const slotOpSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add") }),
  z.object({ action: z.literal("remove"), mesocycle_id: z.string().uuid() }),
  z.object({
    action: z.literal("reorder"),
    ordered_ids: z.array(z.string().uuid()).min(1).max(50),
  }),
]);

/**
 * Direct block management on a macrocycle (I12): add an unplanned placeholder,
 * remove one (planned/started blocks are refused by the helper), or reorder
 * the timeline. Applies immediately — not staged with the edit form's re-plan.
 */
export async function manageMacroSlotsAction(input: {
  macro_id: string;
  op:
    | { action: "add" }
    | { action: "remove"; mesocycle_id: string }
    | { action: "reorder"; ordered_ids: string[] };
}): Promise<FormState> {
  const parsed = z
    .object({ macro_id: z.string().uuid(), op: slotOpSchema })
    .parse(input);
  const { supabase, user } = await requireUser();
  // meso_length_weeks resolves server-side — a new placeholder inherits the
  // macro's block length, never a client-supplied number
  const { data: macro, error: macroErr } = await supabase
    .from("macrocycles")
    .select("meso_length_weeks")
    .eq("id", parsed.macro_id)
    .maybeSingle();
  if (macroErr) throw macroErr;
  if (!macro) return { error: "Macrocycle not found." };
  const result = await manageMacroSlots(
    supabase,
    user.id,
    parsed.macro_id,
    parsed.op,
    macro.meso_length_weeks,
  );
  if (!result.ok) return { error: result.error ?? "Couldn't update the blocks." };
  revalidatePath("/cycles");
  revalidatePath(`/cycles/macro/${parsed.macro_id}`);
  revalidatePath(`/cycles/macro/${parsed.macro_id}/edit`);
  return { error: null };
}

const mesoDetailsSchema = z
  .object({
    meso_id: z.string().uuid(),
    name: z.string().min(1, "Name is required").max(80),
    // shape fields ride only while the meso hasn't started (the sheet omits
    // them once locked; updateMesocycleAttrs re-checks server-side)
    weeks: z.coerce.number().int().min(3).max(8).optional(),
    includes_deload: z.enum(["true", "false"]).optional(),
    rir_start: z.coerce.number().int().min(0).max(5).optional(),
    rir_end: z.coerce.number().int().min(0).max(5).optional(),
  })
  .refine(
    (v) =>
      v.rir_start === undefined ||
      v.rir_end === undefined ||
      v.rir_start >= v.rir_end,
    { message: "The RIR ramp must descend (start ≥ end)." },
  );

/** The edit-details sheet closes itself on `saved` (no redirect — it edits in
 *  place on the meso page and the revalidation refreshes the header). */
export interface MesoDetailsState {
  error: string | null;
  saved?: boolean;
}

/** Edit the meso header in place (I12): name any time before completion;
 *  weeks / RIR ramp / deload only before the meso starts. */
export async function updateMesoDetailsAction(
  _prev: MesoDetailsState,
  formData: FormData,
): Promise<MesoDetailsState> {
  const raw = Object.fromEntries(
    ["meso_id", "name", "weeks", "includes_deload", "rir_start", "rir_end"]
      .map((k) => [k, formData.get(k)])
      .filter(([, v]) => v != null),
  );
  const parsed = mesoDetailsSchema.safeParse(raw);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { supabase, user } = await requireUser();
  const result = await updateMesocycleAttrs(supabase, user.id, parsed.data.meso_id, {
    name: parsed.data.name,
    weeks: parsed.data.weeks,
    includes_deload:
      parsed.data.includes_deload === undefined
        ? undefined
        : parsed.data.includes_deload === "true",
    rir_start: parsed.data.rir_start,
    rir_end: parsed.data.rir_end,
  });
  if (!result.ok) return { error: result.error ?? "Couldn't save the changes." };
  revalidatePath("/cycles");
  revalidatePath(`/cycles/meso/${parsed.data.meso_id}`);
  return { error: null, saved: true };
}

/**
 * Duplicate a mesocycle (I12): settings + planner board copied into a fresh
 * standalone `planned` meso (no loads — the engine reseeds on activation).
 * Lands on the new meso's page.
 */
export async function duplicateMesoAction(formData: FormData): Promise<void> {
  const mesoId = z.string().uuid().parse(formData.get("meso_id"));
  const { supabase, user } = await requireUser();
  const { meso, error } = await duplicateMesocycle(supabase, user.id, mesoId);
  if (error || !meso) redirect(`/cycles/meso/${mesoId}?error=duplicate`);
  revalidatePath("/cycles");
  redirect(`/cycles/meso/${meso.id}`);
}

// ---------------------------------------------------------------------------
// delete a mesocycle — destructive; cascades remove logged history. The UI
// confirms (with a stronger warning when the meso has logged sets).
// ---------------------------------------------------------------------------

export async function deleteMesoAction(formData: FormData): Promise<void> {
  const mesoId = z.string().uuid().parse(formData.get("meso_id"));
  const { supabase, user } = await requireUser();
  await deleteMesocycle(supabase, user.id, mesoId);
  revalidatePath("/cycles");
  redirect("/cycles");
}

/**
 * Discard the in-progress draft (the one-at-a-time build). Only deletes a meso
 * still in `draft` status, so it can never remove a planned/active cycle or any
 * logged history. Lands back on the plan-a-meso entry.
 */
export async function discardDraftAction(formData: FormData): Promise<void> {
  const mesoId = z.string().uuid().parse(formData.get("meso_id"));
  const { supabase, user } = await requireUser();
  const { data: meso } = await supabase
    .from("mesocycles")
    .select("status")
    .eq("id", mesoId)
    .maybeSingle();
  if (meso?.status === "draft") {
    await deleteMesocycle(supabase, user.id, mesoId);
  }
  revalidatePath("/cycles");
  redirect("/cycles/plan");
}

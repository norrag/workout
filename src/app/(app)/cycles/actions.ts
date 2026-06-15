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
  finalizeDraftMeso,
  removeDayGroup,
  removeMesoDay,
  saveMesoPlan,
  setGroupExercises,
  updateDayGroup,
  updateMesoDay,
} from "@/lib/queries/cycles";
import type { MesoDayRow } from "@/lib/types/database";
import {
  createMacrocycleWithMesos,
  planUnplannedMeso,
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

const finalizeSchema = z.object({
  meso_id: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(80),
  weeks: z.coerce.number().int().min(3).max(8),
});

/** Create-mesocycle final stage — name the draft + confirm weeks → planned. */
export async function finalizeMesoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = finalizeSchema.safeParse({
    meso_id: formData.get("meso_id"),
    name: formData.get("name"),
    weeks: formData.get("weeks"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { supabase, user } = await requireUser();
  await finalizeDraftMeso(supabase, user.id, parsed.data.meso_id, {
    name: parsed.data.name,
    weeks: parsed.data.weeks,
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
        day_number: z.number().int().min(1).max(14),
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
              }),
            ),
          }),
        ),
      }),
    )
    .max(14),
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
      fills: { slot_number: number; exercise_id: string; initial_sets: number }[];
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  addDayGroup,
  addMesoDay,
  clearSlot,
  copyMesoStructure,
  createMesocycle,
  fillSlot,
  removeDayGroup,
  removeMesoDay,
  updateDayGroup,
  updateMesoDay,
} from "@/lib/queries/cycles";
import {
  createMacrocycleWithMesos,
  planUnplannedMeso,
} from "@/lib/queries/macro";
import { getActiveEngineParams, startMeso } from "@/lib/queries/generation";
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
// standalone meso creation (fig 2.4 from-scratch / template) — weeks, RIR ramp
// ---------------------------------------------------------------------------

const mesoSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  weeks: z.coerce.number().int().min(3).max(8),
  includes_deload: z.boolean(),
  rir_start: z.coerce.number().int().min(0).max(5),
  rir_end: z.coerce.number().int().min(0).max(5),
  template_id: z.string().uuid().nullable(),
  copy_meso_id: z.string().uuid().nullable(),
});

export async function createMesocycleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = mesoSchema.safeParse({
    name: formData.get("name"),
    weeks: formData.get("weeks"),
    includes_deload: formData.get("includes_deload") === "true",
    rir_start: formData.get("rir_start"),
    rir_end: formData.get("rir_end"),
    template_id: formData.get("template_id") || null,
    copy_meso_id: formData.get("copy_meso_id") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  if (parsed.data.rir_end > parsed.data.rir_start) {
    return { error: "RIR must ramp downward." };
  }

  const { supabase, user } = await requireUser();
  const { copy_meso_id, ...mesoInput } = parsed.data;
  const meso = await createMesocycle(supabase, user.id, mesoInput);
  if (mesoInput.template_id) {
    await applyTemplateToMeso(supabase, user.id, meso.id, mesoInput.template_id);
  } else if (copy_meso_id) {
    await copyMesoStructure(supabase, user.id, copy_meso_id, meso.id);
  }
  revalidatePath("/cycles");
  redirect(`/cycles/meso/${meso.id}/plan`);
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
}): Promise<void> {
  const parsed = dayInputSchema.parse(input);
  const { supabase, user } = await requireUser();
  await addMesoDay(supabase, user.id, parsed.meso_id, {
    label: parsed.label,
    weekday: parsed.weekday,
  });
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
}

const dayPatchSchema = z.object({
  day_id: z.string().uuid(),
  meso_id: z.string().uuid(),
  label: z.string().max(40).nullable(),
  weekday: z.coerce.number().int().min(1).max(7).nullable(),
  week_starts_here: z.boolean().optional(),
});

export async function updateDayAction(input: {
  day_id: string;
  meso_id: string;
  label: string | null;
  weekday: number | null;
  week_starts_here?: boolean;
}): Promise<void> {
  const parsed = dayPatchSchema.parse(input);
  const { supabase, user } = await requireUser();
  await updateMesoDay(supabase, parsed.day_id, {
    label: parsed.label,
    weekday: parsed.weekday,
  });
  // "week starts on this day" (fig 2.5) writes the profile-level setting
  if (parsed.week_starts_here && parsed.weekday) {
    const { error } = await supabase
      .from("profiles")
      .update({ week_starts_on: parsed.weekday })
      .eq("id", user.id);
    if (error) throw error;
  }
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

const groupAddSchema = z.object({
  day_id: z.string().uuid(),
  meso_id: z.string().uuid(),
  muscle_group_id: z.string().uuid(),
  exercise_slots: z.coerce.number().int().min(1).max(10),
});

export async function addGroupAction(input: {
  day_id: string;
  meso_id: string;
  muscle_group_id: string;
  exercise_slots: number;
}): Promise<void> {
  const parsed = groupAddSchema.parse(input);
  const { supabase } = await requireUser();
  await addDayGroup(
    supabase,
    parsed.day_id,
    parsed.muscle_group_id,
    parsed.exercise_slots,
  );
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

const fillSchema = z.object({
  meso_id: z.string().uuid(),
  group_id: z.string().uuid(),
  slot_number: z.coerce.number().int().min(1).max(10),
  exercise_id: z.string().uuid(),
  initial_sets: z.coerce.number().int().min(1).max(10),
});

export async function fillSlotAction(input: {
  meso_id: string;
  group_id: string;
  slot_number: number;
  exercise_id: string;
  initial_sets: number;
}): Promise<void> {
  const parsed = fillSchema.parse(input);
  const { supabase } = await requireUser();
  await fillSlot(supabase, {
    mesocycle_id: parsed.meso_id,
    meso_day_group_id: parsed.group_id,
    slot_number: parsed.slot_number,
    exercise_id: parsed.exercise_id,
    initial_sets: parsed.initial_sets,
  });
  revalidatePath(`/cycles/meso/${parsed.meso_id}/plan`);
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

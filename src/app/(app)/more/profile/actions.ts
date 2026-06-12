"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/queries/profiles";
import { addExclusion, removeExclusion } from "@/lib/queries/exercises";

const detailsSchema = z.object({
  display_name: z.string().min(1, "Name is required").max(60),
  age: z.coerce.number().int().min(13).max(120).nullable(),
  height_cm: z.coerce.number().min(90).max(250).nullable(),
  bodyweight: z.coerce.number().positive().max(1000).nullable(),
  training_since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

const experienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
const equipmentSchema = z.array(
  z.enum([
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "smith",
    "bodyweight",
    "bands",
    "kettlebell",
  ]),
);

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

function revalidate() {
  revalidatePath("/more");
  revalidatePath("/more/profile");
}

export interface ProfileFormState {
  error: string | null;
  saved: boolean;
}

export async function saveProfileDetails(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = detailsSchema.safeParse({
    display_name: formData.get("display_name"),
    age: formData.get("age") || null,
    height_cm: formData.get("height_cm") || null,
    bodyweight: formData.get("bodyweight") || null,
    training_since: formData.get("training_since") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, saved: false };
  }

  const { supabase, user } = await requireUser();
  const bodyweightChanged = formData.get("bodyweight_changed") === "true";
  await updateProfile(supabase, user.id, {
    ...parsed.data,
    ...(bodyweightChanged && parsed.data.bodyweight
      ? { bodyweight_updated_at: new Date().toISOString() }
      : {}),
  });
  revalidate();
  return { error: null, saved: true };
}

export async function setExperience(level: string): Promise<void> {
  const parsed = experienceSchema.parse(level);
  const { supabase, user } = await requireUser();
  await updateProfile(supabase, user.id, { experience_level: parsed });
  revalidate();
}

export async function setEquipment(values: string[]): Promise<void> {
  const parsed = equipmentSchema.parse(values);
  const { supabase, user } = await requireUser();
  await updateProfile(supabase, user.id, { preferred_equipment: parsed });
  revalidate();
}

const exclusionSchema = z.object({
  exercise_id: z.string().uuid(),
  reason: z.string().max(40).nullable(),
});

export async function addExclusionAction(
  exerciseId: string,
  reason: string | null,
): Promise<void> {
  const parsed = exclusionSchema.parse({
    exercise_id: exerciseId,
    reason: reason || null,
  });
  const { supabase, user } = await requireUser();
  await addExclusion(supabase, user.id, parsed.exercise_id, parsed.reason);
  revalidate();
}

export async function removeExclusionAction(exclusionId: string): Promise<void> {
  const parsed = z.string().uuid().parse(exclusionId);
  const { supabase, user } = await requireUser();
  await removeExclusion(supabase, user.id, parsed);
  revalidate();
}

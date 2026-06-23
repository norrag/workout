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
  height_in: z.coerce.number().min(36).max(96).nullable(),
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
    height_in: formData.get("height_in") || null,
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

const fieldSchemas = {
  display_name: z.string().min(1).max(60),
  age: z.coerce.number().int().min(13).max(120),
  height_in: z.coerce.number().min(36).max(96),
  bodyweight: z.coerce.number().positive().max(1000),
  training_since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body_fat_pct: z.coerce.number().min(2).max(70),
} as const;

export async function updateProfileField(
  field: keyof typeof fieldSchemas,
  value: string,
): Promise<{ error: string | null }> {
  const schema = fieldSchemas[field];
  if (!schema) return { error: "Unknown field." };
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, user } = await requireUser();
  await updateProfile(supabase, user.id, {
    [field]: parsed.data,
    ...(field === "bodyweight"
      ? { bodyweight_updated_at: new Date().toISOString() }
      : {}),
  });
  revalidate();
  return { error: null };
}

export async function clearBodyFatAction(): Promise<void> {
  const { supabase, user } = await requireUser();
  await updateProfile(supabase, user.id, { body_fat_pct: null });
  revalidate();
}

export async function setExperience(level: string): Promise<void> {
  const parsed = experienceSchema.parse(level);
  const { supabase, user } = await requireUser();
  await updateProfile(supabase, user.id, { experience_level: parsed });
  revalidate();
}

const genderSchema = z.enum(["female", "male", "other", "undisclosed"]);

export async function setGender(value: string): Promise<void> {
  const parsed = genderSchema.parse(value);
  const { supabase, user } = await requireUser();
  await updateProfile(supabase, user.id, { gender: parsed });
  revalidate();
}

const EQUIPMENT_VALUES = new Set([
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "smith",
  "bodyweight",
  "bands",
  "kettlebell",
]);

export async function setEquipment(values: string[]): Promise<void> {
  // Filter to the canonical vocabulary first so a stale legacy value carried in
  // from older data (e.g. "free_weights") can't fail the parse / crash the page.
  const parsed = equipmentSchema.parse(
    values.filter((v) => EQUIPMENT_VALUES.has(v)),
  );
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

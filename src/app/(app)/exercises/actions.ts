"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createCustomExercise } from "@/lib/queries/exercises";

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

const customExerciseSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  equipment_type: z.enum([
    "dumbbell",
    "barbell",
    "machine",
    "cable",
    "smith",
    "bodyweight",
    "bands",
    "kettlebell",
    "other",
  ]),
  primary_muscle_group_id: z.string().uuid("Pick a primary muscle group"),
  secondary_muscle_group_ids: z.array(z.string().uuid()).max(4),
  description: z.string().max(500).nullable(),
  notes: z.string().max(500).nullable(),
});

export async function createCustomExerciseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let secondary: unknown;
  try {
    secondary = JSON.parse(String(formData.get("secondary") ?? "[]"));
  } catch {
    return { error: "Invalid muscle groups." };
  }
  const parsed = customExerciseSchema.safeParse({
    name: formData.get("name"),
    equipment_type: formData.get("equipment_type"),
    primary_muscle_group_id: formData.get("primary_muscle_group_id"),
    secondary_muscle_group_ids: secondary,
    description: String(formData.get("description") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { supabase, user } = await requireUser();
  const exercise = await createCustomExercise(supabase, user.id, {
    name: parsed.data.name,
    equipment_type: parsed.data.equipment_type,
    description: parsed.data.description,
    notes: parsed.data.notes,
    muscle_groups: [
      {
        muscle_group_id: parsed.data.primary_muscle_group_id,
        role: "primary" as const,
      },
      ...parsed.data.secondary_muscle_group_ids
        .filter((id) => id !== parsed.data.primary_muscle_group_id)
        .map((id) => ({ muscle_group_id: id, role: "secondary" as const })),
    ],
  });
  revalidatePath("/exercises");
  redirect(`/exercises/${exercise.id}`);
}

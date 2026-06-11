"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createCustomExercise } from "@/lib/queries/exercises";
import { equipmentTypes } from "@/lib/engine/params";

const exerciseSchema = z.object({
  name: z.string().min(1).max(80),
  equipment_type: z.enum(equipmentTypes),
  primary_muscle_group_id: z.string().uuid(),
  secondary_muscle_group_id: z.string().uuid().nullable(),
  notes: z.string().max(500).nullable(),
});

export interface ExerciseFormState {
  error: string | null;
}

export async function createExerciseAction(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const parsed = exerciseSchema.safeParse({
    name: formData.get("name"),
    equipment_type: formData.get("equipment_type"),
    primary_muscle_group_id: formData.get("primary_muscle_group_id"),
    secondary_muscle_group_id:
      formData.get("secondary_muscle_group_id") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const input = parsed.data;
  if (input.secondary_muscle_group_id === input.primary_muscle_group_id) {
    return { error: "Secondary muscle must differ from primary" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await createCustomExercise(supabase, user.id, {
    name: input.name,
    equipment_type: input.equipment_type,
    notes: input.notes,
    muscle_groups: [
      { muscle_group_id: input.primary_muscle_group_id, role: "primary" },
      ...(input.secondary_muscle_group_id
        ? [
            {
              muscle_group_id: input.secondary_muscle_group_id,
              role: "secondary" as const,
            },
          ]
        : []),
    ],
  });
  revalidatePath("/exercises");
  return { error: null };
}

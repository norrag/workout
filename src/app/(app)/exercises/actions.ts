"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createCustomExercise } from "@/lib/queries/exercises";
import { customExerciseEquipment } from "@/lib/types/equipment";
import { clearPinnedNote, savePinnedNote } from "@/lib/queries/logging";
import {
  clearExerciseIncrementOverride,
  setExerciseIncrementOverride,
} from "@/lib/queries/exercise-overrides";

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

const pinnedNoteSchema = z.object({
  exercise_id: z.string().uuid(),
  body: z.string().max(500).nullable(),
});

/** Edit the exercise's pinned note from the Exercise page (09 §8 parity with
 * the Day View pencil). An empty body unpins it. */
export async function setPinnedNoteAction(input: {
  exercise_id: string;
  body: string | null;
}): Promise<void> {
  const parsed = pinnedNoteSchema.parse(input);
  const { supabase, user } = await requireUser();
  const body = parsed.body?.trim() || null;
  if (body) await savePinnedNote(supabase, user.id, parsed.exercise_id, body);
  else await clearPinnedNote(supabase, user.id, parsed.exercise_id);
  revalidatePath(`/exercises/${parsed.exercise_id}`);
}

const incrementOverrideSchema = z.object({
  exercise_id: z.string().uuid(),
  // the per-set load step in the user's units; null clears the override (default).
  // capped well above any sane plate jump so a fat-fingered value can't poison the
  // engine; the engine clamps/rounds regardless.
  weight_increment: z.number().positive().max(1000).nullable(),
});

/**
 * Set or clear this user's editable weight increment for one exercise (doc 14
 * phase 3). The new value differs from the fingerprint the stored prescriptions
 * carry, so the read-path reconcile recomputes exactly this exercise's open rows
 * on the next view — no eager invalidation needed. Revalidates the exercise page
 * and the workout surface where prescriptions are shown.
 */
export async function setIncrementOverrideAction(input: {
  exercise_id: string;
  weight_increment: number | null;
}): Promise<void> {
  const parsed = incrementOverrideSchema.parse(input);
  const { supabase, user } = await requireUser();
  if (parsed.weight_increment == null) {
    await clearExerciseIncrementOverride(supabase, user.id, parsed.exercise_id);
  } else {
    await setExerciseIncrementOverride(
      supabase,
      user.id,
      parsed.exercise_id,
      parsed.weight_increment,
    );
  }
  revalidatePath(`/exercises/${parsed.exercise_id}`);
  revalidatePath("/workout");
  // also bust the cached day-view pages (the Workout tab now lands on a
  // `/log/[id]` via the last-viewed pointer); with the client Router Cache on,
  // this keeps an override edit from reading stale on return there (WS-J).
  revalidatePath("/log/[workoutId]", "page");
}

const customExerciseSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  // the create vocabulary replaces bare "bodyweight" with the three load-typed
  // labels so the exercise's load_type derives honestly on insert (R12)
  equipment_type: z.enum(customExerciseEquipment),
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

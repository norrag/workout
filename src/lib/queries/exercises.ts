import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  EquipmentType,
  ExerciseRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export interface ExerciseWithMuscles extends ExerciseRow {
  muscles: { id: string; name: string; role: "primary" | "secondary" }[];
}

/** Stock + own custom exercises (RLS enforces visibility). */
export async function listExercises(
  supabase: Client,
  opts: { search?: string; equipment?: EquipmentType } = {},
): Promise<ExerciseWithMuscles[]> {
  let query = supabase.from("exercises").select("*").order("name");
  if (opts.search) query = query.ilike("name", `%${opts.search}%`);
  if (opts.equipment) query = query.eq("equipment_type", opts.equipment);
  const { data: exercises, error } = await query;
  if (error) throw error;
  if (!exercises || exercises.length === 0) return [];

  const ids = exercises.map((e) => e.id);
  const [{ data: links, error: linkError }, { data: groups, error: mgError }] =
    await Promise.all([
      supabase
        .from("exercise_muscle_groups")
        .select("*")
        .in("exercise_id", ids),
      supabase.from("muscle_groups").select("*"),
    ]);
  if (linkError) throw linkError;
  if (mgError) throw mgError;

  const groupById = new Map((groups ?? []).map((g) => [g.id, g.name]));
  return exercises.map((e) => ({
    ...e,
    muscles: (links ?? [])
      .filter((l) => l.exercise_id === e.id)
      .map((l) => ({
        id: l.muscle_group_id,
        name: groupById.get(l.muscle_group_id) ?? "",
        role: l.role,
      })),
  }));
}

export async function createCustomExercise(
  supabase: Client,
  userId: string,
  input: {
    name: string;
    equipment_type: EquipmentType;
    notes?: string | null;
    muscle_groups: { muscle_group_id: string; role: "primary" | "secondary" }[];
  },
): Promise<ExerciseRow> {
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      user_id: userId,
      name: input.name,
      equipment_type: input.equipment_type,
      notes: input.notes ?? null,
      video_url: null,
      source_exercise_id: null,
    })
    .select()
    .single();
  if (error) throw error;

  if (input.muscle_groups.length > 0) {
    const { error: mgError } = await supabase
      .from("exercise_muscle_groups")
      .insert(
        input.muscle_groups.map((mg) => ({
          exercise_id: data.id,
          muscle_group_id: mg.muscle_group_id,
          role: mg.role,
        })),
      );
    if (mgError) throw mgError;
  }
  return data;
}

export async function listMuscleGroups(supabase: Client) {
  const { data, error } = await supabase
    .from("muscle_groups")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

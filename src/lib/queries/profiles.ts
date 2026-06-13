import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export async function getProfile(
  supabase: Client,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  supabase: Client,
  userId: string,
  patch: Partial<
    Pick<
      ProfileRow,
      | "display_name"
      | "age"
      | "gender"
      | "height_cm"
      | "bodyweight"
      | "bodyweight_updated_at"
      | "training_since"
      | "experience_level"
      | "preferred_equipment"
      | "units"
      | "week_starts_on"
      | "onboarded_at"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);
  if (error) throw error;
}

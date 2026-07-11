import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * The profile's current age: derived from `birthdate` when present (doc 17
 * §2.5 — always fresh), falling back to the legacy static `age` int. Pure.
 */
export function profileAge(
  profile: Pick<ProfileRow, "age" | "birthdate">,
  now: Date = new Date(),
): number | null {
  if (profile.birthdate) {
    const born = new Date(`${profile.birthdate}T12:00:00`);
    if (!Number.isNaN(born.getTime())) {
      const years = (now.getTime() - born.getTime()) / MS_PER_YEAR;
      if (years > 0) return Math.floor(years);
    }
  }
  return profile.age;
}

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
      | "birthdate"
      | "gender"
      | "height_in"
      | "bodyweight"
      | "bodyweight_updated_at"
      | "body_fat_pct"
      | "body_fat_source"
      | "training_since"
      | "experience_level"
      | "preferred_equipment"
      | "week_starts_on"
      | "auto_match_weights"
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

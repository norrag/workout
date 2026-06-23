"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/queries/profiles";

const unitsSchema = z.enum(["lb", "kg"]);

export async function setUnits(units: string): Promise<void> {
  const parsed = unitsSchema.parse(units);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Switching unit converts every stored weight the user owns (bodyweight,
  // logged history, prescriptions, macro targets, increment overrides) and
  // re-tags logged sets — a no-op beyond the setting when already on `parsed`.
  const { error } = await supabase.rpc("convert_my_weights", {
    to_unit: parsed,
  });
  if (error) throw error;
  revalidatePath("/more");
  revalidatePath("/more/profile");
}

export async function setAutoMatchWeights(enabled: boolean): Promise<void> {
  const parsed = z.boolean().parse(enabled);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await updateProfile(supabase, user.id, { auto_match_weights: parsed });
  revalidatePath("/more");
}

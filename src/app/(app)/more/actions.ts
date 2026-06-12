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

  await updateProfile(supabase, user.id, { units: parsed });
  revalidatePath("/more");
  revalidatePath("/more/profile");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/queries/profiles";

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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createMacrocycle } from "@/lib/queries/cycles";

const macroSchema = z.object({
  name: z.string().min(1).max(80),
  goal_type: z.enum(["cut", "gain", "maintain"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  target_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export interface MacroFormState {
  error: string | null;
}

export async function createMacrocycleAction(
  _prev: MacroFormState,
  formData: FormData,
): Promise<MacroFormState> {
  const parsed = macroSchema.safeParse({
    name: formData.get("name"),
    goal_type: formData.get("goal_type"),
    start_date: formData.get("start_date"),
    target_end_date: formData.get("target_end_date") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await createMacrocycle(supabase, user.id, parsed.data);
  revalidatePath("/cycles");
  return { error: null };
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/queries/profiles";

const onboardingSchema = z.object({
  display_name: z.string().min(1, "Name is required").max(60),
  age: z.coerce.number().int().min(13).max(120),
  gender: z.enum(["female", "male", "other", "undisclosed"]).default("undisclosed"),
  height_in: z.coerce.number().min(36).max(96).nullable(),
  bodyweight: z.coerce.number().positive().max(1000).nullable(),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
  preferred_equipment: z.array(z.string()).default([]),
});

export interface OnboardingState {
  error: string | null;
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse({
    display_name: formData.get("display_name"),
    age: formData.get("age"),
    gender: formData.get("gender") || "undisclosed",
    height_in: formData.get("height_in") || null,
    bodyweight: formData.get("bodyweight") || null,
    experience_level: formData.get("experience_level"),
    preferred_equipment: formData.getAll("preferred_equipment"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await updateProfile(supabase, user.id, {
    ...parsed.data,
    bodyweight_updated_at: parsed.data.bodyweight
      ? new Date().toISOString()
      : null,
    onboarded_at: new Date().toISOString(),
  });

  // land on Cycles with the create-macro empty state (08 §4)
  redirect("/cycles");
}

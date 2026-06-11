"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/queries/profiles";

const onboardingSchema = z.object({
  display_name: z.string().min(1).max(60),
  age: z.coerce.number().int().min(13).max(120),
  gender: z.enum(["female", "male", "other", "undisclosed"]),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
  units: z.enum(["kg", "lb"]),
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
    gender: formData.get("gender"),
    experience_level: formData.get("experience_level"),
    units: formData.get("units"),
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
    onboarded_at: new Date().toISOString(),
  });

  redirect("/today");
}

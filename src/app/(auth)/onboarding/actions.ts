"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/queries/profiles";
import { appendBodyweightPoint } from "@/lib/queries/bodyweight";
import { setLastSeenVersion } from "@/lib/queries/releases";
import { CURRENT_VERSION } from "@/content/releases";
import { localDayIso } from "@/lib/dates";

// birthdate replaces the static age int (doc 17 §2.5) — age is derived fresh
// at plan time from this, so it never goes stale a year at a time
const birthdateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Birthdate is required")
  .refine((s) => {
    const born = new Date(`${s}T12:00:00`).getTime();
    if (Number.isNaN(born)) return false;
    const years = (Date.now() - born) / (365.25 * 24 * 60 * 60 * 1000);
    return years >= 13 && years <= 120;
  }, "Enter a valid birthdate (13+)");

const onboardingSchema = z.object({
  display_name: z.string().min(1, "Name is required").max(60),
  birthdate: birthdateSchema,
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
    birthdate: formData.get("birthdate"),
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

  // doc 23 §6.2 (T3): a new account's history with the app starts now. Priming
  // last-seen alongside `onboarded_at` is what stops every signup from being
  // greeted by a changelog of releases that predate it.
  await setLastSeenVersion(supabase, user.id, CURRENT_VERSION);

  // doc 17 §5: onboarding's bodyweight is the series' first measured point
  if (parsed.data.bodyweight != null)
    await appendBodyweightPoint(supabase, user.id, {
      measuredOn: localDayIso(),
      weight: parsed.data.bodyweight,
      source: "profile",
    });

  // land on Cycles with the create-macro empty state (08 §4)
  redirect("/cycles");
}

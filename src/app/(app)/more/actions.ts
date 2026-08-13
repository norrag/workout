"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/queries/profiles";
import { appendBodyweightPoint } from "@/lib/queries/bodyweight";
import { setLastSeenVersion } from "@/lib/queries/releases";
import { displayVersion } from "@/lib/version";
import { localDayIso } from "@/lib/dates";

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

const logBodyweightSchema = z.object({
  weight: z.coerce.number().positive().max(1000),
  measured_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date")
    .refine((s) => !Number.isNaN(new Date(`${s}T12:00:00`).getTime()), {
      message: "Enter a date",
    }),
});

/**
 * doc 17 §5 / 09-changelog 2026-07-11 §1 — the More-page quick entry: append
 * a `source:'manual'` measured point (backdating allowed; same-day re-entry
 * replaces that day's manual point). Deliberately NEVER writes
 * `profiles.bodyweight` — the profile scalar stays the engine/profile input,
 * edited only through the profile paths.
 */
export async function logBodyweightAction(input: {
  weight: number;
  measured_on: string;
}): Promise<{ error: string | null }> {
  const parsed = logBodyweightSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // measurements are records of the past, never the future
  if (parsed.data.measured_on > localDayIso())
    return { error: "That date hasn't happened yet." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await appendBodyweightPoint(supabase, user.id, {
    measuredOn: parsed.data.measured_on,
    weight: parsed.data.weight,
    source: "manual",
  });
  revalidatePath("/more");
  return { error: null };
}

/**
 * doc 23 §6.3 — acknowledgment is an explicit action, never a render side
 * effect. Dismissing the What's New modal, or tapping one of its links, calls
 * this; a user who force-quits over an unacknowledged modal sees it again,
 * which is the correct failure direction.
 *
 * The same action primes a `null` last-seen (§6.2 belt and braces): an account
 * created before the column existed, or by a path that skips onboarding, is
 * caught up silently on its first app navigation rather than being shown a
 * changelog it has no history with.
 */
export async function acknowledgeReleases(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // The displayed version, not the highest pending release: a user who skipped
  // 1.1 and 1.2 clears both. Off production this includes the explicit preview
  // override, so dismissal can be tested without registering an unreleased
  // block. Monotonic — `setLastSeenVersion` never lowers it.
  await setLastSeenVersion(supabase, user.id, displayVersion());
}

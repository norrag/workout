"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { syncBodySpec } from "@/lib/bodyspec/sync";
import { disconnectBodySpec } from "@/lib/queries/external-connections";
import { deleteAllBodyScans } from "@/lib/queries/body-scans";

/** On-demand pull (doc 15 §2.3 — no polling; scans arrive a few times a
 *  year). Outcome is stamped on the connection row; the screen re-reads it. */
export async function syncBodySpecAction(): Promise<{
  error: string | null;
  imported: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const outcome = await syncBodySpec(supabase, user.id);
  revalidatePath("/more/bodyspec");
  revalidatePath("/more");
  return { error: outcome.error, imported: outcome.imported };
}

const disconnectSchema = z.object({ purgeScans: z.boolean() });

/**
 * Disconnect (doc 15 §2.3): tokens are always destroyed (best-effort
 * provider-side revocation, then the deny-all secrets row cascades with the
 * connection row); imported scans are purged only when the user asked —
 * third-party health data is theirs to remove. Logged training history is
 * never touched.
 */
export async function disconnectBodySpecAction(input: {
  purgeScans: boolean;
}): Promise<{ error: string | null }> {
  const parsed = disconnectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await disconnectBodySpec(supabase, user.id);
  if (parsed.data.purgeScans) await deleteAllBodyScans(supabase, user.id);
  revalidatePath("/more/bodyspec");
  revalidatePath("/more");
  return { error: null };
}

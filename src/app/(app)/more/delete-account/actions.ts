"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Permanently delete the signed-in user's account (07 Phase 7, data lifecycle).
 *
 * Every user-owned table FK-cascades from `auth.users` (verified against the
 * live schema), so removing the auth user removes all their data in one step.
 * Identity is server-derived — the service client is scoped to the caller's own
 * id only (hard rule #4), never an argument.
 */
export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;

  // Clear the now-orphaned session cookies, then land on sign-in.
  await supabase.auth.signOut();
  redirect("/sign-in");
}

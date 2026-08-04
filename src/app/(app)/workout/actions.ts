"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  catchUpMesoGeneration,
  catchUpProgression,
} from "@/lib/queries/progression";
import { reportError } from "@/lib/observability/report";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

const retrySchema = z.object({ meso_id: z.string().uuid() });

/**
 * User-triggered retry of week generation (N74).
 *
 * The per-completion advance and the read-path catch-up are both wrapped in
 * degrade-gracefully catches, so a persistent failure in either leaves an
 * active mesocycle with no active week and no next workout — a state the user
 * cannot leave by any action in the app. Before this existed the Workout tab
 * simply said "next week's targets generate when the engine runs" forever.
 *
 * Runs the same two idempotent jobs the read path runs, in the same order:
 * fill any closed day whose next-week counterpart is missing, then advance off
 * the last completed week if no week is active. Unlike the read path this one
 * reports its outcome, because the user asked for it and is waiting on it.
 */
export async function retryWeekGenerationAction(input: {
  meso_id: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const { meso_id } = retrySchema.parse(input);
  const { user } = await requireUser();

  try {
    const service = createServiceClient();
    // both are idempotent and safe to run together: the gap-heal reuses the
    // same advance job, and a day already generated is a no-op on its turn
    await catchUpMesoGeneration(service, user.id, meso_id);
    await catchUpProgression(service, user.id, meso_id);
  } catch (error) {
    // schema drift re-scopes itself in the funnel (N74) — this is exactly the
    // call path that was failing silently for two days
    await reportError("actions:retry-week-generation", error, {
      userId: user.id,
      mesoId: meso_id,
    });
    return {
      ok: false,
      error:
        "Couldn't build next week. This is a problem on our side, not something you can fix by retrying — it has been reported.",
    };
  }

  revalidatePath("/workout");
  return { ok: true, error: null };
}

import { notFound, redirect } from "next/navigation";
import { getRequestAuth } from "@/lib/supabase/server";
import { getWorkoutDetail } from "@/lib/queries/logging";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { ensureFreshPrescriptions } from "@/lib/queries/regeneration";
import { DayView } from "./DayView";

/** Deep link to a specific workout's day view (fig 1.1). */
export default async function LogWorkoutPage({
  params,
}: {
  params: Promise<{ workoutId: string }>;
}) {
  const { workoutId } = await params;
  const { supabase, user } = await getRequestAuth();
  if (!user) redirect("/sign-in");

  const [initialDetail, active] = await Promise.all([
    getWorkoutDetail(supabase, user.id, workoutId),
    getActiveEngineParams(supabase),
  ]);
  const engineParams = active.params;
  let detail = initialDetail;
  if (!detail) notFound();

  // keep prescriptions fresh on EVERY surface that shows them, not just the
  // Workout tab (doc 14 §5/§10): bring this meso's not-yet-started rows in line
  // with the user's current inputs (engine params, profile, macro goal, meso
  // config, an exercise increment override) before rendering, then re-read if the
  // recompute actually moved anything. A bypassed/un-logged planned day reached by
  // deep link is refreshed here exactly as it would be from the Workout tab.
  const fresh = await ensureFreshPrescriptions(
    user.id,
    detail.mesocycle.id,
    active,
  );
  if (fresh && (fresh.generated > 0 || fresh.refreshed > 0)) {
    detail = await getWorkoutDetail(supabase, user.id, workoutId);
    if (!detail) notFound();
  }

  // P17 (owner 2026-07-02, option 2): no back button here — the day navigator
  // lives inside the Workout tab, so selecting a day isn't a "page" change.
  return (
    <div>
      <DayView detail={detail} params={engineParams} />
    </div>
  );
}

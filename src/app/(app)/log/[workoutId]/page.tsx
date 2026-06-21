import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkoutDetail } from "@/lib/queries/logging";
import { getProfile } from "@/lib/queries/profiles";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [initialDetail, profile, { params: engineParams }] = await Promise.all([
    getWorkoutDetail(supabase, user.id, workoutId),
    getProfile(supabase, user.id),
    getActiveEngineParams(supabase),
  ]);
  let detail = initialDetail;
  if (!detail) notFound();

  // keep prescriptions fresh on EVERY surface that shows them, not just the
  // Workout tab (doc 14 §5/§10): bring this meso's not-yet-started rows in line
  // with the user's current inputs (engine params, profile, macro goal, meso
  // config, an exercise increment override) before rendering, then re-read if the
  // recompute actually moved anything. A bypassed/un-logged planned day reached by
  // deep link is refreshed here exactly as it would be from the Workout tab.
  const fresh = await ensureFreshPrescriptions(user.id, detail.mesocycle.id);
  if (fresh && (fresh.generated > 0 || fresh.refreshed > 0)) {
    detail = await getWorkoutDetail(supabase, user.id, workoutId);
    if (!detail) notFound();
  }

  return (
    <div>
      <Link
        href="/workout"
        className="mb-3 block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ WORKOUT
      </Link>
      <DayView
        detail={detail}
        units={profile?.units ?? "lb"}
        params={engineParams}
      />
    </div>
  );
}

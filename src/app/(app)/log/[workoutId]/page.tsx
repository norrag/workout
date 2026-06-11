import { notFound, redirect } from "next/navigation";
import { RirBadge } from "@/components/ui/RirBadge";
import { createClient } from "@/lib/supabase/server";
import { getWorkoutDetail } from "@/lib/queries/workouts";
import { getProfile } from "@/lib/queries/profiles";
import { LoggingFlow } from "./LoggingFlow";

export default async function LogWorkoutPage({
  params,
}: {
  params: Promise<{ workoutId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { workoutId } = await params;
  const [detail, profile] = await Promise.all([
    getWorkoutDetail(supabase, workoutId),
    getProfile(supabase, user.id),
  ]);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="label-caps text-lg font-bold">
            Day {detail.workout.day_number}
          </h1>
          <p className="text-sm text-text-secondary">
            Week {detail.week_number}
          </p>
        </div>
        <RirBadge rir={detail.target_rir} isDeload={detail.is_deload} />
      </header>

      {detail.workout.status === "completed" ? (
        <p className="text-sm text-text-secondary">
          This workout is completed. Logged sets stay on record.
        </p>
      ) : detail.exercises.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No exercises planned for this session.
        </p>
      ) : (
        <LoggingFlow detail={detail} units={profile?.units ?? "lb"} />
      )}
    </div>
  );
}

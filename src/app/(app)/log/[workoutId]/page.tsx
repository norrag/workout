import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RirBadge } from "@/components/ui/RirBadge";
import { WeekTrack, type WeekTrackWeek } from "@/components/ui/WeekTrack";
import { createClient } from "@/lib/supabase/server";
import { getWorkoutDetail } from "@/lib/queries/logging";
import { getProfile } from "@/lib/queries/profiles";
import { WorkoutLogger } from "./WorkoutLogger";

/** Day view (fig 1.1): week track, day coordinate, one-thumb logging. */
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

  const [detail, profile] = await Promise.all([
    getWorkoutDetail(supabase, user.id, workoutId),
    getProfile(supabase, user.id),
  ]);
  if (!detail) notFound();

  const weeks: WeekTrackWeek[] = detail.microcycles.map((micro) => ({
    label: micro.is_deload ? "DL" : `W${micro.week_number}`,
    state:
      micro.status === "completed"
        ? "complete"
        : micro.id === detail.microcycle.id
          ? "current"
          : "future",
    isDeload: micro.is_deload,
  }));

  return (
    <div className="flex flex-col gap-5">
      <header className="border-b-[1.5px] border-ink pb-3">
        <Link
          href="/workout"
          className="label-caps text-[10px] font-semibold text-ink/45"
        >
          ← WORKOUT
        </Link>
        <div className="mt-1 flex items-baseline justify-between">
          <h1 className="title-display text-3xl">
            w{detail.microcycle.week_number} · d{detail.workout.day_number}
          </h1>
          <RirBadge
            rir={detail.microcycle.target_rir}
            isDeload={detail.microcycle.is_deload}
          />
        </div>
        <p className="label-caps mt-1 text-[10px] font-semibold text-ink/55">
          {detail.mesocycle.name.toUpperCase()}
          {detail.dayLabel ? ` · ${detail.dayLabel.toUpperCase()}` : ""}
          {detail.workout.status === "completed" ? " · COMPLETED" : ""}
        </p>
        <div className="mt-3">
          <WeekTrack weeks={weeks} />
        </div>
      </header>

      <WorkoutLogger detail={detail} units={profile?.units ?? "lb"} />
    </div>
  );
}

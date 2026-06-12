import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkoutDetail } from "@/lib/queries/logging";
import { getProfile } from "@/lib/queries/profiles";
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

  const [detail, profile] = await Promise.all([
    getWorkoutDetail(supabase, user.id, workoutId),
    getProfile(supabase, user.id),
  ]);
  if (!detail) notFound();

  return (
    <div>
      <Link
        href="/workout"
        className="mb-3 block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ WORKOUT
      </Link>
      <DayView detail={detail} units={profile?.units ?? "lb"} />
    </div>
  );
}

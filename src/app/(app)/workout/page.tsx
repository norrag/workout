import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentState } from "@/lib/queries/cycles";
import { getWorkoutDetail } from "@/lib/queries/logging";
import { getProfile } from "@/lib/queries/profiles";
import {
  catchUpProgression,
  catchUpMesoGeneration,
} from "@/lib/queries/progression";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { getMesoStats } from "@/lib/queries/stats";
import { createServiceClient } from "@/lib/supabase/service";
import { VolumeView } from "@/components/stats/MesoStatsViews";
import { DayView } from "../log/[workoutId]/DayView";

/**
 * Workout tab (08 §2): the latest uncompleted workout IS the tab (fig 1.1).
 * With no active workout, fall back to the latest completed meso's summary.
 */
export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  let state = await getCurrentState(supabase, user.id);

  // self-heal generation gaps: any closed day whose next-week counterpart was
  // never generated (seeded/imported history, a failed or raced completion)
  // leaves a hole the per-completion path can't reach. Fill them on open so a
  // missing day (e.g. W4·D1 when W3·D1 was seeded complete) appears without a
  // manual step. Idempotent + additive; cheap when there is nothing to do.
  if (state.mesocycle) {
    try {
      const generated = await catchUpMesoGeneration(
        createServiceClient(),
        user.id,
        state.mesocycle.id,
      );
      if (generated > 0) state = await getCurrentState(supabase, user.id);
    } catch (error) {
      console.error("generation gap catch-up failed", error);
    }
  }

  // first-open-of-new-week fallback (07 Phase 4): if the active week closed
  // but generation didn't run (e.g. completion raced or failed), run the
  // engine job now and re-read the position.
  if (state.mesocycle && !state.nextWorkout) {
    try {
      const advanced = await catchUpProgression(
        createServiceClient(),
        user.id,
        state.mesocycle.id,
      );
      if (advanced) state = await getCurrentState(supabase, user.id);
    } catch (error) {
      console.error("progression catch-up failed", error);
    }
  }

  if (state.nextWorkout) {
    const detail = await getWorkoutDetail(
      supabase,
      user.id,
      state.nextWorkout.id,
    );
    if (detail) {
      const { params: engineParams } = await getActiveEngineParams(supabase);
      return (
        <DayView
          detail={detail}
          units={profile?.units ?? "lb"}
          params={engineParams}
        />
      );
    }
  }

  // resting state — latest completed meso's summary
  const { data: restingSummary, error } = await supabase
    .from("v_meso_summary")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const restingStats = restingSummary
    ? await getMesoStats(supabase, user.id, restingSummary.mesocycle_id)
    : null;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="logotype text-[13px] font-semibold">workout</div>
        {profile?.display_name && (
          <div className="label-caps text-[10px] font-medium tracking-[0.1em] text-ink/55">
            {profile.display_name.toUpperCase()}
          </div>
        )}
      </div>

      <div className="mt-4 border-b-[1.5px] border-ink pb-3">
        <h1 className="title-display text-4xl">workout</h1>
      </div>

      {state.mesocycle && !state.nextWorkout && (
        <p className="mt-5 text-sm text-ink/60">
          Every workout this week is logged. Next week&apos;s targets generate
          when the engine runs.
        </p>
      )}

      {restingStats && restingSummary && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between border-b-[1.5px] border-ink pb-1.5">
            <div className="text-[10px] font-bold tracking-[0.14em]">
              LAST MESO — {restingSummary.name.toUpperCase()}
            </div>
            <Link
              href={`/cycles/meso/${restingSummary.mesocycle_id}/stats`}
              className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55"
            >
              ALL STATS ›
            </Link>
          </div>
          <VolumeView stats={restingStats} />
        </div>
      )}

      {!state.mesocycle && (
        <div className="mt-6">
          <p className="text-sm leading-relaxed text-ink/70">
            Training runs in cycles. Set up a macrocycle — or a standalone
            meso — and plan your first block.
          </p>
          <Link
            href="/cycles"
            className="mt-4 block w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base"
          >
            SET UP CYCLES
          </Link>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestAuth } from "@/lib/supabase/server";
import { getCurrentState } from "@/lib/queries/cycles";
import { getWorkoutDetail } from "@/lib/queries/logging";
import { getProfile } from "@/lib/queries/profiles";
import { catchUpProgression } from "@/lib/queries/progression";
import { ensureFreshPrescriptions } from "@/lib/queries/regeneration";
import { reportError } from "@/lib/observability/report";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { getMesoStats } from "@/lib/queries/stats";
import { createServiceClient } from "@/lib/supabase/service";
import { VolumeView } from "@/components/stats/MesoStatsViews";
import { InlineTerm } from "@/components/ui/InlineTerm";
import { DayView } from "../log/[workoutId]/DayView";
import { StalledWeek } from "./StalledWeek";

/**
 * Workout tab (08 §2): the latest uncompleted workout IS the tab (fig 1.1).
 * With no active workout, fall back to the latest completed meso's summary.
 */
export default async function WorkoutPage() {
  const { supabase, user } = await getRequestAuth();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  let state = await getCurrentState(supabase, user.id);

  // keep the plan correct on open: generate any missing day whose previous-week
  // counterpart is complete, and refresh any not-yet-started prescription whose
  // inputs have changed since it was computed (engine params, profile, macro goal,
  // meso config, the upstream week). Staleness is derived from a per-prescription
  // dependency fingerprint (doc 14), so a change to ANY input propagates to every
  // user transparently on their next open — no manual regenerate step. Idempotent
  // + additive; a hash compare when nothing changed.
  if (state.mesocycle) {
    // resolve the active params once (request-cached with the predictor read at
    // render) and pass them in, so the reconcile's service client doesn't re-read
    // the global engine_params row (#8).
    const active = await getActiveEngineParams(supabase);
    const result = await ensureFreshPrescriptions(
      user.id,
      state.mesocycle.id,
      active,
    );
    if (result && (result.generated > 0 || result.refreshed > 0)) {
      state = await getCurrentState(supabase, user.id);
    }
  }

  // first-open-of-new-week fallback (07 Phase 4): if the active week closed
  // but generation didn't run (e.g. completion raced or failed), run the
  // engine job now and re-read the position.
  if (state.mesocycle && !state.nextWorkout) {
    const mesoId = state.mesocycle.id;
    try {
      const advanced = await catchUpProgression(
        createServiceClient(),
        user.id,
        mesoId,
      );
      if (advanced) state = await getCurrentState(supabase, user.id);
    } catch (error) {
      // last-resort generation path — if this also fails the user is stuck on
      // a closed week, so it must be visible in prod (R20)
      await reportError("workout-tab:progression-catch-up", error, {
        userId: user.id,
        mesoId,
      });
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
        <DayView detail={detail} params={engineParams} />
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
          <div className="label-caps text-[10px] font-medium tracking-[0.1em] text-ink-muted">
            {profile.display_name.toUpperCase()}
          </div>
        )}
      </div>

      <div className="mt-4 border-b-[1.5px] border-ink pb-3">
        <h1 className="title-display text-4xl">workout</h1>
      </div>

      {/* N74: an ACTIVE meso with no next workout is never a normal resting
          state — the advance job activates week N+1 as the last day of week N
          closes, and the final week completes the meso. Reaching here means
          generation failed, so say so and give the user a way out. */}
      {state.mesocycle && !state.nextWorkout && (
        <StalledWeek mesoId={state.mesocycle.id} />
      )}

      {restingStats && restingSummary && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between border-b-[1.5px] border-ink pb-1.5">
            <div className="text-[10px] font-bold tracking-[0.14em]">
              LAST MESO — {restingSummary.name.toUpperCase()}
            </div>
            <Link
              href={`/cycles/meso/${restingSummary.mesocycle_id}?view=balance`}
              className="text-[9.5px] font-semibold tracking-[0.1em] text-ink-muted"
            >
              ALL STATS ›
            </Link>
          </div>
          <VolumeView stats={restingStats} />
        </div>
      )}

      {!state.mesocycle && (
        <div className="mt-6">
          {/* N81 — the app's own vocabulary, on the screen a first-time reader
              meets it. `22c` §C1-a: `macrocycle` is defined in glossary.ts and
              has never had a trigger anywhere. */}
          <p className="text-sm leading-relaxed text-ink/70">
            Training runs in cycles. Set up a{" "}
            <InlineTerm term="macrocycle">macrocycle</InlineTerm> — or a
            standalone meso — and plan your first block.
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { RirBadge } from "@/components/ui/RirBadge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentState } from "@/lib/queries/cycles";
import { getProfile } from "@/lib/queries/profiles";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  const state = await getCurrentState(supabase, user.id);

  // resting logic (08 §2): no active meso → latest completed meso's stats
  let restingSummary = null;
  if (!state.mesocycle) {
    const { data, error } = await supabase
      .from("v_meso_summary")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    restingSummary = data;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <h1 className="title-display text-4xl">workout</h1>
        {profile?.display_name && (
          <p className="label-caps mt-2 text-[10px] font-medium text-ink/55">
            {profile.display_name}
          </p>
        )}
      </header>

      {!state.mesocycle && restingSummary && (
        <Card header={`LAST MESO — ${restingSummary.name.toUpperCase()}`}>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between border-b border-ink/15 pb-2">
              <dt className="text-ink/55">Workouts</dt>
              <dd className="numeral">
                {restingSummary.workouts_completed} /{" "}
                {restingSummary.workouts_total}
              </dd>
            </div>
            <div className="flex justify-between border-b border-ink/15 pb-2">
              <dt className="text-ink/55">Working sets</dt>
              <dd className="numeral">{restingSummary.working_sets}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/55">Best e1RM</dt>
              <dd className="numeral">
                {restingSummary.best_e1rm != null
                  ? Math.round(restingSummary.best_e1rm)
                  : "—"}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {!state.mesocycle && (
        <Card header="No active mesocycle">
          <p className="mb-4 text-sm text-ink/70">
            Training runs in cycles. Set up a macrocycle — or a standalone
            meso — and plan your first block.
          </p>
          <Link
            href="/cycles"
            className="label-caps inline-flex min-h-11 items-center justify-center bg-ink px-5 text-xs font-bold text-bg-base"
          >
            Set up cycles
          </Link>
        </Card>
      )}

      {state.mesocycle && (
        <Card header="Cycle position">
          <dl className="flex flex-col gap-2 text-sm">
            {state.macrocycle && (
              <div className="flex justify-between border-b border-ink/15 pb-2">
                <dt className="text-ink/55">Macro</dt>
                <dd>
                  {state.macrocycle.name}{" "}
                  <span className="text-ink/55">
                    ({state.macrocycle.goal_type})
                  </span>
                </dd>
              </div>
            )}
            <div className="flex justify-between border-b border-ink/15 pb-2">
              <dt className="text-ink/55">Meso</dt>
              <dd>
                <Link href={`/cycles/meso/${state.mesocycle.id}`}>
                  {state.mesocycle.name}
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink/55">Week</dt>
              <dd>
                {state.microcycle ? (
                  <span className="flex items-center gap-2">
                    <span className="numeral">
                      {state.microcycle.week_number} / {state.mesocycle.weeks}
                    </span>
                    <RirBadge
                      rir={state.microcycle.target_rir}
                      isDeload={state.microcycle.is_deload}
                    />
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {state.nextWorkout && state.microcycle && (
        <Card header="Next workout">
          <p className="numeral mb-4 text-2xl font-bold">
            W{state.microcycle.week_number} · D{state.nextWorkout.day_number}
          </p>
          <Link
            href={`/log/${state.nextWorkout.id}`}
            className="label-caps inline-flex min-h-11 w-full items-center justify-center bg-ink px-5 text-xs font-bold text-bg-base"
          >
            Open workout
          </Link>
        </Card>
      )}

      {state.mesocycle && !state.nextWorkout && (
        <p className="text-sm text-ink/55">
          Every workout this week is complete. Next week generates when the
          engine runs.
        </p>
      )}
    </div>
  );
}

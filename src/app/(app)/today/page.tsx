import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { RirBadge } from "@/components/ui/RirBadge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentState } from "@/lib/queries/cycles";
import { getProfile } from "@/lib/queries/profiles";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  const state = await getCurrentState(supabase, user.id);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="label-caps text-lg font-bold">Today</h1>
        {profile?.display_name && (
          <p className="text-sm text-text-secondary">{profile.display_name}</p>
        )}
      </header>

      {!state.macrocycle && (
        <Card header="No active cycle">
          <p className="mb-4 text-sm text-text-secondary">
            Training starts with a macrocycle: a goal and a timeline. Build
            yours, then plan your first mesocycle.
          </p>
          <Link
            href="/cycles"
            className="label-caps inline-flex min-h-11 items-center justify-center rounded-[6px] bg-accent px-4 text-sm font-semibold text-bg-base"
          >
            Set up cycles
          </Link>
        </Card>
      )}

      {state.macrocycle && (
        <Card header="Cycle position">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">Macro</dt>
              <dd>
                {state.macrocycle.name}{" "}
                <span className="text-text-secondary">
                  ({state.macrocycle.goal_type})
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Meso</dt>
              <dd>{state.mesocycle?.name ?? "none planned"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Week</dt>
              <dd>
                {state.microcycle ? (
                  <span className="flex items-center gap-2">
                    <span className="numeral">
                      {state.microcycle.week_number} / {state.mesocycle?.weeks}
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

      {state.nextWorkout && (
        <Card header="Next workout">
          <p className="numeral mb-4 text-2xl font-semibold">
            Day {state.nextWorkout.day_number}
          </p>
          <Link
            href={`/log/${state.nextWorkout.id}`}
            className="label-caps inline-flex min-h-11 w-full items-center justify-center rounded-[6px] bg-accent px-4 text-sm font-semibold text-bg-base"
          >
            Start workout
          </Link>
        </Card>
      )}

      {state.macrocycle && !state.nextWorkout && state.mesocycle && (
        <Card>
          <p className="text-sm text-text-secondary">
            No workout scheduled. Check your cycle plan.
          </p>
        </Card>
      )}
    </div>
  );
}

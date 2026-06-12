import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Day view, read-only preview. Shows the generated prescriptions grouped
 * by muscle group (fig 1.1 structure); one-thumb logging lands in Phase 3.
 */
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

  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", workoutId)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout) notFound();

  const [
    { data: micro, error: microError },
    { data: workoutExercises, error: weError },
    { data: muscleGroups, error: mgError },
  ] = await Promise.all([
    supabase
      .from("microcycles")
      .select("*")
      .eq("id", workout.microcycle_id)
      .single(),
    supabase
      .from("workout_exercises")
      .select("*")
      .eq("workout_id", workoutId)
      .order("position"),
    supabase.from("muscle_groups").select("*"),
  ]);
  if (microError) throw microError;
  if (weError) throw weError;
  if (mgError) throw mgError;

  const exerciseIds = (workoutExercises ?? []).map((we) => we.exercise_id);
  let exerciseNames = new Map<string, string>();
  if (exerciseIds.length > 0) {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name")
      .in("id", exerciseIds);
    if (error) throw error;
    exerciseNames = new Map((data ?? []).map((e) => [e.id, e.name]));
  }
  const mgNameById = new Map((muscleGroups ?? []).map((g) => [g.id, g.name]));

  // group consecutive exercises by muscle group (fig 1.1 headers)
  const groups: { name: string; items: NonNullable<typeof workoutExercises> }[] =
    [];
  for (const we of workoutExercises ?? []) {
    const name = we.muscle_group_id
      ? (mgNameById.get(we.muscle_group_id) ?? "OTHER")
      : "OTHER";
    const last = groups.at(-1);
    if (last && last.name === name) last.items.push(we);
    else groups.push({ name, items: [we] });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <Link
          href="/workout"
          className="label-caps text-[10px] font-semibold text-ink/45"
        >
          ← WORKOUT
        </Link>
        <h1 className="title-display mt-1 text-3xl">
          w{micro.week_number} · d{workout.day_number}
        </h1>
        <p className="label-caps mt-1 text-[10px] font-semibold text-ink/55">
          {micro.is_deload ? "DELOAD · " : ""}
          TARGET <span className="numeral">{micro.target_rir}</span> RIR
        </p>
      </header>

      {groups.map((group, gi) => (
        <section key={gi}>
          <h2 className="label-caps border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
            <span className="numeral">{String(gi + 1).padStart(2, "0")}</span>
            {" — "}
            {group.name.toUpperCase()}
          </h2>
          <div className="flex flex-col divide-y divide-ink/15">
            {group.items.map((we) => (
              <div key={we.id} className="py-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold">
                    {exerciseNames.get(we.exercise_id) ?? ""}
                  </p>
                  <p className="numeral text-sm font-semibold">
                    {we.prescribed_weight != null
                      ? `${we.prescribed_weight} × `
                      : ""}
                    {we.prescribed_reps ?? "—"} · {we.prescribed_sets ?? "—"}{" "}
                    SETS
                  </p>
                </div>
                {we.notes && (
                  <p className="mt-1 text-xs text-ink/55">{we.notes}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="label-caps text-center text-[9px] font-medium text-ink/45">
        SET LOGGING LANDS IN THE NEXT PHASE
      </p>
    </div>
  );
}

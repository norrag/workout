import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExerciseHistory } from "@/lib/queries/history";
import { ExerciseHistoryList } from "@/components/ExerciseHistoryList";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/**
 * Exercise detail (08 §4, described not mocked): description, equipment +
 * muscle group, last performed, inline 3.2 history, notes.
 */
export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: exercise, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", exerciseId)
    .maybeSingle();
  if (error) throw error;
  if (!exercise) notFound();

  const [
    { data: links, error: linkError },
    { data: groups, error: groupError },
    { data: pr, error: prError },
    { data: pinned, error: pinnedError },
    history,
  ] = await Promise.all([
    supabase
      .from("exercise_muscle_groups")
      .select("*")
      .eq("exercise_id", exercise.id),
    supabase.from("muscle_groups").select("*"),
    supabase
      .from("v_exercise_prs")
      .select("*")
      .eq("user_id", user.id)
      .eq("exercise_id", exercise.id)
      .maybeSingle(),
    supabase
      .from("exercise_notes")
      .select("*")
      .eq("user_id", user.id)
      .eq("exercise_id", exercise.id)
      .eq("is_pinned", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getExerciseHistory(supabase, user.id, exercise.id),
  ]);
  if (linkError) throw linkError;
  if (groupError) throw groupError;
  if (prError) throw prError;
  if (pinnedError) throw pinnedError;

  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const primary = (links ?? []).find((l) => l.role === "primary");
  const secondary = (links ?? []).filter((l) => l.role === "secondary");
  const metaLine = [
    primary ? groupName.get(primary.muscle_group_id)?.toUpperCase() : null,
    exercise.equipment_type.toUpperCase(),
    secondary.length > 0
      ? `ALSO ${secondary
          .map((l) => groupName.get(l.muscle_group_id)?.toUpperCase())
          .filter(Boolean)
          .join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <Link
        href="/exercises"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ EXERCISES
      </Link>
      <div className="mt-3 flex items-end justify-between">
        <h1 className="text-[27px] font-extrabold leading-none tracking-[-0.02em]">
          {exercise.name}
        </h1>
        {exercise.user_id !== null && (
          <div className="border border-ink/35 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ink/55">
            CUSTOM
          </div>
        )}
      </div>
      <div className="mt-2 text-[10.5px] font-medium tracking-[0.1em] text-ink/55">
        {metaLine}
      </div>

      {exercise.description && (
        <p className="mt-4 text-[13px] leading-[1.55] text-ink/80">
          {exercise.description}
        </p>
      )}

      <div className="mt-5 border-t-[1.5px] border-ink">
        <div className="flex justify-between border-b border-ink/15 py-3 text-sm">
          <span className="font-medium text-ink/70">Last performed</span>
          <span className="numeral font-bold">
            {pr?.last_performed_at ? longDate(pr.last_performed_at) : "Never"}
          </span>
        </div>
        <div className="flex justify-between border-b border-ink/15 py-3 text-sm">
          <span className="font-medium text-ink/70">All-time best</span>
          <span className="numeral font-bold">
            {pr?.best_weight != null
              ? `${pr.best_weight} lb × ${pr.best_reps}`
              : "—"}
          </span>
        </div>
      </div>

      {pinned && (
        <div className="mt-4 border-l-2 border-ink py-1.5 pl-2.5 text-[11.5px] leading-normal text-ink/75">
          <span className="font-bold tracking-[0.08em]">PINNED — </span>
          {pinned.body}
        </div>
      )}
      {exercise.notes && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            NOTES
          </div>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-ink/80">
            {exercise.notes}
          </p>
        </div>
      )}

      <div className="mt-6">
        <div className="pb-2 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
          HISTORY
        </div>
        <ExerciseHistoryList entries={history} />
      </div>
    </div>
  );
}

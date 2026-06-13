import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listExercises,
  listMuscleGroups,
} from "@/lib/queries/exercises";

function shortDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${String(d.getFullYear()).slice(2)}`;
}

/** Exercise library (fig 3.1): search, muscle-group filter, last-logged. */
export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mg?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { q, mg } = await searchParams;
  const [exercises, muscleGroups, { data: prs, error: prError }] =
    await Promise.all([
      listExercises(supabase, { search: q }),
      listMuscleGroups(supabase),
      supabase.from("v_exercise_prs").select("*").eq("user_id", user.id),
    ]);
  if (prError) throw prError;
  const lastById = new Map(
    (prs ?? []).map((p) => [p.exercise_id, p.last_performed_at]),
  );
  const activeGroup = muscleGroups.find((g) => g.id === mg) ?? null;
  const visible = activeGroup
    ? exercises.filter((e) => e.muscles.some((m) => m.id === activeGroup.id))
    : exercises;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="title-display text-[32px]">exercises</h1>
        <div className="border-[1.5px] border-ink/30 px-3.5 py-[9px] text-[11px] font-bold tracking-[0.1em] text-ink/40">
          + NEW
        </div>
      </div>

      <form method="get">
        {activeGroup && <input type="hidden" name="mg" value={activeGroup.id} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search"
          className="mt-4 h-[46px] w-full border-[1.5px] border-ink bg-paper px-3.5 text-sm text-ink placeholder:text-ink/45 focus:outline-none"
        />
      </form>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold tracking-[0.12em] text-ink/55">
          FILTERS
        </span>
        {activeGroup ? (
          <Link
            href={`/exercises${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            className="flex items-center gap-2 bg-ink px-2.5 py-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-bg-base"
          >
            {activeGroup.name.toUpperCase()} <span className="opacity-60">✕</span>
          </Link>
        ) : (
          muscleGroups.map((g) => (
            <Link
              key={g.id}
              href={`/exercises?mg=${g.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="border border-ink/35 px-2.5 py-1.5 text-[10.5px] font-medium tracking-[0.08em] text-ink/55"
            >
              {g.name.toUpperCase()}
            </Link>
          ))
        )}
      </div>

      <div className="mt-4 border-t-[1.5px] border-ink">
        {visible.length === 0 && (
          <p className="py-4 text-sm text-ink/45">No exercises found.</p>
        )}
        {visible.map((ex) => {
          const primary = ex.muscles.find((m) => m.role === "primary")?.name;
          const last = lastById.get(ex.id);
          const sub = [
            primary?.toUpperCase(),
            ex.equipment_type.toUpperCase(),
            last ? `LAST ${shortDate(last)}` : null,
            ex.user_id !== null ? "CUSTOM" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              key={ex.id}
              className="flex items-center justify-between border-b border-ink/[0.18] py-3.5"
            >
              <div>
                <div className="text-base font-bold">{ex.name}</div>
                <div className="mt-1 text-[10px] font-medium tracking-[0.1em] text-ink/55">
                  {sub}
                </div>
              </div>
              <div className="text-base text-ink/40">›</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listExercises, listMuscleGroups } from "@/lib/queries/exercises";
import type { EquipmentType } from "@/lib/types/database";

function shortDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${String(d.getFullYear()).slice(2)}`;
}

/** Exercise library (fig 3.1): search + two-axis filter (MUSCLE × EQUIP, AND). */
export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mg?: string; eq?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { q, mg, eq } = await searchParams;
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
  const activeEquip = (eq ?? null) as EquipmentType | null;

  // equipment axis: the distinct equipment types present in the (searched) library
  const equipTypes = [...new Set(exercises.map((e) => e.equipment_type))].sort();

  const visible = exercises.filter(
    (e) =>
      (!activeGroup || e.muscles.some((m) => m.id === activeGroup.id)) &&
      (!activeEquip || e.equipment_type === activeEquip),
  );
  const filtering = !!activeGroup || !!activeEquip;

  // build an href preserving the other query params
  const href = (next: { mg?: string | null; eq?: string | null }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const m = next.mg === undefined ? mg : next.mg;
    const e = next.eq === undefined ? eq : next.eq;
    if (m) sp.set("mg", m);
    if (e) sp.set("eq", e);
    const s = sp.toString();
    return `/exercises${s ? `?${s}` : ""}`;
  };

  const chipBase =
    "px-2.5 py-1.5 text-[10.5px] tracking-[0.08em] whitespace-nowrap";
  const chipOn = `bg-ink text-bg-base font-bold flex items-center gap-2 ${chipBase}`;
  const chipOff = `border-[1.5px] border-ink/40 text-ink/55 font-medium ${chipBase}`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="title-display text-[32px]">exercises</h1>
        <Link
          href="/exercises/new"
          className="border-[1.5px] border-ink px-3.5 py-[9px] text-[11px] font-bold tracking-[0.1em]"
        >
          + NEW
        </Link>
      </div>

      <form method="get">
        {mg && <input type="hidden" name="mg" value={mg} />}
        {eq && <input type="hidden" name="eq" value={eq} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search"
          className="mt-4 h-[46px] w-full border-[1.5px] border-ink bg-paper px-3.5 text-sm text-ink placeholder:text-ink/45 focus:outline-none"
        />
      </form>

      {/* MUSCLE axis */}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="w-[52px] flex-shrink-0 text-[10px] font-semibold tracking-[0.12em] text-ink/55">
          MUSCLE
        </span>
        <div className="flex gap-1.5 overflow-x-auto">
          {muscleGroups.map((g) =>
            activeGroup?.id === g.id ? (
              <Link key={g.id} href={href({ mg: null })} className={chipOn}>
                {g.name.toUpperCase()} <span className="opacity-60">✕</span>
              </Link>
            ) : (
              <Link key={g.id} href={href({ mg: g.id })} className={chipOff}>
                {g.name.toUpperCase()}
              </Link>
            ),
          )}
        </div>
      </div>

      {/* EQUIP axis */}
      <div className="mt-2 flex items-center gap-2">
        <span className="w-[52px] flex-shrink-0 text-[10px] font-semibold tracking-[0.12em] text-ink/55">
          EQUIP
        </span>
        <div className="flex gap-1.5 overflow-x-auto">
          <Link
            href={href({ eq: null })}
            className={activeEquip ? chipOff : chipOn}
          >
            ALL
          </Link>
          {equipTypes.map((type) =>
            activeEquip === type ? (
              <Link key={type} href={href({ eq: null })} className={chipOn}>
                {type.toUpperCase()} <span className="opacity-60">✕</span>
              </Link>
            ) : (
              <Link key={type} href={href({ eq: type })} className={chipOff}>
                {type.toUpperCase()}
              </Link>
            ),
          )}
        </div>
      </div>

      {filtering && (
        <div className="mt-2.5 flex items-baseline justify-between">
          <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/45">
            {visible.length} OF {exercises.length} EXERCISES
          </div>
          <Link
            href={href({ mg: null, eq: null })}
            className="border-b-[1.5px] border-ink text-[9.5px] font-bold tracking-[0.1em] text-ink"
          >
            CLEAR ALL
          </Link>
        </div>
      )}

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
            <Link
              key={ex.id}
              href={`/exercises/${ex.id}`}
              className="flex items-center justify-between border-b border-ink/[0.18] py-3.5"
            >
              <div>
                <div className="text-base font-bold">{ex.name}</div>
                <div className="mt-1 text-[10px] font-medium tracking-[0.1em] text-ink/55">
                  {sub}
                </div>
              </div>
              <div className="text-base text-ink/40">›</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

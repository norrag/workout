import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMesoPlan } from "@/lib/queries/cycles";
import { getActiveEngineParams } from "@/lib/queries/generation";
import {
  getSlotEffortAssignments,
  resolveSlotEffort,
  slotEffortKey,
} from "@/lib/queries/slot-effort";
import { isMeasuringRir } from "@/lib/engine";
import {
  effortEyebrowSuffix,
  effortRirLabel,
} from "@/lib/slot-effort-display";

const WEEKDAY_LABELS = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * Read-only view of a planned-but-not-yet-generated day (issue: let the user
 * see the basic planned exercises for a future day, clearly denoting that its
 * prescription isn't set yet — loads/sets are computed once the prior week is
 * logged and that week is generated).
 */
export default async function PlannedDayPage({
  params,
}: {
  params: Promise<{ mesoId: string; week: string; day: string }>;
}) {
  const { mesoId, week, day } = await params;
  const weekNumber = Number(week);
  const dayNumber = Number(day);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const plan = await getMesoPlan(supabase, mesoId);
  if (!plan) notFound();
  const { meso, days } = plan;
  const planDay = days.find((d) => d.day_number === dayNumber);
  if (!planDay) notFound();

  // the week's target RIR: prefer the generated microcycle if it exists,
  // otherwise preview it from the ramp.
  const { data: micro } = await supabase
    .from("microcycles")
    .select("target_rir, is_deload, week_number")
    .eq("mesocycle_id", mesoId)
    .eq("week_number", weekNumber)
    .maybeSingle();

  const isDeload =
    micro?.is_deload ?? (meso.includes_deload && weekNumber === meso.weeks);
  // preview RIR for a not-yet-generated week: the deload RIR comes from the active
  // engine params (so it tracks tuning, e.g. v15's 6), working weeks from the ramp
  const { params: engineParams } = await getActiveEngineParams(supabase);
  const previewRir = () => {
    if (isDeload) return engineParams.deload.target_rir;
    const working = meso.includes_deload ? meso.weeks - 1 : meso.weeks;
    const t =
      working <= 1 ? 1 : Math.min(weekNumber - 1, working - 1) / (working - 1);
    return Math.round(meso.rir_start + (meso.rir_end - meso.rir_start) * t);
  };
  const targetRir = micro?.target_rir ?? previewRir();

  // doc 21 §8 — the planner slot discloses the effort assignment resolved for
  // THIS week, so a planned week shows the intensity it will actually be priced
  // at rather than the ramp value it has been superseded by. One filtered read
  // that returns nothing for a meso with no assignments.
  const assignments = await getSlotEffortAssignments(supabase, mesoId);
  const slotEffortFor = (exerciseId: string) => {
    const assignment = assignments.get(slotEffortKey(dayNumber, exerciseId));
    if (!assignment) return null;
    const resolved = resolveSlotEffort(assignment, weekNumber, targetRir);
    if (
      resolved.assignedRir == null &&
      resolved.setCap == null &&
      resolved.repPosition == null
    )
      return null;
    return {
      ...resolved,
      isDeload,
      measuring: isMeasuringRir(resolved.rir, engineParams.e1rm),
    };
  };

  const dayName = `${planDay.weekday ? WEEKDAY_LABELS[planDay.weekday] : `D${planDay.day_number}`}${planDay.label ? ` — ${planDay.label.toUpperCase()}` : ""}`;
  const totalSets = planDay.groups.reduce(
    (n, g) => n + g.fills.reduce((s, f) => s + f.initial_sets, 0),
    0,
  );

  return (
    <div>
      <Link
        href={`/cycles/meso/${mesoId}`}
        className="mb-3 block text-[10px] font-medium tracking-[0.12em] text-ink-muted"
      >
        ‹ {meso.name.toUpperCase()}
      </Link>

      <h1 className="text-[27px] font-extrabold leading-none tracking-[-0.02em]">
        W{weekNumber}·D{dayNumber}
      </h1>
      <div className="mt-2 flex items-center gap-2 text-[10px] font-medium tracking-[0.12em] text-ink-muted">
        <span>{dayName}</span>
        <span>·</span>
        <span className={isDeload ? "font-bold text-accent" : "text-accent"}>
          {isDeload ? "DELOAD WEEK" : `TARGET ${targetRir} RIR`}
        </span>
      </div>

      {/* not-generated banner */}
      <div className="mt-4 border-[1.5px] border-dashed border-ink/45 bg-paper px-3.5 py-3">
        <div className="text-[9px] font-bold tracking-[0.14em] text-ink-muted">
          NOT PLANNED YET
        </div>
        <p className="mt-1.5 text-[12.5px] leading-[1.5] text-ink/70">
          These are the planned exercises for this day. Their loads and sets are
          set once the previous week is logged — the engine builds this week from
          how the last one went.
        </p>
      </div>

      <div className="mt-3 text-[9px] font-semibold tracking-[0.1em] text-ink-muted">
        <span className="numeral">{planDay.groups.length}</span>{" "}
        {planDay.groups.length === 1 ? "GROUP" : "GROUPS"} ·{" "}
        <span className="numeral">{totalSets}</span> PLANNED SETS
      </div>

      {/* flat planned-exercise list in day order, across groups (read-only, #2) */}
      <div className="mt-3 border-t-[1.5px] border-ink">
        {planDay.groups
          .flatMap((group, gi) =>
            group.fills.map((fill, si) => ({
              fill,
              group,
              key: [fill.position ?? 0, gi, fill.slot_number ?? si + 1] as const,
            })),
          )
          .sort(
            (a, b) =>
              a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2],
          )
          .map(({ fill, group }) => (
            <div
              key={fill.id}
              className="flex items-center gap-3 border-b border-ink/[0.18] py-2.5 last:border-b-0"
            >
              <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-[9px] font-extrabold">
                {group.muscle_group.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-semibold">
                  {fill.exercise_name}
                </div>
                <div className="mt-[3px] text-[9px] font-semibold tracking-[0.12em] text-ink-muted">
                  {group.muscle_group.toUpperCase()}
                </div>
              </div>
              {(() => {
                const effort = slotEffortFor(fill.exercise_id);
                const sets =
                  effort?.setCap != null
                    ? Math.min(fill.initial_sets, effort.setCap)
                    : fill.initial_sets;
                return (
                  <div className="text-right text-[9px] font-semibold tracking-[0.12em] text-ink-muted">
                    <span className="numeral">{sets}</span> SETS ·{" "}
                    {effortRirLabel(
                      effort?.rir ?? targetRir,
                      effort?.measuring ?? true,
                    )}
                    {effortEyebrowSuffix(effort, 1)}
                  </div>
                );
              })()}
            </div>
          ))}
        {planDay.groups.every((g) => g.fills.length === 0) && (
          <p className="py-4 text-sm text-ink-muted">
            {planDay.groups.length === 0
              ? "This day has no muscle groups planned yet."
              : "No exercises picked for this day yet."}
          </p>
        )}
      </div>
    </div>
  );
}

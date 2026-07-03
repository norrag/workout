import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMesoDeletionImpact, getMesoPlan } from "@/lib/queries/cycles";
import {
  getActiveEngineParams,
  mesoActivationBlock,
} from "@/lib/queries/generation";
import { getMesoStats } from "@/lib/queries/stats";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  BalanceView,
  PerformanceView,
} from "@/components/stats/MesoStatsViews";
import { StartMesoForm } from "./StartMesoForm";
import {
  MesoHeader,
  type MesoCalendarCell,
  type MesoCalendarWeek,
} from "./MesoHeader";
import { MesoPlanView, type PlanViewDay } from "./MesoPlanView";

const WEEKDAY_LABELS = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const VIEWS = ["overview", "balance", "performance"] as const;
type View = (typeof VIEWS)[number];

/**
 * Meso page (P16 rework, 2026-07-02): day-view-style header (calendar
 * dropdown · share · ⋮ menu) over an OVERVIEW | BALANCE | PERFORMANCE toggle.
 * Overview = the planner board read-only; Balance/Performance = the meso
 * stats views (absorbs the old MESO STATS button + /stats screen).
 */
export default async function MesoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ mesoId: string }>;
  searchParams: Promise<{ error?: string; view?: string }>;
}) {
  const { mesoId } = await params;
  // saveMesoAsTemplateAction lands back here with ?error=template on failure
  const { error: actionError, view: viewParam } = await searchParams;
  const view: View = VIEWS.includes(viewParam as View)
    ? (viewParam as View)
    : "overview";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const plan = await getMesoPlan(supabase, mesoId);
  if (!plan) notFound();
  const { meso, days } = plan;

  const [deletion, stats] = await Promise.all([
    getMesoDeletionImpact(supabase, user.id, mesoId),
    getMesoStats(supabase, user.id, mesoId),
  ]);
  if (!stats) notFound();

  const { data: micros, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("mesocycle_id", mesoId)
    .order("week_number");
  if (microError) throw microError;

  let allWorkouts: import("@/lib/types/database").WorkoutRow[] = [];
  if ((micros ?? []).length > 0) {
    const { data, error } = await supabase
      .from("workouts")
      .select("*")
      .in(
        "microcycle_id",
        (micros ?? []).map((m) => m.id),
      );
    if (error) throw error;
    allWorkouts = data ?? [];
  }

  const currentMicro = (micros ?? []).find((m) => m.status === "active");
  const nextWorkout = currentMicro
    ? allWorkouts
        .filter(
          (w) =>
            w.microcycle_id === currentMicro.id &&
            (w.status === "planned" || w.status === "in_progress"),
        )
        .sort((a, b) => a.day_number - b.day_number)[0]
    : null;

  // ramp values for planned mesos (no microcycles yet). The deload RIR comes from
  // the active engine params (so the preview tracks tuning, e.g. v15's 6); working
  // weeks from the meso's own ramp.
  const { params: engineParams } = await getActiveEngineParams(supabase);
  const previewRir = (weekIdx: number, isDeload: boolean) => {
    if (isDeload) return engineParams.deload.target_rir;
    const working = meso.includes_deload ? meso.weeks - 1 : meso.weeks;
    const t = working === 1 ? 1 : Math.min(weekIdx, working - 1) / (working - 1);
    return Math.round(meso.rir_start + (meso.rir_end - meso.rir_start) * t);
  };

  const weekRows =
    (micros ?? []).length > 0
      ? (micros ?? []).map((m) => ({
          key: m.id,
          weekNumber: m.week_number,
          isDeload: m.is_deload,
          targetRir: m.target_rir,
          status: m.status,
          microId: m.id as string | null,
        }))
      : Array.from({ length: meso.weeks }, (_, i) => {
          const isDeload = meso.includes_deload && i === meso.weeks - 1;
          return {
            key: String(i),
            weekNumber: i + 1,
            isDeload,
            targetRir: previewRir(i, isDeload),
            status: "unbuilt" as const,
            microId: null as string | null,
          };
        });
  const deloadRow = weekRows.find((w) => w.isDeload);

  // the header calendar (was the page-body ramp matrix) — day cells link to
  // the day view when materialized, else the read-only planned-day view
  const dayCols = days.length > 0 ? days : [];
  const calendar: MesoCalendarWeek[] = weekRows.map((week) => {
    const isCurrent = week.status === "active";
    const cells: MesoCalendarCell[] = dayCols.map((day) => {
      const workout = week.microId
        ? allWorkouts.find(
            (w) =>
              w.microcycle_id === week.microId &&
              w.day_number === day.day_number,
          )
        : null;
      const header = day.weekday
        ? (WEEKDAY_LABELS[day.weekday] ?? `D${day.day_number}`)
        : `D${day.day_number}`;
      if (workout?.status === "completed")
        return {
          dayNumber: day.day_number,
          header,
          state: "done",
          href: `/log/${workout.id}`,
        };
      if (isCurrent && workout && nextWorkout?.id === workout.id)
        return {
          dayNumber: day.day_number,
          header,
          state: "next",
          href: `/log/${workout.id}`,
        };
      if (isCurrent && workout)
        return {
          dayNumber: day.day_number,
          header,
          state: "current",
          href: `/log/${workout.id}`,
        };
      return {
        dayNumber: day.day_number,
        header,
        state: "planned",
        href: `/cycles/meso/${meso.id}/planned/${week.weekNumber}/${day.day_number}`,
      };
    });
    return {
      key: week.key,
      weekNumber: week.weekNumber,
      isDeload: week.isDeload,
      targetRir: week.targetRir,
      cells,
      isCurrent,
      isComplete: week.status === "completed",
      isUnbuilt: week.status === "unbuilt",
    };
  });

  // whole-grid completion share for the header progress bar (weeks × days —
  // lazily-materialized future workouts count toward the denominator)
  const plannedGrid = weekRows.length * days.length;
  const completedCount = allWorkouts.filter(
    (w) => w.status === "completed",
  ).length;
  const progressPct =
    plannedGrid > 0 ? Math.round((completedCount / plannedGrid) * 100) : 0;

  // macro context for the header's top-right label
  let contextLabel = "STANDALONE";
  if (meso.macrocycle_id) {
    const { data: macro, error: macroError } = await supabase
      .from("macrocycles")
      .select("name")
      .eq("id", meso.macrocycle_id)
      .maybeSingle();
    if (macroError) throw macroError;
    contextLabel = macro?.name ?? "STANDALONE";
  }

  const hasFills = days.some((d) => d.groups.some((g) => g.fills.length > 0));

  // I12: surface the activation gates PROACTIVELY on a planned meso — the same
  // checks `startMeso` enforces (one live block per user, sequential order
  // within a macro), so the button explains itself instead of failing on tap.
  // `startMeso` re-checks on submit either way; this is UX, not the guard.
  let startBlockReason: string | null = null;
  if (meso.status === "planned") {
    const { data: liveMesos, error: liveErr } = await supabase
      .from("mesocycles")
      .select("name")
      .eq("status", "active")
      .neq("id", meso.id)
      .limit(1);
    if (liveErr) throw liveErr;
    if (liveMesos && liveMesos.length > 0) {
      startBlockReason = `another mesocycle ("${liveMesos[0].name}") is currently active — complete or abandon it before starting this one.`;
    } else if (meso.macrocycle_id) {
      const { data: siblings, error: sibErr } = await supabase
        .from("mesocycles")
        .select("position, status")
        .eq("macrocycle_id", meso.macrocycle_id)
        .neq("id", meso.id);
      if (sibErr) throw sibErr;
      const gate = mesoActivationBlock(siblings ?? [], meso.position);
      if (gate.blocked) startBlockReason = gate.reason;
    }
  }

  // read-only plan view rows: flat day order across groups (planner board #2)
  const planDays: PlanViewDay[] = days.map((day) => {
    const dayPosById = new Map<string, number>();
    day.groups
      .flatMap((g, gi) =>
        g.fills.map((f, si) => ({
          id: f.id,
          pos: f.position ?? 0,
          gi,
          slot: f.slot_number ?? si + 1,
        })),
      )
      .sort((a, b) => a.pos - b.pos || a.gi - b.gi || a.slot - b.slot)
      .forEach((x, idx) => dayPosById.set(x.id, idx + 1));
    return {
      id: day.id,
      day_number: day.day_number,
      label: day.label,
      weekday: day.weekday,
      fills: day.groups.flatMap((g) =>
        g.fills.map((f, i) => ({
          id: f.id,
          exercise_name: f.exercise_name,
          equipment: f.exercise_equipment,
          initial_sets: f.initial_sets,
          muscle_group: g.muscle_group,
          day_position: dayPosById.get(f.id) ?? i + 1,
        })),
      ),
      openSlots: day.groups
        .map((g) => ({
          muscle_group: g.muscle_group,
          count: Math.max(0, g.exercise_slots - g.fills.length),
        }))
        .filter((s) => s.count > 0),
    };
  });

  const metaLine = `${meso.weeks} WEEKS · ${days.length} DAYS/WK${meso.includes_deload ? " · DELOAD" : ""}`;

  const overviewPanel = (
    <div key="overview">
      {meso.status === "active" && nextWorkout && currentMicro ? (
        <Link
          href={`/log/${nextWorkout.id}`}
          className="mt-4 block bg-ink py-[13px] text-center text-[11px] font-bold tracking-[0.1em] text-bg-base"
        >
          GO TO W{currentMicro.week_number}·D{nextWorkout.day_number}
        </Link>
      ) : meso.status === "planned" ? (
        <div className="mt-4">
          <StartMesoForm mesoId={meso.id} blockReason={startBlockReason} />
        </div>
      ) : null}

      <MesoPlanView days={planDays} />

      {deletion.hasHistory && (
        <p className="mt-4 text-[11px] leading-normal text-ink/55">
          This mesocycle has logged workouts, so its plan is locked here. Adjust
          exercises, order, or substitutions from the workout page — changes carry
          forward to the same day in future weeks.
        </p>
      )}
    </div>
  );

  return (
    <div>
      <MesoHeader
        mesoId={meso.id}
        mesoName={meso.name}
        status={meso.status}
        contextLabel={contextLabel}
        metaLine={metaLine}
        rampLine={`RAMP ${meso.rir_start} → ${meso.rir_end} RIR`}
        deloadLine={
          deloadRow
            ? `DELOAD W${deloadRow.weekNumber} — ${deloadRow.targetRir} RIR`
            : null
        }
        progressPct={progressPct}
        calendar={calendar}
        hasFills={hasFills}
        hasHistory={deletion.hasHistory}
        loggedSets={deletion.loggedSets}
      />

      {actionError === "template" && (
        <p className="mt-3 text-[11px] leading-normal text-accent">
          Couldn&apos;t save this plan as a template — try again from the header
          menu.
        </p>
      )}
      {actionError === "duplicate" && (
        <p className="mt-3 text-[11px] leading-normal text-accent">
          Couldn&apos;t duplicate this mesocycle — try again from the header
          menu.
        </p>
      )}

      {/* segmented control — instant client-state toggle (all panels' data is
          already fetched); `?view=` still seeds the initial panel for deep-links */}
      <SegmentedTabs
        labels={["OVERVIEW", "BALANCE", "PERFORMANCE"]}
        initial={view === "performance" ? 2 : view === "balance" ? 1 : 0}
        panels={[
          overviewPanel,
          <BalanceView key="balance" balance={stats.balance} />,
          <PerformanceView key="performance" stats={stats} />,
        ]}
      />
    </div>
  );
}

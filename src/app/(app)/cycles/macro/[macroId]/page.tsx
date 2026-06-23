import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { getMacroOverview, phaseLabel } from "@/lib/queries/macro";
import { getProfile } from "@/lib/queries/profiles";
import type { MacroRange } from "@/lib/engine";
import type { MacroGoalType, MesocycleRow } from "@/lib/types/database";
import { formatWeight } from "@/lib/units";
import { planMesoAction } from "../../actions";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function ym(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

function span(start: string, end: string | null): string {
  return end ? `${ym(start)} — ${ym(end)}` : ym(start);
}

const TARGET_NOUN: Record<MacroGoalType, string> = {
  hypertrophy: "LEAN MASS",
  strength: "KEY-LIFT STRENGTH",
  cut: "BODYWEIGHT",
  maintain: "RECOMPOSITION",
};

// weight ranges snap to 0.5 for display; percent goals pass through
function fmtNum(value: number, isPct: boolean): string {
  return isPct ? String(value) : formatWeight(value);
}

function fmtRange(r: MacroRange): string {
  const isPct = r.unit === "%";
  const unit = isPct ? "%" : ` ${r.unit}`;
  const sign = r.direction === "loss" ? "−" : "+";
  return r.low === r.high
    ? `${sign}${fmtNum(r.low, isPct)}${unit}`
    : `${sign}${fmtNum(r.low, isPct)}–${fmtNum(r.high, isPct)}${unit}`;
}

function fmtRate(r: MacroRange): string {
  const isPct = r.unit === "%";
  const unit = isPct ? "%" : ` ${r.unit}`;
  const sign = r.direction === "loss" ? "−" : "+";
  const body =
    r.low === r.high
      ? `${fmtNum(r.low, isPct)}${unit}`
      : `${fmtNum(r.low, isPct)}–${fmtNum(r.high, isPct)}${unit}`;
  return `≈ ${sign}${body} / month`;
}

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}

function TimelineMark({ meso, pos }: { meso: MesocycleRow; pos: number }) {
  if (meso.status === "completed")
    return (
      <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center bg-ink text-[11px] text-bg-base">
        ✓
      </div>
    );
  if (meso.status === "active")
    return (
      <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-2 border-accent text-[10px] font-extrabold text-accent">
        {pos}
      </div>
    );
  return (
    <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-[1.5px] border-dashed border-ink/45 text-[10px] font-bold text-ink/45">
      {pos}
    </div>
  );
}

/** Macrocycle Overview (fig 2.2): goal, realistic target, timeline, stats. */
export default async function MacroOverviewPage({
  params,
}: {
  params: Promise<{ macroId: string }>;
}) {
  const { macroId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");
  const { params: engineParams } = await getActiveEngineParams(supabase);

  const overview = await getMacroOverview(
    supabase,
    user.id,
    macroId,
    profile,
    engineParams,
  );
  if (!overview) notFound();
  const { macro, mesos, plan, stats } = overview;

  const months = macro.duration_months ?? plan.durationMonths;
  const hasTarget = plan.target.direction !== "none";
  const trainingAge = profile.training_since
    ? Math.max(
        0,
        (Date.now() - new Date(`${profile.training_since}T12:00:00`).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
  const statusBadge =
    macro.status === "active"
      ? { label: "ACTIVE", cls: "border-accent text-accent" }
      : macro.status === "completed"
        ? { label: "COMPLETE", cls: "border-ink/40 text-ink/55" }
        : { label: "ARCHIVED", cls: "border-ink/40 text-ink/55" };

  return (
    <div>
      <Link
        href="/cycles"
        className="text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ CYCLES
      </Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <div className="text-[27px] font-extrabold leading-none tracking-[-0.02em]">
            {macro.name}
          </div>
          {macro.goal_notes && (
            <div className="mt-[3px] text-[13px] font-semibold text-ink/55">
              {macro.goal_notes}
            </div>
          )}
        </div>
        <div
          className={`border-[1.5px] px-2 py-1 text-[9px] font-bold tracking-[0.12em] ${statusBadge.cls}`}
        >
          {statusBadge.label}
        </div>
      </div>
      <div className="mt-2.5 text-[10.5px] font-semibold tracking-[0.1em] text-ink/55">
        GOAL <span className="text-ink">{macro.goal_type.toUpperCase()}</span> ·{" "}
        {span(macro.start_date, macro.target_end_date)} · {months} MONTH
        {months === 1 ? "" : "S"}
      </div>

      {/* realistic target (engine output) */}
      <div className="mt-4 border-[1.5px] border-ink bg-paper px-[15px] py-3.5">
        <div className="text-[9.5px] font-bold tracking-[0.14em] text-ink/55">
          REALISTIC TARGET · {TARGET_NOUN[macro.goal_type]}
        </div>
        {hasTarget ? (
          <>
            <div className="mt-1.5 flex items-baseline gap-2">
              <div className="text-[34px] font-extrabold leading-none tracking-[-0.02em]">
                {fmtRange(plan.target)}
              </div>
              <div className="text-[12px] font-semibold text-ink/60">
                over {months} mo
              </div>
            </div>
            <div className="mt-[7px] text-[11px] font-semibold tracking-[0.02em] text-accent">
              {fmtRate(plan.perMonthRate)}
            </div>
          </>
        ) : (
          <div className="mt-1.5 text-[20px] font-extrabold tracking-[-0.01em]">
            Recomposition — no weight target
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {trainingAge != null && (
            <Chip>{trainingAge < 1 ? "<1" : Math.round(trainingAge)} YR TRAINING AGE</Chip>
          )}
          {profile.bodyweight && (
            <Chip>
              {Math.round(profile.bodyweight)} {profile.units.toUpperCase()}
            </Chip>
          )}
          {profile.experience_level && (
            <Chip>{profile.experience_level.toUpperCase()}</Chip>
          )}
        </div>
        <div className="mt-2 text-[9px] leading-normal text-ink/45">
          Estimate from your profile — a planning framework, not a guarantee.
        </div>
      </div>

      {/* mesocycle timeline */}
      <div className="mt-[18px] border-t-[1.5px] border-ink pt-[13px]">
        <div className="text-[9.5px] font-bold tracking-[0.14em] text-ink/55">
          MESOCYCLE TIMELINE
        </div>
        <div className="mt-[11px] flex flex-col gap-2">
          {mesos.map((meso, i) => {
            const phase = phaseLabel(meso.phase);
            const isUnplanned = meso.status === "unplanned";
            const pos = meso.position ?? i + 1;
            const parts = (state: string) =>
              [`MESO ${pos}`, phase, state].filter(Boolean).join(" · ");
            const sub =
              meso.status === "completed"
                ? parts("DONE")
                : meso.status === "active"
                  ? parts("IN PROGRESS")
                  : isUnplanned
                    ? [`SUGGESTED ${phase}`.trim(), "UNPLANNED"].join(" · ")
                    : parts("PLANNED");
            const inner = (
              <>
                <TimelineMark meso={meso} pos={pos} />
                <div className="flex-1">
                  <div
                    className={`text-[13px] font-bold ${isUnplanned ? "text-ink/50" : ""}`}
                  >
                    {isUnplanned ? `Mesocycle ${pos}` : meso.name}
                  </div>
                  <div
                    className={`text-[8.5px] font-semibold tracking-[0.1em] ${
                      meso.status === "active"
                        ? "text-accent"
                        : isUnplanned
                          ? "text-ink/42"
                          : "text-ink/50"
                    }`}
                  >
                    {sub}
                  </div>
                </div>
              </>
            );
            if (isUnplanned)
              return (
                <div key={meso.id} className="flex items-center gap-[11px]">
                  {inner}
                  <form action={planMesoAction}>
                    <input type="hidden" name="meso_id" value={meso.id} />
                    <button
                      type="submit"
                      className="border-[1.5px] border-dashed border-ink/45 px-[7px] py-1 text-[8.5px] font-bold tracking-[0.08em] text-ink/60"
                    >
                      + PLAN
                    </button>
                  </form>
                </div>
              );
            return (
              <Link
                key={meso.id}
                href={`/cycles/meso/${meso.id}`}
                className="flex items-center gap-[11px]"
              >
                {inner}
                <div
                  className={`h-1.5 w-[46px] flex-shrink-0 ${
                    meso.status === "completed"
                      ? "bg-ink"
                      : meso.status === "active"
                        ? "bg-accent"
                        : "bg-ink/15"
                  }`}
                />
              </Link>
            );
          })}
        </div>
      </div>

      {/* macrocycle stats */}
      <div className="mt-[18px] border-t-[1.5px] border-ink pt-[13px]">
        <div className="text-[9.5px] font-bold tracking-[0.14em] text-ink/55">
          MACROCYCLE STATS · TO DATE
        </div>
        <div className="mt-[11px] grid grid-cols-2 gap-[1.5px] border-[1.5px] border-ink bg-ink">
          <Stat
            value={stats.estStrengthPct == null ? "—" : `${stats.estStrengthPct > 0 ? "+" : ""}${stats.estStrengthPct}%`}
            label="EST. STRENGTH · KEY LIFTS"
          />
          <Stat value={fmtVolume(stats.totalVolume)} label={`TOTAL VOLUME · ${profile.units.toUpperCase()}`} />
          <Stat value={String(stats.sessionsLogged)} label="SESSIONS LOGGED" />
          <Stat
            value={stats.adherencePct == null ? "—" : `${stats.adherencePct}%`}
            label="ADHERENCE"
          />
        </div>
        <div className="mt-[9px] text-[10px] leading-normal text-ink/55">
          Per-meso detail in each meso&apos;s{" "}
          <strong className="text-ink">STATS</strong> tab.
        </div>
      </div>

      <Link
        href={`/cycles/macro/${macroId}/edit`}
        className="mb-6 mt-[18px] block border-[1.5px] border-ink py-[13px] text-center text-[11px] font-bold tracking-[0.1em] text-ink"
      >
        EDIT MACROCYCLE
      </Link>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-ink/30 px-2 py-1 text-[8.5px] font-semibold tracking-[0.1em] text-ink/70">
      {children}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-bg-base px-3 py-[11px]">
      <div className="numeral text-[22px] font-extrabold tracking-[-0.01em]">
        {value}
      </div>
      <div className="mt-0.5 text-[8.5px] font-semibold tracking-[0.1em] text-ink/55">
        {label}
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MacroHeader } from "./MacroHeader";
import { createClient } from "@/lib/supabase/server";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { getMacroOverview, phaseLabel } from "@/lib/queries/macro";
import { getMacroStats } from "@/lib/queries/stats";
import { getProfile } from "@/lib/queries/profiles";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { InfoDot } from "@/components/ui/InfoDot";
import type { GlossaryKey } from "@/lib/glossary";
import { BalanceView } from "@/components/stats/MesoStatsViews";
import { MuscleStrengthSection } from "@/components/stats/MuscleStrengthSection";
import type { MesocycleRow } from "@/lib/types/database";
import type {
  RetroBlocks,
  RetroDemand,
  RetroVerdict,
} from "@/lib/queries/macro-retrospective";
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

const VIEWS = ["overview", "balance", "performance"] as const;
type View = (typeof VIEWS)[number];

/**
 * Macrocycle page (fig 2.2 + M8, 2026-07-02): goal, timeline and stats on
 * OVERVIEW, plus the same BALANCE | PERFORMANCE tabs the meso page carries —
 * the macro-scope muscle-volume view and the est-strength trends (I11/PH37).
 * No mockup exists for the two stats tabs (owner-approved rule-8 deviation);
 * they reuse the meso stats views. The REALISTIC TARGET card is hidden (N21,
 * owner 2026-07-04) until the target engine is corrected — `planMacrocycle`
 * and the persisted target columns stay, so re-enabling is a pure view change.
 */
export default async function MacroOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ macroId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { macroId } = await params;
  const { view: viewParam } = await searchParams;
  const view: View = VIEWS.includes(viewParam as View)
    ? (viewParam as View)
    : "overview";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");
  const { params: engineParams } = await getActiveEngineParams(supabase);

  const [overview, macroStats] = await Promise.all([
    getMacroOverview(supabase, user.id, macroId, profile, engineParams),
    getMacroStats(supabase, user.id, macroId),
  ]);
  if (!overview) notFound();
  const { macro, mesos, plan, stats, retrospective } = overview;
  // §4.1: a terminal macro is frozen — no planning affordances on its timeline
  const frozen = macro.status !== "active";

  const months = macro.duration_months ?? plan.durationMonths;
  const metaLine = `GOAL ${macro.goal_type.toUpperCase()} · ${span(
    macro.start_date,
    macro.target_end_date,
  )} · ${months} MONTH${months === 1 ? "" : "S"}`;

  return (
    <div>
      {/* N24: the shared sticky header — edit lives in its ⋮ menu */}
      <MacroHeader
        macroId={macroId}
        name={macro.name}
        goalNotes={macro.goal_notes}
        metaLine={metaLine}
        status={macro.status}
      />

      {/* M8: the meso page's three-way toggle at macro scope — instant
          client-state switch, `?view=` seeds deep links */}
      <SegmentedTabs
        labels={["OVERVIEW", "BALANCE", "PERFORMANCE"]}
        initial={view === "performance" ? 2 : view === "balance" ? 1 : 0}
        panels={[
          <div key="overview">
      {/* mesocycle timeline (the REALISTIC TARGET card that led here is
          hidden — N21) */}
      <div className="mt-4 border-t-[1.5px] border-ink pt-[13px]">
        <div className="text-[9.5px] font-bold tracking-[0.14em] text-ink/55">
          MESOCYCLE TIMELINE
        </div>
        <div className="mt-[11px] flex flex-col gap-2">
          {mesos.map((meso, i) => {
            const phase = phaseLabel(meso.phase);
            const isUnplanned = meso.status === "unplanned";
            // N8: only current/completed render full ink — future mesos
            // (planned and unplanned) stay muted
            const muted =
              meso.status !== "active" && meso.status !== "completed";
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
                    : meso.status === "abandoned"
                      ? parts("ABANDONED")
                      : parts("PLANNED");
            const inner = (
              <>
                <TimelineMark meso={meso} pos={pos} />
                <div className="flex-1">
                  <div
                    className={`text-[13px] font-bold ${muted ? "text-ink/50" : ""}`}
                  >
                    {isUnplanned ? `Mesocycle ${pos}` : meso.name}
                  </div>
                  <div
                    className={`text-[8.5px] font-semibold tracking-[0.1em] ${
                      meso.status === "active"
                        ? "text-accent"
                        : isUnplanned
                          ? "text-ink/42"
                          : muted
                            ? "text-ink/45"
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
                  {/* §4.1: on a closed macro a placeholder was never built and
                      never will be — the plan affordance goes with the close */}
                  {frozen ? (
                    <div className="border-[1.5px] border-dashed border-ink/30 px-[7px] py-1 text-[8.5px] font-bold tracking-[0.08em] text-ink/45">
                      NOT BUILT
                    </div>
                  ) : (
                    <form action={planMesoAction}>
                      <input type="hidden" name="meso_id" value={meso.id} />
                      <button
                        type="submit"
                        className="border-[1.5px] border-dashed border-ink/45 px-[7px] py-1 text-[8.5px] font-bold tracking-[0.08em] text-ink/60"
                      >
                        + PLAN
                      </button>
                    </form>
                  )}
                </div>
              );
            return (
              <Link
                key={meso.id}
                href={`/cycles/meso/${meso.id}`}
                className="flex items-center gap-[11px]"
              >
                {inner}
                {/* N8 (owner, 2026-07-03 addendum): planned rows swap the
                    progress bar for the PLANNED badge (CURRENT's geometry
                    in ink); the bar stays for completed/active */}
                {meso.status === "planned" ? (
                  <div className="flex-shrink-0 border-[1.5px] border-ink px-[7px] py-[3px] text-[8.5px] font-bold tracking-[0.12em] text-ink">
                    PLANNED
                  </div>
                ) : (
                  <div
                    className={`h-1.5 w-[46px] flex-shrink-0 ${
                      meso.status === "completed"
                        ? "bg-ink"
                        : meso.status === "active"
                          ? "bg-accent"
                          : "bg-ink/15"
                    }`}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* macrocycle stats — doc 17 §4.2: once the macro completes the "to
          date" framing gives way to the retrospective, graded against the
          stored contract (09-changelog 2026-07-11) */}
      <div className="mt-[18px] border-t-[1.5px] border-ink pt-[13px]">
        <div className="text-[9.5px] font-bold tracking-[0.14em] text-ink/55">
          {retrospective ? "RETROSPECTIVE" : "MACROCYCLE STATS · TO DATE"}
        </div>
        {retrospective && (
          <div className="mt-[11px] flex flex-col gap-[9px]">
            {/* strength verdict vs the contract band — informational on a
                mass-goal macro (strength was never the promise) */}
            <RetroRow label="STRENGTH">
              {retrospective.strength.informational ? (
                <span className="text-[11px] font-semibold text-ink/55">
                  EST. {fmtPct(retrospective.strength.estStrengthPct)} · NOT
                  THE PROMISE
                </span>
              ) : (
                <>
                  <span className="text-[11px] font-semibold">
                    {fmtPct(retrospective.strength.estStrengthPct)}
                    {retrospective.strength.band && (
                      <span className="text-ink/55">
                        {" "}
                        · TARGET {fmtBandPct(retrospective.strength.band)}
                      </span>
                    )}
                  </span>
                  {retrospective.strength.verdict && (
                    <VerdictTag verdict={retrospective.strength.verdict} />
                  )}
                </>
              )}
            </RetroRow>
            {/* mass verdict: only ever graded against measured body data —
                "not measured" until a bodyweight series / DEXA exists */}
            {retrospective.mass && (
              <RetroRow
                label="MASS"
                note={retrospective.mass.note}
              >
                {retrospective.mass.measured ? (
                  <>
                    <span className="text-[11px] font-semibold">
                      {retrospective.mass.measuredDeltaLb! > 0 ? "+" : ""}
                      {retrospective.mass.measuredDeltaLb} LB
                    </span>
                    {retrospective.mass.verdict && (
                      <VerdictTag verdict={retrospective.mass.verdict} />
                    )}
                  </>
                ) : (
                  <span className="text-[11px] font-semibold text-ink/45">
                    NOT MEASURED
                  </span>
                )}
              </RetroRow>
            )}
            {/* demand-side aggregate — absent while no progression decisions
                exist over the span */}
            {retrospective.demand && (
              <RetroRow
                label="PROGRESSION"
                note={demandBreakdown(retrospective.demand)}
              >
                <span className="text-[11px] font-semibold">
                  {retrospective.demand.stepped} EARNED ·{" "}
                  {retrospective.demand.paced} PACED ·{" "}
                  {retrospective.demand.notEarned} HELD
                </span>
              </RetroRow>
            )}
            <RetroRow label="BLOCKS">
              <span className="text-[11px] font-semibold">
                {blocksLine(retrospective.blocks)}
              </span>
            </RetroRow>
          </div>
        )}
        <div className="mt-[11px] grid grid-cols-2 gap-[1.5px] border-[1.5px] border-ink bg-ink">
          <Stat
            value={stats.estStrengthPct == null ? "—" : `${stats.estStrengthPct > 0 ? "+" : ""}${stats.estStrengthPct}%`}
            label="EST. STRENGTH"
            info="est_strength"
          />
          <Stat value={fmtVolume(stats.totalVolume)} label="TOTAL VOLUME · LB" />
          <Stat value={String(stats.sessionsLogged)} label="SESSIONS LOGGED" />
          <Stat
            value={stats.adherencePct == null ? "—" : `${stats.adherencePct}%`}
            label="ADHERENCE"
          />
        </div>
        <div className="mb-6 mt-[9px] text-[10px] leading-normal text-ink/55">
          {retrospective && (
            <>
              Strength is an estimate graded against the goal set when this
              macrocycle was planned.{" "}
            </>
          )}
          Per-meso detail on each meso&apos;s{" "}
          <strong className="text-ink">BALANCE · PERFORMANCE</strong> tabs.
        </div>
      </div>
          </div>,
          <div key="balance">
            <BalanceView balance={macroStats.balance} />
            {macroStats.hasVolume && (
              <p className="mt-2 text-[9px] leading-normal tracking-[0.04em] text-ink/45">
                AVERAGED OVER LOGGED &amp; PLANNED WEEKS ACROSS THIS MACROCYCLE
                — UNBUILT FUTURE WEEKS EXCLUDED
              </p>
            )}
          </div>,
          <div key="performance">
            {/* N9: muscle-group gain is the macro-scope primary stat; the
                per-exercise detail lives in each group's drill-down (the flat
                all-exercises list stays a meso-tab idiom) */}
            <MuscleStrengthSection
              strength={macroStats.strength}
              scopeLabel="THIS MACROCYCLE"
              // N15: contributor rows drill into the macro-scoped history
              historyScope={{
                mesoIds: mesos.map((m) => m.id),
                label: "THIS MACROCYCLE",
              }}
            />
          </div>,
        ]}
      />
    </div>
  );
}

// --- retrospective helpers (doc 17 §4.2, 09-changelog 2026-07-11) -----------

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`;
}

/** The contract band, e.g. `+4–8%` (magnitudes are stored positive). */
function fmtBandPct(band: { low: number; high: number }): string {
  const lo = Math.min(band.low, band.high);
  const hi = Math.max(band.low, band.high);
  return `${lo > 0 ? "+" : ""}${lo}–${hi}%`;
}

function blocksLine(blocks: RetroBlocks): string {
  const parts = [`${blocks.completed} DONE`];
  if (blocks.abandoned > 0) parts.push(`${blocks.abandoned} ABANDONED`);
  if (blocks.notBuilt > 0) parts.push(`${blocks.notBuilt} NOT BUILT`);
  return parts.join(" · ");
}

/** Muted breakdown under the PROGRESSION row: pacer vs gate mix + the
 *  vanished share (the increment-sizing signal). */
function demandBreakdown(demand: RetroDemand): string {
  const parts: string[] = [];
  const ratePaced = demand.governorFirings["rate_pacer"] ?? 0;
  if (ratePaced > 0) parts.push(`${ratePaced} by the rate pacer`);
  if (demand.vanished > 0) {
    const share =
      demand.vanishedShare != null
        ? ` (${Math.round(demand.vanishedShare * 100)}% of earned asks)`
        : "";
    parts.push(`${demand.vanished} vanished${share}`);
  }
  return parts.length > 0
    ? parts.join(" · ")
    : `${demand.decisions} progression decisions over this macrocycle`;
}

/** Verdict tag — the PLANNED badge geometry in ink (the macro is over,
 *  nothing is "current"; orange stays position/selection only). */
function VerdictTag({ verdict }: { verdict: RetroVerdict }) {
  return (
    <div className="flex-shrink-0 border-[1.5px] border-ink px-[7px] py-[3px] text-[8.5px] font-bold tracking-[0.12em] text-ink">
      {verdict.toUpperCase()}
    </div>
  );
}

/** Ledger row: tracked caps label left, value (+ optional tag) right; an
 *  optional muted note line spans underneath. */
function RetroRow({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[8.5px] font-semibold tracking-[0.1em] text-ink/55">
          {label}
        </div>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {note && (
        <div className="mt-0.5 text-right text-[9px] leading-normal text-ink/45">
          {note}
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  info,
}: {
  value: string;
  label: string;
  info?: GlossaryKey;
}) {
  return (
    <div className="bg-bg-base px-3 py-[11px]">
      <div className="numeral text-[22px] font-extrabold tracking-[-0.01em]">
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[8.5px] font-semibold tracking-[0.1em] text-ink/55">
        {label}
        {info && <InfoDot term={info} small />}
      </div>
    </div>
  );
}

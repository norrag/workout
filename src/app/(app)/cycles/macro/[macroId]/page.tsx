import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MacroHeader } from "./MacroHeader";
import { createClient } from "@/lib/supabase/server";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { getMacroOverview, phaseLabel } from "@/lib/queries/macro";
import { getMacroStats } from "@/lib/queries/stats";
import { getProfile } from "@/lib/queries/profiles";
import {
  getBodyCompHistoryInRange,
  scanCompForSpan,
} from "@/lib/queries/body-comp";
import { getNewestBodyScan } from "@/lib/queries/body-scans";
import { BRACKET_TOLERANCE_DAYS } from "@/lib/queries/bodyweight";
import { dateAtLocalNoon, localDayIso, shortDate } from "@/lib/dates";
import { formatMeasuredLb } from "@/lib/units";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { GuideLink } from "@/components/ui/GuideLink";
import { GUIDE_LINKS } from "@/lib/guide-links";
import { InfoDot } from "@/components/ui/InfoDot";
import type { GlossaryKey } from "@/lib/glossary";
import { BalanceView } from "@/components/stats/MesoStatsViews";
import { MuscleStrengthSection } from "@/components/stats/MuscleStrengthSection";
import type { MesocycleRow, VBodyCompHistoryRow } from "@/lib/types/database";
import type {
  RetroBlocks,
  RetroComposition,
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
 * they reuse the meso stats views. The REALISTIC TARGET card is hidden again
 * (N54, owner 2026-07-11 — the Phase-R2 restore is rolled back until N43's v23
 * band makes the numbers trustworthy) — `planMacrocycle` and the persisted
 * target columns stay, so re-enabling is a pure view change.
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

  // 5b (doc 15 §3.2): scans inside the macro's window (±14-day bracket
  // tolerance) — the BODY COMPOSITION trend. One scan is not a trend and
  // renders nothing; the first→last change reuses the same fold as the
  // retrospective (tolerance ∞ — the endpoints ARE the window's scans).
  const compWindowMs = BRACKET_TOLERANCE_DAYS * 24 * 60 * 60 * 1000;
  const compRows = await getBodyCompHistoryInRange(
    supabase,
    user.id,
    new Date(
      dateAtLocalNoon(macro.start_date).getTime() - compWindowMs,
    ).toISOString(),
    new Date(
      dateAtLocalNoon(macro.target_end_date ?? localDayIso()).getTime() +
        compWindowMs,
    ).toISOString(),
  );
  const compChange =
    compRows.length >= 2
      ? scanCompForSpan(
          compRows,
          compRows[0].scanned_at,
          compRows[compRows.length - 1].scanned_at,
          Number.POSITIVE_INFINITY,
        )
      : null;
  // 5c (doc 15 §3.4): measured-RMR context on the goals that manage an energy
  // balance — cut and hypertrophy. Cunningham only (FFM-based, i.e. genuinely
  // DEXA-informed; Mifflin is height/weight arithmetic and doesn't qualify as
  // "measured from your lean mass"). Display-only — prescriptions, targets,
  // and verdicts never read it, and it must not grow nutrition tracking.
  const rmrScan =
    macro.goal_type === "cut" || macro.goal_type === "hypertrophy"
      ? await getNewestBodyScan(supabase, user.id)
      : null;
  const rmrKcal =
    rmrScan?.rmr_kcal_cunningham != null
      ? Math.round(Number(rmrScan.rmr_kcal_cunningham))
      : null;
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
          hidden again — N54, re-enable rides N43/v23) */}
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
            {/* 5b: measured Δlean/Δfat from scans bracketing the span —
                informational on every goal, LSC treatment per doc 15 §6.2 */}
            {retrospective.composition && (
              <RetroRow
                label="COMPOSITION"
                note={retrospective.composition.note}
              >
                {retrospective.composition.sameScanner ? (
                  <span className="text-[11px] font-semibold">
                    {compositionLine(retrospective.composition)}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-ink/45">
                    NOT COMPARABLE
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
        {/* doc 22 Phase 7, audit §3 #5 — the band this arc is graded against
            is not printed on any screen (N54 / `22a` D-15), so the section is
            where a reader learns what the grading is even about. Sits under the
            stats block rather than at the foot of the tab, so it reads as an
            answer to these numbers. */}
        {/* -mt-3 eats half the paragraph's mb-6 so the link reads as attached
            to it; the following block carries its own top margin, so the gated
            state above 1.1.0 and below it are spaced the same */}
        <GuideLink
          className="-mt-3"
          to={GUIDE_LINKS.macroTarget}
          from={`/cycles/macro/${macro.id}`}
        />
      </div>

      {/* 5b (doc 15 §3.2; 09 2026-07-11 5b §3): the composition trend —
          renders ONLY with ≥ 2 in-window scans (one scan is not a trend) */}
      {compRows.length >= 2 && (
        <div className="mt-[18px] border-t-[1.5px] border-ink pt-[13px]">
          <div className="text-[9.5px] font-bold tracking-[0.14em] text-ink/55">
            BODY COMPOSITION
          </div>
          <div className="mt-[11px] grid grid-cols-[1fr_auto_auto_auto] gap-x-5 gap-y-0">
            <div />
            <CompColHead label="LEAN LB" />
            <CompColHead label="FAT LB" />
            <CompColHead label="BF%" />
            {compRows.map((row) => (
              <CompScanRow key={row.scan_id} row={row} />
            ))}
          </div>
          {compChange && (
            <div className="mt-[9px] flex items-center justify-between gap-3 border-t-[1.5px] border-ink pt-[9px]">
              <div className="text-[8.5px] font-semibold tracking-[0.1em] text-ink/55">
                CHANGE
              </div>
              {compChange.sameScanner ? (
                <span className="text-[11px] font-semibold">
                  {compositionLine(compChange)}
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-ink/45">
                  DIFFERENT SCANNERS — NOT COMPARABLE
                </span>
              )}
            </div>
          )}
          <div className="mb-6 mt-[9px] text-[9px] leading-normal tracking-[0.04em] text-ink/45">
            DEXA READS QUARTERLY-PLUS — SCAN-TO-SCAN LEAN CHANGES UNDER ~2 LB
            SIT INSIDE MEASUREMENT NOISE
          </div>
        </div>
      )}

      {/* 5c (doc 15 §3.4; 09 2026-07-11 5c §3): maintenance context on the
          energy-balance goals, from the newest scan's FFM-based RMR.
          Display-only — nothing downstream reads it. */}
      {rmrKcal != null && rmrScan && (
        <div className="mt-[18px] border-t-[1.5px] border-ink pt-[13px]">
          <div className="text-[9.5px] font-bold tracking-[0.14em] text-ink/55">
            MEASURED RMR
          </div>
          <div className="mt-[11px] flex items-baseline justify-between">
            <div className="numeral text-[22px] font-extrabold tracking-[-0.01em]">
              {rmrKcal.toLocaleString("en-US")}{" "}
              <span className="text-[11px] font-semibold tracking-[0.08em] text-ink/55">
                KCAL/DAY
              </span>
            </div>
            <div className="text-[9px] font-medium tracking-[0.1em] text-ink/50">
              SCAN {shortDate(rmrScan.scanned_at)}
            </div>
          </div>
          <div className="mb-6 mt-[9px] text-[9px] leading-normal tracking-[0.04em] text-ink/45">
            RESTING METABOLIC RATE FROM YOUR LEAN MASS (CUNNINGHAM) — DAILY
            MAINTENANCE SITS ABOVE IT ONCE ACTIVITY IS ADDED. CONTEXT FOR THIS{" "}
            {macro.goal_type === "cut" ? "CUT" : "GAINING"} BLOCK ONLY —
            PRESCRIPTIONS AND TARGETS NEVER READ IT
          </div>
        </div>
      )}
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
            {/* doc 22 Phase 7, audit §3 #6 — macro scope is where a cut block
                sits next to a bulk block, so comparability is the question this
                screen actually invites */}
            <GuideLink
              rule
              className="mt-4"
              to={GUIDE_LINKS.comparability}
              from={`/cycles/macro/${macro.id}?view=performance`}
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

/** One line for a same-scanner composition change: sub-LSC deltas carry the
 *  RANGE marker — never presented as a change (doc 15 §6.2 rule 1). */
function compositionLine(c: RetroComposition): string {
  const part = (
    label: string,
    delta: number | null,
    withinNoise: boolean | null,
  ): string | null => {
    if (delta == null) return null;
    const v = `${label} ${delta > 0 ? "+" : ""}${delta} LB`;
    return withinNoise ? `${v} (IN RANGE)` : v;
  };
  const parts = [
    part("LEAN", c.deltaLeanLb, c.leanWithinNoise),
    part("FAT", c.deltaFatLb, c.fatWithinNoise),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function CompColHead({ label }: { label: string }) {
  return (
    <div className="pb-1 text-right text-[9px] font-semibold tracking-[0.1em] text-ink/45">
      {label}
    </div>
  );
}

/** One scan in the BODY COMPOSITION trend (values as measured, no deltas —
 *  the CHANGE line below carries the guarded first→last comparison). */
function CompScanRow({ row }: { row: VBodyCompHistoryRow }) {
  const cell = (v: string) => (
    <div className="numeral border-b border-ink/15 py-2 text-right text-sm">
      {v}
    </div>
  );
  return (
    <>
      <div className="border-b border-ink/15 py-2 text-[10px] font-semibold tracking-[0.12em] text-ink/55">
        {shortDate(row.scanned_at)}
      </div>
      {cell(
        row.lean_mass_lb != null
          ? formatMeasuredLb(Number(row.lean_mass_lb))
          : "—",
      )}
      {cell(
        row.fat_mass_lb != null
          ? formatMeasuredLb(Number(row.fat_mass_lb))
          : "—",
      )}
      {cell(row.body_fat_pct != null ? `${row.body_fat_pct}` : "—")}
    </>
  );
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

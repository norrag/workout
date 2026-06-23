import { formatWeight } from "@/lib/units";
import type { MesoStats } from "@/lib/queries/stats";

// Shared renderers for the meso-stats views (figs 4.1–4.3) — used by the
// stats screen and the Workout-tab resting state (08 §2).

function weekColWidth(count: number): number {
  return count <= 4 ? 42 : count <= 6 ? 34 : 28;
}

function weekLabel(week: { week_number: number; is_deload: boolean }): string {
  return week.is_deload ? "DL" : `W${week.week_number}`;
}

// ---------------------------------------------------------------------------
// 4.1 — volume: sets per muscle group per week
// ---------------------------------------------------------------------------

export function VolumeView({ stats }: { stats: MesoStats }) {
  const { weeks, volume, currentWeek } = stats;
  const col = weekColWidth(weeks.length);
  const gridCols = {
    gridTemplateColumns: `1fr repeat(${weeks.length}, ${col}px)`,
  };
  const cellClass = (kind: string) =>
    kind === "current"
      ? "font-bold"
      : kind === "logged"
        ? "font-semibold"
        : "font-medium text-ink/45";
  const futureWeeks = weeks.filter(
    (w) => w.status === "pending" && currentWeek != null,
  );

  return (
    <div>
      <div className="mt-[18px] border-t-[1.5px] border-ink">
        <div
          className="grid gap-1.5 pb-[5px] pt-[9px] text-[9px] font-semibold tracking-[0.12em] text-ink/50"
          style={gridCols}
        >
          <div>SETS / WEEK</div>
          {weeks.map((w) => (
            <div
              key={w.week_number}
              className={`text-center ${w.week_number === currentWeek ? "font-bold text-accent" : ""}`}
            >
              {w.week_number === currentWeek ? "● " : ""}
              {weekLabel(w)}
            </div>
          ))}
        </div>
        {volume.groups.map((group) => (
          <div
            key={group.name}
            className="grid items-baseline gap-1.5 border-t border-ink/15 py-2"
            style={gridCols}
          >
            <div className="text-[10.5px] font-bold tracking-[0.1em]">
              {group.name.toUpperCase()}
            </div>
            {group.cells.map((cell, i) => (
              <div
                key={i}
                className={`numeral text-center text-[13px] ${cellClass(cell.kind)}`}
              >
                {cell.value ?? "—"}
              </div>
            ))}
          </div>
        ))}
        <div
          className="grid items-baseline gap-1.5 border-b-[1.5px] border-t-[1.5px] border-ink pb-2.5 pt-[9px]"
          style={gridCols}
        >
          <div className="text-[10.5px] font-bold tracking-[0.1em]">TOTAL</div>
          {volume.totals.map((cell, i) => (
            <div
              key={i}
              className={`numeral text-center text-[13px] ${
                cell.kind === "current"
                  ? "font-bold text-accent"
                  : cell.kind === "logged"
                    ? "font-bold"
                    : "font-semibold text-ink/45"
              }`}
            >
              {cell.value ?? "—"}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[9.5px] font-medium tracking-[0.1em] text-ink/50">
        {volume.currentLogged != null && currentWeek != null ? (
          <span className="font-bold text-accent">
            ● W{currentWeek} — {volume.currentLogged} OF{" "}
            {volume.currentPlanned} PLANNED SETS
          </span>
        ) : (
          <span />
        )}
        {futureWeeks.length > 0 && (
          <span>
            {futureWeeks.length === 1
              ? weekLabel(futureWeeks[0])
              : `${weekLabel(futureWeeks[0])}–${weekLabel(futureWeeks.at(-1)!)}`}{" "}
            = AUTOREGULATED PLAN
          </span>
        )}
      </div>
      {volume.groups.length === 0 && (
        <p className="mt-4 text-sm text-ink/45">Nothing planned yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4.2 — balance: push/pull/legs cards, per-muscle bars, balance check
// ---------------------------------------------------------------------------

export function BalanceView({ stats }: { stats: MesoStats }) {
  const { balance } = stats;
  const max = Math.max(1, ...balance.bars.map((b) => b.avg));
  const cards = [
    { label: "PUSH", value: balance.push },
    { label: "PULL", value: balance.pull },
    { label: "LEGS", value: balance.legs },
  ];

  return (
    <div>
      <div className="mt-[18px] flex gap-2.5">
        {cards.map((card) => (
          <div key={card.label} className="flex-1 border border-ink/35 px-3 py-2.5">
            <div className="text-[9px] font-semibold tracking-[0.14em] text-ink/55">
              {card.label}
            </div>
            <div className="numeral mt-1 text-2xl font-extrabold">
              {card.value}
            </div>
            <div className="mt-0.5 text-[8.5px] font-medium tracking-[0.1em] text-ink/50">
              SETS / WK
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[18px] border-t-[1.5px] border-ink pt-2.5">
        <div className="mb-1.5 text-[9px] font-semibold tracking-[0.12em] text-ink/50">
          AVG SETS / WEEK — PLANNED
        </div>
        {balance.bars.map((bar) => (
          <div
            key={bar.name}
            className="grid items-center gap-2.5 py-[5px]"
            style={{ gridTemplateColumns: "92px 1fr 30px" }}
          >
            <div className="text-[10.5px] font-bold tracking-[0.1em]">
              {bar.name.toUpperCase()}
            </div>
            <div className="h-3.5 bg-ink/[0.08]">
              <div
                className="h-full bg-ink"
                style={{ width: `${Math.round((bar.avg / max) * 100)}%` }}
              />
            </div>
            <div className="numeral text-right text-xs font-semibold">
              {bar.avg}
            </div>
          </div>
        ))}
        {balance.bars.length === 0 && (
          <p className="py-3 text-sm text-ink/45">Nothing planned yet.</p>
        )}
      </div>

      {balance.note && (
        <div className="mt-4 border border-ink/35 px-4 py-3.5">
          <div className="text-[10px] font-bold tracking-[0.14em] text-accent">
            BALANCE CHECK
          </div>
          <div className="mt-1.5 text-[13px] leading-[1.55] text-ink/80">
            {balance.note}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4.3 — performance: top set by week, e1RM across macro, PRs this meso
// ---------------------------------------------------------------------------

export function PerformanceView({ stats, unit }: { stats: MesoStats; unit: string }) {
  const { weeks, performance } = stats;
  const liftGrid = { gridTemplateColumns: `repeat(${weeks.length}, 1fr)` };
  const chartMax = Math.max(
    1,
    ...performance.macroChart.map((b) => b.e1rm ?? 0),
  );

  return (
    <div>
      <div className="mt-[18px] border-t-[1.5px] border-ink pt-[9px]">
        <div className="text-[9px] font-semibold tracking-[0.12em] text-ink/50">
          TOP SET BY WEEK — KEY LIFTS · {unit.toUpperCase()}
        </div>
        {performance.keyLifts.map((lift) => (
          <div
            key={lift.exercise_id}
            className="border-b border-ink/15 py-2.5"
          >
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-bold">{lift.name}</div>
              {lift.badge && (
                <div className="border border-ink px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em]">
                  {lift.badge}
                </div>
              )}
            </div>
            <div className="mt-2 grid gap-1.5" style={liftGrid}>
              {lift.cells.map((cell, i) =>
                cell ? (
                  <div
                    key={i}
                    className={`numeral box-border text-center text-[11.5px] ${
                      cell.isCurrent
                        ? "border-2 border-accent py-1.5 font-bold text-accent"
                        : "border border-ink/30 py-[7px] font-semibold"
                    }`}
                  >
                    {formatWeight(cell.weight)} × {cell.reps}
                  </div>
                ) : (
                  <div
                    key={i}
                    className="border border-dashed border-ink/30 py-[7px] text-center text-[11.5px] font-medium text-ink/40"
                  >
                    —
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
        {performance.keyLifts.length === 0 && (
          <p className="py-3 text-sm text-ink/45">Nothing logged yet.</p>
        )}
      </div>

      {performance.macroChart.length > 0 && performance.macroLiftName && (
        <div className="mt-4">
          <div className="flex justify-between text-[9px] font-semibold tracking-[0.12em] text-ink/50">
            <span>
              ACROSS MACRO — {performance.macroLiftName.toUpperCase()} EST. 1RM
            </span>
            {performance.macroChart.some((b) => b.state === "current") && (
              <span className="font-bold text-accent">
                {performance.macroChart.find((b) => b.state === "current")?.label}{" "}
                TO DATE
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-stretch gap-2">
            {performance.macroChart.map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col gap-1">
                <div
                  className={`numeral text-center text-[11px] ${
                    bar.state === "current"
                      ? "font-bold text-accent"
                      : bar.state === "past"
                        ? "font-bold"
                        : "font-medium text-ink/40"
                  }`}
                >
                  {bar.e1rm != null ? formatWeight(bar.e1rm) : "—"}
                </div>
                <div className="flex h-12 items-end">
                  {bar.state === "future" || bar.e1rm == null ? (
                    <div className="box-border h-full w-full border border-dashed border-ink/30" />
                  ) : (
                    <div
                      className={`w-full ${bar.state === "current" ? "box-border border-2 border-accent" : "bg-ink"}`}
                      style={{
                        height: `${Math.round((bar.e1rm / chartMax) * 84)}%`,
                      }}
                    />
                  )}
                </div>
                <div
                  className={`text-center text-[8.5px] tracking-[0.1em] ${
                    bar.state === "current"
                      ? "font-bold text-accent"
                      : "font-semibold text-ink/55"
                  }`}
                >
                  {bar.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t-[1.5px] border-ink">
        <div className="pt-[9px] text-[9px] font-semibold tracking-[0.12em] text-ink/50">
          PRS THIS MESO
        </div>
        {performance.prs.map((pr, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between border-b border-ink/15 py-2.5 last:border-b-0"
          >
            <div className="numeral text-sm font-bold">{pr.label}</div>
            <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
              {pr.coordinate} · {pr.kind}
            </div>
          </div>
        ))}
        {performance.prs.length === 0 && (
          <p className="py-3 text-sm text-ink/45">No PRs yet this meso.</p>
        )}
      </div>
    </div>
  );
}

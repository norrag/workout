"use client";

export interface FilterAxisOption {
  value: string;
  label: string;
}

export interface FilterAxis {
  /** Stable key handed back through onChange (e.g. "muscle", "days"). */
  key: string;
  /** Tracked-caps axis caption rendered left of the chip track. */
  label: string;
  options: FilterAxisOption[];
  /** Active option value, or null when the axis is unfiltered. */
  value: string | null;
  /** Label for the leading reset chip. Defaults to ALL. */
  allLabel?: string;
}

const chipBase =
  "min-h-8 px-2.5 py-1.5 text-[10.5px] tracking-[0.08em] whitespace-nowrap";
const chipOn = `bg-ink text-bg-base font-bold flex items-center gap-2 ${chipBase}`;
const chipOff = `border-[1.5px] border-ink/40 text-ink/55 font-medium ${chipBase}`;

/**
 * Shared filter grammar (N29, generalizing the fig 3.1 two-axis idiom): each
 * axis is a tracked-caps caption + a horizontally scrolling chip track led by
 * an ALL reset chip. Selected = filled ink with an ✕ to clear (tapping it also
 * clears). While any axis is active, a live result count and CLEAR ALL appear.
 * Purely presentational — state lives with the caller, so the same bar serves
 * client-state surfaces (exercises, planner picker) and URL-driven ones
 * (templates) alike.
 */
export function FilterBar({
  axes,
  onChange,
  onClearAll,
  summary,
  className,
}: {
  axes: FilterAxis[];
  onChange: (key: string, value: string | null) => void;
  /** Clears every axis in one step (URL drivers need a single navigation).
   *  Defaults to calling onChange(key, null) per active axis. */
  onClearAll?: () => void;
  /** Result count shown while filtering: "12 OF 30 EXERCISES", or without
   *  `total` just "12 TEMPLATES" (server-filtered surfaces don't know the
   *  unfiltered total). */
  summary?: { visible: number; total?: number; noun: string };
  className?: string;
}) {
  const active = axes.filter((a) => a.value != null && a.value !== "");
  const clearAll =
    onClearAll ?? (() => active.forEach((a) => onChange(a.key, null)));

  return (
    <div className={className}>
      {axes.map((axis, i) => (
        <div
          key={axis.key}
          className={`flex items-center gap-2 ${i === 0 ? "" : "mt-2"}`}
        >
          <span className="w-[52px] flex-shrink-0 text-[10px] font-semibold tracking-[0.12em] text-ink/55">
            {axis.label}
          </span>
          <div className="flex gap-1.5 overflow-x-auto">
            <button
              type="button"
              aria-pressed={!axis.value}
              onClick={() => onChange(axis.key, null)}
              className={axis.value ? chipOff : chipOn}
            >
              {(axis.allLabel ?? "ALL").toUpperCase()}
            </button>
            {axis.options.map((o) =>
              axis.value === o.value ? (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed
                  onClick={() => onChange(axis.key, null)}
                  className={chipOn}
                >
                  {o.label.toUpperCase()} <span className="opacity-60">✕</span>
                </button>
              ) : (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={false}
                  onClick={() => onChange(axis.key, o.value)}
                  className={chipOff}
                >
                  {o.label.toUpperCase()}
                </button>
              ),
            )}
          </div>
        </div>
      ))}

      {active.length > 0 && summary && (
        <div className="mt-2.5 flex items-baseline justify-between">
          <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/45">
            {summary.visible}
            {summary.total != null ? ` OF ${summary.total}` : ""} {summary.noun}
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="border-b-[1.5px] border-ink text-[9.5px] font-bold tracking-[0.1em] text-ink"
          >
            CLEAR ALL
          </button>
        </div>
      )}
    </div>
  );
}

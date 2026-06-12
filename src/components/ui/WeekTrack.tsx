export type WeekTrackWeek = {
  label: string;
  state: "complete" | "current" | "future";
  isDeload?: boolean;
};

/**
 * Meso week track (fig 1.1): filled ink = done, 2px ink frame + orange
 * dot = current, faint frame = future, dashed = planned deload.
 */
export function WeekTrack({ weeks }: { weeks: WeekTrackWeek[] }) {
  return (
    <div className="flex items-stretch gap-[5px]">
      {weeks.map((week, i) => {
        const cls =
          week.state === "complete"
            ? "bg-ink font-semibold text-bg-base"
            : week.state === "current"
              ? "relative border-2 border-ink font-bold"
              : week.isDeload
                ? "border border-dashed border-ink/40 font-medium text-ink/45"
                : "border border-ink/30 font-medium text-ink/45";
        return (
          <div
            key={i}
            className={`flex h-8 items-center justify-center text-[10.5px] tracking-[0.08em] ${
              week.isDeload ? "flex-[0.8]" : "flex-1"
            } ${cls}`}
          >
            {week.label}
            {week.state === "current" && (
              <div className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </div>
        );
      })}
    </div>
  );
}

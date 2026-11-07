/** DayView's SetRow visual cells, shared by the tape logger without importing
 * any workout state, prescription logic or write queue. Keep these literal
 * utilities here so Tailwind generates the same styles for both surfaces. */
export function loggingCellClass(
  state: "logged" | "next" | "skipped" | "future",
): string {
  const base =
    "h-[35px] w-full text-center text-[15px] focus:outline-none numeral";
  return state === "logged"
    ? `${base} border border-ink/30 bg-ink/5 font-semibold`
    : state === "next"
      ? `${base} border-[1.5px] border-ink bg-paper font-semibold`
      : state === "skipped"
        ? `${base} border border-ink/15 font-medium text-ink/30 line-through`
        : `${base} border border-ink/25 font-medium text-ink/45`;
}

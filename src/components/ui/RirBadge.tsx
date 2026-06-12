export function RirBadge({
  rir,
  isDeload = false,
}: {
  rir: number;
  isDeload?: boolean;
}) {
  const label = isDeload ? "DELOAD" : rir === 0 ? "0 RIR — PEAK" : `${rir} RIR`;
  const look = isDeload
    ? "border border-dashed border-ink/40 text-ink/55"
    : rir === 0
      ? "border-[1.5px] border-accent text-accent"
      : "border border-ink/35 text-ink/55";
  return (
    <span
      className={`label-caps numeral inline-flex items-center px-2 py-0.5 text-[10px] font-bold ${look}`}
    >
      {label}
    </span>
  );
}

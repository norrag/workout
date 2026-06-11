export function RirBadge({
  rir,
  isDeload = false,
}: {
  rir: number;
  isDeload?: boolean;
}) {
  const label = isDeload ? "DELOAD" : rir === 0 ? "0 RIR — PEAK" : `${rir} RIR`;
  return (
    <span
      className={`label-caps numeral inline-flex items-center rounded-[6px] border px-2 py-0.5 text-xs font-semibold ${
        rir === 0 && !isDeload
          ? "border-accent text-accent"
          : "border-border-subtle text-text-secondary"
      }`}
    >
      {label}
    </span>
  );
}

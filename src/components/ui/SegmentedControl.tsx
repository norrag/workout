"use client";

/**
 * Filled-ink segmented control: 1.5px ink frame, the active segment
 * inverts to cream-on-ink (08 §1 — VOLUME/BALANCE/PERFORMANCE, LB/KG).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex border-[1.5px] border-ink ${className}`}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`label-caps min-h-11 flex-1 px-3 text-[10px] transition-colors duration-150 ${
              active ? "bg-ink font-bold text-bg-base" : "font-medium text-ink/55"
            } ${i > 0 ? "border-l border-ink/30" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

/**
 * Filled-ink segmented control: 1.5px ink frame, the active segment
 * inverts to cream-on-ink (08 §1 — e.g. VOLUME/BALANCE/PERFORMANCE).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
  disabled = false,
  compact = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
  /** Match the 35px logging cells without changing existing controls. */
  compact?: boolean;
}) {
  return (
    <div
      className={`flex border-[1.5px] border-ink ${compact ? "h-[35px]" : ""} ${className}`}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`label-caps ${compact ? "h-full min-h-0 px-2" : "min-h-11 px-3"} flex-1 text-[10px] transition-colors duration-150 ${
              active
                ? "bg-ink font-bold text-bg-base"
                : "font-medium text-ink/55"
            } ${i > 0 ? "border-l border-ink/30" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

/**
 * Wrapping single-select tap-chips for 5–8 options (docs/08-ui-design-corpus.md).
 * Selected: accent border + accent text (active state, not the CTA).
 */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  label,
  render = (v) => String(v),
}: {
  options: readonly T[];
  value: T | null;
  onChange: (next: T) => void;
  label: string;
  render?: (v: T) => string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-2"
    >
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={opt === value}
          onClick={() => onChange(opt)}
          className={`label-caps min-h-11 rounded-[6px] border px-3 text-xs font-semibold transition-colors duration-150 ${
            opt === value
              ? "border-accent text-accent"
              : "border-border-subtle bg-bg-raised text-text-secondary"
          }`}
        >
          {render(opt)}
        </button>
      ))}
    </div>
  );
}

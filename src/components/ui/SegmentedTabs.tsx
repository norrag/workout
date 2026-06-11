"use client";

/**
 * Equal-width slice control for 2–7 parallel items (docs/08-ui-design-corpus.md).
 * Selected slice: raised surface + primary text.
 */
export function SegmentedTabs<T extends string | number>({
  items,
  value,
  onChange,
  label,
  render = (v) => String(v),
}: {
  items: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  render?: (v: T) => string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex rounded-[6px] border border-border-subtle bg-bg-base p-1"
    >
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={item === value}
          onClick={() => onChange(item)}
          className={`label-caps min-h-10 flex-1 rounded-[5px] text-xs font-semibold transition-colors duration-150 ${
            item === value
              ? "bg-bg-raised text-text-primary"
              : "text-text-secondary"
          }`}
        >
          {render(item)}
        </button>
      ))}
    </div>
  );
}

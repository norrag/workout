"use client";

/**
 * Discrete feedback options (fig 1.4 joint pain): the selected option is
 * an accent fill — selection is one of the two permitted orange uses.
 */
export function FeedbackScale({
  question,
  options,
  value,
  onChange,
}: {
  question: string;
  options: readonly string[];
  value: number | null;
  onChange: (index: number) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[13px] font-bold text-ink">{question}</legend>
      <div className="flex gap-[7px]">
        {options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            aria-pressed={value === i}
            onClick={() => onChange(i)}
            className={`min-h-[46px] flex-1 px-2 text-xs transition-colors duration-150 ${
              value === i
                ? "bg-accent font-bold text-bg-base"
                : "border border-ink/40 font-medium text-ink"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

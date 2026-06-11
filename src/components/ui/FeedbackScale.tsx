"use client";

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
      <legend className="text-sm text-text-primary">{question}</legend>
      <div className="flex gap-2">
        {options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            aria-pressed={value === i}
            onClick={() => onChange(i)}
            className={`min-h-11 flex-1 rounded-[6px] border px-2 text-sm transition-colors duration-150 ${
              value === i
                ? "border-accent text-accent"
                : "border-border-subtle bg-bg-raised text-text-secondary"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

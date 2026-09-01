import { type ButtonHTMLAttributes, forwardRef } from "react";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** filled-ink selection state (08 §1) */
  selected?: boolean;
  /** dashed border = empty/planned/add affordance (08 §1) */
  dashed?: boolean;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, dashed = false, className = "", ...props },
  ref,
) {
  const look = selected
    ? "border-[1.5px] border-ink bg-ink font-bold text-bg-base"
    : dashed
      ? "border border-dashed border-ink/40 font-medium text-ink-muted"
      : "border border-ink/40 font-medium text-ink";
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={`label-caps inline-flex min-h-11 items-center justify-center px-3 text-[11px] transition-colors duration-150 ${look} ${className}`}
      {...props}
    />
  );
});

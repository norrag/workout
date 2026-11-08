import { type InputHTMLAttributes, forwardRef, useId } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Dense logging controls; other forms retain the standard 44px size. */
  compact?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, className = "", id, compact = false, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="label-caps text-[10px] font-semibold text-ink/55"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`${compact ? "h-[35px] min-h-[35px] px-2 text-[15px]" : "min-h-11 px-3 text-base"} border border-ink/30 bg-paper text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink ${className}`}
        {...props}
      />
    </div>
  );
});

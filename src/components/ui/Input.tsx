import { type InputHTMLAttributes, forwardRef, useId } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, className = "", id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="label-caps text-xs font-semibold text-text-secondary"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`min-h-11 rounded-[6px] border border-border-subtle bg-bg-raised px-3 text-base text-text-primary placeholder:text-text-secondary/60 focus:border-accent focus:outline-none ${className}`}
        {...props}
      />
    </div>
  );
});

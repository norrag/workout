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
          className="label-caps text-[10px] font-semibold text-ink/55"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`min-h-11 border border-ink/30 bg-paper px-3 text-base text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink ${className}`}
        {...props}
      />
    </div>
  );
});

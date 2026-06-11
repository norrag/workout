import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "label-caps inline-flex min-h-11 items-center justify-center rounded-[6px] px-4 text-sm font-semibold transition-colors duration-150 ease-out disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-bg-base active:bg-accent-pressed",
  secondary:
    "bg-bg-raised text-text-primary border border-border-subtle active:bg-bg-surface",
  ghost: "bg-transparent text-text-secondary active:text-text-primary",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "secondary", className = "", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);

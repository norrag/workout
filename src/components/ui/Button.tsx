import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "label-caps inline-flex min-h-11 items-center justify-center px-5 text-xs font-bold transition-colors duration-150 ease-out disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg-base active:bg-ink/85",
  secondary: "border-[1.5px] border-ink text-ink active:bg-ink/5",
  ghost: "bg-transparent font-semibold text-ink/60 active:text-ink",
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

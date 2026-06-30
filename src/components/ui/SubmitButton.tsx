"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * Submit button for plain `<form action={serverAction}>` flows. Reads the form's
 * pending state via `useFormStatus` (so it must render *inside* the `<form>`) and
 * disables + optionally swaps its label while the action runs — so a submit that
 * does server work then redirects is acknowledged the instant it's tapped instead
 * of sitting dead (perf WS-J, Phase A). `disabled:opacity-50` is always applied.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "",
  disabled = false,
  ...rest
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  className?: string;
  /** an external gate (e.g. a confirmation checkbox) OR'd with the pending state */
  disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled">) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={`${className} transition-opacity disabled:opacity-50`}
      {...rest}
    >
      {pending && pendingLabel != null ? pendingLabel : children}
    </button>
  );
}

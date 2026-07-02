"use client";

/**
 * LogCheckbox — the set "LOG" control (fig 1.1 set grid).
 *
 * Three visual states on the same 21px square, square-cornered per the light
 * ledger system (08 §1):
 *   - empty  : ink outline, tap to log
 *   - checked: filled ink box with a ✓ (tap to uncheck, unless read-only)
 *   - loading: the outline itself with a gap that travels around the perimeter
 *
 * The visual stays 21px (mockup fidelity), but the button itself fills the
 * 44×32px LOG cell — the most-tapped control in the app was a 21px target,
 * below the WCAG 2.2 minimum (R18).
 *
 * The loading state is the immediate acknowledgement that a tap registered —
 * the write fires in the background (no blocking, no full-page refresh) and the
 * box resolves to checked on success or rolls back to empty (with a brief
 * shake) on failure. Motion is disabled under prefers-reduced-motion.
 */

const TARGET = "flex h-8 w-11 items-center justify-center";

export function LogCheckbox({
  checked,
  loading,
  error = false,
  readOnly = false,
  ariaLabel,
  onClick,
}: {
  checked: boolean;
  loading: boolean;
  error?: boolean;
  readOnly?: boolean;
  ariaLabel: string;
  onClick?: () => void;
}) {
  if (loading) {
    return (
      <span
        role="status"
        aria-label={`${ariaLabel} — saving`}
        className={`${TARGET} text-ink`}
      >
        <svg viewBox="0 0 21 21" className="h-[21px] w-[21px]" aria-hidden>
          <rect
            x="1.5"
            y="1.5"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            pathLength={100}
            className="log-checkbox-gap"
          />
        </svg>
      </span>
    );
  }

  if (checked) {
    const box = `flex h-[21px] w-[21px] items-center justify-center bg-ink text-[12px] text-bg-base ${
      error ? "log-checkbox-shake" : ""
    }`;
    if (readOnly) {
      return (
        <div aria-label={ariaLabel} className={TARGET}>
          <span className={box}>✓</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className={TARGET}
      >
        <span className={box}>✓</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={TARGET}
    >
      <span
        className={`h-[21px] w-[21px] border-2 border-ink ${error ? "log-checkbox-shake" : ""}`}
      />
    </button>
  );
}

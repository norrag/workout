/**
 * Edit-note pencil (PH42): a legible inline pencil replacing the bare `✎`
 * Unicode glyph used across the app (day-view notes, exercise history, the
 * pinned-note affordance). Inherits color via `currentColor`; size defaults to
 * 16 — ~20% larger than the old glyph and matching the icon-row SVGs.
 */
export function PencilGlyph({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
    >
      <path
        d="M11.3 2.3 13.7 4.7 5.4 13 2.2 13.8 3 10.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M10 3.6 12.4 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

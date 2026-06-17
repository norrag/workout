/**
 * Skeleton — square, pulsing ink wash used inside route loading boundaries so a
 * tapped tab/link paints an instant placeholder instead of blocking on the RSC
 * fetch. Square corners + ink wash keep it in the light ledger system (08 §1);
 * the pulse is disabled under prefers-reduced-motion.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse bg-ink/10 motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Cold-start splash (perf WS-J). The `(app)` layout blocks on a network
 * `auth.getUser()` before it can render the shell, and the heavy day-view route
 * then fetches its data — so on a cold/hard load there's nothing to paint and the
 * viewport sits blank (black on a dark-themed device) for the whole TTFB, reading
 * as "hung". Streamed as the root Suspense fallback, this paints from the first
 * byte: the app background + logotype + a quiet activity cue, so a cold launch
 * always shows the app starting rather than a black void. Theme-aware via
 * `bg-bg-base`/`text-ink`; replaced by the real shell the moment it streams in.
 */
export function Splash() {
  return (
    <div
      role="status"
      aria-label="Loading workout"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg-base"
    >
      <div className="logotype text-[26px] text-ink">workout</div>
      <div className="flex gap-1.5" aria-hidden>
        <span className="h-1.5 w-1.5 animate-pulse bg-ink/45 [animation-delay:-300ms]" />
        <span className="h-1.5 w-1.5 animate-pulse bg-ink/45 [animation-delay:-150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse bg-ink/45" />
      </div>
    </div>
  );
}

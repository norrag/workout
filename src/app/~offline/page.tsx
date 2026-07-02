"use client";

/**
 * Offline interstitial (R7). Precached at service-worker install
 * (`additionalPrecacheEntries` in next.config.ts) and served as the document
 * fallback when a navigation fails offline. The app is online-only (hard rule
 * #9): with runtime page caching removed, a dropped connection surfaces this
 * screen instead of a silently stale copy of yesterday's prescriptions.
 * Not linked from anywhere — reachable only through the service worker.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="logotype border-b-[1.5px] border-ink pb-4 text-xl">
        workout
      </h1>
      <div className="mt-8 border-[1.5px] border-ink p-6">
        <div className="text-[10px] font-bold tracking-[0.14em] text-ink/55">
          OFFLINE
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          No connection. Prescriptions and logging are always live, so nothing
          is shown from a stale copy. Reconnect to pick up where you left off.
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-5 block w-full border-[1.5px] border-ink py-3 text-xs font-bold tracking-[0.12em]"
        >
          RETRY
        </button>
      </div>
    </main>
  );
}

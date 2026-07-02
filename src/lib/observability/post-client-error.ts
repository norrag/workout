import type { ClientErrorReport } from "./client-error";

/**
 * Fire-and-forget client half of the R20 error pipeline: the three error
 * boundaries (`global-error`, `(app)/error`, `(auth)/error`) call this from
 * their mount effect so a render/action crash is reported server-side, not
 * just `console.error`'d into a closed devtools panel. Must never throw —
 * a reporting failure inside an error boundary would loop the crash.
 */
export function postClientError(report: ClientErrorReport): void {
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never let reporting break the boundary
  }
}

/** Shape a boundary's `error` prop into the report body, capped client-side so
 *  an oversized stack degrades to truncation, not a 400. */
export function boundaryReport(
  boundary: ClientErrorReport["boundary"],
  error: Error & { digest?: string },
): ClientErrorReport {
  return {
    boundary,
    message: (error.message || String(error)).slice(0, 2_000) || "(no message)",
    stack: error.stack?.slice(0, 8_000),
    digest: error.digest?.slice(0, 128),
    path:
      typeof window !== "undefined"
        ? window.location.pathname.slice(0, 1_024)
        : undefined,
  };
}

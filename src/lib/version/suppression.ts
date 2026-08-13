/**
 * doc 23 §6.4 — when the What's New modal may appear.
 *
 * T5: "the modal must never interrupt a session, and session is not a route."
 * The Workout tab does not lead to a session — it *is* the session
 * (`(app)/workout/page.tsx` renders `DayView` directly), so suppressing on the
 * workout screen would suppress the modal on the surface the app opens to, i.e.
 * always. The signal comes from the workout's state instead: `logSet` flips
 * `planned → in_progress` on the first logged set, which is exactly the line
 * between a workout the user is *looking at* and one they are *in*.
 *
 * Pure and client-safe: the route and the queue state are known on the client,
 * the workout status is resolved on the server and passed down.
 */

export type ActiveWorkoutStatus = "planned" | "in_progress" | "completed";

export interface SuppressionInput {
  /** the current pathname, e.g. "/workout", "/log/abc", "/stats" */
  pathname: string;
  /** status of the workout the Workout tab would render; null when none */
  workoutStatus: ActiveWorkoutStatus | null;
  /** the N68 set-logging queue has ops still to drain */
  queuePending: boolean;
}

/** Routes that never show the sheet regardless of everything else. */
function isExcludedRoute(pathname: string): boolean {
  return (
    // the explicit day view is only ever reached deliberately — mid-session or
    // reviewing a logged day
    pathname === "/log" ||
    pathname.startsWith("/log/") ||
    pathname === "/onboarding" ||
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/~offline"
  );
}

/** The Workout tab, which renders the day view inline. */
function isWorkoutTab(pathname: string): boolean {
  return pathname === "/workout";
}

export function suppressWhatsNew({
  pathname,
  workoutStatus,
  queuePending,
}: SuppressionInput): boolean {
  if (isExcludedRoute(pathname)) return true;
  // a queued write is an unfinished action: the user is mid-set even if they
  // navigated away (N68)
  if (queuePending) return true;
  // they have logged at least one set into the workout on screen — training,
  // not browsing
  if (isWorkoutTab(pathname) && workoutStatus === "in_progress") return true;
  // everything else shows, including Cycles / Stats / More while a stale
  // session sits `in_progress`. That is the release valve: no time-based
  // "abandoned after N hours" heuristic and no clock in the gate.
  return false;
}

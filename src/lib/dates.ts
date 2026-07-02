// One date-display definition (R6). Six near-identical `shortDate` copies had
// grown across the app, two of which parsed raw ISO strings — a date-only
// string parses as UTC midnight, so evening-timezone users saw yesterday's
// date. Every formatter here goes through `dateAtLocalNoon`:
//   - a date-only value ("2026-06-15") is anchored at LOCAL noon — the value
//     is a calendar day and must never shift across timezones;
//   - a timestamp is parsed as the real instant and displayed in local time.

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Drift-safe parse: date-only → local noon; timestamp → the real instant. */
export function dateAtLocalNoon(iso: string): Date {
  return iso.length > 10 ? new Date(iso) : new Date(`${iso}T12:00:00`);
}

/** "15 JUN" */
export function shortDate(iso: string): string {
  const d = dateAtLocalNoon(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "MON 15 JUN" (day-view header) */
export function shortDateWithWeekday(iso: string): string {
  const d = dateAtLocalNoon(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "15 JUN '26" */
export function shortDateWithYear(iso: string): string {
  const d = dateAtLocalNoon(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/** The device's local calendar day as YYYY-MM-DD (R6: what `logged_sets.
 *  performed_on` records — the session's day as the client saw it). */
export function localDayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

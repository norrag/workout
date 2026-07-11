import type { SupabaseClient } from "@supabase/supabase-js";
import type { BodyweightLogRow, Database } from "@/lib/types/database";
import { dateAtLocalNoon } from "@/lib/dates";
import type { RetroBodyData } from "./macro-retrospective";

type Client = SupabaseClient<Database>;

/**
 * doc 17 §5 (N41) — the measured bodyweight series. `bodyweight_log` is
 * measurement SUBSTRATE for the macro layer only (doc 15 §3.3 boundary):
 * it grades mass-goal retrospectives and backs freshness labels;
 * `profiles.bodyweight` remains the engine/profile input and is never
 * derived from the log. Every point comes from an explicit user action
 * (profile edit / quick entry / Phase-5 DEXA sync) — nothing here proposes
 * or infers.
 */

export type BodyweightSource = BodyweightLogRow["source"];

/** ±days a measured point may sit from a span endpoint and still bracket it
 *  (doc 17 §5). */
export const BRACKET_TOLERANCE_DAYS = 14;

/** A block must span at least this many logged days before its est-strength
 *  headline can honestly denominate a monthly rate (09 2026-07-11 §3). */
export const MIN_RATE_SPAN_DAYS = 28;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** mean Gregorian month — the same denominator everywhere a %/mo renders */
const DAYS_PER_MONTH = 30.44;

/**
 * Append (or same-day replace) a measured point. One row per
 * (user, day, source): re-entering a day's weight overwrites that point, and
 * `created_at` is restamped so recency-based same-day resolution favors the
 * latest entry (doc 17 §5 "latest same-day entry wins on read").
 */
export async function appendBodyweightPoint(
  supabase: Client,
  userId: string,
  point: { measuredOn: string; weight: number; source: BodyweightSource },
): Promise<void> {
  const { error } = await supabase.from("bodyweight_log").upsert(
    {
      user_id: userId,
      measured_on: point.measuredOn,
      weight: point.weight,
      source: point.source,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,measured_on,source" },
  );
  if (error) throw error;
}

/** The latest measured point (by day, then entry recency) — the More-page
 *  quick-entry row's display value and prefill. */
export async function getLatestBodyweightPoint(
  supabase: Client,
  userId: string,
): Promise<BodyweightLogRow | null> {
  const { data, error } = await supabase
    .from("bodyweight_log")
    .select("*")
    .eq("user_id", userId)
    .order("measured_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** All points whose measured day falls within `toleranceDays` of the given
 *  span — the fetch behind the retrospective's mass verdict. */
export async function getBodyweightPointsAroundSpan(
  supabase: Client,
  userId: string,
  spanStartIso: string,
  spanEndIso: string,
  toleranceDays: number = BRACKET_TOLERANCE_DAYS,
): Promise<BodyweightLogRow[]> {
  // one extra day of slack: the exact ±tolerance gate lives in the pure fold
  // (`bodyDeltaForSpan`); the fetch window only has to be inclusive across
  // timezone conversions of the date-only column
  const pad = (toleranceDays + 1) * MS_PER_DAY;
  const from = new Date(dateAtLocalNoon(spanStartIso).getTime() - pad);
  const to = new Date(dateAtLocalNoon(spanEndIso).getTime() + pad);
  const { data, error } = await supabase
    .from("bodyweight_log")
    .select("*")
    .eq("user_id", userId)
    .gte("measured_on", from.toISOString().slice(0, 10))
    .lte("measured_on", to.toISOString().slice(0, 10))
    .order("measured_on", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** The slice of a log row the pure folds below need. */
export type BodyweightPoint = Pick<
  BodyweightLogRow,
  "measured_on" | "weight" | "source" | "created_at"
>;

/** Deterministic same-day tie-break when two sources share a `created_at`:
 *  a deliberate entry outranks a side-effect append outranks an import. */
const SOURCE_RANK: Record<BodyweightSource, number> = {
  manual: 2,
  dexa: 1,
  profile: 0,
};

/**
 * Pure: one point per calendar day. When a day carries points from several
 * sources, the most recently *entered* one wins (created_at recency — the
 * user's latest word on that day's weight), with the source rank as a
 * deterministic tie-break. Returned in measured_on order.
 */
export function resolveDailyBodyweight(
  rows: BodyweightPoint[],
): BodyweightPoint[] {
  const byDay = new Map<string, BodyweightPoint>();
  for (const row of rows) {
    const held = byDay.get(row.measured_on);
    if (
      !held ||
      row.created_at > held.created_at ||
      (row.created_at === held.created_at &&
        SOURCE_RANK[row.source] > SOURCE_RANK[held.source])
    )
      byDay.set(row.measured_on, row);
  }
  return [...byDay.values()].sort((a, b) =>
    a.measured_on < b.measured_on ? -1 : 1,
  );
}

/** Local noon of the value's calendar day — tolerance is DAY-precision, so a
 *  span endpoint's time-of-day must not push a 14-day-out point to 14.3. */
function dayAnchorMs(iso: string): number {
  const d = dateAtLocalNoon(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
}

/** Whole calendar days between two values (rounding absorbs DST hours).
 *  Exported for the scan-bracketing fold (`body-comp.ts`) — one distance
 *  definition for every ±tolerance bracket check. */
export function daysBetween(aIso: string, bIso: string): number {
  return Math.round(Math.abs(dayAnchorMs(aIso) - dayAnchorMs(bIso)) / MS_PER_DAY);
}

/** The resolved point nearest `targetIso`, or null when none sits within the
 *  tolerance. */
function nearestPoint(
  daily: BodyweightPoint[],
  targetIso: string,
  toleranceDays: number,
): BodyweightPoint | null {
  let best: BodyweightPoint | null = null;
  let bestDist = Infinity;
  for (const p of daily) {
    const d = daysBetween(p.measured_on, targetIso);
    if (d <= toleranceDays && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Pure: the measured Δbw for a logged span, or null when the series doesn't
 * bracket it (doc 17 §5) — a point within ±`toleranceDays` of EACH endpoint,
 * and the two must be distinct days (one measurement can't measure a change).
 * Feeds `macroRetrospective`'s mass verdict; null keeps the honest
 * "not measured" row (principle 6 — never proxy-graded).
 */
export function bodyDeltaForSpan(
  rows: BodyweightPoint[],
  spanStartIso: string,
  spanEndIso: string,
  toleranceDays: number = BRACKET_TOLERANCE_DAYS,
): RetroBodyData | null {
  const daily = resolveDailyBodyweight(rows);
  const start = nearestPoint(daily, spanStartIso, toleranceDays);
  const end = nearestPoint(daily, spanEndIso, toleranceDays);
  if (!start || !end || start.measured_on === end.measured_on) return null;
  return {
    measuredDeltaLb:
      Math.round((Number(end.weight) - Number(start.weight)) * 10) / 10,
    source: "bodyweight_log",
  };
}

/**
 * Pure: normalize a block's est-strength headline to %/mo over its logged
 * span (the create-flow priming line, doc 17 §5). Null when the headline is
 * missing or the span is too short to denominate a monthly rate honestly.
 */
export function measuredRatePctMonth(
  estStrengthPct: number | null,
  firstLoggedAt: string | null,
  lastLoggedAt: string | null,
): number | null {
  if (estStrengthPct == null || !firstLoggedAt || !lastLoggedAt) return null;
  const spanDays = daysBetween(firstLoggedAt, lastLoggedAt);
  if (spanDays < MIN_RATE_SPAN_DAYS) return null;
  return Math.round((estStrengthPct / (spanDays / DAYS_PER_MONTH)) * 10) / 10;
}

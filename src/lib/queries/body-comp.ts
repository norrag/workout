import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BodyScanRow,
  Database,
  ProfileRow,
  VBodyCompHistoryRow,
} from "@/lib/types/database";
import { BRACKET_TOLERANCE_DAYS, daysBetween } from "./bodyweight";
import type {
  RetroBodyData,
  RetroComposition,
} from "./macro-retrospective";

type Client = SupabaseClient<Database>;

/**
 * doc 15 §3.2/§6 (N34 Phase 5b) — the scan-bracketing folds behind the
 * macro-page composition trend and the retrospective's DEXA rows, plus the
 * consented profile-update proposal. All measurement guardrails live HERE as
 * data (LSC bands, same-scanner comparability), so every consumer inherits
 * them from one definition.
 */

/** Least-significant-change working bands (doc 15 §6.1, ISCD-style ≈ 2.77 ×
 *  precision error): scan-to-scan lean/fat deltas under ~2 lb, and body-fat
 *  moves under ±1 point, are inside measurement noise — never presented as
 *  change (§6.2 rule 1). */
export const LEAN_LSC_LB = 2;
export const FAT_LSC_LB = 2;
export const BF_PCT_NOISE_BAND = 1;

/** Scans closer than this read as a hint, not a trend — DEXA cadence is
 *  quarterly-plus (doc 15 §6.1). */
export const QUARTERLY_CADENCE_DAYS = 60;

/** The slice of a scan the pure folds need. */
export type ScanCompPoint = Pick<
  BodyScanRow,
  | "scanned_at"
  | "scanner_model"
  | "weight_lb"
  | "body_fat_pct"
  | "lean_mass_lb"
  | "fat_mass_lb"
>;

/** Scans within ±`toleranceDays` of a span — the fetch behind the
 *  retrospective's composition block (mirrors
 *  `getBodyweightPointsAroundSpan`). */
export async function getBodyScansAroundSpan(
  supabase: Client,
  userId: string,
  spanStartIso: string,
  spanEndIso: string,
  toleranceDays: number = BRACKET_TOLERANCE_DAYS,
): Promise<ScanCompPoint[]> {
  // one extra day of slack, same as the bodyweight fetch: the exact
  // ±tolerance gate lives in the pure fold
  const pad = (toleranceDays + 1) * 24 * 60 * 60 * 1000;
  const from = new Date(new Date(spanStartIso).getTime() - pad);
  const to = new Date(new Date(spanEndIso).getTime() + pad);
  const { data, error } = await supabase
    .from("body_scans")
    .select(
      "scanned_at, scanner_model, weight_lb, body_fat_pct, lean_mass_lb, fat_mass_lb",
    )
    .eq("user_id", userId)
    .gte("scanned_at", from.toISOString())
    .lte("scanned_at", to.toISOString())
    .order("scanned_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** `v_body_comp_history` rows inside a window (inclusive), scan order — the
 *  macro-page composition trend's read. Deltas are vs each scan's true
 *  previous scan (full-history window function), not the window's first. */
export async function getBodyCompHistoryInRange(
  supabase: Client,
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<VBodyCompHistoryRow[]> {
  const { data, error } = await supabase
    .from("v_body_comp_history")
    .select("*")
    .eq("user_id", userId)
    .gte("scanned_at", fromIso)
    .lte("scanned_at", toIso)
    .order("scanned_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** The view row for one scan — the scan detail's VS PREVIOUS SCAN section. */
export async function getBodyCompHistoryForScan(
  supabase: Client,
  userId: string,
  scanId: string,
): Promise<VBodyCompHistoryRow | null> {
  const { data, error } = await supabase
    .from("v_body_comp_history")
    .select("*")
    .eq("user_id", userId)
    .eq("scan_id", scanId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function delta(
  start: number | null,
  end: number | null,
): number | null {
  if (start == null || end == null) return null;
  return round1(Number(end) - Number(start));
}

/** The scan nearest `targetIso`, within the day tolerance. */
function nearestScan(
  scans: ScanCompPoint[],
  targetIso: string,
  toleranceDays: number,
): ScanCompPoint | null {
  let best: ScanCompPoint | null = null;
  let bestDist = Infinity;
  for (const s of scans) {
    const d = daysBetween(s.scanned_at, targetIso);
    if (d <= toleranceDays && d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Pure: the measured composition change over a logged span, or null when
 * scans don't bracket it — one scan within ±`toleranceDays` of EACH endpoint,
 * two distinct scans (doc 17 §6 5b / doc 15 §3.2). Cross-scanner brackets
 * come back flagged (`sameScanner: false`, `*WithinNoise: null`) — deltas are
 * reported as flagged context, never graded (doc 15 §6.2 rule 2).
 */
export function scanCompForSpan(
  scans: ScanCompPoint[],
  spanStartIso: string,
  spanEndIso: string,
  toleranceDays: number = BRACKET_TOLERANCE_DAYS,
): RetroComposition | null {
  const ordered = [...scans].sort((a, b) =>
    a.scanned_at < b.scanned_at ? -1 : 1,
  );
  const start = nearestScan(ordered, spanStartIso, toleranceDays);
  const end = nearestScan(ordered, spanEndIso, toleranceDays);
  if (!start || !end || start.scanned_at === end.scanned_at) return null;

  const sameScanner =
    start.scanner_model != null &&
    end.scanner_model != null &&
    start.scanner_model === end.scanner_model;
  const deltaLeanLb = delta(start.lean_mass_lb, end.lean_mass_lb);
  const deltaFatLb = delta(start.fat_mass_lb, end.fat_mass_lb);
  const daysApart = daysBetween(start.scanned_at, end.scanned_at);

  const noteParts = [`${daysApart} days between scans`];
  if (!sameScanner)
    noteParts.push("different scanners — deltas not comparable");
  else if (daysApart < QUARTERLY_CADENCE_DAYS)
    noteParts.push("closer than a quarterly cadence — a hint, not a trend");
  return {
    startScannedAt: start.scanned_at,
    endScannedAt: end.scanned_at,
    daysApart,
    sameScanner,
    deltaLeanLb,
    deltaFatLb,
    deltaWeightLb: delta(start.weight_lb, end.weight_lb),
    deltaBodyFatPct: delta(start.body_fat_pct, end.body_fat_pct),
    leanWithinNoise:
      sameScanner && deltaLeanLb != null
        ? Math.abs(deltaLeanLb) < LEAN_LSC_LB
        : null,
    fatWithinNoise:
      sameScanner && deltaFatLb != null
        ? Math.abs(deltaFatLb) < FAT_LSC_LB
        : null,
    note: noteParts.join(" · "),
  };
}

/**
 * Pure: the DEXA fallback for the retrospective's mass verdict (doc 17 §4.2
 * "a bodyweight series and/or DEXA scans") — the bracketing scans' measured
 * weight change, only from a same-machine pair with weights on both ends.
 * The caller prefers the bodyweight series when it brackets (denser,
 * user-owned); this grades the span when only scans do.
 */
export function dexaBodyDataForSpan(
  comp: RetroComposition | null,
): RetroBodyData | null {
  if (!comp || !comp.sameScanner || comp.deltaWeightLb == null) return null;
  return { measuredDeltaLb: comp.deltaWeightLb, source: "dexa" };
}

// ---------------------------------------------------------------------------
// the consented profile-update proposal (doc 15 §2.3)
// ---------------------------------------------------------------------------

/** What the proposal card offers, beside the values it would replace. */
export interface ScanProfileProposal {
  scanId: string;
  scannedAt: string;
  /** proposed values — only fields the scan actually measured */
  weightLb: number | null;
  bodyFatPct: number | null;
  /** the profile values being replaced (display context) */
  currentBodyweight: number | null;
  currentBodyFatPct: number | null;
}

/**
 * Pure: whether (and what) to propose for the user's NEWEST scan. Null —
 * i.e. no card — when the scan is already resolved (applied/dismissed), when
 * it measured nothing proposable, when the profile's bodyweight is fresher
 * than the scan (a backfilled old scan must not nag over a newer weigh-in),
 * or when the scan matches the profile already. Import stays mechanical;
 * mutation is consented (doc 15 §2.3) — this only ever renders a question.
 */
export function scanProfileProposal(
  scan: Pick<
    BodyScanRow,
    | "id"
    | "scanned_at"
    | "weight_lb"
    | "body_fat_pct"
    | "profile_applied_at"
    | "profile_dismissed_at"
  >,
  profile: Pick<
    ProfileRow,
    "bodyweight" | "body_fat_pct" | "bodyweight_updated_at"
  >,
): ScanProfileProposal | null {
  if (scan.profile_applied_at != null || scan.profile_dismissed_at != null)
    return null;
  // stale relative to the profile's own freshness anchor ⇒ never propose
  if (
    profile.bodyweight_updated_at != null &&
    new Date(scan.scanned_at) < new Date(profile.bodyweight_updated_at)
  )
    return null;

  const weightLb =
    scan.weight_lb != null ? round1(Number(scan.weight_lb)) : null;
  const bodyFatPct =
    scan.body_fat_pct != null ? round1(Number(scan.body_fat_pct)) : null;
  const weightDiffers =
    weightLb != null &&
    (profile.bodyweight == null || round1(Number(profile.bodyweight)) !== weightLb);
  const bfDiffers =
    bodyFatPct != null &&
    (profile.body_fat_pct == null ||
      round1(Number(profile.body_fat_pct)) !== bodyFatPct);
  if (!weightDiffers && !bfDiffers) return null;

  return {
    scanId: scan.id,
    scannedAt: scan.scanned_at,
    weightLb: weightDiffers ? weightLb : null,
    bodyFatPct: bfDiffers ? bodyFatPct : null,
    currentBodyweight:
      profile.bodyweight != null ? Number(profile.bodyweight) : null,
    currentBodyFatPct:
      profile.body_fat_pct != null ? Number(profile.body_fat_pct) : null,
  };
}

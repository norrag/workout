/**
 * Aggregated strength-trend scoring (10-metrics-spec §6) — pure, zod-free
 * (mirrors predict.ts so it can run anywhere).
 *
 * Turns a lift's per-session e1RM series into a single "recent vs starting"
 * percentage that is ROBUST to the RIR ramp. A fresh mesocycle opens light and
 * high-RIR, so a single new session must never define the endpoint (the old
 * first→last fold did exactly that and made every continuing lift crater the
 * moment a new block started — the bug this replaces). Instead we compare the
 * BEST of the most-recent few sessions against the BEST of the earliest few,
 * using symmetric, non-overlapping windows that shrink gracefully on short
 * series.
 *
 * Inputs are session-grain e1RM points, oldest → newest, already deload-filtered
 * and outlier-dropped by the caller (queries/stats.ts). The per-session value is
 * the session's average working-set e1RM (kept from N2), so this module never
 * sees individual sets — only the ordered session numbers.
 */

/** The `engine_params.strength` slice this module keys on. */
export interface StrengthTrendConfig {
  /** max sessions in EACH of the baseline / recent windows (default 3) */
  window_sessions: number;
  /** minimum sessions before a trend is computed at all (default 3) */
  min_sessions: number;
  /** dead-band, in %, inside which the trend reads "holding", not up/down */
  tolerance_pct: number;
}

/**
 * Fallback config used whenever `engine_params.strength` is absent — which is
 * every stored row today, since the block is `.optional()` to keep the params
 * hash (replayability) untouched. The active-row default; tunable by seeding
 * `strength` on a future engine_params version.
 */
export const DEFAULT_STRENGTH: StrengthTrendConfig = {
  window_sessions: 3,
  min_sessions: 3,
  tolerance_pct: 1.5,
};

export type StrengthTrendLabel =
  | "improving"
  | "holding"
  | "declining"
  | "insufficient_data";

export interface StrengthTrend {
  /** best e1RM over the earliest window — the "starting" level */
  baseline_e1rm: number | null;
  /** best e1RM over the most-recent window — the "current" level */
  current_e1rm: number | null;
  /** (current − baseline) / baseline, as a percentage rounded to 1 dp */
  change_pct: number | null;
  /** number of points the trend was computed over */
  sessions: number;
  trend: StrengthTrendLabel;
}

/**
 * Score one lift's ordered session e1RMs into a recent-vs-baseline trend.
 * `points` must be oldest → newest, already filtered (no deloads, no mis-log
 * outliers). Pure.
 */
export function strengthTrend(
  points: number[],
  cfg: StrengthTrendConfig,
): StrengthTrend {
  const n = points.length;
  const insufficient: StrengthTrend = {
    baseline_e1rm: null,
    current_e1rm: null,
    change_pct: null,
    sessions: n,
    trend: "insufficient_data",
  };
  if (n < cfg.min_sessions) return insufficient;

  // Symmetric, non-overlapping windows: with few sessions each side shrinks so
  // the baseline and recent windows never share a session — otherwise a
  // 3-session lift would compare max(all) against max(all) and always read 0%.
  // k = 1 at n=3, growing to window_sessions once n ≥ 2·window_sessions.
  const k = Math.max(1, Math.min(cfg.window_sessions, Math.floor(n / 2)));
  const baseline = Math.max(...points.slice(0, k));
  const current = Math.max(...points.slice(n - k));
  if (baseline <= 0) return insufficient;

  const change_pct = Math.round(((current - baseline) / baseline) * 1000) / 10;
  const trend: StrengthTrendLabel =
    change_pct > cfg.tolerance_pct
      ? "improving"
      : change_pct < -cfg.tolerance_pct
        ? "declining"
        : "holding";
  return {
    baseline_e1rm: Math.round(baseline * 10) / 10,
    current_e1rm: Math.round(current * 10) / 10,
    change_pct,
    sessions: n,
    trend,
  };
}

/**
 * Volume-weighted mean of per-item values, skipping null values and
 * non-positive weights (10 §6). Folds the muscle-group strength changes into a
 * single macro headline, weighting each muscle by its fractional set volume so
 * a one-lift muscle can't swing the number as hard as a heavily-trained one.
 * Returns null when nothing qualifies. Pure.
 */
export function volumeWeightedMean(
  items: { value: number | null; weight: number }[],
): number | null {
  let acc = 0;
  let wsum = 0;
  for (const it of items) {
    if (it.value == null || it.weight <= 0) continue;
    acc += it.value * it.weight;
    wsum += it.weight;
  }
  return wsum > 0 ? Math.round((acc / wsum) * 10) / 10 : null;
}

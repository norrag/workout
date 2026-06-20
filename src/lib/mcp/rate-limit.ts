/**
 * Fixed-window in-memory rate limiter for the MCP connector (05 §Safeguards:
 * "rate limiting per token"). Pure logic with an injected clock so it's
 * deterministic to test.
 *
 * Caveat (documented in PROGRESS): on serverless this is **per-instance** — a
 * scaled-out deployment enforces `limit` per warm lambda, not globally. That is
 * a deliberate first pass: it caps a single client hammering one instance and
 * needs no Redis (the app is online-only and SSE/Redis is intentionally off,
 * 05 §Transport). A global limiter would move to a shared store later.
 *
 * Memory safety: the limiter is consulted **before** auth and keyed by a hash of
 * the bearer token (IP fallback). An attacker spraying unique `Authorization:
 * Bearer <random>` values would otherwise create an unbounded number of distinct
 * keys and exhaust the instance's memory. Two guards prevent that: (1) expired
 * windows are pruned opportunistically once per window, and (2) a hard `maxKeys`
 * cap bounds the map — once full (after pruning), new keys are rejected
 * (fail-closed) rather than allowed to grow memory without limit.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** epoch ms when the current window resets */
  resetAt: number;
  /** ms until the caller may retry (0 when allowed) */
  retryAfterMs: number;
}

/** Default cap on distinct tracked keys per instance (~ a few MB worst case). */
export const DEFAULT_MAX_KEYS = 20_000;

export class RateLimiter {
  private windows = new Map<string, Window>();
  private lastPruneAt = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Hard cap on distinct keys; bounds memory against unique-key sprays. */
    private readonly maxKeys: number = DEFAULT_MAX_KEYS,
  ) {}

  /** Record a hit for `key` and report whether it is within the limit. */
  check(key: string, now: number): RateLimitResult {
    // Opportunistic prune: at most once per window, drop expired entries so a
    // warm instance's map reflects only currently-active keys.
    if (now - this.lastPruneAt >= this.windowMs) {
      this.prune(now);
      this.lastPruneAt = now;
    }

    let w = this.windows.get(key);
    if (!w || now >= w.resetAt) {
      // We are about to (re)create an entry. If this is a brand-new key and the
      // map is already at capacity, try to reclaim space; if none is reclaimable
      // the table is genuinely full of live entries, so refuse rather than grow
      // unbounded. Existing-but-expired keys are replaced in place (no growth).
      const isNewKey = !w;
      if (isNewKey && this.windows.size >= this.maxKeys) {
        this.prune(now);
        if (this.windows.size >= this.maxKeys) {
          return {
            allowed: false,
            remaining: 0,
            resetAt: now + this.windowMs,
            retryAfterMs: this.windowMs,
          };
        }
      }
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    if (w.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: w.resetAt,
        retryAfterMs: Math.max(0, w.resetAt - now),
      };
    }
    w.count += 1;
    return {
      allowed: true,
      remaining: this.limit - w.count,
      resetAt: w.resetAt,
      retryAfterMs: 0,
    };
  }

  /** Drop expired windows so the map doesn't grow unbounded on a warm instance. */
  prune(now: number): void {
    for (const [key, w] of this.windows) {
      if (now >= w.resetAt) this.windows.delete(key);
    }
  }

  get size(): number {
    return this.windows.size;
  }
}

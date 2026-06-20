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

export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Record a hit for `key` and report whether it is within the limit. */
  check(key: string, now: number): RateLimitResult {
    let w = this.windows.get(key);
    if (!w || now >= w.resetAt) {
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

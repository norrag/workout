import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/mcp/rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const rl = new RateLimiter(3, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 10).allowed).toBe(true);
    expect(rl.check("a", 20).allowed).toBe(true);
    const blocked = rl.check("a", 30);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(970);
  });

  it("reports remaining count as it consumes the budget", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.check("a", 0).remaining).toBe(1);
    expect(rl.check("a", 1).remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 500).allowed).toBe(false);
    expect(rl.check("a", 1000).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 0).allowed).toBe(true);
    expect(rl.check("a", 0).allowed).toBe(false);
  });

  it("prunes expired windows", () => {
    const rl = new RateLimiter(5, 1000);
    rl.check("a", 0);
    rl.check("b", 0);
    expect(rl.size).toBe(2);
    rl.prune(1001);
    expect(rl.size).toBe(0);
  });
});

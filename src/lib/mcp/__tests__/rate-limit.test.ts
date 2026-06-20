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

  it("opportunistically prunes expired keys on later checks (bounds memory)", () => {
    const rl = new RateLimiter(5, 1000);
    for (let i = 0; i < 50; i++) rl.check(`k${i}`, 0);
    expect(rl.size).toBe(50);
    // A check a full window later triggers the once-per-window prune, dropping
    // all the now-expired keys before recording the new one.
    rl.check("fresh", 1001);
    expect(rl.size).toBe(1);
  });

  it("caps the number of distinct keys (fail-closed against unique-key sprays)", () => {
    const rl = new RateLimiter(5, 1000, 3); // maxKeys = 3
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 0).allowed).toBe(true);
    expect(rl.check("c", 0).allowed).toBe(true);
    // Map is full of live entries; a brand-new key is rejected rather than
    // growing the map without bound.
    const overflow = rl.check("d", 0);
    expect(overflow.allowed).toBe(false);
    expect(rl.size).toBe(3);
    // Existing keys are still served from their live windows.
    expect(rl.check("a", 1).allowed).toBe(true);
  });

  it("admits new keys again once capacity frees up", () => {
    const rl = new RateLimiter(5, 1000, 2);
    rl.check("a", 0);
    rl.check("b", 0);
    expect(rl.check("c", 0).allowed).toBe(false); // full
    // After the window lapses, the cap check prunes the expired keys and admits.
    expect(rl.check("c", 1001).allowed).toBe(true);
  });
});

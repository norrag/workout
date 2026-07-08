import { describe, expect, it } from "vitest";
import { GLOSSARY } from "../glossary";

// N25: the glossary is the single copy source for every InfoDot — hold it to
// the design-system voice (rule 7: tracked all-caps labels, no hype, no
// exclamation marks) and to a length the 264px anchored card can carry.
describe("glossary", () => {
  const entries = Object.entries(GLOSSARY);

  it("every entry has a label and a body", () => {
    for (const [key, entry] of entries) {
      expect(entry.label.length, key).toBeGreaterThan(0);
      expect(entry.body.length, key).toBeGreaterThan(20);
    }
  });

  it("labels are tracked all-caps (no lowercase letters)", () => {
    for (const [key, entry] of entries) {
      expect(entry.label, key).toBe(entry.label.toUpperCase());
    }
  });

  it("copy carries no exclamation marks (design rule 7)", () => {
    for (const [key, entry] of entries) {
      expect(entry.label, key).not.toContain("!");
      expect(entry.body, key).not.toContain("!");
    }
  });

  it("bodies stay card-sized — simple terms tight, complex metrics fuller", () => {
    // Owner directive (2026-07-08): for complicated metrics, prefer a fuller
    // plain-language explanation any level of user can follow over a terse
    // one-liner ("better to explain well than be short"). Those keys carry a
    // higher ceiling; every other term stays one-glance short. The 264px card
    // scrolls, so the cap is about focus, not overflow.
    const EXPLAINERS = new Set(["e1rm", "e1rm_confidence", "est_strength"]);
    for (const [key, entry] of entries) {
      const cap = EXPLAINERS.has(key) ? 640 : 280;
      expect(entry.body.length, key).toBeLessThanOrEqual(cap);
    }
  });

  it("honesty guardrails: e1rm is framed as an estimate, deload not as growth", () => {
    expect(GLOSSARY.e1rm.body.toLowerCase()).toContain("estimate");
    expect(GLOSSARY.e1rm.body.toLowerCase()).not.toContain("exact");
    expect(GLOSSARY.deload.body.toLowerCase()).not.toContain("boost");
  });
});

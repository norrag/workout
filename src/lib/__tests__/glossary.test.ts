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

  it("bodies stay card-sized (~3 short sentences max)", () => {
    for (const [key, entry] of entries) {
      expect(entry.body.length, key).toBeLessThanOrEqual(280);
    }
  });

  it("honesty guardrails: e1rm is framed as an estimate, deload not as growth", () => {
    expect(GLOSSARY.e1rm.body.toLowerCase()).toContain("estimate");
    expect(GLOSSARY.e1rm.body.toLowerCase()).not.toContain("exact");
    expect(GLOSSARY.deload.body.toLowerCase()).not.toContain("boost");
  });
});

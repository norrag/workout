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

  // Owner review round 2 (doc 22): a definition may not lean on an unexplained
  // abbreviation — "RM" means nothing to a reader meeting it for the first
  // time, least of all inside the card that is supposed to explain the term.
  it("spells out any abbreviation it uses (no bare RM)", () => {
    for (const [key, entry] of entries) {
      const text = `${entry.label} ${entry.body}`;
      if (/\b(e?1RM)\b/i.test(text)) {
        expect(text.toLowerCase(), `${key} uses "1RM" without spelling it out`).toContain(
          "one-rep max",
        );
      }
    }
  });

  // D-11: GLOSSARY.volume_landmarks used MEV/MRV without spelling either out —
  // the same defect D-02 fixed on e1RM, in a card the abbreviation check above
  // never covered. Generalized so the next abbreviated term is caught by a
  // test rather than by re-reading the card in review.
  it("spells out MEV and MRV wherever they appear", () => {
    for (const [key, entry] of entries) {
      const text = `${entry.label} ${entry.body}`;
      if (/\bMEV\b/.test(text)) {
        expect(
          text.toLowerCase(),
          `${key} uses "MEV" without spelling it out`,
        ).toContain("minimum effective volume");
      }
      if (/\bMRV\b/.test(text)) {
        expect(
          text.toLowerCase(),
          `${key} uses "MRV" without spelling it out`,
        ).toContain("maximum recoverable volume");
      }
    }
  });

  // doc 22 Phase 1 found this clause inverted. e1RM rises with effective reps
  // (= reps + RIR), so at the same weight × reps the set with reps LEFT implies
  // the greater strength — which is why the doc 21 §2 restamp moved every
  // historical stamp upward. The card must not claim the opposite again.
  it("e1rm explains the RIR direction the way the engine computes it", () => {
    const body = GLOSSARY.e1rm.body.toLowerCase();
    expect(body).toContain("reps still in reserve implies more strength");
    expect(body).not.toContain("closer to failure reads as stronger");
  });
});

import { describe, it, expect } from "vitest";
import { MCP_INSTRUCTIONS, MCP_MANUAL_INSTRUCTIONS } from "../server";
import { manualRetrievalActive } from "../tools/manual";

/**
 * The server instructions carry the always-on coaching paradigm + §9 honesty
 * stance (12 §Stage 1). They must stay short, point at the depth resource, and
 * not drift into a motivational-trainer voice that overclaims.
 */
describe("MCP_INSTRUCTIONS", () => {
  it("teaches the engine paradigm so the model reasons with it", () => {
    expect(MCP_INSTRUCTIONS).toMatch(/RIR/);
    expect(MCP_INSTRUCTIONS).toMatch(/MEV/);
    expect(MCP_INSTRUCTIONS).toMatch(/MRV/);
    expect(MCP_INSTRUCTIONS).toMatch(/fractional/i);
    expect(MCP_INSTRUCTIONS).toMatch(/comparability/i);
  });

  it("carries the §9 honesty guardrails", () => {
    expect(MCP_INSTRUCTIONS).toMatch(/honesty guardrails/i);
    expect(MCP_INSTRUCTIONS).toMatch(/estimate|estimates/);
    expect(MCP_INSTRUCTIONS).toMatch(/pump/i);
    expect(MCP_INSTRUCTIONS).toMatch(/deload/i);
    expect(MCP_INSTRUCTIONS).toMatch(/advisory/i);
  });

  it("points at the coaching-guide resource for the depth", () => {
    expect(MCP_INSTRUCTIONS).toMatch(/workout:\/\/coaching-guide/);
  });

  it("stays short — the depth lives in the resource", () => {
    // Guardrail against the instructions string ballooning; the long-form
    // content belongs in workout://coaching-guide. The ceiling was 3000 before
    // doc 22 Phase 5 added the manual paragraph, which is itself capped below
    // — the point is that neither half may grow unnoticed.
    expect(MCP_INSTRUCTIONS.length).toBeLessThan(3500);
  });

  /**
   * doc 22 Phase 5 / doc 23 §9.2 — the manual paragraph is part of the
   * instructions only while the manual is live. Instructions that advertise
   * tools a client cannot see are worse than silence, so one gate governs the
   * prose and the registration, and this asserts they agree.
   */
  describe("the manual paragraph", () => {
    it("is present exactly when the manual's retrieval tools are registered", () => {
      expect(MCP_INSTRUCTIONS.includes(MCP_MANUAL_INSTRUCTIONS)).toBe(
        manualRetrievalActive(),
      );
    });

    it("names all three retrieval surfaces and keeps the app/data line", () => {
      expect(MCP_MANUAL_INSTRUCTIONS).toMatch(/search_manual/);
      expect(MCP_MANUAL_INSTRUCTIONS).toMatch(/get_manual_section/);
      expect(MCP_MANUAL_INSTRUCTIONS).toMatch(/workout:\/\/user-guide-index/);
      expect(MCP_MANUAL_INSTRUCTIONS).toMatch(/app_route/);
      // the one distinction the model will not otherwise draw
      expect(MCP_MANUAL_INSTRUCTIONS).toMatch(/never this user's\s+data/i);
    });

    it("stays a paragraph — the depth is in the sections themselves", () => {
      expect(MCP_MANUAL_INSTRUCTIONS.length).toBeLessThan(700);
    });
  });
});

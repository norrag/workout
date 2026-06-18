import { describe, it, expect } from "vitest";
import { MCP_INSTRUCTIONS } from "../server";

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
    // content belongs in workout://coaching-guide.
    expect(MCP_INSTRUCTIONS.length).toBeLessThan(3000);
  });
});

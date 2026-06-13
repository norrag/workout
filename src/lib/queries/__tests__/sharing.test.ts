/**
 * Pure-helper tests for sharing (F5/F6): code format. Copy-on-accept I/O is
 * covered by the hosted-DB integration smoke.
 */
import { describe, expect, it } from "vitest";
import { formatShareCode, newShareCode } from "../sharing";

describe("share codes", () => {
  it("formats 8 chars from the unambiguous alphabet", () => {
    const code = formatShareCode(
      new Uint8Array([0, 31, 32, 255, 7, 100, 200, 50]),
    );
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(code).not.toMatch(/[01IO]/);
  });

  it("generates distinct codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => newShareCode()));
    expect(codes.size).toBeGreaterThan(45);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{8}$/);
  });
});

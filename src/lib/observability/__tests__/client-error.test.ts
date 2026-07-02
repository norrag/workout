import { describe, expect, it } from "vitest";
import { clientErrorSchema } from "@/lib/observability/client-error";
import { boundaryReport } from "@/lib/observability/post-client-error";

describe("clientErrorSchema (the pre-auth intake contract)", () => {
  it("accepts a minimal boundary report", () => {
    const parsed = clientErrorSchema.safeParse({
      boundary: "app",
      message: "Cannot read properties of undefined",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts the full shape", () => {
    const parsed = clientErrorSchema.safeParse({
      boundary: "root",
      message: "boom",
      stack: "Error: boom\n  at x",
      digest: "123456789",
      path: "/workout",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown boundaries, empty messages, oversized fields", () => {
    expect(
      clientErrorSchema.safeParse({ boundary: "hax", message: "m" }).success,
    ).toBe(false);
    expect(
      clientErrorSchema.safeParse({ boundary: "app", message: "" }).success,
    ).toBe(false);
    expect(
      clientErrorSchema.safeParse({
        boundary: "app",
        message: "m",
        stack: "x".repeat(8_001),
      }).success,
    ).toBe(false);
  });
});

describe("boundaryReport", () => {
  it("caps every field to the schema limits", () => {
    const err = new Error("m".repeat(5_000)) as Error & { digest?: string };
    err.stack = "s".repeat(20_000);
    err.digest = "d".repeat(500);
    const report = boundaryReport("app", err);
    expect(report.message).toHaveLength(2_000);
    expect(report.stack).toHaveLength(8_000);
    expect(report.digest).toHaveLength(128);
    expect(clientErrorSchema.safeParse(report).success).toBe(true);
  });

  it("substitutes a placeholder for an empty message", () => {
    const err = new Error("") as Error & { digest?: string };
    err.stack = undefined;
    const report = boundaryReport("auth", err);
    expect(report.message.length).toBeGreaterThan(0);
    expect(clientErrorSchema.safeParse(report).success).toBe(true);
  });
});

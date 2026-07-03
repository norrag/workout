import { describe, expect, it, vi, beforeEach } from "vitest";

// R25 — recordMcpWrite runs AFTER its tool's mutation has committed, so an
// audit failure must never invert a successful write into an isError result
// (a retrying agent would duplicate the draft). It logs loudly and returns.

const insertMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({ insert: insertMock }),
  }),
}));

const reportErrorMock = vi.fn<
  (scope: string, err: unknown, ctx?: Record<string, unknown>) => Promise<void>
>(async () => {});
vi.mock("@/lib/observability/report", () => ({
  reportError: (scope: string, err: unknown, ctx?: Record<string, unknown>) =>
    reportErrorMock(scope, err, ctx),
}));

import { recordMcpWrite, hashArgs } from "../audit";

beforeEach(() => {
  insertMock.mockReset();
  reportErrorMock.mockClear();
});

describe("recordMcpWrite (R25)", () => {
  it("writes the audit row on the happy path", async () => {
    insertMock.mockResolvedValue({ error: null });
    await recordMcpWrite("user-1", "create_mesocycle", { weeks: 4 }, "drafted");
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      tool: "create_mesocycle",
      args_hash: hashArgs({ weeks: 4 }),
      summary: "drafted",
    });
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("NEVER throws when the audit insert fails — reports instead", async () => {
    insertMock.mockResolvedValue({
      error: { code: "42501", message: "permission denied" },
    });
    await expect(
      recordMcpWrite("user-1", "create_mesocycle", {}, "drafted"),
    ).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock.mock.calls[0][0]).toBe("mcp:audit");
  });

  it("swallows a thrown service-client failure too (e.g. missing key)", async () => {
    insertMock.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    });
    await expect(
      recordMcpWrite("user-1", "log_note", {}, "noted"),
    ).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });
});

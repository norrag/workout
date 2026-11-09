import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  mutate: vi.fn(),
  rls: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/queries/measure/tape", () => ({
  getTapeSessions: mocks.history,
}));
vi.mock("@/lib/queries/measure/mutate", () => ({
  mutateTapeSession: mocks.mutate,
}));
vi.mock("../audit", () => ({ recordMcpWrite: mocks.audit }));
vi.mock("../auth", async (original) => ({
  ...(await original<typeof import("../auth")>()),
  createMcpRlsClient: mocks.rls,
}));
import { registerMeasurementMutations } from "../tools/measurement-mutate";
import { captureServer, fakeExtra, fakeAuthInfo } from "./harness";
const id = "11111111-1111-4111-8111-111111111111";
const current = {
  id,
  measured_on: "2020-01-01",
  input_unit: "in" as const,
  note: "keep this",
  readings: [
    { site_key: "chest" as const, value_in: 40 },
    { site_key: "waist_navel" as const, value_in: 35 },
  ],
};
function tool(name = "update_body_measurements") {
  const c = captureServer();
  registerMeasurementMutations(c.server);
  return c.tools.get(name)!;
}
function setup(status = "would_update") {
  mocks.rls.mockReturnValue({});
  mocks.history.mockResolvedValue([current]);
  mocks.mutate.mockResolvedValue({
    committed: false,
    status,
    current,
    proposed: current,
    session_id: id,
  });
}
const auth = () => fakeExtra(fakeAuthInfo("owner", "jwt"));
afterEach(() => vi.clearAllMocks());
describe("measurement edit/delete tools", () => {
  it("rejects unauthenticated requests", async () => {
    await expect(
      tool().handler({ session_id: id, changes: { note: "x" } }, fakeExtra()),
    ).rejects.toThrow(/authenticated/);
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("previews a patch preserving omitted date, unit, readings and note", async () => {
    setup();
    await tool().handler(
      { session_id: id, changes: { date: "2020-01-02" } },
      auth(),
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        expected: current,
        replacement: { ...current, measured_on: "2020-01-02" },
        commit: false,
      }),
    );
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("changing only display unit preserves physical readings", async () => {
    setup();
    await tool().handler({ session_id: id, changes: { unit: "cm" } }, auth());
    expect(mocks.mutate.mock.calls[0][1].replacement).toEqual({
      ...current,
      input_unit: "cm",
    });
  });
  it("reports removed sites on full reading replacement", async () => {
    setup();
    const r = await tool().handler(
      {
        session_id: id,
        changes: { readings: [{ site_key: "chest", value: 41 }] },
      },
      auth(),
    );
    expect(
      (r as { structuredContent: { data: { removed_sites: string[] } } })
        .structuredContent.data.removed_sites,
    ).toEqual(["waist_navel"]);
  });
  it("requires preview snapshot to commit and rejects mismatched identities", async () => {
    setup();
    await expect(
      tool().handler(
        { session_id: id, changes: { note: "x" }, commit: true },
        auth(),
      ),
    ).rejects.toThrow(/Preview/);
    await expect(
      tool().handler(
        {
          session_id: id,
          expected_session: { ...current, id: crypto.randomUUID() },
          changes: { note: "x" },
        },
        auth(),
      ),
    ).rejects.toThrow(/match/);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("rejects foreign/missing sessions without invoking mutation", async () => {
    setup();
    mocks.history.mockResolvedValue([]);
    await expect(
      tool().handler({ session_id: id, changes: { note: "x" } }, auth()),
    ).rejects.toThrow(/not found/);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("uses approved snapshot for retry rather than silently rebasing a patch", async () => {
    setup("updated");
    mocks.history.mockResolvedValue([{ ...current, note: "someone edited" }]);
    await tool().handler(
      {
        session_id: id,
        expected_session: current,
        changes: { date: "2020-01-02" },
        commit: true,
      },
      auth(),
    );
    expect(mocks.mutate.mock.calls[0][1].replacement.note).toBe("keep this");
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
  it("requires deletion confirmation in addition to snapshot and commit", async () => {
    setup();
    await expect(
      tool("delete_body_measurements").handler(
        { session_id: id, expected_session: current, commit: true },
        auth(),
      ),
    ).rejects.toThrow(/Confirm permanent/);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("previews deletion without a write/audit then passes explicit confirmed deletion", async () => {
    setup("would_delete");
    const t = tool("delete_body_measurements");
    await t.handler({ session_id: id }, auth());
    expect(mocks.mutate.mock.calls[0][1]).toMatchObject({
      delete: true,
      commit: false,
      confirmDelete: false,
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    mocks.mutate.mockResolvedValue({ status: "deleted" });
    await t.handler(
      {
        session_id: id,
        expected_session: current,
        commit: true,
        confirm_delete: true,
      },
      auth(),
    );
    expect(mocks.mutate.mock.calls[1][1]).toMatchObject({
      delete: true,
      commit: true,
      confirmDelete: true,
    });
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
  it("propagates stale conflicts without success auditing", async () => {
    setup();
    mocks.mutate.mockRejectedValue(new Error("STALE_SESSION"));
    await expect(
      tool().handler(
        {
          session_id: id,
          expected_session: current,
          changes: { note: "x" },
          commit: true,
        },
        auth(),
      ),
    ).rejects.toThrow("STALE_SESSION");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects future dates and invalid or duplicate readings", async () => {
    setup();
    for (const changes of [
      { date: "2999-01-01" },
      { readings: [{ site_key: "chest", value: 0 }] },
      {
        readings: [
          { site_key: "chest", value: 40 },
          { site_key: "chest", value: 41 },
        ],
      },
    ])
      await expect(
        tool().handler({ session_id: id, changes }, auth()),
      ).rejects.toThrow();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

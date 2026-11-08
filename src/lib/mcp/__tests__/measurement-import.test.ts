import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: {},
  history: vi.fn(),
  import: vi.fn(),
  rls: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/queries/measure/tape", () => ({
  getTapeSessions: mocks.history,
}));
vi.mock("@/lib/queries/measure/import", () => ({
  importTapeSessions: mocks.import,
}));
vi.mock("../audit", () => ({ recordMcpWrite: mocks.audit }));
vi.mock("../auth", async (original) => ({
  ...(await original<typeof import("../auth")>()),
  createMcpRlsClient: mocks.rls,
}));
import {
  registerMeasurementImport,
  IMPORT_BODY_MEASUREMENTS,
} from "../tools/measurement-import";
import { captureServer, fakeExtra, fakeAuthInfo } from "./harness";
const input = {
  sessions: [
    {
      date: "2020-01-01",
      unit: "in",
      readings: [{ site_key: "chest", value: 40 }],
    },
  ],
};
function tool() {
  const c = captureServer();
  registerMeasurementImport(c.server);
  return c.tools.get(IMPORT_BODY_MEASUREMENTS)!;
}
function setup() {
  mocks.rls.mockReturnValue(mocks.client);
  mocks.history.mockResolvedValue([]);
  mocks.import.mockResolvedValue({
    committed: true,
    sessions: [
      {
        date: "2020-01-01",
        session_id: crypto.randomUUID(),
        status: "inserted",
      },
    ],
  });
}
afterEach(() => vi.clearAllMocks());
describe("measurement write tool", () => {
  it("denies unauthenticated writes before querying", async () => {
    await expect(tool().handler(input, fakeExtra())).rejects.toThrow(
      /authenticated/,
    );
    expect(mocks.import).not.toHaveBeenCalled();
  });
  it("defaults to preview with token-bound identity", async () => {
    setup();
    await tool().handler(input, fakeExtra(fakeAuthInfo("owner", "jwt")));
    expect(mocks.rls).toHaveBeenCalledWith("jwt");
    expect(mocks.history).toHaveBeenCalledWith(mocks.client, "owner");
    expect(mocks.import).toHaveBeenCalledWith(
      mocks.client,
      expect.any(Array),
      false,
    );
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("requires review of unusual readings and never writes them silently", async () => {
    setup();
    const r = await tool().handler(
      {
        ...input,
        commit: true,
        sessions: [
          {
            ...input.sessions[0],
            readings: [{ site_key: "chest", value: 100 }],
          },
        ],
      },
      fakeExtra(fakeAuthInfo("owner", "jwt")),
    );
    expect(r).toMatchObject({
      structuredContent: {
        data: { ok: false, error: { code: "REVIEW_VALUES" } },
      },
    });
    expect(mocks.import).not.toHaveBeenCalled();
  });
  it("commits approved entries and records a non-sensitive audit summary", async () => {
    setup();
    await tool().handler(
      { ...input, commit: true },
      fakeExtra(fakeAuthInfo("owner", "jwt")),
    );
    expect(mocks.import).toHaveBeenCalledWith(
      mocks.client,
      expect.any(Array),
      true,
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      "owner",
      IMPORT_BODY_MEASUREMENTS,
      expect.anything(),
      "Imported 1 measurement sessions",
    );
  });
  it("does not claim success or audit on a database conflict", async () => {
    setup();
    mocks.import.mockRejectedValue(new Error("conflict"));
    await expect(
      tool().handler(
        { ...input, commit: true },
        fakeExtra(fakeAuthInfo("owner", "jwt")),
      ),
    ).rejects.toThrow("conflict");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

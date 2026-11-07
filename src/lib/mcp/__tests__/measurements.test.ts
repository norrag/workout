import { afterEach, describe, expect, it, vi } from "vitest";
import { type TapeSession } from "@/lib/measure/tape";
const mocks = vi.hoisted(() => ({
  client: {},
  query: vi.fn(),
  rlsClient: vi.fn(),
}));
vi.mock("@/lib/queries/measure/tape", () => ({ getTapeSessions: mocks.query }));
vi.mock("../auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth")>()),
  createMcpRlsClient: mocks.rlsClient,
}));
import {
  bodyMeasurementArgs,
  formatBodyMeasurements,
  GET_BODY_MEASUREMENTS,
  registerMeasurementTools,
} from "../tools/measurements";
import { registerTools } from "../tools";
import { captureServer, fakeAuthInfo, fakeExtra } from "./harness";
const first: TapeSession = {
  id: "first",
  measured_on: "2026-01-01",
  input_unit: "in",
  note: "before training",
  readings: [
    { site_key: "chest", value_in: 40 },
    { site_key: "upper_arm_left", value_in: 14 },
  ],
};
const middle: TapeSession = {
  id: "middle",
  measured_on: "2026-02-01",
  input_unit: "in",
  note: "",
  readings: [{ site_key: "upper_arm_right", value_in: 15 }],
};
const last: TapeSession = {
  id: "last",
  measured_on: "2026-03-01",
  input_unit: "in",
  note: "",
  readings: [
    { site_key: "chest", value_in: 41 },
    { site_key: "upper_arm_right", value_in: 15.5 },
  ],
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("measurement connector", () => {
  it("returns dated same-site/side changes across gaps, with no carried values", () => {
    const data = formatBodyMeasurements([last, middle, first], "in", false);
    expect(data.sessions[0].readings).toEqual([
      {
        site_key: "chest",
        value: 41,
        previous_date: "2026-01-01",
        previous_value: 40,
        delta: 1,
        days_between: 59,
      },
      {
        site_key: "upper_arm_right",
        value: 15.5,
        previous_date: "2026-02-01",
        previous_value: 15,
        delta: 0.5,
        days_between: 28,
      },
    ]);
    expect(data.sessions[1].readings[0].delta).toBeNull();
    expect(data.sessions[0].readings).toHaveLength(2);
  });
  it("converts values and deltas together and marks paged baselines honestly", () => {
    const data = formatBodyMeasurements([last, middle], "cm", true);
    expect(data.sessions[0].readings[0]).toMatchObject({
      value: 104.14,
      delta: null,
      previous_date: null,
    });
    expect(data.sessions[0].readings[1]).toMatchObject({
      value: 39.37,
      delta: 1.27,
    });
    expect(data.next_before).toBe("2026-02-01");
    expect(formatBodyMeasurements([], "in", false)).toMatchObject({
      session_count: 0,
      sessions: [],
      next_before: null,
    });
  });
  it("bounds requests and rejects identity arguments", () => {
    expect(bodyMeasurementArgs.parse({})).toEqual({ unit: "in", limit: 24 });
    for (const args of [
      { user_id: "someone" },
      { limit: 121 },
      { limit: 0 },
      { before: "not-a-date" },
      { unit: "lb" },
    ])
      expect(bodyMeasurementArgs.safeParse(args).success).toBe(false);
  });
  it("requires authentication before any read", async () => {
    const capture = captureServer();
    registerMeasurementTools(capture.server);
    await expect(
      capture.tools.get(GET_BODY_MEASUREMENTS)!.handler({}, fakeExtra()),
    ).rejects.toThrow(/authenticated/);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("binds the bearer client and owner from the session and labels length units", async () => {
    mocks.rlsClient.mockReturnValue(mocks.client);
    mocks.query.mockResolvedValue([last, middle]);
    const capture = captureServer();
    registerMeasurementTools(capture.server);
    const result = (await capture.tools
      .get(GET_BODY_MEASUREMENTS)!
      .handler(
        { limit: 1, unit: "cm", before: "2026-04-01" },
        fakeExtra(fakeAuthInfo("owner", "owner.jwt")),
      )) as {
      structuredContent: {
        units: string;
        data: ReturnType<typeof formatBodyMeasurements>;
      };
    };
    expect(mocks.rlsClient).toHaveBeenCalledWith("owner.jwt");
    expect(mocks.query).toHaveBeenCalledWith(mocks.client, "owner", {
      limit: 2,
      before: "2026-04-01",
    });
    expect(result.structuredContent.units).toBe("cm");
    expect(result.structuredContent.data).toMatchObject({
      session_count: 1,
      has_more: true,
      next_before: "2026-03-01",
    });
  });
  it("is absent before 1.3 and from production even with an override", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_OVERRIDE", "1.2.1");
    let capture = captureServer();
    registerTools(capture.server);
    expect(capture.tools.has(GET_BODY_MEASUREMENTS)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_RELEASE_OVERRIDE", "1.3.0");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    capture = captureServer();
    registerTools(capture.server);
    expect(capture.tools.has(GET_BODY_MEASUREMENTS)).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    capture = captureServer();
    registerTools(capture.server);
    expect(capture.tools.has(GET_BODY_MEASUREMENTS)).toBe(false);
  });
});

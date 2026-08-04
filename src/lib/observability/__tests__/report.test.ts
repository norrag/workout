import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeError,
  isSchemaDriftError,
  reportError,
  reportEvent,
} from "@/lib/observability/report";

describe("describeError", () => {
  it("extracts from an Error instance", () => {
    const err = new TypeError("boom");
    const shape = describeError(err);
    expect(shape.name).toBe("TypeError");
    expect(shape.message).toBe("boom");
    expect(shape.stack).toContain("boom");
  });

  it("extracts from a PostgrestError-shaped plain object", () => {
    expect(describeError({ code: "42501", message: "permission denied" })).toEqual({
      name: "42501",
      message: "permission denied",
      stack: null,
    });
  });

  it("stringifies primitives and message-less objects", () => {
    expect(describeError("oops").message).toBe("oops");
    expect(describeError(7).name).toBe("NonError");
    expect(describeError({ weird: true }).message).toBe('{"weird":true}');
  });
});

describe("isSchemaDriftError", () => {
  // the exact PostgrestError the app raised for two days in Aug 2026
  it("detects the undefined-column error by code", () => {
    expect(
      isSchemaDriftError({
        code: "42703",
        message: "column meso_exercises.rep_position does not exist",
      }),
    ).toBe(true);
  });

  it("detects undefined table and undefined function", () => {
    expect(isSchemaDriftError({ code: "42P01", message: "relation x does not exist" })).toBe(true);
    expect(isSchemaDriftError({ code: "42883", message: "function y does not exist" })).toBe(true);
  });

  it("falls back to the message when the code was lost crossing a boundary", () => {
    expect(
      isSchemaDriftError(new Error("column meso_exercises.rep_position does not exist")),
    ).toBe(true);
  });

  it("does not claim ordinary failures", () => {
    expect(isSchemaDriftError(new Error("fetch failed"))).toBe(false);
    expect(isSchemaDriftError({ code: "42501", message: "permission denied" })).toBe(false);
    // a genuinely absent row is not schema drift
    expect(isSchemaDriftError({ code: "PGRST116", message: "no rows returned" })).toBe(false);
    expect(isSchemaDriftError(null)).toBe(false);
    expect(isSchemaDriftError("boom")).toBe(false);
  });
});

describe("reportEvent / reportError", () => {
  const fetchMock = vi.fn();
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    consoleSpy.mockRestore();
  });

  it("always writes the structured console line, even with no DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    await reportError("queries:freshness-reconcile", new Error("db down"), {
      mesoId: "m1",
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[report:queries:freshness-reconcile] Error: db down",
      { mesoId: "m1" },
      expect.any(String),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ships a Sentry envelope when SENTRY_DSN is set", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/99");
    await reportError("mcp:tool", new Error("boom"), { tool: "log_note" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://o1.ingest.sentry.io/api/99/envelope/" +
        "?sentry_key=key&sentry_version=7&sentry_client=workout-report%2F1",
    );
    expect(init.method).toBe("POST");
    const lines = (init.body as string).split("\n");
    expect(lines).toHaveLength(3);
    const event = JSON.parse(lines[2]);
    expect(event.logger).toBe("mcp:tool");
    expect(event.exception.values[0].value).toBe("boom");
    expect(event.extra.tool).toBe("log_note");
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("never rejects when the send fails", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/99");
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(
      reportEvent({ scope: "s", name: "E", message: "m" }),
    ).resolves.toBeUndefined();
    // the delivery failure itself is logged
    expect(consoleSpy).toHaveBeenCalledWith(
      "[report] error delivery failed",
      expect.any(Error),
    );
  });

  it("logs a non-2xx ingest response without throwing", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/99");
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    await reportEvent({ scope: "s", name: "E", message: "m" });
    expect(consoleSpy).toHaveBeenCalledWith("[report] sentry ingest responded 429");
  });

  // N74: the scope prefix is what makes a self-inflicted outage greppable
  // instead of looking like one more flaky-infrastructure line
  it("re-scopes schema drift and flags it in context", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    await reportError(
      "actions:advance-week:complete",
      { code: "42703", message: "column meso_exercises.rep_position does not exist" },
      { workoutId: "w1" },
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[report:schema-drift:actions:advance-week:complete] 42703: column meso_exercises.rep_position does not exist",
      expect.objectContaining({ workoutId: "w1", schema_drift: true }),
      expect.any(String),
    );
  });

  it("leaves an ordinary error's scope and context untouched", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    await reportError("actions:advance-week:complete", new Error("timeout"), {
      workoutId: "w1",
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[report:actions:advance-week:complete] Error: timeout",
      { workoutId: "w1" },
      expect.any(String),
    );
  });

  it("treats a malformed DSN as console-only", async () => {
    vi.stubEnv("SENTRY_DSN", "not a dsn");
    await reportEvent({ scope: "s", name: "E", message: "m" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

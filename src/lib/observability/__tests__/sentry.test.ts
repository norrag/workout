import { describe, expect, it } from "vitest";
import {
  buildEventEnvelope,
  envelopeUrl,
  parseDsn,
  type SentryEventInput,
} from "@/lib/observability/sentry";

describe("parseDsn", () => {
  it("parses a standard hosted DSN", () => {
    expect(parseDsn("https://abc123@o450.ingest.sentry.io/4507")).toEqual({
      protocol: "https",
      publicKey: "abc123",
      host: "o450.ingest.sentry.io",
      projectId: "4507",
    });
  });

  it("parses a self-hosted DSN with a path prefix", () => {
    expect(parseDsn("https://key@sentry.internal.example/prefix/42")).toEqual({
      protocol: "https",
      publicKey: "key",
      host: "sentry.internal.example",
      projectId: "42",
    });
  });

  it("returns null for empty/undefined (unset env var)", () => {
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn(null)).toBeNull();
    expect(parseDsn("")).toBeNull();
  });

  it("returns null for malformed values instead of throwing", () => {
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn("https://sentry.io/123")).toBeNull(); // no public key
    expect(parseDsn("https://key@sentry.io/")).toBeNull(); // no project id
    expect(parseDsn("https://key@sentry.io/abc")).toBeNull(); // non-numeric id
  });
});

describe("envelopeUrl", () => {
  it("builds the ingest URL with query auth", () => {
    const dsn = parseDsn("https://abc123@o450.ingest.sentry.io/4507")!;
    expect(envelopeUrl(dsn)).toBe(
      "https://o450.ingest.sentry.io/api/4507/envelope/" +
        "?sentry_key=abc123&sentry_version=7&sentry_client=workout-report%2F1",
    );
  });
});

describe("buildEventEnvelope", () => {
  const input: SentryEventInput = {
    eventId: "0".repeat(32),
    timestamp: "2026-07-02T12:00:00.000Z",
    scope: "mcp:tool",
    name: "PostgrestError",
    message: "permission denied",
    stack: "PostgrestError: permission denied\n  at x",
    context: { tool: "get_current_state" },
    environment: "production",
    release: "abc123sha",
  };

  it("emits three newline-separated JSON lines", () => {
    const lines = buildEventEnvelope(input).split("\n");
    expect(lines).toHaveLength(3);
    const [header, itemHeader, event] = lines.map((l) => JSON.parse(l));
    expect(header).toEqual({
      event_id: input.eventId,
      sent_at: input.timestamp,
    });
    expect(itemHeader).toEqual({ type: "event" });
    expect(event.level).toBe("error");
    expect(event.logger).toBe("mcp:tool");
    expect(event.tags).toEqual({ scope: "mcp:tool" });
    expect(event.environment).toBe("production");
    expect(event.release).toBe("abc123sha");
    expect(event.exception.values).toEqual([
      {
        type: "PostgrestError",
        value: "permission denied",
        mechanism: { type: "generic", handled: true },
      },
    ]);
    expect(event.extra).toEqual({
      tool: "get_current_state",
      stack: input.stack,
    });
  });

  it("omits optional fields cleanly", () => {
    const event = JSON.parse(
      buildEventEnvelope({
        eventId: input.eventId,
        timestamp: input.timestamp,
        scope: "s",
        name: "Error",
        message: "m",
      }).split("\n")[2],
    );
    expect(event).not.toHaveProperty("environment");
    expect(event).not.toHaveProperty("release");
    expect(event.extra).toEqual({});
  });
});

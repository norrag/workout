/**
 * Minimal, dependency-free Sentry wire format (R20). The app deliberately does
 * NOT ship the Sentry SDK: the reporting need is server-side only, the client
 * bundle is a live perf concern (WS-J / N1), and the envelope ingestion API is
 * a stable, documented three-line HTTP payload. These builders are pure —
 * every input (ids, timestamps, env) is passed in — so the wire format is
 * unit-testable; `report.ts` owns the impure assembly + send.
 *
 * DSN shape: `https://<publicKey>@<host>/<path?><projectId>`
 * Envelope endpoint: `https://<host>/api/<projectId>/envelope/`
 */

export interface SentryDsn {
  protocol: string;
  publicKey: string;
  host: string;
  projectId: string;
}

/** Parse a Sentry DSN; null on anything malformed (never throw — a bad env
 *  var must degrade to console-only reporting, not break the error path). */
export function parseDsn(dsn: string | undefined | null): SentryDsn | null {
  if (!dsn) return null;
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const publicKey = url.username;
  // the project id is the last non-empty path segment; anything before it is
  // an optional path prefix (self-hosted installs)
  const segments = url.pathname.split("/").filter(Boolean);
  const projectId = segments[segments.length - 1];
  if (!publicKey || !projectId || !/^\d+$/.test(projectId)) return null;
  return {
    protocol: url.protocol.replace(":", ""),
    publicKey,
    host: url.host,
    projectId,
  };
}

/** The envelope ingestion URL for a parsed DSN, auth carried in the query. */
export function envelopeUrl(dsn: SentryDsn): string {
  return (
    `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/` +
    `?sentry_key=${dsn.publicKey}&sentry_version=7&sentry_client=workout-report%2F1`
  );
}

export interface SentryEventInput {
  /** 32-char hex id (a uuid without dashes) */
  eventId: string;
  /** ISO-8601 capture time */
  timestamp: string;
  /** where in the app the error was caught, e.g. "mcp:tool", "client:app" */
  scope: string;
  /** error class name → Sentry's exception type (grouping key) */
  name: string;
  message: string;
  stack?: string | null;
  /** free-form structured context (ids, route, tool name…) */
  context?: Record<string, unknown> | null;
  /** deployment environment tag, e.g. "production" | "preview" */
  environment?: string | null;
  /** release identifier, e.g. the deployed commit sha */
  release?: string | null;
}

/**
 * Build the three-line event envelope (header, item header, event payload).
 * The exception carries no parsed stacktrace — the raw stack string travels in
 * `extra.stack`, which keeps this format-stable while still grouping by
 * type + value and preserving the full trace for a human.
 */
export function buildEventEnvelope(input: SentryEventInput): string {
  const header = { event_id: input.eventId, sent_at: input.timestamp };
  const itemHeader = { type: "event" };
  const event = {
    event_id: input.eventId,
    timestamp: input.timestamp,
    platform: "javascript",
    level: "error",
    logger: input.scope,
    environment: input.environment ?? undefined,
    release: input.release ?? undefined,
    tags: { scope: input.scope },
    exception: {
      values: [
        {
          type: input.name,
          value: input.message,
          mechanism: { type: "generic", handled: true },
        },
      ],
    },
    extra: {
      ...(input.context ?? {}),
      ...(input.stack ? { stack: input.stack } : {}),
    },
  };
  return [header, itemHeader, event].map((o) => JSON.stringify(o)).join("\n");
}

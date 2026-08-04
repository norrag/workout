import "server-only";
import { buildEventEnvelope, envelopeUrl, parseDsn } from "./sentry";

/**
 * The one server-side error-reporting funnel (R20). Every deliberate
 * degrade-gracefully catch (freshness reconcile, week generation, seed-decision
 * recording, MCP tool guard) and every boundary (instrumentation hook, client
 * error intake) routes through here so failures degrade *loudly*:
 *
 * 1. Always emits one structured `console.error` line — Vercel function logs
 *    capture these with zero configuration, so there is a floor even before
 *    `SENTRY_DSN` is set (a manual op, `docs/deployment/manual-operations.md`).
 * 2. If `SENTRY_DSN` parses, ships a Sentry event envelope over plain fetch
 *    (no SDK — see `sentry.ts` for why), bounded by a short timeout.
 *
 * Never throws and never rejects: the reporter must not be able to break the
 * error path it is reporting on.
 */

const SEND_TIMEOUT_MS = 3_000;

interface ErrorShape {
  name: string;
  message: string;
  stack: string | null;
}

/** Extract a name/message/stack from an arbitrary thrown value. */
export function describeError(error: unknown): ErrorShape {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      stack: error.stack ?? null,
    };
  }
  if (error && typeof error === "object") {
    const e = error as { name?: string; message?: string; code?: string };
    return {
      name: e.name ?? e.code ?? "NonError",
      message: e.message ?? safeStringify(error),
      stack: null,
    };
  }
  return { name: "NonError", message: String(error), stack: null };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export interface ReportEventInput {
  /** where in the app the error was caught, e.g. "mcp:tool", "client:app" */
  scope: string;
  name: string;
  message: string;
  stack?: string | null;
  context?: Record<string, unknown> | null;
}

/** Report a pre-shaped event (used directly by the client-error intake, where
 *  the "error" arrives as fields, not a thrown value). Never throws. */
export async function reportEvent(input: ReportEventInput): Promise<void> {
  try {
    // structured floor: one line, greppable scope prefix, context inline
    console.error(
      `[report:${input.scope}] ${input.name}: ${input.message}`,
      input.context ?? {},
      input.stack ?? "",
    );

    const dsn = parseDsn(process.env.SENTRY_DSN);
    if (!dsn) return;

    const envelope = buildEventEnvelope({
      eventId: crypto.randomUUID().replace(/-/g, ""),
      timestamp: new Date().toISOString(),
      scope: input.scope,
      name: input.name,
      message: input.message,
      stack: input.stack ?? null,
      context: input.context ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });

    const res = await fetch(envelopeUrl(dsn), {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[report] sentry ingest responded ${res.status}`);
    }
  } catch (sendError) {
    // the reporter must never take down the path it reports on
    console.error("[report] error delivery failed", sendError);
  }
}

/**
 * Postgres error codes that mean "the deployed code and the database schema
 * disagree" — the object the query names is not there:
 *
 *   42703 undefined_column · 42P01 undefined_table · 42883 undefined_function
 *
 * These are categorically different from the transient failures the
 * degrade-gracefully catches are designed for (a dropped connection, a timeout,
 * a raced write). A retry never fixes one; every call fails identically until a
 * human applies a migration. Left in the general error stream they read as
 * ordinary noise — which is exactly what happened on 2026-08-02, when a missing
 * `meso_exercises.rep_position` took out next-week generation for two days
 * behind a calm "next week's targets generate when the engine runs".
 */
const SCHEMA_DRIFT_CODES = new Set(["42703", "42P01", "42883"]);

/** Pure: does this look like deployed code running against a stale schema?
 *  Reads the `code` PostgrestError/pg carry; falls back to the message text for
 *  errors that lost their code crossing a boundary. Exported for unit tests. */
export function isSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && SCHEMA_DRIFT_CODES.has(code)) return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    /does not exist|undefined (column|table|function)/i.test(message) &&
    /column|table|relation|function/i.test(message)
  );
}

/**
 * Report a caught error with a scope + optional structured context.
 *
 * Schema drift is re-scoped to `schema-drift:<scope>` and flagged in context
 * (N74). Every call site that reaches here is a deliberate degrade-gracefully
 * catch, so the user sees a friendly fallback either way — the scope prefix is
 * what makes a total, self-inflicted outage greppable in the Vercel function
 * logs and distinct in Sentry, instead of one more line that looks like flaky
 * infrastructure.
 */
export async function reportError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const shape = describeError(error);
  const drift = isSchemaDriftError(error);
  await reportEvent({
    scope: drift ? `schema-drift:${scope}` : scope,
    name: shape.name,
    message: shape.message,
    stack: shape.stack,
    context: drift
      ? {
          ...(context ?? {}),
          schema_drift: true,
          remediation:
            "deployed code references a database object that does not exist — check for an unapplied migration (`npm run db:check`)",
        }
      : (context ?? null),
  });
}

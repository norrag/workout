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

/** Report a caught error with a scope + optional structured context. */
export async function reportError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const shape = describeError(error);
  await reportEvent({
    scope,
    name: shape.name,
    message: shape.message,
    stack: shape.stack,
    context: context ?? null,
  });
}

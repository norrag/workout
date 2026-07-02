import type { Instrumentation } from "next";

/**
 * Global server-side error capture (R20). Next invokes this for every
 * unhandled error in server components, server actions, route handlers, and
 * middleware — the errors that previously only surfaced as a digest on the
 * client boundary with nothing recorded server-side. Deliberate
 * degrade-gracefully catches (freshness reconcile, week generation, seed
 * decisions, the MCP tool guard) never reach here; they report themselves
 * through the same funnel before swallowing.
 *
 * The reporter is imported lazily per the Next instrumentation contract (this
 * file is loaded in both the node and edge runtimes).
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const { reportError } = await import("@/lib/observability/report");
  await reportError(`server:${context.routerKind}:${context.routeType}`, error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
  });
};

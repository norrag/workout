import "server-only";
import type {
  CallToolRequest,
  CallToolResult,
  McpServer,
  ServerContext,
} from "@modelcontextprotocol/server";
import { reportError } from "@/lib/observability/report";
import {
  getCatalogRecord,
  recordCatalogNotified,
  recordCatalogServed as persistCatalogServed,
} from "@/lib/queries/mcp-catalog";
import {
  CATALOG_NOTICE_META_KEY,
  CONNECTOR_UPDATE_NOTICE,
  catalogNoticeMeta,
  catalogVariantOf,
  evaluateCatalogFreshness,
  fingerprintCatalog,
  shouldAttachNotice,
  type ServedTool,
} from "./catalog";
import { currentCatalogSnapshot } from "./catalog-snapshot";
import { ADMIN_TOOL_NAMES } from "./tools/admin";
import { identityFromAuthInfo } from "./auth";
import type { McpExtra } from "./session";

/**
 * N91 — the two wires between the protocol and catalog freshness.
 *
 * `recordServedCatalog` is called from the `tools/list` wrapper
 * (`visibility.ts`) with the listing that principal actually received.
 * `attachCatalogNotice` wraps `tools/call` so a stale connection is told to
 * refresh.
 *
 * Both hang off the SDK's request handlers rather than off individual tools.
 * That matters: the alternative — a line in each of ~50 tool handlers, or in
 * the `withErrorHandling` wrapper inside `tools/index.ts` — would have to be
 * remembered by every future tool, and wiring it through `tools/index.ts` would
 * make the tool registry depend on the catalog snapshot that is built *from*
 * the tool registry. Wrapping the dispatch point costs one hook and cannot be
 * forgotten by a new tool, because a new tool does not touch it.
 */

type CallHandler = (
  request: CallToolRequest,
  ctx: ServerContext,
) => Promise<CallToolResult> | CallToolResult;

/** Identity for freshness purposes, or null when there is no usable session. */
function connection(
  ctx: ServerContext,
): { userId: string; clientId: string } | null {
  try {
    const authInfo = (ctx as McpExtra).http?.authInfo;
    if (!authInfo) return null;
    const { userId, clientId } = identityFromAuthInfo(authInfo);
    return { userId, clientId };
  } catch {
    return null;
  }
}

/**
 * `clientInfo.name` off the request envelope, when the client sends one.
 *
 * Recorded for debugging only — "which of this user's connections is stale" is
 * a much easier question to answer with `chatgpt` next to the row than with an
 * opaque OAuth client id. Read defensively: the 2026-07-28 envelope makes
 * `clientInfo` a SHOULD, not a MUST, and the SDK types it as an open record.
 */
function clientName(ctx: ServerContext): string | null {
  try {
    const envelope = (
      ctx as unknown as {
        mcpReq?: { envelope?: Record<string, unknown> };
      }
    ).mcpReq?.envelope;
    if (!envelope) return null;
    for (const [key, value] of Object.entries(envelope)) {
      if (!key.endsWith("/clientInfo")) continue;
      const name = (value as { name?: unknown } | null)?.name;
      if (typeof name === "string" && name.trim())
        return name.trim().slice(0, 120);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Record the catalog a principal was just served.
 *
 * The fingerprint is taken from the listing as sent — after the admin filter,
 * after whatever the SDK did to the schemas — so what we store is exactly what
 * the client now holds, not a reconstruction of it.
 *
 * Awaited by its caller but never allowed to fail one: `tools/list` answering
 * correctly matters, bookkeeping about it does not.
 */
export async function recordServedCatalog(
  ctx: ServerContext,
  tools: readonly ServedTool[],
): Promise<void> {
  const who = connection(ctx);
  if (!who || tools.length === 0) return;
  try {
    const snapshot = await currentCatalogSnapshot();
    await persistCatalogServed(who.userId, who.clientId, {
      fingerprint: fingerprintCatalog(tools),
      generation: snapshot?.generation ?? 0,
      variant: catalogVariantOf(tools, ADMIN_TOOL_NAMES),
      toolCount: tools.length,
      clientName: clientName(ctx),
    });
  } catch (err) {
    await reportError("mcp:catalog-record", err, {});
  }
}

/**
 * Wrap `tools/call` so a stale connection's results carry the refresh notice.
 *
 * The notice is an extra `content` block plus a `_meta` entry. Both, for
 * different readers: the text block is what a model reliably sees and relays
 * (`_meta` is routinely ignored by clients and never shown), and the `_meta`
 * entry is what a programmatic consumer can branch on without parsing prose.
 * Neither touches `structuredContent`, so the enveloped `data` every tool
 * returns is byte-for-byte what it was — no tool's contract changes, and a
 * consumer reading `structuredContent` cannot tell this feature exists.
 *
 * Fails open the way `visibility.ts` does: if the handler cannot be captured,
 * the stock one stays and nobody is ever notified. A missed notice is a user
 * who keeps an old tool list; a wrongly-broken `tools/call` is a user who
 * cannot train.
 */
export function attachCatalogNotice(server: McpServer) {
  const handlers = (
    server.server as unknown as { _requestHandlers?: Map<string, CallHandler> }
  )._requestHandlers;
  const original = handlers?.get("tools/call");
  if (!original) return;

  server.server.setRequestHandler("tools/call", async (request, ctx) => {
    const result = (await original(
      request as CallToolRequest,
      ctx as ServerContext,
    )) as CallToolResult;
    try {
      return await decorate(result, ctx as ServerContext);
    } catch (err) {
      await reportError("mcp:catalog-notice", err, {});
      return result;
    }
  });
}

async function decorate(
  result: CallToolResult,
  ctx: ServerContext,
): Promise<CallToolResult> {
  const who = connection(ctx);
  if (!who) return result;

  const [lookup, snapshot] = await Promise.all([
    getCatalogRecord(who.userId, who.clientId),
    currentCatalogSnapshot(),
  ]);
  // A table we cannot read tells us nothing about what the client holds, so it
  // must not be read as "never listed" — see `CatalogLookup`.
  if (!lookup.available) return result;

  const record = lookup.record;
  const freshness = evaluateCatalogFreshness(record, snapshot);
  if (!freshness.stale) return result;
  if (!shouldAttachNotice(record?.notifiedAt ?? null, Date.now()))
    return result;

  // Stamp before returning, so a burst of parallel tool calls in one turn
  // cannot each decide they are the first to warn.
  await recordCatalogNotified(who.userId, who.clientId, clientName(ctx));

  return {
    ...result,
    content: [
      ...(result.content ?? []),
      { type: "text" as const, text: CONNECTOR_UPDATE_NOTICE },
    ],
    _meta: {
      ...(result._meta ?? {}),
      [CATALOG_NOTICE_META_KEY]: catalogNoticeMeta(freshness.reason),
    },
  };
}

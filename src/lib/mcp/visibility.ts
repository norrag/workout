import "server-only";
import type {
  ListToolsRequest,
  ListToolsResult,
  McpServer,
  ServerContext,
} from "@modelcontextprotocol/server";
import { getProfile } from "@/lib/queries/profiles";
import { resolveSession, type McpExtra } from "./session";
import { ADMIN_TOOL_NAMES } from "./tools/admin";

/**
 * PH33 (owner 2026-07-02): hide the admin/tuning tools from `tools/list` for
 * non-admin sessions. This is a *visibility* nicety, not the security boundary
 * — every admin tool still denies non-admins at call time (`resolveAdmin`);
 * the owner just doesn't want regular clients seeing tools they can't use.
 *
 * The SDK's high-level McpServer builds its own tools/list handler with no
 * auth context, so we capture that handler after registration and wrap it:
 * same listing, filtered by the caller's `profiles.role` (one RLS-scoped read
 * per tools/list request — rare). If the SDK's internals ever shift and the
 * handler can't be captured, we leave the stock handler in place: admin tools
 * become visible again but never callable — fail open on visibility, never on
 * access.
 *
 * Spec 2026-07-28 makes `tools/list` a *cacheable* result. Because this listing
 * varies by principal, its cache hint must stay `cacheScope: "private"` — a
 * shared cache would serve one caller's listing to another. That hint is set
 * explicitly in `src/app/api/mcp/route.ts`; it is also the SDK default.
 */
type ListHandler = (
  request: ListToolsRequest,
  ctx: ServerContext,
) => Promise<ListToolsResult> | ListToolsResult;

export function scopeAdminToolVisibility(server: McpServer) {
  const handlers = (
    server.server as unknown as {
      _requestHandlers?: Map<string, ListHandler>;
    }
  )._requestHandlers;
  const original = handlers?.get("tools/list");
  if (!original) return;

  // v2 keys request handlers by method string; the request schemas that the 1.x
  // overload took are no longer public API.
  server.server.setRequestHandler("tools/list", async (request, ctx) => {
    const result = await original(request, ctx);
    if (await isAdminSession(ctx as McpExtra)) return result;
    return {
      ...result,
      tools: result.tools.filter((t) => !ADMIN_TOOL_NAMES.has(t.name)),
    };
  });
}

async function isAdminSession(extra: McpExtra): Promise<boolean> {
  try {
    const { client, userId } = resolveSession(extra);
    const profile = await getProfile(client, userId);
    return profile?.role === "admin";
  } catch {
    // no/invalid auth context → not an admin; the transport-level auth gate
    // already rejected truly unauthenticated requests
    return false;
  }
}

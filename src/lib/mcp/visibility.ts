import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
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
 */
type ListedTool = { name: string };
type ListHandler = (
  request: unknown,
  extra: unknown,
) => Promise<{ tools: ListedTool[] }> | { tools: ListedTool[] };

export function scopeAdminToolVisibility(server: McpServer) {
  const handlers = (
    server.server as unknown as {
      _requestHandlers?: Map<string, ListHandler>;
    }
  )._requestHandlers;
  const original = handlers?.get("tools/list");
  if (!original) return;

  server.server.setRequestHandler(
    ListToolsRequestSchema,
    async (request, extra) => {
      const result = await original(request, extra);
      if (await isAdminSession(extra as McpExtra)) return result;
      return {
        ...result,
        tools: result.tools.filter((t) => !ADMIN_TOOL_NAMES.has(t.name)),
      };
    },
  );
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

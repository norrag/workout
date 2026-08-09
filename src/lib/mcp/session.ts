import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerContext } from "@modelcontextprotocol/server";
import type { Database } from "@/lib/types/database";
import {
  createMcpRlsClient,
  identityFromAuthInfo,
  type McpIdentity,
} from "./auth";

/**
 * The per-request handler context (SDK v2 / spec 2026-07-28). The protocol is
 * stateless — there is no `initialize` handshake and no session id — so this
 * context, rebuilt for every request, is the only place identity lives.
 */
export type McpExtra = ServerContext;
export type McpClient = SupabaseClient<Database>;

export interface McpSession extends McpIdentity {
  /** RLS-scoped Supabase client, bound to this session's bearer token */
  client: McpClient;
}

/**
 * Resolve the calling user from the MCP request's auth context.
 *
 * Identity comes from the validated bearer token only (hard rule #5) — never
 * from a tool argument. Every tool/resource handler starts here.
 */
export function resolveSession(extra: McpExtra): McpSession {
  // v2 carries the validated token under `http.authInfo` (it was a top-level
  // `extra.authInfo` on the 1.x/2025 handler context).
  const authInfo = extra.http?.authInfo;
  if (!authInfo) {
    throw new Error("this tool requires an authenticated session");
  }
  const identity = identityFromAuthInfo(authInfo);
  return { ...identity, client: createMcpRlsClient(identity.token) };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import type { Database } from "@/lib/types/database";
import {
  createMcpRlsClient,
  identityFromAuthInfo,
  type McpIdentity,
} from "./auth";

export type McpExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;
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
  if (!extra.authInfo) {
    throw new Error("this tool requires an authenticated session");
  }
  const identity = identityFromAuthInfo(extra.authInfo);
  return { ...identity, client: createMcpRlsClient(identity.token) };
}

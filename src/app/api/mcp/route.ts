import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  initializeMcpServer,
  MCP_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "@/lib/mcp/server";
import { verifyMcpToken } from "@/lib/mcp/auth";

// The connector talks to the LLM and Supabase; it must run on Node (not Edge).
export const runtime = "nodejs";
// Auth is per-request from the bearer token — never cache.
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => {
    initializeMcpServer(server);
  },
  {
    serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    instructions: MCP_INSTRUCTIONS,
  },
  {
    // Stateless Streamable HTTP at exactly /api/mcp; SSE is retired from the
    // MCP spec and needs Redis, so it stays off (05 §Transport).
    streamableHttpEndpoint: "/api/mcp",
    disableSse: true,
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

// Require a valid Supabase-issued bearer JWT; a missing/invalid token yields a
// 401 carrying the protected-resource metadata pointer (RFC 9728), which the
// client follows to discover the Supabase OAuth authorization server.
const authedHandler = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authedHandler as GET, authedHandler as POST };

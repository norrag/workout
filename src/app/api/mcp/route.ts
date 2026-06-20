import { createHash } from "crypto";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  initializeMcpServer,
  MCP_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "@/lib/mcp/server";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { RateLimiter } from "@/lib/mcp/rate-limit";

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

// Per-token rate limit (05 §Safeguards). Keyed by a hash of the bearer token so
// one client can't exhaust the connector; unauthenticated requests are keyed by
// IP. Defaults to 120 req/min, overridable via MCP_RATE_LIMIT. See
// src/lib/mcp/rate-limit.ts for the per-instance caveat.
const limiter = new RateLimiter(
  Number(process.env.MCP_RATE_LIMIT) || 120,
  60_000,
);

function clientKey(req: Request): string {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return "t:" + createHash("sha256").update(auth.slice(7)).digest("hex");
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return "ip:" + ip;
}

async function withRateLimit(
  req: Request,
  next: (req: Request) => Promise<Response> | Response,
): Promise<Response> {
  const now = Date.now();
  const result = limiter.check(clientKey(req), now);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32029, message: "Rate limit exceeded" },
        id: null,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
        },
      },
    );
  }
  return next(req);
}

const GET = (req: Request) => withRateLimit(req, authedHandler);
const POST = (req: Request) => withRateLimit(req, authedHandler);

export { GET, POST };

import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import { issuer } from "@/lib/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728). MCP clients fetch this
 * after a 401 from /api/mcp to discover the authorization server — Supabase's
 * native OAuth 2.1 server (05 §Auth). `MCP_AUTH_ISSUER` overrides the default
 * `<supabase-url>/auth/v1` issuer if the project exposes a different one.
 *
 * The handler is built lazily (per request) so the issuer is resolved from the
 * runtime env, not at build/collection time. The resource URL is auto-detected
 * from the request (honoring proxy headers), so this works unchanged across
 * local, preview, and production deployments.
 */
export function GET(req: Request): Response {
  const handler = protectedResourceHandler({
    authServerUrls: [process.env.MCP_AUTH_ISSUER || issuer()],
  });
  return handler(req);
}

const optionsHandler = metadataCorsOptionsRequestHandler();
export { optionsHandler as OPTIONS };

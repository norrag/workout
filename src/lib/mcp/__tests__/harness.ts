import type { McpServer } from "@modelcontextprotocol/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpExtra } from "../session";

/**
 * Test harness for MCP tool/resource handlers. Captures registrations so a test
 * can fetch a handler by name and invoke it with a synthetic auth context —
 * exercising the real handler body (identity resolution + formatting) without a
 * transport. DB-backed handlers should be run against the seeded fixture user
 * (local Supabase stack) in the integration suite.
 */

interface CapturedTool {
  config: { inputSchema?: unknown; description?: string };
  handler: (args: unknown, extra: McpExtra) => unknown;
}
interface CapturedResource {
  uri: string;
  handler: (uri: URL, extra: McpExtra) => unknown;
}

export interface CaptureServer {
  server: McpServer;
  tools: Map<string, CapturedTool>;
  resources: Map<string, CapturedResource>;
}

/** A fake McpServer that records `registerTool` / `registerResource` calls. */
export function captureServer(): CaptureServer {
  const tools = new Map<string, CapturedTool>();
  const resources = new Map<string, CapturedResource>();

  const server = {
    registerTool(
      name: string,
      config: CapturedTool["config"],
      handler: CapturedTool["handler"],
    ) {
      tools.set(name, { config, handler });
      return {};
    },
    registerResource(
      name: string,
      uri: string,
      _config: unknown,
      handler: CapturedResource["handler"],
    ) {
      resources.set(name, { uri, handler });
      return {};
    },
  } as unknown as McpServer;

  return { server, tools, resources };
}

/** A validated-token AuthInfo carrying the user id, as `verifyMcpToken` emits. */
export function fakeAuthInfo(
  userId: string,
  token = "test.jwt.token",
): AuthInfo {
  return {
    token,
    clientId: "test-client",
    scopes: [],
    extra: { userId },
  };
}

/**
 * An MCP handler context with the given (or no) auth context. Under SDK v2 the
 * validated token hangs off `http.authInfo`, so an unauthenticated call is
 * `http` present with no `authInfo` — the shape `withMcpAuth` produces when it
 * lets a request through without one.
 */
export function fakeExtra(authInfo?: AuthInfo): McpExtra {
  return { http: { authInfo } } as unknown as McpExtra;
}

/**
 * A context shaped for the `tools/call` REQUEST HANDLER rather than for a tool
 * body. The SDK's dispatcher reads `ctx.mcpReq.requestState()` before it ever
 * reaches a handler, so the minimal `{ http: { authInfo } }` above is enough to
 * invoke a tool function directly but not to drive `tools/call` end to end
 * (N91's catalog-notice wrapper sits on that handler, so its suite does).
 *
 * `clientInfo` rides the 2026-07-28 `_meta` envelope; it is optional in the
 * spec, so it is optional here too.
 */
export function fakeCallExtra(
  authInfo?: AuthInfo,
  opts: { clientName?: string } = {},
): McpExtra {
  return {
    http: { authInfo },
    mcpReq: {
      id: 1,
      method: "tools/call",
      requestState: () => undefined,
      ...(opts.clientName
        ? {
            envelope: {
              "io.modelcontextprotocol/clientInfo": {
                name: opts.clientName,
                version: "1.0.0",
              },
            },
          }
        : {}),
    },
  } as unknown as McpExtra;
}

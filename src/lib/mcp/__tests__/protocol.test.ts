import { describe, it, expect, beforeAll } from "vitest";
import { createMcpHandler } from "mcp-handler";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/server";

/**
 * The stateless wire revision. The SDK keeps the modern revision separate from
 * the legacy-era constants it still exports — `LATEST_PROTOCOL_VERSION` is the
 * newest *2025-era* version (`2025-11-25`) and `SUPPORTED_PROTOCOL_VERSIONS`
 * lists only that era — so the modern revision is pinned here as a literal,
 * which is what a conformance test should assert against anyway.
 */
const MODERN_PROTOCOL_VERSION = "2026-07-28";
import {
  initializeMcpServer,
  MCP_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "../server";
import { ADMIN_TOOL_NAMES } from "../tools/admin";

/**
 * Protocol conformance for the stateless MCP spec (2026-07-28).
 *
 * Unlike the per-tool suites, this one drives the **real** handler — the same
 * `createMcpHandler` wiring `/api/mcp` exports, with every tool and resource
 * actually registered — over genuine HTTP requests. It is what catches an SDK
 * upgrade that type-checks but no longer serves: a raw-shape `inputSchema` that
 * stops being auto-wrapped, a `tools/list` override that stops being applied,
 * or a request that now needs a handshake we no longer perform.
 *
 * Env: `MCP_INSTRUCTIONS` and tool registration read no secrets, but the
 * Supabase client factory validates its env lazily, so a call that reaches the
 * database is deliberately not exercised here (that is the integration suite).
 */

const ENDPOINT = "https://workout.test/api/mcp";

let handler: (req: Request) => Promise<Response>;

beforeAll(() => {
  handler = createMcpHandler(
    (server) => {
      initializeMcpServer(server);
    },
    {
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      instructions: MCP_INSTRUCTIONS,
      cacheHints: {
        "tools/list": { ttlMs: 0, cacheScope: "private" },
        "resources/list": { ttlMs: 0, cacheScope: "private" },
        "resources/read": { ttlMs: 0, cacheScope: "private" },
      },
    },
  );
});

/** Parse a response body that may be a plain JSON result or a one-shot SSE frame. */
async function readBody(res: Response): Promise<Record<string, never>> {
  const text = await res.text();
  if (!text) return {} as Record<string, never>;
  if (text.startsWith("event:") || text.startsWith("data:")) {
    const line = text.split("data: ")[1]?.split("\n")[0] ?? "{}";
    return JSON.parse(line);
  }
  return JSON.parse(text);
}

/**
 * One 2026-07-28 request: no prior `initialize`, no session id — the per-request
 * `_meta` envelope carries the client identity the handshake used to establish.
 */
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const res = await handler(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
        // `Mcp-Method` and `Mcp-Name` let gateways route and rate-limit without
        // parsing the body. The SDK rejects a request whose headers and body
        // disagree, so `Mcp-Name` is required whenever the params name a target
        // — the tool name for `tools/call`, the URI for `resources/read`.
        "Mcp-Method": method,
        ...(typeof (params.name ?? params.uri) === "string"
          ? { "Mcp-Name": String(params.name ?? params.uri) }
          : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
            [CLIENT_INFO_META_KEY]: { name: "conformance-test", version: "0" },
            [CLIENT_CAPABILITIES_META_KEY]: {},
          },
        },
      }),
    }),
  );
  return { status: res.status, body: (await readBody(res)) as Record<string, never> };
}

type ListedTool = {
  name: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown> };
};

async function listTools(): Promise<ListedTool[]> {
  const { body } = await rpc("tools/list");
  const result = body["result"] as { tools?: ListedTool[] } | undefined;
  return result?.tools ?? [];
}

describe("MCP 2026-07-28 conformance", () => {
  it("keeps the modern revision distinct from the legacy-era version list", () => {
    // Guards the assumption above: if a later SDK folds 2026-07-28 into
    // SUPPORTED_PROTOCOL_VERSIONS, switch this file to the SDK constant.
    expect(SUPPORTED_PROTOCOL_VERSIONS).not.toContain(MODERN_PROTOCOL_VERSION);
  });

  it("serves tools/list with no initialize handshake (stateless)", async () => {
    const { status, body } = await rpc("tools/list");
    expect(status).toBe(200);
    expect(body["error"]).toBeUndefined();
    const tools = (body["result"] as { tools: ListedTool[] }).tools;
    expect(tools.length).toBeGreaterThan(30);
  });

  it("answers server/discover with the modern revision, capabilities and instructions", async () => {
    // `server/discover` is the spec's optional capability negotiation; it
    // replaces the initialize/initialized handshake, which no longer exists.
    const { status, body } = await rpc("server/discover");
    expect(status).toBe(200);
    const result = body["result"] as {
      supportedVersions?: string[];
      capabilities?: { tools?: unknown; resources?: unknown };
      instructions?: string;
    };
    expect(result.supportedVersions).toContain(MODERN_PROTOCOL_VERSION);
    expect(result.capabilities?.tools).toBeDefined();
    expect(result.capabilities?.resources).toBeDefined();
    // the domain instructions the connector teaches the model
    expect(result.instructions).toContain("WORKOUT");
  });

  it("rejects a request whose Mcp-Name header disagrees with the body", async () => {
    const res = await handler(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
          "Mcp-Method": "tools/call",
          "Mcp-Name": "some_other_tool",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_current_state",
            arguments: {},
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
              [CLIENT_INFO_META_KEY]: { name: "conformance-test", version: "0" },
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("never advertises a cacheable listing to a shared cache", async () => {
    // tools/list is filtered per principal (admin visibility) and the resources
    // are user-scoped, so a `public` scope here would leak one caller's view.
    for (const method of ["tools/list", "resources/list"]) {
      const { body } = await rpc(method);
      const result = body["result"] as { cacheScope?: string; ttlMs?: number };
      expect(result.cacheScope, `${method} cacheScope`).toBe("private");
      expect(result.ttlMs, `${method} ttlMs`).toBe(0);
    }
  });

  it("lets a shared cache hold the static resources but never the user-scoped ones", async () => {
    const staticRead = await rpc("resources/read", {
      uri: "workout://coaching-guide",
    });
    const staticResult = staticRead.body["result"] as {
      cacheScope?: string;
      ttlMs?: number;
    };
    expect(staticResult.cacheScope).toBe("public");
    expect(staticResult.ttlMs).toBeGreaterThan(0);

    // The user-scoped resource must not inherit that hint. It fails closed on
    // an unauthenticated read; what matters is that it is never `public`.
    const userRead = await rpc("resources/read", { uri: "workout://profile" });
    const userResult = userRead.body["result"] as { cacheScope?: string } | undefined;
    expect(userResult?.cacheScope).not.toBe("public");
  });

  it("auto-wraps every tool's raw-shape inputSchema into a JSON Schema object", async () => {
    const tools = await listTools();
    const bad = tools.filter((t) => t.inputSchema?.type !== "object");
    expect(bad.map((t) => t.name)).toEqual([]);
  });

  it("exposes no user_id argument on any tool (hard rule #5)", async () => {
    const tools = await listTools();
    const leaky = tools.filter(
      (t) => t.inputSchema?.properties && "user_id" in t.inputSchema.properties,
    );
    expect(leaky.map((t) => t.name)).toEqual([]);
  });

  it("hides admin tools from an unauthenticated listing (PH33)", async () => {
    const tools = await listTools();
    const leaked = tools.filter((t) => ADMIN_TOOL_NAMES.has(t.name));
    expect(leaked.map((t) => t.name)).toEqual([]);
  });

  it("fails an unauthenticated tools/call closed rather than crashing", async () => {
    const { status, body } = await rpc("tools/call", {
      name: "get_current_state",
      arguments: {},
    });
    expect(status).toBe(200);
    const result = body["result"] as
      | { isError?: boolean; content?: { text?: string }[] }
      | undefined;
    const message =
      result?.content?.[0]?.text ??
      (body["error"] as { message?: string } | undefined)?.message ??
      "";
    expect(result?.isError ?? body["error"] !== undefined).toBe(true);
    expect(message).toMatch(/authenticat/i);
  });

  it("answers the retired 2025 session operations with 405", async () => {
    // Serving is stateless, so there is no stream to resume and no session to
    // delete. Both were GET/DELETE on the 2025 Streamable HTTP transport.
    for (const method of ["GET", "DELETE"]) {
      const res = await handler(new Request(ENDPOINT, { method }));
      expect(res.status, method).toBe(405);
    }
  });

  it("still serves a 2025-era client through the stateless legacy fallback", async () => {
    // Existing connectors must keep working across the spec change.
    const res = await handler(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "legacy-client", version: "0" },
          },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await readBody(res)) as Record<string, never>;
    const result = body["result"] as { protocolVersion?: string } | undefined;
    expect(result?.protocolVersion).toBe("2025-06-18");
  });
});

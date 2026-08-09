import { describe, it, expect, vi, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { initializeMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "../server";
import { ADMIN_TOOL_NAMES } from "../tools/admin";
import { fakeAuthInfo, fakeExtra } from "./harness";

/**
 * PH33 — admin tools are hidden from tools/list for non-admins (visibility
 * only; call-time denial in resolveAdmin is the real boundary and has its own
 * tests). Uses a REAL McpServer so the capture-and-wrap of the SDK's stock
 * tools/list handler is exercised against the SDK's actual internals — if an
 * SDK upgrade moves `_requestHandlers`, this suite is what catches it.
 */

vi.mock("@/lib/queries/profiles", () => ({
  getProfile: vi.fn(async (_client: unknown, userId: string) => ({
    id: userId,
    role: userId === "admin-user" ? "admin" : "user",
  })),
}));

type ListResult = { tools: { name: string }[] };
type Handler = (req: unknown, extra: unknown) => Promise<ListResult> | ListResult;

function buildServer(): Handler {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });
  initializeMcpServer(server);
  const handler = (
    server.server as unknown as { _requestHandlers: Map<string, Handler> }
  )._requestHandlers.get("tools/list");
  if (!handler) throw new Error("tools/list handler not registered");
  return handler;
}

const LIST_REQ = { method: "tools/list" as const, params: {} };

beforeAll(() => {
  // createMcpRlsClient only needs these to construct; no network is hit
  // (getProfile is mocked above).
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
});

describe("scopeAdminToolVisibility (PH33)", () => {
  it("hides every admin tool from a non-admin session", async () => {
    const handler = buildServer();
    const result = await handler(LIST_REQ, fakeExtra(fakeAuthInfo("regular-user")));
    const names = new Set(result.tools.map((t) => t.name));
    for (const admin of ADMIN_TOOL_NAMES) {
      expect(names.has(admin), `${admin} should be hidden`).toBe(false);
    }
    // the public surface is untouched
    expect(names.has("get_current_state")).toBe(true);
    expect(names.size).toBeGreaterThan(20);
  });

  it("lists admin tools for an admin session", async () => {
    const handler = buildServer();
    const result = await handler(LIST_REQ, fakeExtra(fakeAuthInfo("admin-user")));
    const names = new Set(result.tools.map((t) => t.name));
    for (const admin of ADMIN_TOOL_NAMES) {
      expect(names.has(admin), `${admin} should be visible`).toBe(true);
    }
  });

  it("treats a session without auth context as non-admin", async () => {
    const handler = buildServer();
    const result = await handler(LIST_REQ, fakeExtra());
    const names = new Set(result.tools.map((t) => t.name));
    for (const admin of ADMIN_TOOL_NAMES) {
      expect(names.has(admin)).toBe(false);
    }
  });
});

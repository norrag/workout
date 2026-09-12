import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { fakeCallExtra, fakeExtra } from "./harness";

/**
 * N91 — tool-catalog freshness, end to end through the real SDK handlers.
 *
 * This is the suite that would have caught the feature not working: it drives
 * the actual `tools/list` and `tools/call` request handlers the transport
 * drives, with the database swapped for an in-memory store, and asserts on what
 * a client would receive.
 *
 * The store is keyed `user|client` exactly as the table is keyed
 * `(user_id, client_id)`, so "ChatGPT and Claude are tracked independently" is
 * a property of the test's own bookkeeping too, not just of the assertions.
 */

interface StoredRow {
  catalog_fingerprint: string | null;
  catalog_generation: number | null;
  catalog_variant: "standard" | "admin" | null;
  tool_count: number | null;
  client_name: string | null;
  listed_at: string | null;
  notified_at: string | null;
}

const store = new Map<string, StoredRow>();
const key = (userId: string, clientId: string) => `${userId}|${clientId}`;
/** stands in for an unreachable table — an unapplied migration, say */
let storeUnavailable = false;

vi.mock("@/lib/queries/mcp-catalog", () => ({
  getCatalogRecord: vi.fn(async (userId: string, clientId: string) => {
    if (storeUnavailable) return { available: false, record: null };
    const row = store.get(key(userId, clientId));
    if (!row) return { available: true, record: null };
    return {
      available: true,
      record: {
        fingerprint: row.catalog_fingerprint,
        generation: row.catalog_generation,
        variant: row.catalog_variant,
        listedAt: row.listed_at,
        notifiedAt: row.notified_at,
      },
    };
  }),
  recordCatalogServed: vi.fn(
    async (
      userId: string,
      clientId: string,
      served: {
        fingerprint: string;
        generation: number;
        variant: "standard" | "admin";
        toolCount: number;
        clientName?: string | null;
      },
    ) => {
      store.set(key(userId, clientId), {
        catalog_fingerprint: served.fingerprint,
        catalog_generation: served.generation,
        catalog_variant: served.variant,
        tool_count: served.toolCount,
        client_name: served.clientName ?? null,
        listed_at: new Date().toISOString(),
        // a refresh clears the notification stamp: see the queries module
        notified_at: null,
      });
    },
  ),
  recordCatalogNotified: vi.fn(
    async (userId: string, clientId: string, clientName?: string | null) => {
      const existing = store.get(key(userId, clientId));
      store.set(key(userId, clientId), {
        catalog_fingerprint: existing?.catalog_fingerprint ?? null,
        catalog_generation: existing?.catalog_generation ?? null,
        catalog_variant: existing?.catalog_variant ?? null,
        tool_count: existing?.tool_count ?? null,
        client_name: clientName ?? existing?.client_name ?? null,
        listed_at: existing?.listed_at ?? null,
        notified_at: new Date().toISOString(),
      });
    },
  ),
}));

vi.mock("@/lib/queries/profiles", () => ({
  getProfile: vi.fn(async (_client: unknown, userId: string) => ({
    id: userId,
    role: userId === "admin-user" ? "admin" : "user",
  })),
}));

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { initializeMcpServer } from "../server";
import {
  CONNECTOR_UPDATE_NOTICE,
  CATALOG_NOTICE_META_KEY,
  fingerprintCatalog,
  type ServedTool,
} from "../catalog";
import { currentCatalogSnapshot } from "../catalog-snapshot";
import {
  MCP_CATALOG_GENERATION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "../version";

type Handler = (req: unknown, ctx: unknown) => Promise<Record<string, unknown>>;

function handlersOf(server: McpServer): Map<string, Handler> {
  return (
    server.server as unknown as { _requestHandlers: Map<string, Handler> }
  )._requestHandlers;
}

/** A server exactly as `/api/mcp` builds it. */
function realServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });
  initializeMcpServer(server);
  return server;
}

/**
 * A server that additionally carries a database-free probe tool, so a
 * `tools/call` can be driven without a Supabase stack. Freshness is judged
 * against `currentCatalogSnapshot()` — the real catalog — never against this
 * instance's own listing, so the probe cannot influence the verdict.
 */
function callableServer(): Handler {
  const server = realServer();
  server.registerTool(
    "__probe",
    { title: "probe", description: "test-only", inputSchema: {} },
    async () => ({
      content: [{ type: "text" as const, text: "ok" }],
      structuredContent: { data: { ok: true } },
    }),
  );
  const call = handlersOf(server).get("tools/call");
  if (!call) throw new Error("tools/call handler not registered");
  return call;
}

function listHandler(): Handler {
  const handler = handlersOf(realServer()).get("tools/list");
  if (!handler) throw new Error("tools/list handler not registered");
  return handler;
}

function auth(userId: string, clientId: string): AuthInfo {
  return { token: "test.jwt.token", clientId, scopes: [], extra: { userId } };
}

const LIST_REQ = { method: "tools/list" as const, params: {} };
const CALL_REQ = {
  method: "tools/call" as const,
  params: { name: "__probe", arguments: {} },
};

async function list(userId: string, clientId: string) {
  return listHandler()(LIST_REQ, fakeExtra(auth(userId, clientId)));
}

async function call(userId: string, clientId: string, clientName?: string) {
  return callableServer()(
    CALL_REQ,
    fakeCallExtra(auth(userId, clientId), clientName ? { clientName } : {}),
  );
}

function hasNotice(result: Record<string, unknown>): boolean {
  const content = (result.content ?? []) as { type: string; text?: string }[];
  return content.some(
    (c) => c.type === "text" && c.text === CONNECTOR_UPDATE_NOTICE,
  );
}

beforeAll(() => {
  // createMcpRlsClient only needs these to construct; no network is hit
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
});

beforeEach(() => {
  store.clear();
  storeUnavailable = false;
});

describe("recording what tools/list served", () => {
  it("records the served catalog against the authenticated user and client", async () => {
    await list("user-1", "chatgpt-client");

    expect(store.size).toBe(1);
    const row = store.get("user-1|chatgpt-client")!;
    expect(row.catalog_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(row.catalog_generation).toBe(MCP_CATALOG_GENERATION);
    expect(row.catalog_variant).toBe("standard");
    expect(row.tool_count).toBeGreaterThan(20);
    expect(row.listed_at).not.toBeNull();
  });

  it("records the fingerprint of the listing that principal actually received", async () => {
    const result = await list("user-1", "chatgpt-client");
    const served = (result.tools ?? []) as ServedTool[];
    expect(store.get("user-1|chatgpt-client")!.catalog_fingerprint).toBe(
      fingerprintCatalog(served),
    );
  });

  it("records the admin listing as the admin variant", async () => {
    await list("admin-user", "chatgpt-client");
    const row = store.get("admin-user|chatgpt-client")!;
    expect(row.catalog_variant).toBe("admin");

    await list("user-1", "chatgpt-client");
    expect(store.get("user-1|chatgpt-client")!.catalog_variant).toBe(
      "standard",
    );
    // the two listings really are different catalogs
    expect(row.catalog_fingerprint).not.toBe(
      store.get("user-1|chatgpt-client")!.catalog_fingerprint,
    );
  });

  it("records nothing for an unauthenticated context", async () => {
    await listHandler()(LIST_REQ, fakeExtra());
    expect(store.size).toBe(0);
  });
});

describe("the stale notice on an ordinary tool call", () => {
  it("warns a connection that predates tracking (the one-time migration)", async () => {
    const result = await call("user-1", "chatgpt-client");
    expect(hasNotice(result)).toBe(true);
    const meta = (result._meta as Record<string, { reason: string }>)[
      CATALOG_NOTICE_META_KEY
    ];
    expect(meta.reason).toBe("never-listed");
  });

  it("does not warn a connection that has just been served the current catalog", async () => {
    await list("user-1", "chatgpt-client");
    const result = await call("user-1", "chatgpt-client");
    expect(hasNotice(result)).toBe(false);
    expect(result._meta ?? {}).not.toHaveProperty(CATALOG_NOTICE_META_KEY);
  });

  it("warns a connection whose recorded catalog is older than the current one", async () => {
    store.set("user-1|chatgpt-client", {
      catalog_fingerprint: fingerprintCatalog([{ name: "get_current_state" }]),
      catalog_generation: MCP_CATALOG_GENERATION,
      catalog_variant: "standard",
      tool_count: 1,
      client_name: null,
      listed_at: "2026-05-01T00:00:00.000Z",
      notified_at: null,
    });
    const result = await call("user-1", "chatgpt-client");
    expect(hasNotice(result)).toBe(true);
    const meta = (result._meta as Record<string, { reason: string }>)[
      CATALOG_NOTICE_META_KEY
    ];
    expect(meta.reason).toBe("catalog-changed");
  });

  it("leaves the tool's own payload untouched — structuredContent never changes", async () => {
    const withNotice = await call("user-1", "chatgpt-client");
    store.clear();
    await list("user-1", "chatgpt-client");
    const without = await call("user-1", "chatgpt-client");
    expect(withNotice.structuredContent).toEqual(without.structuredContent);
    // the notice is additive: the tool's own text block is still first
    const content = withNotice.content as { text?: string }[];
    expect(content[0]?.text).toBe("ok");
  });

  it("records the client's own name when it sends one, for debugging", async () => {
    await call("user-1", "chatgpt-client", "chatgpt");
    expect(store.get("user-1|chatgpt-client")!.client_name).toBe("chatgpt");
  });

  it("says nothing at all when the freshness table cannot be read", async () => {
    // the failure mode this guards: if an unreadable table read as "never
    // listed", an unapplied migration would warn every user, every hour,
    // forever — and the write that clears it would be failing too
    storeUnavailable = true;
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
  });

  it("says nothing to a call with no authenticated session", async () => {
    const result = await callableServer()(CALL_REQ, fakeCallExtra());
    expect(hasNotice(result)).toBe(false);
  });

  it("warns once and then holds its tongue for the cooldown", async () => {
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(true);
    expect(store.get("user-1|chatgpt-client")!.notified_at).not.toBeNull();
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
  });
});

describe("refreshing clears it", () => {
  it("is cleared by the tools/list the client sends after a manual Refresh", async () => {
    // 1. stale connection is warned
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(true);
    // 2. the user hits Settings → Plugins → Workout → Refresh; ChatGPT re-lists
    await list("user-1", "chatgpt-client");
    // 3. the notice is gone, and stays gone
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
  });

  it("clears the notification stamp on refresh, so a future staleness warns at once", async () => {
    await call("user-1", "chatgpt-client");
    await list("user-1", "chatgpt-client");
    expect(store.get("user-1|chatgpt-client")!.notified_at).toBeNull();
  });
});

describe("connections are tracked independently", () => {
  it("keeps one user's two OAuth clients separate", async () => {
    await list("user-1", "chatgpt-client");

    // ChatGPT is current; Claude has never listed
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
    expect(hasNotice(await call("user-1", "claude-client"))).toBe(true);

    // and refreshing Claude does not disturb ChatGPT's record
    const chatgptBefore = { ...store.get("user-1|chatgpt-client")! };
    await list("user-1", "claude-client");
    expect(store.get("user-1|chatgpt-client")).toEqual(chatgptBefore);
    expect(hasNotice(await call("user-1", "claude-client"))).toBe(false);
  });

  it("keeps two users on the same client software separate", async () => {
    await list("user-1", "chatgpt-client");
    expect(hasNotice(await call("user-2", "chatgpt-client"))).toBe(true);
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
  });
});

describe("admin visibility does not corrupt the verdict", () => {
  it("leaves an admin who has listed reading as current", async () => {
    await list("admin-user", "chatgpt-client");
    expect(hasNotice(await call("admin-user", "chatgpt-client"))).toBe(false);
  });

  it("leaves a non-admin who has listed reading as current", async () => {
    await list("user-1", "chatgpt-client");
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
  });

  it("would mark a non-admin stale if the variants were ever compared crosswise", async () => {
    // guards the failure mode directly: store the admin catalog against a
    // standard record and confirm it reads stale, which is what a
    // single-catalog implementation would do to every ordinary user
    const snapshot = await currentCatalogSnapshot();
    store.set("user-1|chatgpt-client", {
      catalog_fingerprint: snapshot!.admin.fingerprint,
      catalog_generation: MCP_CATALOG_GENERATION,
      catalog_variant: "standard",
      tool_count: snapshot!.admin.toolCount,
      client_name: null,
      listed_at: "2026-09-01T00:00:00.000Z",
      notified_at: null,
    });
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(true);
  });
});

describe("the rollout bump", () => {
  it("makes an already-up-to-date connection stale until it refreshes", async () => {
    // Exactly the owner's situation: a ChatGPT connection holding today's real
    // catalog, recorded under the PREVIOUS generation. It must read stale on
    // deploy, and one Refresh must clear it for good.
    const served = ((await list("user-1", "chatgpt-client")).tools ??
      []) as ServedTool[];
    const previousGeneration = MCP_CATALOG_GENERATION - 1;
    store.set("user-1|chatgpt-client", {
      catalog_fingerprint: fingerprintCatalog(served, {
        generation: previousGeneration,
      }),
      catalog_generation: previousGeneration,
      catalog_variant: "standard",
      tool_count: served.length,
      client_name: "chatgpt",
      listed_at: "2026-08-01T00:00:00.000Z",
      notified_at: null,
    });

    const warned = await call("user-1", "chatgpt-client");
    expect(hasNotice(warned)).toBe(true);
    const meta = (warned._meta as Record<string, { reason: string }>)[
      CATALOG_NOTICE_META_KEY
    ];
    expect(meta.reason).toBe("generation-advanced");

    await list("user-1", "chatgpt-client");
    expect(hasNotice(await call("user-1", "chatgpt-client"))).toBe(false);
  });

  it("ships at a generation above the pre-tracking era", () => {
    expect(MCP_CATALOG_GENERATION).toBeGreaterThan(1);
  });
});

describe("the current catalog snapshot", () => {
  it("matches what tools/list actually serves, for both variants", async () => {
    const snapshot = await currentCatalogSnapshot();
    expect(snapshot).not.toBeNull();

    const standardServed = ((await list("user-1", "c")).tools ??
      []) as ServedTool[];
    const adminServed = ((await list("admin-user", "c")).tools ??
      []) as ServedTool[];

    expect(snapshot!.standard.fingerprint).toBe(
      fingerprintCatalog(standardServed),
    );
    expect(snapshot!.admin.fingerprint).toBe(fingerprintCatalog(adminServed));
    expect(snapshot!.admin.toolCount).toBeGreaterThan(
      snapshot!.standard.toolCount,
    );
  });
});

/**
 * The one test that proves this reaches the wire.
 *
 * Everything above drives the SDK's request handlers directly, which is enough
 * to test the policy but not enough to prove the transport dispatches through
 * the wrappers at all — an SDK upgrade that routed `tools/call` past
 * `_requestHandlers` would leave every assertion above green and the feature
 * dead in production. So this block builds the real `createMcpHandler` +
 * `withMcpAuth` stack `/api/mcp` exports and sends genuine 2026-07-28 requests
 * through it.
 */
describe("over the real transport", () => {
  const ENDPOINT = "https://workout.test/api/mcp";
  const MODERN_PROTOCOL_VERSION = "2026-07-28";

  /**
   * The probe tool is registered for `tools/call` only. A `tools/list` must
   * serve the REAL catalog — otherwise the fingerprint recorded by the refresh
   * would include a tool production does not have, and step 3 below would read
   * stale forever for a reason that exists only in this file.
   */
  function authedHandler(userId: string, clientId: string, withProbe: boolean) {
    const base = createMcpHandler(
      (server) => {
        initializeMcpServer(server);
        if (withProbe) {
          server.registerTool(
            "__probe",
            { title: "probe", description: "test-only", inputSchema: {} },
            async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
          );
        }
      },
      {
        serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        cacheHints: { "tools/list": { ttlMs: 0, cacheScope: "private" } },
      },
    );
    return withMcpAuth(base, async () => auth(userId, clientId), {
      required: true,
    });
  }

  async function rpc(
    userId: string,
    clientId: string,
    method: string,
    params: Record<string, unknown> = {},
  ) {
    const res = await authedHandler(
      userId,
      clientId,
      method === "tools/call",
    )(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer test.jwt.token",
          "MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
          "Mcp-Method": method,
          ...(typeof params.name === "string"
            ? { "Mcp-Name": String(params.name) }
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
              [CLIENT_INFO_META_KEY]: { name: "chatgpt", version: "0" },
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        }),
      }),
    );
    const text = await res.text();
    const json =
      text.startsWith("event:") || text.startsWith("data:")
        ? JSON.parse(text.split("data: ")[1]?.split("\n")[0] ?? "{}")
        : JSON.parse(text || "{}");
    return json as {
      result?: { content?: { text?: string }[]; tools?: ServedTool[] };
    };
  }

  function noticed(body: {
    result?: { content?: { text?: string }[] };
  }): boolean {
    return (body.result?.content ?? []).some(
      (c) => c.text === CONNECTOR_UPDATE_NOTICE,
    );
  }

  it("warns a stale connection, and stops after it refreshes", async () => {
    // 1. a connection nobody has tracked calls a tool
    expect(
      noticed(
        await rpc("user-1", "chatgpt", "tools/call", {
          name: "__probe",
          arguments: {},
        }),
      ),
    ).toBe(true);
    // and it recorded who it was, off the request envelope
    expect(store.get("user-1|chatgpt")!.client_name).toBe("chatgpt");

    // 2. the user hits Refresh; ChatGPT re-lists over the same transport
    const listed = await rpc("user-1", "chatgpt", "tools/list");
    expect((listed.result?.tools ?? []).length).toBeGreaterThan(20);
    expect(store.get("user-1|chatgpt")!.catalog_fingerprint).toMatch(
      /^[0-9a-f]{64}$/,
    );

    // 3. the notice is gone
    expect(
      noticed(
        await rpc("user-1", "chatgpt", "tools/call", {
          name: "__probe",
          arguments: {},
        }),
      ),
    ).toBe(false);
  });
});

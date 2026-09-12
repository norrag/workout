import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import type {
  ListToolsRequest,
  ListToolsResult,
  ServerContext,
} from "@modelcontextprotocol/server";
import { reportError } from "@/lib/observability/report";
import {
  fingerprintCatalog,
  type CatalogSnapshot,
  type ServedTool,
} from "./catalog";
import { registerTools } from "./tools";
import { ADMIN_TOOL_NAMES } from "./tools/admin";
import {
  MCP_CATALOG_GENERATION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./version";

/**
 * N91 — what this build's `tools/list` would serve, fingerprinted.
 *
 * The recording side of freshness hashes the listing it just handed out, so it
 * needs nothing from here. The *checking* side does: a `tools/call` arrives with
 * no listing attached, so the server has to be able to say what the current
 * catalog is without one being requested.
 *
 * It does that by building a throwaway `McpServer`, registering the real tools
 * on it, and asking the SDK's own `tools/list` handler — the same path the
 * transport takes — so the hash compared against is the hash of what a client
 * would actually receive, not an approximation reconstructed from the registry.
 * `registerTools` is called directly rather than `initializeMcpServer` so the
 * visibility wrapper (which does a database read) is not in the way; the admin
 * filter is applied here with the same `ADMIN_TOOL_NAMES` set that wrapper uses.
 *
 * Memoized for the life of the process: the tool surface is compiled in, and
 * `createMcpHandler` already rebuilds the real server per request, so paying
 * this once per instance is the whole cost.
 */

type ListHandler = (
  request: ListToolsRequest,
  ctx: ServerContext,
) => Promise<ListToolsResult> | ListToolsResult;

let pending: Promise<CatalogSnapshot | null> | null = null;

/**
 * The current catalog, or `null` if it could not be determined.
 *
 * `null` is not an error path callers have to handle specially — it is the
 * fail-open signal `evaluateCatalogFreshness` turns into "say nothing". If an
 * SDK upgrade moves `_requestHandlers` out from under us, users see no notice
 * rather than a permanent one.
 */
export function currentCatalogSnapshot(): Promise<CatalogSnapshot | null> {
  if (!pending) pending = buildSnapshot();
  return pending;
}

/** Test seam: drop the memo so a suite can rebuild against changed inputs. */
export function resetCatalogSnapshotCache(): void {
  pending = null;
}

async function buildSnapshot(): Promise<CatalogSnapshot | null> {
  try {
    const server = new McpServer({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });
    registerTools(server);
    const handlers = (
      server.server as unknown as {
        _requestHandlers?: Map<string, ListHandler>;
      }
    )._requestHandlers;
    const list = handlers?.get("tools/list");
    if (!list) throw new Error("tools/list handler not registered");

    const result = await list(
      { method: "tools/list", params: {} } as ListToolsRequest,
      {} as ServerContext,
    );
    const admin = (result.tools ?? []) as ServedTool[];
    if (admin.length === 0) throw new Error("tools/list returned no tools");
    const standard = admin.filter((t) => !ADMIN_TOOL_NAMES.has(t.name));

    return {
      generation: MCP_CATALOG_GENERATION,
      admin: {
        fingerprint: fingerprintCatalog(admin),
        toolCount: admin.length,
      },
      standard: {
        fingerprint: fingerprintCatalog(standard),
        toolCount: standard.length,
      },
    };
  } catch (err) {
    // Fail open: no snapshot means no staleness conclusion, not a warning for
    // everybody. Reported so the silence is visible to us rather than to nobody.
    await reportError("mcp:catalog-snapshot", err, {});
    // don't cache the failure — the next request gets another attempt
    pending = null;
    return null;
  }
}

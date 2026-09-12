import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerTools } from "./tools";
import { registerResources } from "./resources";
import { scopeAdminToolVisibility } from "./visibility";
import { attachCatalogNotice } from "./catalog-notice";

// The connector's identity constants live in `version.ts` (N91) and its
// instructions in `instructions.ts`; both are re-exported here because they
// have always been imported from this module.
export {
  MCP_CATALOG_GENERATION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./version";
export { MCP_INSTRUCTIONS, MCP_MANUAL_INSTRUCTIONS } from "./instructions";

/** Register all tools + resources on a freshly-created server instance. */
export function initializeMcpServer(server: McpServer) {
  registerTools(server);
  registerResources(server);
  // PH33: admin tools are hidden from tools/list for non-admin sessions
  // (visibility only — call-time denial is the boundary, in tools/admin.ts).
  // N91: the same wrapper records the catalog this principal was served.
  scopeAdminToolVisibility(server);
  // N91: every tools/call result carries the stale-catalog notice when this
  // connection is holding an out-of-date snapshot. Wrapped here, at the one
  // dispatch point, rather than inside ~50 individual tool handlers.
  attachCatalogNotice(server);
}

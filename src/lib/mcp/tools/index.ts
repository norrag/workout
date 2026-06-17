import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetCurrentState } from "./get-current-state";
import { registerReadTools } from "./read";
import { registerCoachingTools } from "./coaching";
import { registerWriteTools } from "./write";
import { registerAdminTools } from "./admin";

/**
 * Register every MCP tool on the server. Tools are thin, zod-validated wrappers
 * over the existing `src/lib/queries/` layer and the pure engine; identity is
 * always resolved from the session, never an argument (hard rule #5).
 *
 * Slice 1 ships one read tool; slices 2–4 add the read/coaching, write/planning,
 * and admin/tuning surfaces (07 Phase 6).
 */
export function registerTools(server: McpServer) {
  registerGetCurrentState(server);
  registerReadTools(server);
  registerCoachingTools(server);
  registerWriteTools(server);
  registerAdminTools(server);
}

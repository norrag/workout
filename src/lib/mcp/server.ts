import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools";
import { registerResources } from "./resources";

export const MCP_SERVER_NAME = "workout";
export const MCP_SERVER_VERSION = "0.1.0";

/**
 * Server-level instructions teaching the model the WORKOUT domain (05
 * §Resources). Kept terse and grounded — the engine, not the model, owns every
 * prescribed number; the model proposes structure and reads progress.
 */
export const MCP_INSTRUCTIONS = `
WORKOUT is a periodized strength-training tracker. Use these tools to ground
coaching and planning in the user's real data — never invent numbers.

Cycle hierarchy (largest to smallest):
- Macrocycle: a multi-month goal arc (hypertrophy / strength / cut / maintain).
- Mesocycle: a 3–8 week block of training, usually ending in a deload week.
- Microcycle: one week within a mesocycle. Each week has a target RIR.
- Workout: one training day within a week, addressed as "week W, day D".

RIR = Reps In Reserve (how many reps short of failure a set stops). Lower RIR
means closer to failure. A mesocycle "ramps" RIR down over its weeks
(e.g. 3 → 0) to progressively intensify, then a deload week raises it again.

Units: weights are in the user's chosen unit (lb or kg). Always report weights
in the user's unit; do not convert silently.

Grounding: call get_current_state first to learn where the user is. Treats
estimates (e1RM, projected targets) as estimates. The progression engine — not
you — computes all prescribed loads, reps, and set counts; you surface and
interpret them. Identity is fixed to the signed-in user; no tool can address
another user's data.
`.trim();

/** Register all tools + resources on a freshly-created server instance. */
export function initializeMcpServer(server: McpServer) {
  registerTools(server);
  registerResources(server);
}

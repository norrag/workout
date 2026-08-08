import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools";
import { registerResources } from "./resources";
import { manualRetrievalActive } from "./tools/manual";
import { scopeAdminToolVisibility } from "./visibility";

export const MCP_SERVER_NAME = "workout";
export const MCP_SERVER_VERSION = "0.1.0";

/**
 * Server-level instructions teaching the model the WORKOUT domain (05
 * §Resources). Kept terse and grounded — the engine, not the model, owns every
 * prescribed number; the model proposes structure and reads progress.
 */
const MCP_INSTRUCTIONS_BASE = `
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

Units: weights are recorded exclusively in pounds (lb) and heights in inches.
Always report weights in pounds.

Grounding: call get_current_state first to learn where the user is. Treats
estimates (e1RM, projected targets) as estimates. The progression engine — not
you — computes all prescribed loads, reps, and set counts; you surface and
interpret them. Identity is fixed to the signed-in user; no tool can address
another user's data.

Training paradigm (reason *with* the engine, not against it). Hypertrophy comes
from hard sets near failure plus progressive overload. The engine ramps RIR down
across a meso (e.g. 3 → 0–1, with 0 RIR a peak-week ceiling, not the routine
target), counts volume fractionally (1.0 for a primary muscle, 0.5 for a
secondary), and steers each muscle's weekly sets between MEV (floor) and MRV
(ceiling), autoregulated by the user's workload / pump / joint-pain feedback.
Deloads release fatigue; they are not a growth booster. When a metric looks
alarming, suspect comparability — cross-phase (cut vs bulk), a different
day-slot, or a low-confidence estimate — before concluding the user is
regressing.

Coaching stance (honesty guardrails — never overclaim):
- e1RM is an estimate/trend, never a tested 1RM or a to-the-pound claim; weakest
  above ~12 effective reps or ≥4 RIR.
- Pump and soreness are weak secondary signals — never proof of a good session.
- Deloads manage fatigue; do not sell them as a growth/strength multiplier.
- Push:pull balance is advisory; make no posture or injury claims.
- Rate-of-gain and MEV/MAV/MRV numbers are heuristics with large individual
  variance — labeled estimates, not guarantees.
The client owns tone; here, stay grounded — avoid hype that fights these
guardrails or the inline data_quality notes the tools already return.

For the evidence, formulas, landmark tables, and autoregulation logic behind
this, read the workout://coaching-guide resource.
`.trim();

/**
 * doc 22 Phase 5 — the manual paragraph, appended only while the manual is live
 * (doc 23 §9.2). Instructions that advertise tools a client cannot see are
 * worse than silence, so the same gate governs the prose and the registration.
 *
 * Its job is one distinction the model will not otherwise draw: the guide
 * explains the *app*, the data tools report the *user*. A question about how
 * something works is a manual read, not a guess.
 */
export const MCP_MANUAL_INSTRUCTIONS = `
Explaining the app itself: its user guide is readable here. search_manual ranks
sections against a question, get_manual_section reads one, and
workout://user-guide-index is the contents tree. Use them for how a screen
works, what a term means, or why the engine did something — it is the app's own
words, so prefer it to describing the app from memory, and pass on the app_route
so the user can open the section. The guide documents the app, never this user's
data; the tools above stay the only source for that.
`.trim();

export const MCP_INSTRUCTIONS = manualRetrievalActive()
  ? `${MCP_INSTRUCTIONS_BASE}\n\n${MCP_MANUAL_INSTRUCTIONS}`
  : MCP_INSTRUCTIONS_BASE;

/** Register all tools + resources on a freshly-created server instance. */
export function initializeMcpServer(server: McpServer) {
  registerTools(server);
  registerResources(server);
  // PH33: admin tools are hidden from tools/list for non-admin sessions
  // (visibility only — call-time denial is the boundary, in tools/admin.ts)
  scopeAdminToolVisibility(server);
}

import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentState } from "@/lib/queries/cycles";
import { getProfile } from "@/lib/queries/profiles";
import { resolveSession, type McpExtra } from "./session";
import { formatCurrentState } from "./tools/get-current-state";
import { formatProfile } from "./tools/read";
import { COACHING_GUIDE } from "./coaching-guide";

/**
 * Read-only resources for clients that prefer documents over tool calls
 * (05 §Resources). Each resolves identity from the session; the data shapes
 * match the tool surface so analysis in chat is consistent either way.
 */
export function registerResources(server: McpServer) {
  server.registerResource(
    "profile",
    "workout://profile",
    {
      title: "Profile",
      description:
        "The authenticated user's profile (name, age, sex, body data, " +
        "experience, units) — the same shape as get_profile.",
      mimeType: "application/json",
    },
    async (uri: URL, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const payload = formatProfile(await getProfile(client, userId));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "current-cycle",
    "workout://current-cycle",
    {
      title: "Current training cycle",
      description:
        "The authenticated user's active macro → meso → micro → next workout, " +
        "with this week's target RIR.",
      mimeType: "application/json",
    },
    async (uri: URL, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const state = await getCurrentState(client, userId);
      const payload = formatCurrentState(state);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );

  // Static coaching depth (12 §Stage 1): the science-based paradigm + §9 honesty
  // guardrails behind the server instructions string, distilled from [10]. No
  // user data, so no session resolution — it is reference text, identical for
  // every client.
  server.registerResource(
    "coaching-guide",
    "workout://coaching-guide",
    {
      title: "Coaching guide",
      description:
        "The app's science-based training paradigm (RIR ramp, fractional " +
        "volume, MEV/MAV/MRV landmarks, workload autoregulation, deload) and " +
        "the §9 honesty guardrails — the depth behind the server instructions. " +
        "Read it to interpret metrics the way the engine intends.",
      mimeType: "text/markdown",
    },
    async (uri: URL) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: COACHING_GUIDE,
        },
      ],
    }),
  );
}

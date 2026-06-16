import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentState } from "@/lib/queries/cycles";
import { resolveSession, type McpExtra } from "./session";
import { formatCurrentState } from "./tools/get-current-state";

/**
 * Read-only resources for clients that prefer documents over tool calls
 * (05 §Resources). Each resolves identity from the session; the data shapes
 * match the tool surface so analysis in chat is consistent either way.
 */
export function registerResources(server: McpServer) {
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
}

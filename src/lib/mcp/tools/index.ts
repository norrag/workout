import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetCurrentState } from "./get-current-state";
import { registerReadTools } from "./read";
import { registerCoachingTools } from "./coaching";
import { registerWriteTools } from "./write";
import { registerAuthoringTools } from "./authoring";
import { registerAdminTools } from "./admin";
import { toolError } from "../envelope";
import { reportError } from "@/lib/observability/report";

type RegisterTool = McpServer["registerTool"];
type ToolHandler = Parameters<RegisterTool>[2];

/**
 * Wrap a server so every tool handler it registers is guarded: a thrown value
 * (e.g. a raw Supabase error object) is serialized into a structured
 * `{ error: { code, message, detail } }` result instead of the opaque
 * `[object Object]` the SDK would otherwise emit (MCP tooling review §5.6).
 * The wrapper is applied here, at the single composition root, so the pure
 * `register*` functions stay testable without it.
 */
function withErrorHandling(server: McpServer): McpServer {
  const register = server.registerTool.bind(server) as RegisterTool;
  const wrapped = ((name: string, config: unknown, handler: ToolHandler) => {
    const guardedHandler = (async (...args: unknown[]) => {
      try {
        return await (handler as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        // the structured result reaches the model; the server side previously
        // recorded nothing (R20) — report before enveloping
        await reportError("mcp:tool", err, { tool: name });
        return toolError(err);
      }
    }) as ToolHandler;
    return (register as (n: string, c: unknown, h: ToolHandler) => unknown)(
      name,
      config,
      guardedHandler,
    );
  }) as unknown as RegisterTool;
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === "registerTool") return wrapped;
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Register every MCP tool on the server. Tools are thin, zod-validated wrappers
 * over the existing `src/lib/queries/` layer and the pure engine; identity is
 * always resolved from the session, never an argument (hard rule #5).
 *
 * Slice 1 ships one read tool; slices 2–4 add the read/coaching, write/planning,
 * and admin/tuning surfaces (07 Phase 6).
 */
export function registerTools(server: McpServer) {
  const guarded = withErrorHandling(server);
  registerGetCurrentState(guarded);
  registerReadTools(guarded);
  registerCoachingTools(guarded);
  registerWriteTools(guarded);
  registerAuthoringTools(guarded);
  registerAdminTools(guarded);
}

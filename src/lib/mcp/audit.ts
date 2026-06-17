import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * MCP write audit (05 §Safeguards, hard rule #4). Every MCP write records a row
 * in `mcp_write_audit` — tool name, a hash of the args (not the raw args, which
 * may carry note text), and a short human summary. The table has no user insert
 * policy (writes are service-role only), so this is the one place the audit row
 * is written, always with the server-derived `userId` (never trusted input).
 */
export function hashArgs(args: unknown): string {
  return createHash("sha256").update(JSON.stringify(args ?? null)).digest("hex");
}

export async function recordMcpWrite(
  userId: string,
  tool: string,
  args: unknown,
  summary: string,
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("mcp_write_audit").insert({
    user_id: userId,
    tool,
    args_hash: hashArgs(args),
    summary,
  });
  if (error) throw error;
}

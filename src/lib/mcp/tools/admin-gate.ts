import "server-only";
import { getProfile } from "@/lib/queries/profiles";
import { resolveSession, type McpExtra, type McpClient } from "../session";

/**
 * The admin call-time gate, shared by every role-gated tool module (admin.ts,
 * admin-llm.ts) — kept in its own file so the modules don't import each other
 * (the tool-name roster in admin.ts imports admin-llm's names; a back-import
 * of the gate would make that cycle evaluation-order-sensitive).
 */

/** Fetch the session and assert the caller is an admin (else deny). */
export async function resolveAdmin(
  extra: McpExtra,
): Promise<{ client: McpClient; userId: string }> {
  const { client, userId } = resolveSession(extra);
  const profile = await getProfile(client, userId);
  if (!profile || profile.role !== "admin") {
    throw new Error("this tool requires an admin session");
  }
  return { client, userId };
}

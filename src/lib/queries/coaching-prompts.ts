import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { COACHING_PROMPT_VERSION } from "@/lib/llm/coaching";

type Client = SupabaseClient<Database>;

/**
 * doc 19 / N60 follow-up — the coaching-prompt admin data layer. Backs the
 * role-gated MCP tools (get/propose/activate/discard) and the generation
 * resolver. Mirrors engine-admin.ts: `coaching_prompts` RLS already gates
 * writes to `is_admin()`, so an admin's own token-bound client suffices for
 * the tools; the generation resolver reads via the service client (RLS-
 * bypassing) at write sites that hold only the service role.
 *
 * The code constant COACHING_SYSTEM_PROMPT stays the permanent fallback: none
 * of this is on the critical path until an admin activates a DB prompt.
 */

export interface CoachingPromptVersion {
  version: number;
  is_active: boolean;
  notes: string | null;
  /** convenience for the list view — the body isn't returned in the roster */
  char_count: number;
  created_at: string;
  updated_at: string;
}

export interface CoachingPromptDetail extends CoachingPromptVersion {
  body: string;
}

/** One INACTIVE draft can never be activated by accident; the active row is a
 *  single-row partial-unique invariant enforced in the DB. */
export interface ActiveCoachingPrompt {
  version: number;
  body: string;
}

/** The active DB prompt, or null when the table is empty (⇒ the caller uses
 *  the code fallback). Never throws on "no active row"; throws only on a real
 *  query error the caller decides how to absorb. */
export async function getActiveCoachingPrompt(
  client: Client,
): Promise<ActiveCoachingPrompt | null> {
  const { data, error } = await client
    .from("coaching_prompts")
    .select("version, body")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  // maybeSingle yields an object or null; guard defensively so a truthy-but-
  // shapeless value can never masquerade as an active prompt (⇒ code fallback)
  if (!data || typeof data.version !== "number" || typeof data.body !== "string") {
    return null;
  }
  return { version: data.version, body: data.body };
}

export async function listCoachingPrompts(client: Client): Promise<CoachingPromptVersion[]> {
  const { data, error } = await client
    .from("coaching_prompts")
    .select("version, is_active, notes, body, created_at, updated_at")
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    version: r.version,
    is_active: r.is_active,
    notes: r.notes,
    char_count: r.body.length,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function getCoachingPromptVersion(
  client: Client,
  version: number,
): Promise<CoachingPromptDetail | null> {
  const { data, error } = await client
    .from("coaching_prompts")
    .select("version, is_active, notes, body, created_at, updated_at")
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    version: data.version,
    is_active: data.is_active,
    notes: data.notes,
    char_count: data.body.length,
    created_at: data.created_at,
    updated_at: data.updated_at,
    body: data.body,
  };
}

/**
 * Compute the next version for a proposed prompt: one above the highest
 * existing version, but never below `COACHING_PROMPT_VERSION + 1`. Flooring at
 * the code fallback version + 1 guarantees every DB prompt clears the doc-19
 * serving cut (`prompt_version >= COACHING_SERVED_MIN_PROMPT_VERSION`), so the
 * first DB prompt is version 4, not 1 (which would silently never serve).
 * Exported for unit testing the floor logic. */
export function nextCoachingPromptVersion(topVersion: number | null): number {
  return Math.max(topVersion ?? 0, COACHING_PROMPT_VERSION) + 1;
}

/** Write a new INACTIVE prompt version (floored next version). A draft is
 *  never active on write — activate it separately after a preview. */
export async function proposeCoachingPrompt(
  client: Client,
  body: string,
  notes: string | null,
): Promise<number> {
  const { data: top, error: topError } = await client
    .from("coaching_prompts")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (topError) throw topError;
  const nextVersion = nextCoachingPromptVersion(top?.version ?? null);

  const { error } = await client.from("coaching_prompts").insert({
    version: nextVersion,
    body,
    is_active: false,
    notes,
  });
  if (error) throw error;
  return nextVersion;
}

/**
 * Activate a version via the atomic RPC (single-transaction deactivate +
 * activate — the two-round-trip swap could leave zero active rows). A no-op
 * when the version is already active.
 */
export async function activateCoachingPrompt(
  client: Client,
  version: number,
): Promise<void> {
  const { data: target, error: findError } = await client
    .from("coaching_prompts")
    .select("version, is_active")
    .eq("version", version)
    .maybeSingle();
  if (findError) throw findError;
  if (!target) throw new Error(`coaching_prompts version ${version} does not exist`);
  if (target.is_active) return;

  const { error } = await client.rpc("activate_coaching_prompt", { p_version: version });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// discard an inactive prompt version (MCP undo for propose_coaching_prompt).
// Guarded exactly like engine_params: the ACTIVE version can never be deleted,
// and a version referenced by any stored decision_explanation is preserved so
// historical explanations keep a resolvable prompt provenance.
// ---------------------------------------------------------------------------

export interface CoachingPromptDeletionImpact {
  found: boolean;
  isActive: boolean;
  explanationRefs: number;
  deletable: boolean;
}

export async function getCoachingPromptDeletionImpact(
  client: Client,
  version: number,
): Promise<CoachingPromptDeletionImpact> {
  const { data: row, error } = await client
    .from("coaching_prompts")
    .select("version, is_active")
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  if (!row) return { found: false, isActive: false, explanationRefs: 0, deletable: false };

  const { count, error: refError } = await client
    .from("decision_explanations")
    .select("decision_id", { count: "exact", head: true })
    .eq("prompt_version", version);
  if (refError) throw refError;
  const explanationRefs = count ?? 0;
  return {
    found: true,
    isActive: row.is_active,
    explanationRefs,
    deletable: !row.is_active && explanationRefs === 0,
  };
}

export async function deleteCoachingPromptVersion(
  client: Client,
  version: number,
): Promise<void> {
  const { error } = await client
    .from("coaching_prompts")
    .delete()
    .eq("version", version)
    .eq("is_active", false);
  if (error) throw error;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MesocycleRow } from "@/lib/types/database";

/**
 * doc 17 §4.1 — macrocycle close transitions (N40). The macro closeout mirrors
 * the workout → mesocycle closeout family one level up: a macro closes
 * NATURALLY when its last real (positioned, non-placeholder) meso reaches a
 * terminal state, or EXPLICITLY via `endMacrocycle` (logging.ts), which drives
 * every open meso terminal first. Logged history is never touched (hard rule
 * 5); no schema change — `macrocycles.status` already admits `completed`.
 *
 * A LEAF module (imports only DB types): both the week-advance path
 * (`queries/progression.ts`) and the meso closeout (`queries/logging.ts`)
 * consume the natural-close cascade, and those two cannot import each other.
 */

type Client = SupabaseClient<Database>;

type MesoStatus = MesocycleRow["status"];

/** Statuses that hold (or could hold) open work — they block a natural close. */
const OPEN_STATUSES: ReadonlySet<MesoStatus> = new Set([
  "draft",
  "planned",
  "active",
]);

/** Terminal meso statuses — finished one way or the other. */
const TERMINAL_STATUSES: ReadonlySet<MesoStatus> = new Set([
  "completed",
  "abandoned",
]);

export function isTerminalMesoStatus(status: MesoStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** A terminal macro is frozen: goals edits, placement, and slot management are
 *  refused (§4.1). Only `active` macros accept structural writes. */
export function isTerminalMacroStatus(status: string): boolean {
  return status !== "active";
}

/**
 * Pure: does a macro close naturally given its mesos' statuses? Every
 * positioned real block must be terminal (`completed`/`abandoned`); unbuilt
 * `unplanned` placeholders don't count as open work (they're recorded by the
 * retrospective as "not built"). At least one real block must exist — a macro
 * of nothing but placeholders never closes itself.
 */
export function macroClosesNaturally(
  siblings: Pick<MesocycleRow, "status">[],
): boolean {
  return (
    siblings.some((m) => TERMINAL_STATUSES.has(m.status)) &&
    !siblings.some((m) => OPEN_STATUSES.has(m.status))
  );
}

/**
 * Natural-close cascade: called wherever a meso reaches a terminal state
 * (final-week advance, `endMesocycle`). If the meso belongs to a macro and
 * every sibling real block is now terminal, the macro goes `completed`.
 * Returns whether the macro was closed. Guarded to `active` so an archived
 * macro is never resurrected and the update is idempotent.
 */
export async function maybeCompleteMacroAfterMeso(
  supabase: Client,
  userId: string,
  macrocycleId: string | null,
): Promise<boolean> {
  if (!macrocycleId) return false;
  const { data: siblings, error } = await supabase
    .from("mesocycles")
    .select("status")
    .eq("macrocycle_id", macrocycleId)
    .eq("user_id", userId);
  if (error) throw error;
  if (!macroClosesNaturally(siblings ?? [])) return false;
  const { error: updError } = await supabase
    .from("macrocycles")
    .update({ status: "completed" })
    .eq("id", macrocycleId)
    .eq("user_id", userId)
    .eq("status", "active");
  if (updError) throw updError;
  return true;
}

/** How `endMacrocycle` resolves one meso (§4.1 explicit close). */
export interface EndMacroPlan {
  /** open mesos with logged work → `endMesocycle` (skip open, `completed`) */
  endIds: string[];
  /** open mesos never started (and placeholders) → `abandoned` */
  abandonIds: string[];
}

/**
 * Pure: decide the explicit-close action for every meso on the macro, in the
 * given (position) order. Any logged work ⇒ close via the meso path
 * (`completed`); never started ⇒ `abandoned`; already-terminal blocks are
 * untouched.
 */
export function planEndMacrocycle(
  mesos: { id: string; status: MesoStatus; hasLogged: boolean }[],
): EndMacroPlan {
  const endIds: string[] = [];
  const abandonIds: string[] = [];
  for (const m of mesos) {
    if (TERMINAL_STATUSES.has(m.status)) continue;
    if (m.hasLogged) endIds.push(m.id);
    else abandonIds.push(m.id);
  }
  return { endIds, abandonIds };
}

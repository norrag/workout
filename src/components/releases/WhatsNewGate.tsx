import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { CURRENT_VERSION, RELEASES } from "@/content/releases";
import { versionGate } from "@/lib/version";
import {
  getActiveWorkoutStatus,
  getLastSeenVersion,
} from "@/lib/queries/releases";
import { PrimeVersion } from "./PrimeVersion";
import { WhatsNewSheet } from "./WhatsNewSheet";

/**
 * doc 23 §6.3 — the gate, resolved on the **server**.
 *
 * T2 is the whole reason this is not a client fetch: `CURRENT_VERSION` is
 * compiled into the bundle, so a tab running yesterday's JS would compare
 * against yesterday's constant. Deciding here means the value is always the
 * deployed truth.
 *
 * Cost: one PK-keyed single-column read per app navigation. The second read
 * (the active workout's status, for §6.4's suppression) happens only when
 * there is actually something to show, which is a handful of navigations per
 * release. If the first read ever proves measurable against the WS-J budget,
 * §6.3's fallback is to fold it into the tab-root pages — not to move it to
 * the client, which would reintroduce T2.
 */
export async function WhatsNewGate({
  supabase,
  userId,
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const profile = await getLastSeenVersion(supabase, userId);
  // no profile row yet (the signup trigger has not landed): nothing to prime
  // against, and the next navigation will find it
  if (!profile) return null;

  const gate = versionGate(profile.lastSeenVersion, RELEASES, CURRENT_VERSION);
  if (gate.kind === "none") return null;
  if (gate.kind === "prime") return <PrimeVersion />;

  const workoutStatus = await getActiveWorkoutStatus(supabase, userId);
  return (
    <WhatsNewSheet releases={gate.releases} workoutStatus={workoutStatus} />
  );
}

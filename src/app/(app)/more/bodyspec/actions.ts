"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { syncBodySpec } from "@/lib/bodyspec/sync";
import { disconnectBodySpec } from "@/lib/queries/external-connections";
import {
  deleteAllBodyScans,
  getBodyScan,
  resolveScanProposal,
} from "@/lib/queries/body-scans";
import { scanProfileProposal } from "@/lib/queries/body-comp";
import { getProfile, updateProfile } from "@/lib/queries/profiles";
import { appendBodyweightPoint } from "@/lib/queries/bodyweight";

/** On-demand pull (doc 15 §2.3 — no polling; scans arrive a few times a
 *  year). Outcome is stamped on the connection row; the screen re-reads it. */
export async function syncBodySpecAction(): Promise<{
  error: string | null;
  imported: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const outcome = await syncBodySpec(supabase, user.id);
  revalidatePath("/more/bodyspec");
  revalidatePath("/more");
  return { error: outcome.error, imported: outcome.imported };
}

const disconnectSchema = z.object({ purgeScans: z.boolean() });

/**
 * Disconnect (doc 15 §2.3): tokens are always destroyed (best-effort
 * provider-side revocation, then the deny-all secrets row cascades with the
 * connection row); imported scans are purged only when the user asked —
 * third-party health data is theirs to remove. Logged training history is
 * never touched.
 */
export async function disconnectBodySpecAction(input: {
  purgeScans: boolean;
}): Promise<{ error: string | null }> {
  const parsed = disconnectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await disconnectBodySpec(supabase, user.id);
  if (parsed.data.purgeScans) await deleteAllBodyScans(supabase, user.id);
  revalidatePath("/more/bodyspec");
  revalidatePath("/more");
  return { error: null };
}

const scanIdSchema = z.object({ scan_id: z.string().uuid() });

/**
 * Accept the profile-update proposal (doc 15 §2.3, 5b): write the scan's
 * measured values to the profile, append the scan-day point to the
 * bodyweight series (`source: 'dexa'` — the Phase-4 log's third writer), and
 * resolve the proposal. The proposal is recomputed server-side so a stale
 * card can never apply values the pure rule wouldn't propose.
 */
export async function applyScanToProfileAction(input: {
  scan_id: string;
}): Promise<{ error: string | null }> {
  const parsed = scanIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [scan, profile] = await Promise.all([
    getBodyScan(supabase, user.id, parsed.data.scan_id),
    getProfile(supabase, user.id),
  ]);
  if (!scan || !profile) return { error: "Scan not found." };
  const proposal = scanProfileProposal(scan, profile);
  if (!proposal) return { error: "Nothing to apply." };

  await updateProfile(supabase, user.id, {
    ...(proposal.weightLb != null
      ? {
          bodyweight: proposal.weightLb,
          bodyweight_updated_at: new Date().toISOString(),
        }
      : {}),
    ...(proposal.bodyFatPct != null
      ? { body_fat_pct: proposal.bodyFatPct }
      : {}),
  });
  if (proposal.weightLb != null)
    // the point is FOR the scan's day (UTC day of the scan instant — the
    // closest day we can state without the facility's timezone), not today
    await appendBodyweightPoint(supabase, user.id, {
      measuredOn: new Date(scan.scanned_at).toISOString().slice(0, 10),
      weight: proposal.weightLb,
      source: "dexa",
    });
  await resolveScanProposal(supabase, user.id, scan.id, "applied");

  revalidatePath("/more/bodyspec");
  revalidatePath("/more");
  revalidatePath("/more/profile");
  return { error: null };
}

/** Decline the proposal — keep the current profile values. Recorded per scan
 *  so the card never re-renders for it. */
export async function dismissScanProposalAction(input: {
  scan_id: string;
}): Promise<{ error: string | null }> {
  const parsed = scanIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await resolveScanProposal(supabase, user.id, parsed.data.scan_id, "dismissed");
  revalidatePath("/more/bodyspec");
  return { error: null };
}

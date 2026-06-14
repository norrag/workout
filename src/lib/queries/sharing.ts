import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export type ShareObjectType = "exercise" | "template" | "mesocycle";

// no 0/O/1/I — codes get typed from a phone in a gym
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function formatShareCode(bytes: Uint8Array): string {
  return [...bytes]
    .slice(0, 8)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");
}

export function newShareCode(): string {
  return formatShareCode(randomBytes(8));
}

/**
 * Mint (or re-surface) a share code for an object the user owns. One open
 * code per object — sharing twice hands out the same code until it's used.
 */
export async function createShareCode(
  supabase: Client,
  userId: string,
  objectType: ShareObjectType,
  objectId: string,
): Promise<{ code: string | null; error: string | null }> {
  const table =
    objectType === "exercise"
      ? "exercises"
      : objectType === "template"
        ? "templates"
        : "mesocycles";
  const { data: owned, error: ownError } = await supabase
    .from(table)
    .select("id, user_id")
    .eq("id", objectId)
    .maybeSingle();
  if (ownError) throw ownError;
  if (!owned || owned.user_id !== userId)
    return { code: null, error: "Only your own items can be shared." };

  const { data: existing, error: existingError } = await supabase
    .from("shares")
    .select("*")
    .eq("owner_id", userId)
    .eq("object_type", objectType)
    .eq("object_id", objectId)
    .is("accepted_at", null)
    .not("share_code", "is", null)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.share_code) return { code: existing.share_code, error: null };

  const code = newShareCode();
  const { error: insertError } = await supabase.from("shares").insert({
    owner_id: userId,
    grantee_id: null,
    object_type: objectType,
    object_id: objectId,
    share_code: code,
    expires_at: null,
    accepted_at: null,
  });
  if (insertError) throw insertError;
  return { code, error: null };
}

export interface AcceptResult {
  objectType: ShareObjectType | null;
  objectId: string | null;
  name: string | null;
  error: string | null;
}

/**
 * Redeem a share code: copy-on-accept with provenance IDs and dedupe — no
 * cross-user FKs (07 risks). Runs on the service client because the grantee
 * can't read the owner's rows; every write is explicitly scoped to the
 * redeeming user.
 */
export async function acceptShareCode(
  service: Client,
  granteeId: string,
  rawCode: string,
): Promise<AcceptResult> {
  const code = rawCode.trim().toUpperCase();
  const fail = (error: string): AcceptResult => ({
    objectType: null,
    objectId: null,
    name: null,
    error,
  });
  if (!/^[A-Z2-9]{8}$/.test(code)) return fail("That doesn't look like a code.");

  const { data: share, error: shareError } = await service
    .from("shares")
    .select("*")
    .eq("share_code", code)
    .maybeSingle();
  if (shareError) throw shareError;
  if (!share) return fail("Code not found.");
  if (share.owner_id === granteeId) return fail("That's your own share code.");
  if (share.accepted_at && share.grantee_id !== granteeId)
    return fail("Code already used.");
  if (share.expires_at && share.expires_at < new Date().toISOString())
    return fail("Code expired.");

  let objectId: string;
  let name: string;
  if (share.object_type === "exercise") {
    const copied = await copyExercise(service, granteeId, share.object_id);
    if (!copied) return fail("The shared exercise no longer exists.");
    objectId = copied.id;
    name = copied.name;
  } else if (share.object_type === "template") {
    const copied = await copyTemplate(service, granteeId, share.object_id);
    if (!copied) return fail("The shared template no longer exists.");
    objectId = copied.id;
    name = copied.name;
  } else {
    const copied = await copyMesocycle(service, granteeId, share.object_id);
    if (!copied) return fail("The shared mesocycle no longer exists.");
    objectId = copied.id;
    name = copied.name;
  }

  const { error: acceptError } = await service
    .from("shares")
    .update({ grantee_id: granteeId, accepted_at: new Date().toISOString() })
    .eq("id", share.id);
  if (acceptError) throw acceptError;

  return { objectType: share.object_type, objectId, name, error: null };
}

/**
 * Stock exercises pass through untouched; custom exercises copy once per
 * grantee (dedupe on `source_exercise_id`).
 */
async function copyExercise(
  service: Client,
  granteeId: string,
  exerciseId: string,
): Promise<{ id: string; name: string } | null> {
  const { data: source, error } = await service
    .from("exercises")
    .select("*")
    .eq("id", exerciseId)
    .maybeSingle();
  if (error) throw error;
  if (!source) return null;
  if (source.user_id === null || source.user_id === granteeId) return source;

  const { data: existing, error: dedupeError } = await service
    .from("exercises")
    .select("id, name")
    .eq("user_id", granteeId)
    .eq("source_exercise_id", source.id)
    .limit(1)
    .maybeSingle();
  if (dedupeError) throw dedupeError;
  if (existing) return existing;

  const { data: copy, error: copyError } = await service
    .from("exercises")
    .insert({
      user_id: granteeId,
      name: source.name,
      equipment_type: source.equipment_type,
      description: source.description,
      notes: source.notes,
      video_url: source.video_url,
      source_exercise_id: source.id,
    })
    .select()
    .single();
  if (copyError) throw copyError;

  const { data: links, error: linkError } = await service
    .from("exercise_muscle_groups")
    .select("*")
    .eq("exercise_id", source.id);
  if (linkError) throw linkError;
  if ((links ?? []).length > 0) {
    const { error: insertError } = await service
      .from("exercise_muscle_groups")
      .insert(
        (links ?? []).map((l) => ({
          exercise_id: copy.id,
          muscle_group_id: l.muscle_group_id,
          role: l.role,
        })),
      );
    if (insertError) throw insertError;
  }
  return copy;
}

async function copyTemplate(
  service: Client,
  granteeId: string,
  templateId: string,
): Promise<{ id: string; name: string } | null> {
  const { data: source, error } = await service
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw error;
  if (!source) return null;

  const { data: existing, error: dedupeError } = await service
    .from("templates")
    .select("id, name")
    .eq("user_id", granteeId)
    .eq("source_template_id", source.id)
    .limit(1)
    .maybeSingle();
  if (dedupeError) throw dedupeError;
  if (existing) return existing;

  const { data: copy, error: copyError } = await service
    .from("templates")
    .insert({
      user_id: granteeId,
      name: source.name,
      emphasis: source.emphasis,
      intended_gender: source.intended_gender,
      days_per_week: source.days_per_week,
      description: source.description,
      source_template_id: source.id,
    })
    .select()
    .single();
  if (copyError) throw copyError;

  const { data: days, error: dayError } = await service
    .from("template_days")
    .select("*")
    .eq("template_id", source.id)
    .order("day_number");
  if (dayError) throw dayError;

  for (const day of days ?? []) {
    const { data: dayCopy, error: dayCopyError } = await service
      .from("template_days")
      .insert({
        template_id: copy.id,
        day_number: day.day_number,
        label: day.label,
      })
      .select()
      .single();
    if (dayCopyError) throw dayCopyError;

    const [
      { data: groups, error: groupError },
      { data: fills, error: fillError },
    ] = await Promise.all([
      service
        .from("template_day_groups")
        .select("*")
        .eq("template_day_id", day.id)
        .order("position"),
      service
        .from("template_exercises")
        .select("*")
        .eq("template_day_id", day.id)
        .order("position"),
    ]);
    if (groupError) throw groupError;
    if (fillError) throw fillError;

    const groupIdMap = new Map<string, string>();
    for (const group of groups ?? []) {
      const { data: groupCopy, error: groupCopyError } = await service
        .from("template_day_groups")
        .insert({
          template_day_id: dayCopy.id,
          muscle_group_id: group.muscle_group_id,
          position: group.position,
          exercise_slots: group.exercise_slots,
        })
        .select()
        .single();
      if (groupCopyError) throw groupCopyError;
      groupIdMap.set(group.id, groupCopy.id);
    }

    for (const fill of fills ?? []) {
      const exercise = await copyExercise(service, granteeId, fill.exercise_id);
      if (!exercise) continue;
      const { error: fillCopyError } = await service
        .from("template_exercises")
        .insert({
          template_day_id: dayCopy.id,
          template_day_group_id: fill.template_day_group_id
            ? (groupIdMap.get(fill.template_day_group_id) ?? null)
            : null,
          slot_number: fill.slot_number,
          exercise_id: exercise.id,
          position: fill.position,
          default_sets: fill.default_sets,
          default_rep_range: fill.default_rep_range,
        });
      if (fillCopyError) throw fillCopyError;
    }
  }
  return copy;
}

/**
 * A shared meso copies as a *planned, standalone* meso: the structure
 * (days, groups, slot fills) carries over; the owner's loads don't — the
 * engine seeds the grantee's numbers at start.
 */
async function copyMesocycle(
  service: Client,
  granteeId: string,
  mesoId: string,
): Promise<{ id: string; name: string } | null> {
  const { data: source, error } = await service
    .from("mesocycles")
    .select("*")
    .eq("id", mesoId)
    .maybeSingle();
  if (error) throw error;
  if (!source) return null;

  const { data: copy, error: copyError } = await service
    .from("mesocycles")
    .insert({
      user_id: granteeId,
      macrocycle_id: null,
      position: null,
      phase: null,
      name: source.name,
      weeks: source.weeks,
      days_per_week: source.days_per_week,
      includes_deload: source.includes_deload,
      rir_start: source.rir_start,
      rir_end: source.rir_end,
      status: "planned",
      template_id: null,
      start_date: null,
    })
    .select()
    .single();
  if (copyError) throw copyError;

  const { data: days, error: dayError } = await service
    .from("meso_days")
    .select("*")
    .eq("mesocycle_id", source.id)
    .order("day_number");
  if (dayError) throw dayError;

  for (const day of days ?? []) {
    const { data: dayCopy, error: dayCopyError } = await service
      .from("meso_days")
      .insert({
        mesocycle_id: copy.id,
        user_id: granteeId,
        day_number: day.day_number,
        label: day.label,
        weekday: day.weekday,
      })
      .select()
      .single();
    if (dayCopyError) throw dayCopyError;

    const { data: groups, error: groupError } = await service
      .from("meso_day_groups")
      .select("*")
      .eq("meso_day_id", day.id)
      .order("position");
    if (groupError) throw groupError;

    for (const group of groups ?? []) {
      const { data: groupCopy, error: groupCopyError } = await service
        .from("meso_day_groups")
        .insert({
          meso_day_id: dayCopy.id,
          muscle_group_id: group.muscle_group_id,
          position: group.position,
          exercise_slots: group.exercise_slots,
        })
        .select()
        .single();
      if (groupCopyError) throw groupCopyError;

      const { data: fills, error: fillError } = await service
        .from("meso_exercises")
        .select("*")
        .eq("meso_day_group_id", group.id)
        .order("slot_number");
      if (fillError) throw fillError;

      for (const fill of fills ?? []) {
        const exercise = await copyExercise(service, granteeId, fill.exercise_id);
        if (!exercise) continue;
        const { error: fillCopyError } = await service
          .from("meso_exercises")
          .insert({
            mesocycle_id: copy.id,
            day_of_week: null,
            meso_day_group_id: groupCopy.id,
            slot_number: fill.slot_number,
            position: fill.position,
            exercise_id: exercise.id,
            initial_weight: null,
            initial_reps: null,
            initial_sets: fill.initial_sets,
          });
        if (fillCopyError) throw fillCopyError;
      }
    }
  }
  return copy;
}

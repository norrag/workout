import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export type ShareObjectType = "exercise" | "template" | "mesocycle";

// ---------------------------------------------------------------------------
// N65 — the share snapshot. A code has to hand over the mesocycle as it stood
// when it was shared: the redemption used to read the owner's LIVE plan, so any
// edit the owner made afterwards (or a plan the owner had since rebuilt) is
// what the grantee actually received. `createShareCode` now captures the
// structure server-side into `shares.payload`, and the redemption copies from
// that snapshot. Codes minted before this shipped carry no payload and fall
// back to the live read, so nothing outstanding breaks.
//
// Exercise references stay ids: they are resolved (and ownership-asserted, R1)
// live at redemption, so a snapshot can never widen what a copy may touch.
// ---------------------------------------------------------------------------

const mesoSnapshotSchema = z.object({
  version: z.literal(1),
  type: z.literal("mesocycle"),
  meso: z.object({
    name: z.string(),
    weeks: z.number().int(),
    days_per_week: z.number().int(),
    includes_deload: z.boolean(),
    rir_start: z.number().int(),
    rir_end: z.number().int(),
    rir_schedule: z.array(z.number().int()).nullable(),
  }),
  days: z.array(
    z.object({
      day_number: z.number().int(),
      label: z.string().nullable(),
      weekday: z.number().int().nullable(),
      groups: z.array(
        z.object({
          muscle_group_id: z.string().uuid(),
          position: z.number().int(),
          exercise_slots: z.number().int(),
          fills: z.array(
            z.object({
              slot_number: z.number().int().nullable(),
              position: z.number().int(),
              exercise_id: z.string().uuid(),
              initial_sets: z.number().int(),
            }),
          ),
        }),
      ),
    }),
  ),
});

export type MesoShareSnapshot = z.infer<typeof mesoSnapshotSchema>;

/** Parse a stored `shares.payload` as a mesocycle snapshot; null when absent or
 *  not the shape this version writes (⇒ the live-read fallback). */
export function parseMesoSnapshot(payload: unknown): MesoShareSnapshot | null {
  const parsed = mesoSnapshotSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/**
 * Build the snapshot for a mesocycle the caller owns, from the planner board —
 * the same tables the cycles view renders, so what is captured is exactly what
 * the owner sees. Reads run on the owner's client (RLS-scoped); returns null
 * when the meso isn't readable, which leaves the code on the live-read path.
 */
export async function buildMesoSnapshot(
  supabase: Client,
  mesoId: string,
): Promise<MesoShareSnapshot | null> {
  const { data: meso, error: mesoError } = await supabase
    .from("mesocycles")
    .select(
      "id, name, weeks, days_per_week, includes_deload, rir_start, rir_end, rir_schedule",
    )
    .eq("id", mesoId)
    .maybeSingle();
  if (mesoError) throw mesoError;
  if (!meso) return null;

  const { data: days, error: dayError } = await supabase
    .from("meso_days")
    .select("id, day_number, label, weekday")
    .eq("mesocycle_id", mesoId)
    .order("day_number");
  if (dayError) throw dayError;

  const dayIds = (days ?? []).map((d) => d.id);
  let groups: {
    id: string;
    meso_day_id: string;
    muscle_group_id: string;
    position: number;
    exercise_slots: number;
  }[] = [];
  if (dayIds.length > 0) {
    const { data, error } = await supabase
      .from("meso_day_groups")
      .select("id, meso_day_id, muscle_group_id, position, exercise_slots")
      .in("meso_day_id", dayIds)
      .order("position");
    if (error) throw error;
    groups = data ?? [];
  }

  const { data: fills, error: fillError } = await supabase
    .from("meso_exercises")
    .select("meso_day_group_id, slot_number, position, exercise_id, initial_sets")
    .eq("mesocycle_id", mesoId)
    .order("position")
    .order("slot_number");
  if (fillError) throw fillError;

  return {
    version: 1,
    type: "mesocycle",
    meso: {
      name: meso.name,
      weeks: meso.weeks,
      days_per_week: meso.days_per_week,
      includes_deload: meso.includes_deload,
      rir_start: meso.rir_start,
      rir_end: meso.rir_end,
      rir_schedule: meso.rir_schedule,
    },
    days: (days ?? []).map((day) => ({
      day_number: day.day_number,
      label: day.label,
      weekday: day.weekday,
      groups: groups
        .filter((g) => g.meso_day_id === day.id)
        .map((g) => ({
          muscle_group_id: g.muscle_group_id,
          position: g.position,
          exercise_slots: g.exercise_slots,
          fills: (fills ?? [])
            .filter((f) => f.meso_day_group_id === g.id)
            .map((f) => ({
              slot_number: f.slot_number,
              position: f.position,
              exercise_id: f.exercise_id,
              initial_sets: f.initial_sets,
            })),
        })),
    })),
  };
}

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
 *
 * N65: minting also captures the object's structure into `shares.payload`, so
 * the grantee receives what was on screen when the code was handed over.
 * Re-surfacing an open code **refreshes** that snapshot: "edit, then share
 * again" is the owner saying share *this* — the code stays the same, what it
 * carries is brought up to date.
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

  // built from the owner's own rows (never from caller input), so the snapshot
  // can only ever describe something they already own
  const payload =
    objectType === "mesocycle"
      ? await buildMesoSnapshot(supabase, objectId)
      : null;

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
  if (existing?.share_code) {
    if (payload) {
      const { error: refreshError } = await supabase
        .from("shares")
        .update({ payload })
        .eq("id", existing.id)
        .eq("owner_id", userId);
      if (refreshError) throw refreshError;
    }
    return { code: existing.share_code, error: null };
  }

  const code = newShareCode();
  const { error: insertError } = await supabase.from("shares").insert({
    owner_id: userId,
    grantee_id: null,
    object_type: objectType,
    object_id: objectId,
    share_code: code,
    expires_at: null,
    accepted_at: null,
    payload,
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
 *
 * R1: because the copy bypasses RLS, every copied object is asserted to belong
 * to `share.owner_id` (stock exercises excepted) — a share row whose
 * `object_id` was re-pointed at a third user's row copies nothing.
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
    const copied = await copyExercise(
      service,
      granteeId,
      share.owner_id,
      share.object_id,
    );
    if (!copied) return fail("The shared exercise no longer exists.");
    objectId = copied.id;
    name = copied.name;
  } else if (share.object_type === "template") {
    const copied = await copyTemplate(
      service,
      granteeId,
      share.owner_id,
      share.object_id,
    );
    if (!copied) return fail("The shared template no longer exists.");
    objectId = copied.id;
    name = copied.name;
  } else {
    const copied = await copyMesocycle(
      service,
      granteeId,
      share.owner_id,
      share.object_id,
      parseMesoSnapshot(share.payload),
    );
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
 * grantee (dedupe on `source_exercise_id`). Custom exercises copy only when
 * the sharing owner actually owns them (R1) — this also covers fills inside a
 * shared template/meso, which may only reference stock or the owner's own.
 */
async function copyExercise(
  service: Client,
  granteeId: string,
  ownerId: string,
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
  if (source.user_id !== ownerId) return null;

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
  ownerId: string,
  templateId: string,
): Promise<{ id: string; name: string } | null> {
  const { data: source, error } = await service
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw error;
  if (!source) return null;
  // R1: only the owner's own template may be copied (stock templates can't be
  // code-shared — createShareCode requires ownership).
  if (source.user_id !== ownerId) return null;

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
      const exercise = await copyExercise(
        service,
        granteeId,
        ownerId,
        fill.exercise_id,
      );
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
 * Read the owner's live planner board into snapshot shape — the fallback for a
 * code minted before `shares.payload` existed (N65).
 */
async function liveMesoSnapshot(
  service: Client,
  mesoId: string,
): Promise<MesoShareSnapshot | null> {
  const { data: source, error } = await service
    .from("mesocycles")
    .select("*")
    .eq("id", mesoId)
    .maybeSingle();
  if (error) throw error;
  if (!source) return null;

  const { data: days, error: dayError } = await service
    .from("meso_days")
    .select("*")
    .eq("mesocycle_id", mesoId)
    .order("day_number");
  if (dayError) throw dayError;

  const snapshot: MesoShareSnapshot = {
    version: 1,
    type: "mesocycle",
    meso: {
      name: source.name,
      weeks: source.weeks,
      days_per_week: source.days_per_week,
      includes_deload: source.includes_deload,
      rir_start: source.rir_start,
      rir_end: source.rir_end,
      rir_schedule: source.rir_schedule,
    },
    days: [],
  };

  for (const day of days ?? []) {
    const { data: groups, error: groupError } = await service
      .from("meso_day_groups")
      .select("*")
      .eq("meso_day_id", day.id)
      .order("position");
    if (groupError) throw groupError;

    const groupSnapshots: MesoShareSnapshot["days"][number]["groups"] = [];
    for (const group of groups ?? []) {
      const { data: fills, error: fillError } = await service
        .from("meso_exercises")
        .select("*")
        .eq("meso_day_group_id", group.id)
        .order("position")
        .order("slot_number");
      if (fillError) throw fillError;
      groupSnapshots.push({
        muscle_group_id: group.muscle_group_id,
        position: group.position,
        exercise_slots: group.exercise_slots,
        fills: (fills ?? []).map((f) => ({
          slot_number: f.slot_number,
          position: f.position,
          exercise_id: f.exercise_id,
          initial_sets: f.initial_sets,
        })),
      });
    }
    snapshot.days.push({
      day_number: day.day_number,
      label: day.label,
      weekday: day.weekday,
      groups: groupSnapshots,
    });
  }
  return snapshot;
}

/**
 * A shared meso copies as a *planned, standalone* meso: the structure
 * (days, groups, slot fills — including the day-level exercise order and the
 * per-week RIR schedule) carries over; the owner's loads don't — the engine
 * seeds the grantee's numbers at start.
 *
 * N65: the structure comes from the code's snapshot (what the owner shared),
 * falling back to the owner's live board for codes minted before snapshots
 * existed. Either way the mesocycle row itself is still read live, because that
 * is where the R1 ownership assertion lives: a share whose `object_id` was
 * re-pointed at a third user's meso copies nothing, snapshot or not. Referenced
 * exercises are likewise resolved live through `copyExercise`, which re-asserts
 * ownership per exercise — a snapshot can never widen what a copy may touch.
 */
async function copyMesocycle(
  service: Client,
  granteeId: string,
  ownerId: string,
  mesoId: string,
  snapshot: MesoShareSnapshot | null,
): Promise<{ id: string; name: string } | null> {
  const { data: source, error } = await service
    .from("mesocycles")
    .select("id, user_id")
    .eq("id", mesoId)
    .maybeSingle();
  if (error) throw error;
  if (!source) return null;
  // R1: only the owner's own mesocycle may be copied.
  if (source.user_id !== ownerId) return null;

  const plan = snapshot ?? (await liveMesoSnapshot(service, mesoId));
  if (!plan) return null;

  const { data: copy, error: copyError } = await service
    .from("mesocycles")
    .insert({
      user_id: granteeId,
      macrocycle_id: null,
      position: null,
      phase: null,
      name: plan.meso.name,
      weeks: plan.meso.weeks,
      days_per_week: plan.meso.days_per_week,
      includes_deload: plan.meso.includes_deload,
      rir_start: plan.meso.rir_start,
      rir_end: plan.meso.rir_end,
      // N18-B: an edited per-week RIR schedule is part of what was shared
      rir_schedule: plan.meso.rir_schedule,
      status: "planned",
      template_id: null,
      start_date: null,
    })
    .select()
    .single();
  if (copyError) throw copyError;

  for (const day of plan.days) {
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

    for (const group of day.groups) {
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

      for (const fill of group.fills) {
        const exercise = await copyExercise(
          service,
          granteeId,
          ownerId,
          fill.exercise_id,
        );
        if (!exercise) continue;
        const { error: fillCopyError } = await service
          .from("meso_exercises")
          .insert({
            mesocycle_id: copy.id,
            day_of_week: null,
            meso_day_group_id: groupCopy.id,
            slot_number: fill.slot_number,
            // the day-level order (across groups) the owner shared
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

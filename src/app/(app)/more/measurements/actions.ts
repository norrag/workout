"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { releaseActive } from "@/lib/version";
import {
  tapeSessionSchema,
  todayAtOffset,
  type TapeSession,
} from "@/lib/measure/tape";
import { deleteTapeSession, saveTapeSession } from "@/lib/queries/measure/tape";

const saveSchema = z
  .object({
    session: tapeSessionSchema,
    timezoneOffset: z.number().int().min(-840).max(840),
  })
  .strict();

export async function saveMeasurements(
  input: unknown,
): Promise<{ error: string | null; saved?: TapeSession }> {
  if (!releaseActive("1.3.0"))
    return { error: "Measurements are not available yet." };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (
    parsed.data.session.measured_on >
    todayAtOffset(new Date(), parsed.data.timezoneOffset)
  )
    return { error: "That date hasn't happened yet." };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return {
      error: "Sign in again before saving. Your entries are still here.",
    };
  try {
    await saveTapeSession(client, parsed.data.session);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      return {
        error:
          "There is already a session on that date. Close this form and edit that session.",
      };
    return {
      error:
        "Couldn't save. Check your connection and try again. Your entries are still here.",
    };
  }
  revalidatePath("/more/measurements");
  return { error: null, saved: parsed.data.session };
}

export async function removeMeasurements(
  input: unknown,
): Promise<{ error: string | null }> {
  if (!releaseActive("1.3.0"))
    return { error: "Measurements are not available yet." };
  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) return { error: "Choose a session." };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: "Sign in again before deleting." };
  try {
    await deleteTapeSession(client, user.id, parsed.data);
  } catch {
    return { error: "Couldn't delete. Check your connection and try again." };
  }
  revalidatePath("/more/measurements");
  return { error: null };
}

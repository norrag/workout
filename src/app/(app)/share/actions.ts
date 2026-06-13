"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  acceptShareCode,
  createShareCode,
  type AcceptResult,
} from "@/lib/queries/sharing";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}

const createSchema = z.object({
  object_type: z.enum(["exercise", "template", "mesocycle"]),
  object_id: z.string().uuid(),
});

export async function createShareCodeAction(input: {
  object_type: "exercise" | "template" | "mesocycle";
  object_id: string;
}): Promise<{ code: string | null; error: string | null }> {
  const parsed = createSchema.parse(input);
  const { supabase, user } = await requireUser();
  return createShareCode(
    supabase,
    user.id,
    parsed.object_type,
    parsed.object_id,
  );
}

export async function acceptShareCodeAction(
  rawCode: string,
): Promise<AcceptResult> {
  const code = z.string().min(1).max(16).parse(rawCode);
  const { user } = await requireUser();
  // copy-on-accept reads the owner's rows — service client, scoped to the
  // session user for every write (hard rule 4)
  const result = await acceptShareCode(createServiceClient(), user.id, code);
  if (!result.error) {
    revalidatePath("/templates");
    revalidatePath("/exercises");
    revalidatePath("/cycles");
  }
  return result;
}

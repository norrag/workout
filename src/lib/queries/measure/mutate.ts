import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { tapeSessionSchema, type TapeSession } from "@/lib/measure/tape";
import { z } from "zod";
const resultSchema = z.object({
  committed: z.boolean(),
  status: z.enum([
    "updated",
    "deleted",
    "unchanged",
    "would_update",
    "would_delete",
  ]),
  session_id: z.uuid(),
  current: tapeSessionSchema,
  proposed: tapeSessionSchema.nullable(),
});
export type MutateTapeSessionInput = {
  id: string;
  expected: TapeSession;
  replacement?: TapeSession;
  commit: boolean;
  delete: boolean;
  confirmDelete: boolean;
};
export async function mutateTapeSession(
  client: SupabaseClient<Database>,
  input: MutateTapeSessionInput,
) {
  z.uuid().parse(input.id);
  const snapshot = (value: TapeSession) => {
    const parsed = tapeSessionSchema.parse(value);
    if (parsed.id !== input.id)
      throw new Error("Session snapshot does not match the target.");
    const { measured_on, input_unit, note, readings } = parsed;
    return { measured_on, input_unit, note, readings };
  };
  const { data, error } = await client.rpc("mutate_measurement_session", {
    p_id: input.id,
    p_expected: snapshot(input.expected),
    p_replacement: input.replacement ? snapshot(input.replacement) : undefined,
    p_commit: z.boolean().parse(input.commit),
    p_delete: z.boolean().parse(input.delete),
    p_confirm_delete: z.boolean().parse(input.confirmDelete),
  });
  if (error) throw error;
  return resultSchema.parse(data);
}

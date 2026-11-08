import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { type TapeSession } from "@/lib/measure/tape";
import { z } from "zod";
const resultSchema = z.object({
  committed: z.boolean(),
  sessions: z.array(
    z.object({
      date: z.iso.date(),
      session_id: z.uuid().nullable(),
      status: z.enum(["inserted", "unchanged", "would_insert"]),
    }),
  ),
});
export async function importTapeSessions(
  client: SupabaseClient<Database>,
  sessions: TapeSession[],
  commit: boolean,
) {
  const { data, error } = await client.rpc("import_measurement_sessions", {
    p_sessions: sessions.map(({ measured_on, input_unit, note, readings }) => ({
      measured_on,
      input_unit,
      note,
      readings,
    })),
    p_commit: commit,
  });
  if (error) throw error;
  return resultSchema.parse(data);
}

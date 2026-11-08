import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { tapeSessionSchema, type TapeSession } from "@/lib/measure/tape";
import { buildCsv } from "@/lib/csv";

type Client = SupabaseClient<Database>;

/** Owner-scoped live reads, paged past PostgREST's row cap. No browser cache. */
export async function getTapeSessions(
  client: Client,
  userId: string,
  options: { before?: string; limit?: number } = {},
): Promise<TapeSession[]> {
  const sessions: TapeSession[] = [];
  for (let from = 0; ; from += 1000) {
    let query = client
      .from("measurement_sessions")
      // A single statement snapshot keeps a concurrent correction/deletion
      // from separating a session header from its readings.
      .select("id,measured_on,input_unit,note,measurements(site_key,value_in)")
      .eq("user_id", userId)
      .order("measured_on", { ascending: false });
    if (options.before) query = query.lt("measured_on", options.before);
    const end = Math.min(from + 999, (options.limit ?? Infinity) - 1);
    const { data, error } = await query.range(from, end);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      measured_on: string;
      input_unit: string;
      note: string;
      measurements: { site_key: string; value_in: number }[];
    }>;
    sessions.push(
      ...rows.map((row) =>
        tapeSessionSchema.parse({
          id: row.id,
          measured_on: row.measured_on,
          input_unit: row.input_unit,
          note: row.note,
          readings: row.measurements.map((r) => ({
            site_key: r.site_key,
            value_in: Number(r.value_in),
          })),
        }),
      ),
    );
    if (
      !data ||
      data.length < end - from + 1 ||
      sessions.length >= (options.limit ?? Infinity)
    )
      break;
  }
  return sessions;
}

export async function saveTapeSession(
  client: Client,
  session: TapeSession,
): Promise<void> {
  const s = tapeSessionSchema.parse(session);
  const { error } = await client.rpc("save_measurement_session", {
    p_id: s.id,
    p_measured_on: s.measured_on,
    p_input_unit: s.input_unit,
    p_note: s.note,
    p_readings: s.readings,
  });
  if (error) throw error;
}

export async function deleteTapeSession(
  client: Client,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("measurement_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export async function buildTapeExportCsv(
  client: Client,
  userId: string,
): Promise<string> {
  const sessions = await getTapeSessions(client, userId);
  return buildCsv(
    ["date", "site", "value_in", "recorded_unit", "note"],
    sessions.flatMap((s) =>
      s.readings.map((r) => [
        s.measured_on,
        r.site_key,
        r.value_in,
        s.input_unit,
        s.note,
      ]),
    ),
  );
}

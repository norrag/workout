import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { buildCsv, type CsvCell } from "@/lib/csv";

type Client = SupabaseClient<Database>;

/**
 * Data-lifecycle export (07 Phase 7 — the More-tab "CSV" row). Streams the
 * user's full logged-set history as a flat, denormalized CSV — one row per
 * logged set with its mesocycle / week / day / exercise context. RLS-scoped to
 * the caller via the passed client; no service role.
 */

const EXPORT_COLUMNS = [
  "performed_at",
  "mesocycle",
  "week",
  "is_deload",
  "target_rir",
  "day",
  "exercise",
  "set_number",
  "set_type",
  "is_warmup",
  "weight",
  "reps",
  "rir_reported",
  "notes",
] as const;

// PostgREST embeds the FK-related rows; logged_sets references each of these.
const SELECT = `
  performed_at, set_number, set_type, is_warmup, weight, reps, rir_reported, notes,
  exercises ( name ),
  workouts ( day_number ),
  microcycles ( week_number, is_deload, target_rir ),
  mesocycles ( name )
`;

type ExportRow = {
  performed_at: string;
  set_number: number;
  set_type: string;
  is_warmup: boolean;
  weight: number;
  reps: number;
  rir_reported: number | null;
  notes: string | null;
  exercises: { name: string } | null;
  workouts: { day_number: number } | null;
  microcycles: {
    week_number: number;
    is_deload: boolean;
    target_rir: number;
  } | null;
  mesocycles: { name: string } | null;
};

const PAGE = 1000;

/** Fetch every logged set for the user, paginated past the PostgREST row cap. */
async function fetchAllRows(client: Client, userId: string): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("logged_sets")
      .select(SELECT)
      .eq("user_id", userId)
      .order("performed_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as ExportRow[];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** Build the user's training-history CSV document. */
export async function buildTrainingExportCsv(
  client: Client,
  userId: string,
): Promise<string> {
  const rows = await fetchAllRows(client, userId);
  const data: CsvCell[][] = rows.map((r) => [
    r.performed_at,
    r.mesocycles?.name ?? null,
    r.microcycles?.week_number ?? null,
    r.microcycles?.is_deload ?? null,
    r.microcycles?.target_rir ?? null,
    r.workouts?.day_number ?? null,
    r.exercises?.name ?? null,
    r.set_number,
    r.set_type,
    r.is_warmup,
    r.weight,
    r.reps,
    r.rir_reported,
    r.notes,
  ]);
  return buildCsv([...EXPORT_COLUMNS], data);
}

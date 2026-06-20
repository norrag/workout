import { createClient } from "@/lib/supabase/server";
import { buildTrainingExportCsv } from "@/lib/queries/export";

// Reads the signed-in user's full history; never cache, always per-request.
export const dynamic = "force-dynamic";

/** CSV export of the user's logged training history (07 Phase 7, More tab). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const csv = await buildTrainingExportCsv(supabase, user.id);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="workout-export-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

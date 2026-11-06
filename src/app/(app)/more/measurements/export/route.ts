import { createClient } from "@/lib/supabase/server";
import { buildTapeExportCsv } from "@/lib/queries/measure/tape";
import { releaseActive } from "@/lib/version";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!releaseActive("1.3.0"))
    return new Response("Not found", { status: 404 });
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  return new Response(await buildTapeExportCsv(client, user.id), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="body-measurements-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

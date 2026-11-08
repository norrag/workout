import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { releaseActive } from "@/lib/version";
import { getTapeSessions } from "@/lib/queries/measure/tape";
import { Measurements } from "./Measurements";

// Health records are live reads, including after consecutive server actions.
export const dynamic = "force-dynamic";

export default async function MeasurementsPage() {
  if (!releaseActive("1.3.0")) notFound();
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/sign-in");
  const sessions = await getTapeSessions(client, user.id);
  return (
    <div className="min-w-0 max-w-full">
      <Measurements sessions={sessions} />
    </div>
  );
}

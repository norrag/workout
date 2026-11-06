import Link from "next/link";
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
    <div>
      <Link
        href="/more"
        className="inline-flex min-h-11 items-center text-[10px] font-semibold tracking-[0.12em] text-ink/65"
      >
        &lt; MORE
      </Link>
      <div className="logotype mt-1 text-[13px] font-semibold">workout</div>
      <h1 className="title-display mt-3 text-[32px]">measurements</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink/70">
        A monthly tape record, between your workouts and scans.
      </p>
      <Measurements sessions={sessions} />
    </div>
  );
}

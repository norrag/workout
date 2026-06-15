import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCopyableMesos } from "@/lib/queries/cycles";

/** Source picker for the copy-a-meso path (fig 2.4 option 01). */
export default async function CopyMesoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const mesos = await listCopyableMesos(supabase, user.id);

  return (
    <div>
      <Link
        href="/cycles/plan"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ BACK
      </Link>
      <h1 className="title-display mt-3 text-[27px]">copy a meso</h1>
      <div className="mt-1 text-[10px] font-medium tracking-[0.12em] text-ink/55">
        CARRY THE STRUCTURE FORWARD — LOADS RESEED FROM YOUR BEST
      </div>

      <div className="mt-4 border-t-[1.5px] border-ink">
        {mesos.length === 0 && (
          <p className="py-4 text-sm text-ink/45">
            No mesocycles to copy yet. Plan one from scratch first.
          </p>
        )}
        {mesos.map((meso) => (
          <Link
            key={meso.id}
            href={`/cycles/plan/new?copy=${meso.id}`}
            className="flex items-center justify-between border-b border-ink/[0.18] py-[15px]"
          >
            <div>
              <div className="text-[9.5px] font-semibold tracking-[0.14em] text-ink/50">
                {meso.status.toUpperCase()}
                {meso.phase ? ` · ${meso.phase.toUpperCase()}` : ""}
              </div>
              <div className="mt-[3px] text-[17px] font-bold">{meso.name}</div>
              <div className="mt-[7px] flex gap-1.5">
                <span className="border border-ink/40 px-[7px] py-[3px] text-[9px] font-semibold tracking-[0.08em]">
                  {meso.weeks} WK
                </span>
                <span className="border border-ink/40 px-[7px] py-[3px] text-[9px] font-semibold tracking-[0.08em]">
                  {meso.days_per_week} D/WK
                </span>
              </div>
            </div>
            <div className="text-base text-ink/40">›</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

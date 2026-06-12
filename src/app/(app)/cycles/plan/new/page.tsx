import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCyclesOverview } from "@/lib/queries/cycles";
import { NewMesoForm } from "./NewMesoForm";

/** Create-mesocycle sheet (fig 2.7) as a page. */
export default async function NewMesoPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const { slot } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { macros } = await getCyclesOverview(supabase, user.id);
  const openSlots = macros.flatMap((macro) =>
    macro.slots
      .filter((s) => !s.mesocycle)
      .map((s) => ({
        id: s.id,
        label: `${macro.name} · ${String(s.slot_number).padStart(2, "0")} ${(s.label ?? s.goal_type).toUpperCase()}`,
      })),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <Link
          href="/cycles/plan"
          className="label-caps text-[10px] font-semibold text-ink/45"
        >
          ← PLAN
        </Link>
        <h1 className="title-display mt-1 text-4xl">create mesocycle</h1>
      </header>
      <NewMesoForm openSlots={openSlots} preselectedSlot={slot ?? null} />
    </div>
  );
}

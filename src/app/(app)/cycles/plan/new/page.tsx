import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCyclesOverview } from "@/lib/queries/cycles";
import { NewMesoForm, type PlacementMacro } from "./NewMesoForm";

/** Create-mesocycle (fig 2.7). */
export default async function NewMesoPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string; template?: string }>;
}) {
  const { slot, template: templateId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  let template: { id: string; name: string } | null = null;
  if (templateId) {
    const { data, error } = await supabase
      .from("templates")
      .select("id, name")
      .eq("id", templateId)
      .maybeSingle();
    if (error) throw error;
    template = data;
  }

  const { macros } = await getCyclesOverview(supabase, user.id);
  const placementMacros: PlacementMacro[] = macros
    .filter((m) => m.slots.length > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      start_date: m.start_date,
      target_end_date: m.target_end_date,
      slots: m.slots.map((s) => ({
        id: s.id,
        slot_number: s.slot_number,
        label: (s.label ?? s.goal_type).toUpperCase(),
        goal_type: s.goal_type,
        state: s.mesocycle
          ? s.mesocycle.status === "completed"
            ? ("done" as const)
            : ("filled" as const)
          : ("open" as const),
      })),
    }));

  return (
    <div>
      <Link
        href="/cycles/plan"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ BACK
      </Link>
      <h1 className="title-display mt-3 text-[27px]">create mesocycle</h1>
      <div className="mt-1 text-[10px] font-medium tracking-[0.12em] text-ink/55">
        {template
          ? `FROM TEMPLATE — ${template.name.toUpperCase()}`
          : "FROM SCRATCH"}
      </div>
      <NewMesoForm
        macros={placementMacros}
        preselectedSlot={slot ?? null}
        templateId={template?.id ?? null}
        defaultName={template?.name ?? ""}
      />
    </div>
  );
}

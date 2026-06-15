import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewMesoForm } from "./NewMesoForm";

/** Create a standalone mesocycle (fig 2.4 → from-scratch / template / copy). */
export default async function NewMesoPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; copy?: string }>;
}) {
  const { template: templateId, copy: copyMesoId } = await searchParams;
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

  // copy-a-meso (fig 2.4 option 01): carry name/weeks/RIR forward from the source
  let source: {
    id: string;
    name: string;
    weeks: number;
    includes_deload: boolean;
    rir_start: number;
    rir_end: number;
  } | null = null;
  if (copyMesoId && !templateId) {
    const { data, error } = await supabase
      .from("mesocycles")
      .select("id, name, weeks, includes_deload, rir_start, rir_end")
      .eq("id", copyMesoId)
      .maybeSingle();
    if (error) throw error;
    source = data;
  }

  const subtitle = template
    ? `FROM TEMPLATE — ${template.name.toUpperCase()}`
    : source
      ? `COPIED FROM — ${source.name.toUpperCase()}`
      : "STANDALONE — FROM SCRATCH";

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
        {subtitle}
      </div>
      <NewMesoForm
        templateId={template?.id ?? null}
        copyMesoId={source?.id ?? null}
        defaultName={template?.name ?? (source ? `${source.name} II` : "")}
        defaultWeeks={source?.weeks ?? 5}
        defaultDeload={source?.includes_deload ?? true}
        defaultRirStart={source?.rir_start ?? 3}
        defaultRirEnd={source?.rir_end ?? 0}
      />
    </div>
  );
}

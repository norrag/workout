import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewMesoForm } from "./NewMesoForm";

/** Create a standalone mesocycle (fig 2.4 → from-scratch / template). */
export default async function NewMesoPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template: templateId } = await searchParams;
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
          : "STANDALONE — FROM SCRATCH"}
      </div>
      <NewMesoForm
        templateId={template?.id ?? null}
        defaultName={template?.name ?? ""}
      />
    </div>
  );
}

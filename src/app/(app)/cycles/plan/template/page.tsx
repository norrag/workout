import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/queries/templates";
import { startTemplateDraftAction } from "../../actions";

/** Template picker for the plan-a-meso flow (fig 2.4 option 02). */
export default async function PlanFromTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { q } = await searchParams;
  const templates = await listTemplates(supabase, { search: q });

  return (
    <div>
      <Link
        href="/cycles/plan"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ BACK
      </Link>
      <h1 className="title-display mt-3 text-[27px]">pick a template</h1>
      <div className="mt-1 text-[10px] font-medium tracking-[0.12em] text-ink/55">
        THE PLANNER BOARD OPENS PREFILLED
      </div>

      <form method="get">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search"
          className="mt-4 h-[46px] w-full border-[1.5px] border-ink bg-paper px-3.5 text-sm text-ink placeholder:text-ink/45 focus:outline-none"
        />
      </form>

      <div className="mt-4 border-t-[1.5px] border-ink">
        {templates.length === 0 && (
          <p className="py-4 text-sm text-ink/45">No templates found.</p>
        )}
        {templates.map((template) => (
          <form key={template.id} action={startTemplateDraftAction}>
            <input type="hidden" name="template_id" value={template.id} />
            <button
              type="submit"
              className="flex w-full items-center justify-between border-b border-ink/[0.18] py-[15px] text-left"
            >
              <div>
                <div className="text-[9.5px] font-semibold tracking-[0.14em] text-ink/50">
                  {template.emphasis.replace(/_/g, " ").toUpperCase()}
                  {template.user_id !== null ? " · YOURS" : ""}
                </div>
                <div className="mt-[3px] text-[17px] font-bold">
                  {template.name}
                </div>
                <div className="mt-[7px] flex gap-1.5">
                  <span className="border border-ink/40 px-[7px] py-[3px] text-[9px] font-semibold tracking-[0.08em]">
                    {template.days_per_week} D/WK
                  </span>
                </div>
              </div>
              <div className="text-base text-ink/40">›</div>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

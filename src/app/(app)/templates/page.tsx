import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/queries/templates";
import { NewTemplateButton } from "./NewTemplateButton";
import { TemplateFilterPanel } from "./TemplateFilterPanel";

/** Templates tab (fig 3.3): stock + own templates, search, filters, start-from-template. */
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    days?: string;
    emphasis?: string;
    gender?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { q, days, emphasis, gender } = await searchParams;
  const templates = await listTemplates(supabase, {
    search: q,
    days: days ? Number(days) : undefined,
    emphasis,
    gender,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="title-display text-[32px]">templates</h1>
        {/* New template = a tray (PH27): blank planner draft, or add from a
            share code. */}
        <NewTemplateButton />
      </div>

      <TemplateFilterPanel
        q={q}
        days={days}
        emphasis={emphasis}
        gender={gender}
        count={templates.length}
      />

      <div className="mt-4 border-t-[1.5px] border-ink">
        {templates.length === 0 && (
          <p className="py-4 text-sm text-ink/45">No templates found.</p>
        )}
        {templates.map((template) => (
          <Link
            key={template.id}
            href={`/templates/${template.id}`}
            className="flex items-center justify-between border-b border-ink/[0.18] py-[15px]"
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
                {template.intended_gender && template.intended_gender !== "any" && (
                  <span className="border border-ink/40 px-[7px] py-[3px] text-[9px] font-semibold tracking-[0.08em]">
                    {template.intended_gender.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <div className="text-base text-ink/40">›</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

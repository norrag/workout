import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTemplateDetail } from "@/lib/queries/templates";
import { ShareRow } from "@/components/ShareRow";
import { startTemplateDraftAction } from "../../cycles/actions";

/**
 * Template detail (08 §4, described not mocked): the template's days, groups
 * and exercises in the house style; starting a meso opens the planner board
 * prefilled (the 2.7 create sheet runs first — flow deviation recorded in
 * PROGRESS).
 */
export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const detail = await getTemplateDetail(supabase, templateId);
  if (!detail) notFound();
  const { template, days } = detail;

  return (
    <div>
      <Link
        href="/templates"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ TEMPLATES
      </Link>
      <div className="mt-3 flex items-end justify-between">
        <h1 className="text-[27px] font-extrabold leading-none tracking-[-0.02em]">
          {template.name}
        </h1>
        {template.user_id !== null && (
          <div className="border border-ink/35 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ink/55">
            YOURS
          </div>
        )}
      </div>
      <div className="mt-2 text-[10.5px] font-medium tracking-[0.1em] text-ink/55">
        {template.emphasis.replace(/_/g, " ").toUpperCase()} ·{" "}
        <span className="numeral">{template.days_per_week}</span> DAYS/WK
      </div>

      {template.description && (
        <p className="mt-4 text-[13px] leading-[1.55] text-ink/80">
          {template.description}
        </p>
      )}

      {days.map((day) => (
        <div key={day.day_number} className="mt-5">
          <div className="border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
            DAY {day.day_number}
            {day.label ? ` — ${day.label.toUpperCase()}` : ""}
          </div>
          {day.groups.map((group) => (
            <div key={group.muscle_group_id} className="mt-2.5">
              <div className="flex items-center gap-2 text-[10px] font-extrabold tracking-[0.14em]">
                <div className="flex h-[22px] w-[22px] items-center justify-center border-[1.5px] border-ink text-[9px]">
                  {group.muscle_group.slice(0, 2).toUpperCase()}
                </div>
                {group.muscle_group.toUpperCase()}
              </div>
              {group.fills.map((fill) => (
                <div
                  key={`${fill.slot_number}-${fill.exercise_id}`}
                  className="flex items-baseline justify-between border-b border-ink/[0.18] py-2 pl-[30px]"
                >
                  <div className="text-sm font-semibold">
                    {fill.exercise_name}
                  </div>
                  <div className="text-[9px] font-semibold tracking-[0.12em] text-ink/55">
                    {fill.equipment_type.toUpperCase()} ·{" "}
                    <span className="numeral">{fill.default_sets}</span> SETS
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      <form action={startTemplateDraftAction}>
        <input type="hidden" name="template_id" value={template.id} />
        <button
          type="submit"
          className="mt-6 block w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base"
        >
          START A MESO FROM THIS
        </button>
      </form>
      <p className="mt-2.5 text-[11px] leading-normal text-ink/60">
        Opens the planner board prefilled — excluded movements never carry
        over.
      </p>
      {template.user_id === user.id && (
        <ShareRow objectType="template" objectId={template.id} />
      )}
    </div>
  );
}

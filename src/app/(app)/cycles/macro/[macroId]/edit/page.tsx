import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveEngineParams } from "@/lib/queries/generation";
import {
  getMacroOverview,
  macroEditImpact,
  profileToMacroProfile,
} from "@/lib/queries/macro";
import { getProfile } from "@/lib/queries/profiles";
import { EditMacroForm } from "./EditMacroForm";
import { MacroBlocksEditor } from "./MacroBlocksEditor";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Edit Macrocycle — same engine as create (fig 2.3), prefilled + re-plan. */
export default async function EditMacroPage({
  params,
}: {
  params: Promise<{ macroId: string }>;
}) {
  const { macroId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");
  const { params: engineParams } = await getActiveEngineParams(supabase);

  const now = new Date();
  const overview = await getMacroOverview(
    supabase,
    user.id,
    macroId,
    profile,
    engineParams,
    now,
  );
  if (!overview) notFound();
  const { macro, mesos } = overview;
  const macroProfile = profileToMacroProfile(profile, now);
  const impact = macroEditImpact(mesos);

  const chips: string[] = [];
  if (profile.training_since) {
    const since = new Date(`${profile.training_since}T12:00:00`);
    if (!Number.isNaN(since.getTime())) {
      const yrs = Math.max(0, (now.getTime() - since.getTime()) / MS_PER_YEAR);
      chips.push(`${yrs < 1 ? "<1" : Math.round(yrs)} YR TRAINING AGE`);
    }
  }
  if (profile.bodyweight)
    chips.push(`${Math.round(profile.bodyweight)} LB`);
  if (profile.experience_level)
    chips.push(profile.experience_level.toUpperCase());

  return (
    <div>
      <Link
        href={`/cycles/macro/${macroId}`}
        className="text-[10px] font-medium tracking-[0.12em] text-ink/55"
      >
        ‹ OVERVIEW
      </Link>
      <h1 className="title-display mt-2.5 text-[30px]">edit macrocycle</h1>
      <p className="mt-[5px] text-[11px] leading-relaxed text-ink/60">
        Adjust the arc. Re-planning only touches not-yet-planned mesocycle
        slots — planned, active, and completed work stays put.
      </p>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="border border-ink/30 px-2 py-1 text-[8.5px] font-semibold tracking-[0.1em] text-ink/70"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <EditMacroForm
        macroId={macroId}
        profile={macroProfile}
        params={engineParams}
        initial={{
          name: macro.name,
          goal_type: macro.goal_type,
          duration_months: macro.duration_months,
          meso_length_weeks: macro.meso_length_weeks,
          goal_notes: macro.goal_notes,
        }}
        impact={impact}
      />

      <MacroBlocksEditor
        macroId={macroId}
        blocks={mesos.map((m) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          position: m.position,
          phase: m.phase,
        }))}
      />
    </div>
  );
}

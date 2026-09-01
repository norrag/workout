import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveEngineParams } from "@/lib/queries/generation";
import {
  getPriorBlockMeasuredRate,
  profileToMacroProfile,
} from "@/lib/queries/macro";
import { getProfile } from "@/lib/queries/profiles";
import { shortDate } from "@/lib/dates";
import { InlineTerm } from "@/components/ui/InlineTerm";
import { CreateMacroForm } from "./CreateMacroForm";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Create Macrocycle — the engine (fig 2.3). */
export default async function NewMacroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/onboarding");
  const { params } = await getActiveEngineParams(supabase);

  const now = new Date();
  const macroProfile = profileToMacroProfile(profile, now);

  // doc 17 §5: the prior completed block's MEASURED strength rate — display
  // context only, never blended into the target (principle 4)
  const priorBlock = await getPriorBlockMeasuredRate(supabase, user.id, params);

  // profile chips shown on the engine card (fig 2.2/2.3)
  const chips: string[] = [];
  if (profile.training_since) {
    const since = new Date(`${profile.training_since}T12:00:00`);
    if (!Number.isNaN(since.getTime())) {
      const yrs = Math.max(0, (now.getTime() - since.getTime()) / MS_PER_YEAR);
      chips.push(`${yrs < 1 ? "<1" : Math.round(yrs)} YR TRAINING AGE`);
    }
  }
  if (profile.bodyweight)
    chips.push(
      // "as of" freshness wherever profile bodyweight displays (doc 17 §5) —
      // the contract is priced off this number
      `${Math.round(profile.bodyweight)} LB${
        profile.bodyweight_updated_at
          ? ` · AS OF ${shortDate(profile.bodyweight_updated_at)}`
          : ""
      }`,
    );
  if (profile.experience_level)
    chips.push(profile.experience_level.toUpperCase());

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/cycles"
          className="text-[10px] font-medium tracking-[0.12em] text-ink-muted"
        >
          ‹ CYCLES
        </Link>
      </div>
      <h1 className="title-display mt-2.5 text-[30px]">new macrocycle</h1>
      <p className="mt-[5px] text-[11px] leading-relaxed text-ink/60">
        A long-term arc that gives your{" "}
        <InlineTerm term="mesocycle">mesocycles</InlineTerm> a shared direction.
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
      <CreateMacroForm
        profile={macroProfile}
        params={params}
        today={now.toISOString().slice(0, 10)}
        priorBlock={priorBlock}
      />
    </div>
  );
}

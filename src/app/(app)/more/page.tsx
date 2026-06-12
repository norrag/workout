import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { signOut } from "@/app/(auth)/actions";
import { UnitsToggle } from "./UnitsToggle";

function formatHeight(heightCm: number | null, units: string): string | null {
  if (heightCm == null) return null;
  if (units === "kg") return `${heightCm} CM`;
  const totalIn = Math.round(heightCm / 2.54);
  return `${Math.floor(totalIn / 12)}′${totalIn % 12}″`;
}

/** More tab (fig 4.4): profile card + inline settings. */
export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  const { count: workoutCount, error: countError } = await supabase
    .from("workouts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "completed");
  if (countError) throw countError;

  const units = profile?.units ?? "lb";
  const meta = [
    profile?.age != null ? String(profile.age) : null,
    profile?.experience_level?.toUpperCase() ?? null,
    profile?.bodyweight != null
      ? `${profile.bodyweight} ${units.toUpperCase()}`
      : null,
    formatHeight(profile?.height_cm ?? null, units),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <div className="logotype text-[13px] font-semibold">workout</div>
      <h1 className="title-display mt-4 text-[32px]">more</h1>

      <Link
        href="/more/profile"
        className="mt-4 block border-[1.5px] border-ink p-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-extrabold tracking-[-0.01em]">
              {profile?.display_name ?? "Set up your profile"}
            </div>
            {meta && (
              <div className="mt-1 text-[10px] font-medium tracking-[0.1em] text-ink/55">
                {meta}
              </div>
            )}
          </div>
          <div className="text-base text-ink/50">›</div>
        </div>
        <div className="mt-3 flex gap-2 border-t border-ink/[0.18] pt-3 text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          {profile?.training_since && (
            <>
              <span>
                TRAINING SINCE &apos;{profile.training_since.slice(2, 4)}
              </span>
              <span>·</span>
            </>
          )}
          <span>
            <span className="numeral">{workoutCount ?? 0}</span> WORKOUTS LOGGED
          </span>
        </div>
      </Link>

      <div className="mt-6 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        SETTINGS
      </div>
      <div className="flex items-center justify-between border-b border-ink/15 py-[11px]">
        <div className="text-sm font-semibold">Units</div>
        <UnitsToggle units={units} />
      </div>
      <div className="flex items-center justify-between border-b border-ink/15 py-3.5">
        <div className="text-sm font-semibold">AI connector</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          NOT CONNECTED ›
        </div>
      </div>
      <div className="flex items-center justify-between border-b border-ink/15 py-3.5">
        <div className="text-sm font-semibold">Export training data</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          CSV ›
        </div>
      </div>

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="w-full border-[1.5px] border-ink py-3 text-center text-xs font-bold tracking-[0.12em]"
        >
          SIGN OUT
        </button>
      </form>

      <div className="mt-6 text-[9.5px] font-medium tracking-[0.12em] text-ink/45">
        WORKOUT 0.1 — PRE-RELEASE
      </div>
    </div>
  );
}

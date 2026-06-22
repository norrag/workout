import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { signOut } from "@/app/(auth)/actions";
import { UnitsToggle } from "./UnitsToggle";
import { ThemeToggle } from "./ThemeToggle";
import { AutoMatchToggle } from "./AutoMatchToggle";
import { formatHeight } from "@/lib/units";

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
        <div className="pr-3">
          <div className="text-sm font-semibold">Units</div>
          <div className="mt-0.5 text-[10px] font-medium tracking-[0.04em] text-ink/55">
            MEASUREMENT SYSTEM — HEIGHT FOLLOWS THIS
          </div>
        </div>
        <UnitsToggle units={units} />
      </div>
      <div className="flex items-center justify-between border-b border-ink/15 py-[11px]">
        <div className="text-sm font-semibold">Theme</div>
        <ThemeToggle />
      </div>
      <div className="flex items-center justify-between border-b border-ink/15 py-[11px]">
        <div className="pr-3">
          <div className="text-sm font-semibold">Match weight across sets</div>
          <div className="mt-0.5 text-[10px] font-medium tracking-[0.04em] text-ink/55">
            CHANGING A SET&apos;S WEIGHT UPDATES THE REST
          </div>
        </div>
        <AutoMatchToggle enabled={profile?.auto_match_weights ?? false} />
      </div>
      <Link
        href="/more/connector"
        className="flex items-center justify-between border-b border-ink/15 py-3.5"
      >
        <div className="text-sm font-semibold">AI connector</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          SET UP ›
        </div>
      </Link>
      <a
        href="/more/export"
        download
        className="flex items-center justify-between border-b border-ink/15 py-3.5"
      >
        <div className="text-sm font-semibold">Export training data</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          CSV ›
        </div>
      </a>
      <Link
        href="/more/delete-account"
        className="flex items-center justify-between border-b border-ink/15 py-3.5"
      >
        <div className="text-sm font-semibold">Delete account</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-accent">
          DELETE ›
        </div>
      </Link>

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

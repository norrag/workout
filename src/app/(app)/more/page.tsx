import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, profileAge } from "@/lib/queries/profiles";
import { getLatestBodyweightPoint } from "@/lib/queries/bodyweight";
import { getBodySpecConnection } from "@/lib/queries/external-connections";
import { signOut } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ThemeToggle } from "./ThemeToggle";
import { LogBodyweightRow } from "./LogBodyweightRow";
import { formatHeight } from "@/lib/units";
import { shortDate } from "@/lib/dates";
import { displayVersion, releaseActive } from "@/lib/version";

/** More tab (fig 4.4): profile card + inline settings. */
export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [profile, latestBodyweight, bodySpecConnection] = await Promise.all([
    getProfile(supabase, user.id),
    getLatestBodyweightPoint(supabase, user.id),
    getBodySpecConnection(supabase, user.id),
  ]);
  const bodySpecStatus = bodySpecConnection?.status ?? null;
  const { count: workoutCount, error: countError } = await supabase
    .from("workouts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "completed");
  if (countError) throw countError;

  const age = profile ? profileAge(profile) : null;
  const meta = [
    age != null ? String(age) : null,
    profile?.experience_level?.toUpperCase() ?? null,
    // "as of" freshness wherever profile bodyweight displays (doc 17 §5,
    // 09-changelog 2026-07-11 §2)
    profile?.bodyweight != null
      ? `${profile.bodyweight} LB${
          profile.bodyweight_updated_at
            ? ` · AS OF ${shortDate(profile.bodyweight_updated_at)}`
            : ""
        }`
      : null,
    formatHeight(profile?.height_in ?? null),
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
      {/* doc 22 O2 — the User Guide's entry point, first because finding it is
          the whole point of having one. Gated with the routes it opens (doc 23
          §9.2): one gate at the route boundary, one here at the door. */}
      {releaseActive("1.1.0") && (
        <Link
          href="/more/guide"
          className="flex items-center justify-between border-b border-ink/15 py-3.5"
        >
          <div className="text-sm font-semibold">Guide</div>
          <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
            READ ›
          </div>
        </Link>
      )}
      <div className="flex items-center justify-between border-b border-ink/15 py-[11px]">
        <div className="text-sm font-semibold">Theme</div>
        <ThemeToggle />
      </div>
      {/* bodyweight quick entry (doc 17 §5, 09-changelog 2026-07-11 §1) —
          appends a manual measured point; never rewrites the profile scalar */}
      <LogBodyweightRow
        latest={
          latestBodyweight
            ? {
                weight: Number(latestBodyweight.weight),
                measured_on: latestBodyweight.measured_on,
              }
            : null
        }
        fallbackWeight={profile?.bodyweight ?? null}
      />
      <Link
        href="/more/connector"
        className="flex items-center justify-between border-b border-ink/15 py-3.5"
      >
        <div className="text-sm font-semibold">AI connector</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          SET UP ›
        </div>
      </Link>
      {/* BodySpec DEXA integration (doc 17 §6 / N34 Phase 5a; 09-changelog
          2026-07-11 §1) — quiet settings row, never a nav item */}
      <Link
        href="/more/bodyspec"
        className="flex items-center justify-between border-b border-ink/15 py-3.5"
      >
        <div className="text-sm font-semibold">BodySpec DEXA</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          {bodySpecStatus === "connected"
            ? "CONNECTED"
            : bodySpecStatus === "error"
              ? "RECONNECT ›"
              : "SET UP ›"}
        </div>
      </Link>
      <Link
        href="/more/account"
        className="flex items-center justify-between border-b border-ink/15 py-3.5"
      >
        <div className="text-sm font-semibold">Account &amp; data</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          ›
        </div>
      </Link>

      <form action={signOut} className="mt-6">
        <SubmitButton
          pendingLabel="SIGNING OUT…"
          className="w-full border-[1.5px] border-ink py-3 text-center text-xs font-bold tracking-[0.12em]"
        >
          SIGN OUT
        </SubmitButton>
      </form>

      {/* doc 23 §8 — the footer is the door to the version history, and its
          number comes from the release registry (never a hardcoded string:
          CI asserts package.json, CURRENT_VERSION and max(RELEASES) agree) */}
      <Link
        href="/more/whats-new"
        className="mt-6 block text-[9.5px] font-medium tracking-[0.12em] text-ink/45"
      >
        WORKOUT <span className="numeral">{displayVersion()}</span> —
        WHAT&apos;S NEW ›
      </Link>
    </div>
  );
}

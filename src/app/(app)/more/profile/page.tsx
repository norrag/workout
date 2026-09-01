import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { listExclusions } from "@/lib/queries/exercises";
import { getBodySpecConnection } from "@/lib/queries/external-connections";
import { getNewestAppliedBodyScan } from "@/lib/queries/body-scans";
import { ProfileEditor } from "./ProfileEditor";

/** Profile screen (fig 4.5). */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [profile, exclusions, { data: exercises, error }, connection] =
    await Promise.all([
      getProfile(supabase, user.id),
      listExclusions(supabase, user.id),
      supabase.from("exercises").select("id, name").order("name"),
      getBodySpecConnection(supabase, user.id),
    ]);
  if (error) throw error;
  if (!profile) redirect("/onboarding");

  // 5c: the body-fat value renders as MEASURED only while its provenance is
  // 'dexa' AND the BodySpec connection still exists — disconnecting reverts
  // the control to the estimate picker (the value itself stays until edited).
  // The "as of" date derives from the newest APPLIED scan, never duplicated.
  const dexaBodyFat =
    profile.body_fat_source === "dexa" && connection != null
      ? {
          scannedAt:
            (await getNewestAppliedBodyScan(supabase, user.id))?.scanned_at ??
            null,
        }
      : null;

  return (
    <div>
      <Link
        href="/more"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink-muted"
      >
        ‹ MORE
      </Link>
      <h1 className="mt-3 text-[27px] font-extrabold leading-none tracking-[-0.02em]">
        Profile
      </h1>
      <ProfileEditor
        profile={profile}
        exclusions={exclusions}
        exercises={exercises ?? []}
        dexaBodyFat={dexaBodyFat}
      />
    </div>
  );
}

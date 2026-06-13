import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { listExclusions } from "@/lib/queries/exercises";
import { ProfileEditor } from "./ProfileEditor";

/** Profile screen (fig 4.5). */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [profile, exclusions, { data: exercises, error }] = await Promise.all([
    getProfile(supabase, user.id),
    listExclusions(supabase, user.id),
    supabase.from("exercises").select("id, name").order("name"),
  ]);
  if (error) throw error;
  if (!profile) redirect("/onboarding");

  return (
    <div>
      <Link
        href="/more"
        className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
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
      />
    </div>
  );
}

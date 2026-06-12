import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { listExclusions } from "@/lib/queries/exercises";
import { ProfileEditor } from "./ProfileEditor";

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
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <Link
          href="/more"
          className="label-caps text-[10px] font-semibold text-ink/45"
        >
          ← MORE
        </Link>
        <h1 className="title-display mt-1 text-4xl">profile</h1>
      </header>
      <ProfileEditor
        profile={profile}
        exclusions={exclusions}
        exercises={exercises ?? []}
      />
    </div>
  );
}

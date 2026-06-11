import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { signOut } from "@/app/(auth)/actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="label-caps text-lg font-bold">Settings</h1>
      <Card header="Profile">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Name</dt>
            <dd>{profile?.display_name ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Experience</dt>
            <dd>{profile?.experience_level ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Units</dt>
            <dd>{profile?.units ?? "—"}</dd>
          </div>
        </dl>
      </Card>
      <Card header="Connections">
        <p className="text-sm text-text-secondary">
          MCP connector tokens will be managed here (Phase 7).
        </p>
      </Card>
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}

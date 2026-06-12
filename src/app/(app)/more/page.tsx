import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { signOut } from "@/app/(auth)/actions";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink/15 py-3 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="label-caps text-[10px] font-semibold text-ink/55">
        {value}
      </span>
    </div>
  );
}

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <h1 className="title-display text-4xl">more</h1>
      </header>

      <Card header="Profile">
        <Row label="Name" value={profile?.display_name ?? "—"} />
        <Row label="Email" value={user.email ?? "—"} />
        <Row label="Experience" value={profile?.experience_level ?? "—"} />
      </Card>

      <Card header="Settings">
        <Row label="Units" value={(profile?.units ?? "lb").toUpperCase()} />
        <Row label="AI connector" value="NOT CONNECTED" />
        <Row label="Export data" value="CSV — SOON" />
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>

      <p className="label-caps text-center text-[9px] font-medium text-ink/45">
        workout — pre-release
      </p>
    </div>
  );
}

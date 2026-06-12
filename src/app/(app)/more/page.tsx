import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { signOut } from "@/app/(auth)/actions";
import { UnitsToggle } from "./UnitsToggle";

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between border-b border-ink/15 py-2 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="label-caps text-[10px] font-semibold text-ink/55">
        {value}
      </span>
    </div>
  );
}

/** More tab (fig 4.4): profile card, settings rows, version line. */
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

      <Link
        href="/more/profile"
        className="flex items-center justify-between border-[1.5px] border-ink px-4 py-4"
      >
        <div>
          <p className="text-lg font-extrabold tracking-[-0.01em]">
            {profile?.display_name ?? "Set up your profile"}
          </p>
          <p className="label-caps mt-0.5 text-[10px] font-semibold text-ink/55">
            {profile?.experience_level ?? "profile"} ·{" "}
            {user.email ?? ""}
          </p>
        </div>
        <span className="label-caps text-[10px] font-bold text-ink/45">
          EDIT →
        </span>
      </Link>

      <Card header="Settings">
        <div className="flex min-h-12 items-center justify-between border-b border-ink/15 py-2 text-sm">
          <span className="font-semibold">Units</span>
          <UnitsToggle units={profile?.units ?? "lb"} />
        </div>
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/today");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
      <div className="text-center">
        <h1 className="label-caps text-4xl font-bold tracking-[0.08em]">
          WORK<span className="text-accent">OUT</span>
        </h1>
        <p className="mt-3 max-w-sm text-text-secondary">
          Periodized training, tracked. RIR-based progression that plans next
          week from how this week actually went.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/sign-in"
          className="label-caps flex min-h-11 items-center justify-center rounded-[6px] bg-accent text-sm font-semibold text-bg-base"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="label-caps flex min-h-11 items-center justify-center rounded-[6px] border border-border-subtle bg-bg-raised text-sm font-semibold"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}

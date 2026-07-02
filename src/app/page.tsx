import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Signed-in traffic normally never reaches this page: the middleware
  // rewrites "/" to /workout while keeping the address "/" (the installed-PWA
  // scope on iOS is derived from the added-from page, so the app must live at
  // "/" — see lib/supabase/middleware.ts). This redirect is only a fallback
  // for requests the middleware didn't cover.
  if (user) redirect("/workout");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-10 px-6">
      <div>
        <h1 className="logotype border-b-[1.5px] border-ink pb-4 text-2xl">
          workout
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink/70">
          Periodized training, tracked. RIR-based progression that plans next
          week from how this week actually went.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Link
          href="/sign-in"
          className="label-caps flex min-h-11 items-center justify-center bg-ink text-xs font-bold text-bg-base"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="label-caps flex min-h-11 items-center justify-center border-[1.5px] border-ink text-xs font-bold text-ink"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}

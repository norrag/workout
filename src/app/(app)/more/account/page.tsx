import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries/profiles";
import { AutoMatchToggle } from "../AutoMatchToggle";

/** Account & data (PH26): match-weight preference, export, delete — moved off the
 *  main More list into a dedicated sub-page. */
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);

  return (
    <div>
      <Link
        href="/more"
        className="text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ MORE
      </Link>
      <h1 className="title-display mt-4 text-[32px]">account &amp; data</h1>

      <div className="mt-6 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        LOGGING
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

      <div className="mt-6 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        DATA
      </div>
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
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Templates tab (fig 3.3) — list lands in Phase 5; frame matches the system. */
export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="title-display text-[32px]">templates</h1>
        <div className="border-[1.5px] border-ink/30 px-3.5 py-[9px] text-[11px] font-bold tracking-[0.1em] text-ink/40">
          + NEW
        </div>
      </div>
      <input
        type="search"
        placeholder="Search"
        disabled
        className="mt-4 h-[46px] w-full border-[1.5px] border-ink/40 bg-paper px-3.5 text-sm text-ink placeholder:text-ink/45 focus:outline-none"
      />
      <div className="mt-4 border-t-[1.5px] border-ink pt-4">
        <div className="border border-dashed border-ink/40 p-5 text-sm leading-relaxed text-ink/55">
          Stock and saved templates list here. Starting a meso from a template
          opens the planner board prefilled.
        </div>
      </div>
    </div>
  );
}

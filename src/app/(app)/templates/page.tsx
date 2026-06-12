import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <h1 className="title-display text-4xl">templates</h1>
      </header>
      <div className="border border-dashed border-ink/40 p-5">
        <p className="text-sm text-ink/55">
          Stock and saved templates appear here. Starting a meso from a
          template lands with cycle planning.
        </p>
      </div>
    </div>
  );
}

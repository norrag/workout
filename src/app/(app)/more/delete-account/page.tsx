import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountForm } from "./DeleteAccountForm";

/** Account-deletion danger zone (07 Phase 7, data lifecycle). */
export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <div>
      <Link
        href="/more"
        className="text-[10px] font-bold tracking-[0.14em] text-ink-muted"
      >
        ‹ MORE
      </Link>
      <h1 className="title-display mt-4 text-[32px]">delete account</h1>

      <div className="mt-4 border-[1.5px] border-ink p-4 text-sm leading-relaxed">
        <p>
          This permanently deletes your account and{" "}
          <span className="font-bold">all</span> of your training data —
          macrocycles, mesocycles, logged workouts, exercises, notes, and
          feedback. It cannot be undone.
        </p>
        <p className="mt-3 text-[11px] font-medium tracking-[0.04em] text-ink-muted">
          WANT A COPY FIRST? EXPORT YOUR DATA AS CSV FROM THE MORE TAB BEFORE
          DELETING.
        </p>
      </div>

      <DeleteAccountForm />
    </div>
  );
}

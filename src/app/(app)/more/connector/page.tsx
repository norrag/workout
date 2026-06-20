import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CopyField } from "./CopyField";
import { resolveOrigin } from "./endpoint";

/**
 * AI connector detail (off the More tab, fig 4.4 row). Surfaces the MCP
 * endpoint and how to connect an LLM client. No specific mockup exists for this
 * detail screen — built in the house ledger style (deviation recorded in
 * PROGRESS). Identity is fixed to the signed-in user (05 §Auth); a client
 * connects via the standard MCP OAuth handshake against Supabase.
 */
export default async function ConnectorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const origin = resolveOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const endpoint = `${origin}/api/mcp`;

  return (
    <div>
      <Link
        href="/more"
        className="text-[10px] font-semibold tracking-[0.12em] text-ink/55"
      >
        ‹ MORE
      </Link>
      <div className="logotype mt-3 text-[13px] font-semibold">workout</div>
      <h1 className="title-display mt-3 text-[32px]">ai connector</h1>

      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink/80">
        Connect an AI client (such as Claude) to analyze your training and draft
        plans grounded in your real data. The connector reads your cycles,
        history, and progress, and can draft mesocycles and templates for you to
        review in the app. It only ever sees your own data, and it never deletes
        logged history.
      </p>

      <div className="mt-7 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        ENDPOINT
      </div>
      <p className="mt-3 mb-2 text-[10px] font-medium tracking-[0.08em] text-ink/55">
        ADD THIS AS A CUSTOM / REMOTE MCP CONNECTOR
      </p>
      <CopyField value={endpoint} />

      <div className="mt-7 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        HOW TO CONNECT
      </div>
      <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink/80">
        <li>
          <span className="font-semibold">1 ·</span> In your AI client, add a
          custom connector and paste the endpoint above.
        </li>
        <li>
          <span className="font-semibold">2 ·</span> You will be sent to sign in
          to WORKOUT and authorize access. Approve the connection.
        </li>
        <li>
          <span className="font-semibold">3 ·</span> Ask the model about your
          training — start with your current mesocycle or a recent lift.
        </li>
      </ol>

      <div className="mt-7 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        ACCESS &amp; REVOCATION
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink/80">
        Access is granted per AI client through a standard authorization
        handshake, scoped to your account alone. To revoke a connection, remove
        the WORKOUT connector from the AI client, or revoke its authorization
        from your account&apos;s connected apps.
      </p>
    </div>
  );
}

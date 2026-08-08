import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";
import { CopyField } from "./CopyField";
import { MANUAL_HOME, RULES_HREF } from "./manual-links";
import { resolveOrigin } from "./endpoint";

/**
 * AI connector (off the More tab, fig 4.4 row) — reworked into the AI Manual's
 * front door by doc 22 Phase 6e (09-changelog 2026-08-13 §3).
 *
 * No mockup exists for this detail screen; it is composed from patterns the app
 * ships and the composition is written down in the changelog before it is
 * transcribed (the deviation the Phase-1 build already recorded).
 *
 * What stays is what a reader opens this page for: the address and the three
 * connect steps, including the `MCP` label they must find in their own client
 * (doc 22 §8.5's one allowance). What changes is that the page stops trying to
 * be a short manual of its own — the `ACCESS & REVOCATION` paragraph was ch. 2
 * and ch. 3 said briefly and without their depth, so it becomes one line and a
 * pointer (§8.4c rule 1: point, do not explain).
 *
 * The manual row is gated with the manual's release; the endpoint and the
 * steps are not, so a connector user loses nothing before 1.1.0 ships.
 *
 * **The two manual destinations are literal strings** in `manual-links.ts`,
 * outside this file because a route module may only export what Next reserves.
 * The reason they are literals at all is doc 22 D3 guard 1 — see that module.
 */
export default async function ConnectorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const origin = resolveOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const endpoint = `${origin}/api/mcp`;
  const manualLive = releaseActive(UNRELEASED_VERSION);

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

      {/* `22d` §7 K3 — the old copy stopped at mesocycles and templates, which
          has been understated since Batch 32 */}
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink/80">
        Connect an AI client (such as Claude) to analyze your training and draft
        plans grounded in your real data. It reads your cycles, history, and
        progress, and can draft macrocycles, blocks, and templates — and reshape
        a block you are already running — for you to review in the app. It only
        ever sees your own data, and it never deletes logged history.
      </p>

      {manualLive && (
        <Link
          href={MANUAL_HOME}
          className="mt-5 flex items-center justify-between border-[1.5px] border-ink px-4 py-3.5"
        >
          <span className="text-sm font-semibold">AI manual</span>
          <span className="label-caps text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
            Read ›
          </span>
        </Link>
      )}

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
        Access is granted per AI client, scoped to your account alone. To revoke
        a connection, remove the WORKOUT connector from the AI client, or revoke
        its authorization from your account&apos;s connected apps.
      </p>
      {manualLive && (
        <Link
          href={`${RULES_HREF}?from=%2Fmore%2Fconnector`}
          className="label-caps mt-3 inline-block text-[9.5px] font-semibold tracking-[0.1em] text-ink/55"
        >
          What a connected client can do ›
        </Link>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { releaseActive } from "@/lib/version";
import { GuideLink } from "@/components/ui/GuideLink";
import { GUIDE_LINKS } from "@/lib/guide-links";
import { CopyField } from "./CopyField";
import { MANUAL_HOME } from "./manual-links";
import { resolveConnectorOrigin } from "./endpoint";

/**
 * AI connector (off the More tab, fig 4.4 row). Setup stays here; the deeper
 * explanation now lives in chapter 18 of the main Guide.
 *
 * No mockup exists for this detail screen; it is composed from patterns the app
 * ships and the composition is written down in the changelog before it is
 * transcribed (the deviation the Phase-1 build already recorded).
 *
 * The reader opens this page for the address and the three connection steps,
 * including the `MCP` label they must find in their own client. The bordered
 * Guide row uses the existing navigation pattern and makes the larger value of
 * the connector visible before setup begins.
 *
 * The manual row is gated with the manual's release; the endpoint and the
 * steps are not, so a connector user loses nothing before 1.1.0 ships.
 *
 * **Manual destinations are literal strings** — the chapter row's in
 * `manual-links.ts` (outside this file because a route module may only export
 * what Next reserves), the section-level hand-off's in `src/lib/guide-links.ts`
 * with the rest of doc 22 Phase 7's placements. The reason they are literals at
 * all is doc 22 D3 guard 1 — see either module.
 */
export default async function ConnectorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const origin = resolveConnectorOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const endpoint = `${origin}/api/mcp`;
  const manualLive = releaseActive("1.1.0");

  return (
    <div>
      <Link
        href="/more"
        className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted"
      >
        ‹ MORE
      </Link>
      <div className="logotype mt-3 text-[13px] font-semibold">workout</div>
      <h1 className="title-display mt-3 text-[32px]">ai connector</h1>

      {/* `22d` §7 K3 — the old copy stopped at mesocycles and templates, which
          has been understated since Batch 32 */}
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink/80">
        Connect Claude or ChatGPT to your profile, cycles, and training history.
        A connected assistant can analyze progress across months of work,
        explain the program&apos;s decisions, draft macrocycles and blocks, and
        reshape a plan you are already running — all from the context in your
        account and with you in control of how you train.
      </p>

      {manualLive && (
        <Link
          href={MANUAL_HOME}
          className="mt-5 flex items-center justify-between border-[1.5px] border-ink px-4 py-3.5"
        >
          <span>
            <span className="block text-sm font-semibold">
              Explore training with AI
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
              Analysis, planning, coaching, and control
            </span>
          </span>
          <span className="label-caps text-[9.5px] font-semibold tracking-[0.1em] text-ink-muted">
            Read ›
          </span>
        </Link>
      )}

      <div className="mt-7 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        ENDPOINT
      </div>
      <p className="mt-3 mb-2 text-[10px] font-medium tracking-[0.08em] text-ink-muted">
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
      {/* doc 22 Phase 7 — an adoption, not an addition. Phase 6e wrote this
          line by hand before the primitive existed; it now shares the component
          and the label contract, so its copy tracks the section title. */}
      <GuideLink
        className="mt-3"
        to={GUIDE_LINKS.connectorControl}
        from="/more/connector"
      />
    </div>
  );
}

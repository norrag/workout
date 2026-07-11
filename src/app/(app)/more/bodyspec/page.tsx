import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bodyspecClientId } from "@/lib/bodyspec/oauth";
import { getBodySpecConnection } from "@/lib/queries/external-connections";
import { getBodyScans } from "@/lib/queries/body-scans";
import { shortDateWithYear } from "@/lib/dates";
import { formatMeasuredLb } from "@/lib/units";
import { SyncNowForm } from "./SyncNowForm";
import { DisconnectPanel } from "./DisconnectPanel";

/**
 * BodySpec DEXA integration screen (doc 15 §5 Phase 1, doc 17 §6 / N34 Phase
 * 5a; 09-changelog 2026-07-11 §2 — house-style, no mockup figure exists).
 * Connect / sync / disconnect status plus the imported scan list. Verdicts,
 * trends, and profile-enrichment proposals are 5b — a single scan renders
 * only itself (doc 15 §6 guardrails need the LSC machinery first).
 */
export default async function BodySpecPage(props: {
  searchParams: Promise<{ connected?: string; imported?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [connection, scans] = await Promise.all([
    getBodySpecConnection(supabase, user.id),
    getBodyScans(supabase, user.id),
  ]);
  const configured = bodyspecClientId() !== null;

  const flash = flashLine(searchParams, connection?.last_sync_error ?? null);

  return (
    <div>
      <Link
        href="/more"
        className="text-[10px] font-semibold tracking-[0.12em] text-ink/55"
      >
        ‹ MORE
      </Link>
      <div className="logotype mt-3 text-[13px] font-semibold">workout</div>
      <h1 className="title-display mt-3 text-[32px]">bodyspec dexa</h1>

      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink/80">
        Connect your BodySpec account to import your DEXA scan history — lean
        mass, body fat, bone density, and visceral fat, measured. Scans inform
        your macrocycle targets and outcome verdicts; they never change a
        workout prescription.
      </p>

      {flash && (
        <div className="mt-4 border-[1.5px] border-ink p-3 text-sm leading-relaxed">
          {flash}
        </div>
      )}

      {!connection ? (
        configured ? (
          <a
            href="/api/integrations/bodyspec/connect"
            className="mt-6 block w-full border-[1.5px] border-ink py-3 text-center text-xs font-bold tracking-[0.12em]"
          >
            CONNECT BODYSPEC ACCOUNT
          </a>
        ) : (
          <div className="mt-6 border border-dashed border-ink/40 p-4 text-center text-[10px] font-semibold tracking-[0.12em] text-ink/55">
            NOT AVAILABLE IN THIS ENVIRONMENT
          </div>
        )
      ) : (
        <>
          <div className="mt-7 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
            CONNECTION
          </div>
          <Row label="STATUS">
            {connection.status === "connected" ? "CONNECTED" : "NEEDS RECONNECT"}
          </Row>
          {connection.provider_email && (
            <Row label="CONNECTED AS">{connection.provider_email}</Row>
          )}
          <Row label="LAST SYNCED">
            {connection.last_synced_at
              ? shortDateWithYear(connection.last_synced_at)
              : "—"}
          </Row>
          {connection.last_sync_error && (
            <p className="mt-3 text-sm leading-relaxed text-ink/80">
              {connection.last_sync_error}
            </p>
          )}
          {connection.status === "error" ? (
            <a
              href="/api/integrations/bodyspec/connect"
              className="mt-4 block w-full border-[1.5px] border-ink py-3 text-center text-xs font-bold tracking-[0.12em]"
            >
              RECONNECT
            </a>
          ) : (
            <SyncNowForm />
          )}
        </>
      )}

      {/* imported scans persist through a disconnect unless purged
          (doc 15 §2.3), so the list renders whenever scans exist */}
      {(connection || scans.length > 0) && (
        <>
          <div className="mt-7 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
            SCANS
          </div>
          {scans.length === 0 ? (
            <div className="mt-3 border border-dashed border-ink/40 p-4 text-center">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-ink/55">
                NO SCANS IMPORTED YET
              </div>
              <div className="mt-1 text-[9.5px] font-medium tracking-[0.1em] text-ink/45">
                SYNC AFTER YOUR APPOINTMENT — RESULTS APPEAR WITHIN A FEW DAYS
              </div>
            </div>
          ) : (
            <div>
              {scans.map((scan) => (
                <Link
                  key={scan.id}
                  href={`/more/bodyspec/${scan.id}`}
                  className="flex items-center justify-between border-b border-ink/15 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {shortDateWithYear(scan.scanned_at)}
                    </div>
                    {scan.scanner_model && (
                      <div className="mt-0.5 text-[9.5px] font-medium tracking-[0.1em] text-ink/55">
                        {scan.scanner_model.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {scan.body_fat_pct != null && (
                      <div className="text-right">
                        <div className="numeral text-sm">{scan.body_fat_pct}%</div>
                        <div className="text-[9px] font-medium tracking-[0.1em] text-ink/45">
                          BODY FAT
                        </div>
                      </div>
                    )}
                    {scan.lean_mass_lb != null && (
                      <div className="text-right">
                        <div className="numeral text-sm">
                          {formatMeasuredLb(Number(scan.lean_mass_lb))}
                        </div>
                        <div className="text-[9px] font-medium tracking-[0.1em] text-ink/45">
                          LEAN LB
                        </div>
                      </div>
                    )}
                    <div className="text-base text-ink/50">›</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {connection && <DisconnectPanel scanCount={scans.length} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-ink/15 py-3">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-ink/55">
        {label}
      </div>
      <div className="text-sm font-semibold">{children}</div>
    </div>
  );
}

/** One-shot outcome line for the ?connected / ?error redirect params. The
 *  §8.3 api_denied case gets its own copy — it is the one failure that needs
 *  a human follow-up (docs/deployment/manual-operations.md → BodySpec). */
function flashLine(
  params: { connected?: string; imported?: string; error?: string },
  lastSyncError: string | null,
): string | null {
  if (params.connected) {
    const n = Number(params.imported);
    if (Number.isFinite(n) && params.imported !== undefined) {
      return n > 0
        ? `Connected. Imported ${n} scan${n === 1 ? "" : "s"}.`
        : "Connected. No scans on the account yet — sync after your appointment.";
    }
    return lastSyncError
      ? "Connected, but the first import failed — try Sync now."
      : "Connected.";
  }
  switch (params.error) {
    case "denied":
      return "BodySpec authorization was declined. Nothing was connected.";
    case "state":
      return "The sign-in round trip didn't verify. Try connecting again.";
    case "exchange":
      return "BodySpec sign-in failed. Try connecting again.";
    case "api_denied":
      return "BodySpec accepted the sign-in but rejected the app's access token — this needs a configuration follow-up (see the deployment runbook).";
    case "not_configured":
      return "The BodySpec integration isn't configured for this environment.";
    default:
      return null;
  }
}

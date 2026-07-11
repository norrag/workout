import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBodyScan } from "@/lib/queries/body-scans";
import { shortDateWithYear } from "@/lib/dates";
import { formatHeight, formatMeasuredLb } from "@/lib/units";

/**
 * One scan, read as a ledger (09-changelog 2026-07-11 §3 — house-style; no
 * mockup figure exists). Deliberately NO deltas, trends, or verdicts here in
 * 5a: honest scan-to-scan comparison needs the LSC noise bands and
 * same-scanner flags that ship with `v_body_comp_history` in 5b (doc 15 §6).
 * A single scan renders only itself, stated flat.
 */
export default async function ScanDetailPage(props: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const scan = await getBodyScan(supabase, user.id, scanId);
  if (!scan) notFound();

  const percentiles = readPercentiles(scan.percentiles);
  const regions = readRegions(scan.regions);

  return (
    <div>
      <Link
        href="/more/bodyspec"
        className="text-[10px] font-semibold tracking-[0.12em] text-ink/55"
      >
        ‹ BODYSPEC
      </Link>
      <div className="logotype mt-3 text-[13px] font-semibold">workout</div>
      <h1 className="title-display mt-3 text-[32px]">
        {shortDateWithYear(scan.scanned_at).toLowerCase()}
      </h1>
      <div className="mt-1 text-[10px] font-medium tracking-[0.1em] text-ink/55">
        {[scan.scanner_model?.toUpperCase(), "DEXA · BODYSPEC"]
          .filter(Boolean)
          .join(" · ")}
      </div>

      <Section title="MEASURED AT SCAN">
        {scan.weight_lb != null && (
          <Row label="WEIGHT" value={`${formatMeasuredLb(Number(scan.weight_lb))} LB`} />
        )}
        {scan.height_in != null && (
          <Row label="HEIGHT" value={formatHeight(Number(scan.height_in)) ?? "—"} />
        )}
        {scan.age_years != null && (
          <Row label="AGE" value={`${Math.floor(Number(scan.age_years))}`} />
        )}
      </Section>

      <Section title="COMPOSITION">
        {scan.body_fat_pct != null && (
          <Row label="BODY FAT" value={`${scan.body_fat_pct}%`} />
        )}
        {scan.lean_mass_lb != null && (
          <Row label="LEAN MASS" value={`${formatMeasuredLb(Number(scan.lean_mass_lb))} LB`} />
        )}
        {scan.fat_mass_lb != null && (
          <Row label="FAT MASS" value={`${formatMeasuredLb(Number(scan.fat_mass_lb))} LB`} />
        )}
        {scan.bone_mass_lb != null && (
          <Row label="BONE MASS" value={`${formatMeasuredLb(Number(scan.bone_mass_lb))} LB`} />
        )}
        {scan.android_gynoid_ratio != null && (
          <Row label="ANDROID / GYNOID" value={String(scan.android_gynoid_ratio)} />
        )}
      </Section>

      {regions.length > 0 && (
        <Section title="REGIONS">
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-0">
            <div />
            <div className="pb-1 text-right text-[9px] font-semibold tracking-[0.1em] text-ink/45">
              LEAN LB
            </div>
            <div className="pb-1 text-right text-[9px] font-semibold tracking-[0.1em] text-ink/45">
              FAT LB
            </div>
            {regions.map((r) => (
              <RegionRow key={r.name} region={r} />
            ))}
          </div>
        </Section>
      )}

      {(scan.vat_mass_lb != null || scan.vat_volume_cm3 != null) && (
        <Section title="VISCERAL FAT">
          {scan.vat_mass_lb != null && (
            <Row label="MASS" value={`${formatMeasuredLb(Number(scan.vat_mass_lb))} LB`} />
          )}
          {scan.vat_volume_cm3 != null && (
            <Row label="VOLUME" value={`${scan.vat_volume_cm3} CM³`} />
          )}
        </Section>
      )}

      {scan.bmd_total_g_cm2 != null && (
        <Section title="BONE DENSITY">
          <Row label="TOTAL BMD" value={`${scan.bmd_total_g_cm2} G/CM²`} />
        </Section>
      )}

      {percentiles.length > 0 && (
        <Section title="PERCENTILES">
          {percentiles.map((p) => (
            <Row
              key={p.label}
              label={p.label}
              value={`${ordinal(p.percentile)} · ${p.value}`}
            />
          ))}
        </Section>
      )}

      {(scan.rmr_kcal_cunningham != null || scan.rmr_kcal_mifflin != null) && (
        <Section title="RESTING METABOLIC RATE">
          {scan.rmr_kcal_cunningham != null && (
            <Row
              label="CUNNINGHAM · MEASURED FROM LEAN MASS"
              value={`${scan.rmr_kcal_cunningham} KCAL/DAY`}
            />
          )}
          {scan.rmr_kcal_mifflin != null && (
            <Row
              label="MIFFLIN-ST. JEOR · HEIGHT-WEIGHT ESTIMATE"
              value={`${scan.rmr_kcal_mifflin} KCAL/DAY`}
            />
          )}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mt-7 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        {title}
      </div>
      {children}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink/15 py-2.5">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-ink/55">
        {label}
      </div>
      <div className="numeral text-sm">{value}</div>
    </div>
  );
}

/** Region display order + labels (the provider's region key vocabulary). */
const REGION_LABELS: [string, string][] = [
  ["left_arm", "LEFT ARM"],
  ["right_arm", "RIGHT ARM"],
  ["left_leg", "LEFT LEG"],
  ["right_leg", "RIGHT LEG"],
  ["trunk", "TRUNK"],
  ["android", "ANDROID"],
  ["gynoid", "GYNOID"],
];

interface RegionDisplay {
  name: string;
  leanLb: number | null;
  fatLb: number | null;
}

function RegionRow({ region }: { region: RegionDisplay }) {
  return (
    <>
      <div className="border-b border-ink/15 py-2 text-[10px] font-semibold tracking-[0.12em] text-ink/55">
        {region.name}
      </div>
      <div className="numeral border-b border-ink/15 py-2 text-right text-sm">
        {region.leanLb != null ? formatMeasuredLb(region.leanLb) : "—"}
      </div>
      <div className="numeral border-b border-ink/15 py-2 text-right text-sm">
        {region.fatLb != null ? formatMeasuredLb(region.fatLb) : "—"}
      </div>
    </>
  );
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRegions(regions: Record<string, unknown> | null): RegionDisplay[] {
  if (!regions) return [];
  const out: RegionDisplay[] = [];
  for (const [key, label] of REGION_LABELS) {
    const entry = regions[key];
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    out.push({
      name: label,
      leanLb: asNumber(r.lean_mass_lb),
      fatLb: asNumber(r.fat_mass_lb),
    });
  }
  return out;
}

/** Percentile metrics worth a ledger row, in display order. */
const PERCENTILE_LABELS: [string, string][] = [
  ["total_body_fat_pct", "BODY FAT %"],
  ["total_lmi_kg_m2", "LEAN MASS INDEX"],
  ["limb_lmi_kg_m2", "APPENDICULAR LMI"],
  ["vat_mass_kg", "VISCERAL FAT"],
  ["bone_density_g_cm2", "BONE DENSITY"],
];

function readPercentiles(
  stored: Record<string, unknown> | null,
): { label: string; value: number; percentile: number }[] {
  const metrics =
    stored && typeof stored.metrics === "object" && stored.metrics !== null
      ? (stored.metrics as Record<string, unknown>)
      : null;
  if (!metrics) return [];
  const out: { label: string; value: number; percentile: number }[] = [];
  for (const [key, label] of PERCENTILE_LABELS) {
    const entry = metrics[key];
    if (!entry || typeof entry !== "object") continue;
    const value = asNumber((entry as Record<string, unknown>).value);
    const percentile = asNumber((entry as Record<string, unknown>).percentile);
    if (value != null && percentile != null) out.push({ label, value, percentile });
  }
  return out;
}

function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  const suffix =
    rem100 >= 11 && rem100 <= 13
      ? "TH"
      : rem10 === 1
        ? "ST"
        : rem10 === 2
          ? "ND"
          : rem10 === 3
            ? "RD"
            : "TH";
  return `${n}${suffix}`;
}

import type { BodyScanRow } from "@/lib/types/database";
import type {
  BodySpecBodyRegion,
  BodySpecBoneDensity,
  BodySpecComposition,
  BodySpecPercentiles,
  BodySpecRmr,
  BodySpecScanInfo,
  BodySpecVisceralFat,
} from "./schemas";

/**
 * Pure conversion + mapping for BodySpec imports. The provider is metric
 * (kg / cm); WORKOUT is imperial-only (lb / in, migration 20260623120000).
 * Conversion happens HERE and only here (doc 15 §2.3) — no kg/cm value ever
 * lands in a canonical column. The verbatim metric payloads ride along in
 * `raw` for fidelity.
 */

const LB_PER_KG = 2.2046226218;
const IN_PER_CM = 1 / 2.54;

/** kg → lb at DEXA-relevant precision (2 dp ≈ 5 g — below any LSC band). */
export function kgToLb(kg: number): number {
  return Math.round(kg * LB_PER_KG * 100) / 100;
}

/** cm → in, 1 dp (heights display as ft′in″; storage keeps a decimal). */
export function cmToIn(cm: number): number {
  return Math.round(cm * IN_PER_CM * 10) / 10;
}

/** A composition region converted to app units (per-region jsonb shape). */
export function convertRegion(region: BodySpecBodyRegion): {
  lean_mass_lb: number;
  fat_mass_lb: number;
  bone_mass_lb: number;
  total_mass_lb: number;
  tissue_fat_pct: number;
  region_fat_pct: number;
} {
  return {
    lean_mass_lb: kgToLb(region.lean_mass_kg),
    fat_mass_lb: kgToLb(region.fat_mass_kg),
    bone_mass_lb: kgToLb(region.bone_mass_kg),
    total_mass_lb: kgToLb(region.total_mass_kg),
    tissue_fat_pct: region.tissue_fat_pct,
    region_fat_pct: region.region_fat_pct,
  };
}

/** The validated sections available for one scan result. Composition is the
 *  core payload (required to import); the rest degrade to null columns. */
export interface ScanSections {
  scanInfo: BodySpecScanInfo | null;
  composition: BodySpecComposition;
  boneDensity: BodySpecBoneDensity | null;
  percentiles: BodySpecPercentiles | null;
  visceralFat: BodySpecVisceralFat | null;
  rmr: BodySpecRmr | null;
}

/** Everything the DB row needs except identity (id/user_id/timestamps) and
 *  the 5b proposal-resolution stamps — those belong to the user's later
 *  decision, never to an import (and an upsert re-sync must not reset them). */
export type BodyScanImport = Omit<
  BodyScanRow,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "profile_applied_at"
  | "profile_dismissed_at"
>;

function rmrByFormula(
  rmr: BodySpecRmr | null,
  match: string,
): number | null {
  const hit = rmr?.estimates.find((e) =>
    e.formula.toLowerCase().includes(match),
  );
  return hit ? Math.round(hit.kcal_per_day) : null;
}

/**
 * Pure fold: validated sections → the canonical `body_scans` row shape
 * (doc 15 §2.2). `raw` is the caller's verbatim (unvalidated) payload map so
 * fidelity never depends on what these schemas kept.
 */
export function mapScanToImport(input: {
  providerResultId: string;
  /** result start_time — the fallback when scan-info is unavailable */
  startTime: string;
  sections: ScanSections;
  raw: Record<string, unknown>;
}): BodyScanImport {
  const { scanInfo, composition, boneDensity, percentiles, visceralFat, rmr } =
    input.sections;
  const total = composition.total;
  const regions: Record<string, unknown> = {};
  for (const [name, region] of Object.entries(composition.regions)) {
    regions[name] = convertRegion(region);
  }
  return {
    provider: "bodyspec",
    provider_result_id: input.providerResultId,
    scanned_at: scanInfo?.acquire_time ?? input.startTime,
    scanner_model: scanInfo?.scanner_model ?? null,
    weight_lb: scanInfo ? kgToLb(scanInfo.patient_intake.weight_kg) : null,
    height_in: scanInfo ? cmToIn(scanInfo.patient_intake.height_cm) : null,
    age_years: scanInfo?.patient_intake.age_years ?? null,
    body_fat_pct: total.tissue_fat_pct,
    lean_mass_lb: kgToLb(total.lean_mass_kg),
    fat_mass_lb: kgToLb(total.fat_mass_kg),
    bone_mass_lb: kgToLb(total.bone_mass_kg),
    vat_mass_lb: visceralFat ? kgToLb(visceralFat.vat_mass_kg) : null,
    vat_volume_cm3: visceralFat?.vat_volume_cm3 ?? null,
    android_gynoid_ratio: composition.android_gynoid_ratio ?? null,
    lmi_kg_m2: percentiles?.metrics["total_lmi_kg_m2"]?.value ?? null,
    almi_kg_m2: percentiles?.metrics["limb_lmi_kg_m2"]?.value ?? null,
    bmd_total_g_cm2: boneDensity?.total.bone_mineral_density ?? null,
    rmr_kcal_cunningham: rmrByFormula(rmr, "cunningham"),
    rmr_kcal_mifflin: rmrByFormula(rmr, "mifflin"),
    regions,
    percentiles: percentiles
      ? { params: percentiles.params ?? null, metrics: percentiles.metrics }
      : null,
    raw: input.raw,
  };
}

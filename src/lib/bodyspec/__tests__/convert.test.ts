import { describe, expect, it } from "vitest";
import {
  cmToIn,
  convertRegion,
  kgToLb,
  mapScanToImport,
  type ScanSections,
} from "../convert";
import {
  compositionSchema,
  percentilesSchema,
  resultsListSchema,
  rmrSchema,
  scanInfoSchema,
  tokenSetSchema,
  visceralFatSchema,
} from "../schemas";

/** A full section set shaped like the provider's openapi.json v0.14.3
 *  examples — the import-golden fixture (doc 15 §1.3). */
function fullSections(): ScanSections {
  return {
    scanInfo: scanInfoSchema.parse({
      scanner_model: "GE Lunar iDXA",
      acquire_time: "2026-07-08T10:15:00-07:00",
      patient_intake: { age_years: 38.4, height_cm: 180, weight_kg: 83.7 },
    }),
    composition: compositionSchema.parse({
      total: {
        fat_mass_kg: 20.5,
        lean_mass_kg: 60.0,
        bone_mass_kg: 3.2,
        total_mass_kg: 83.7,
        tissue_fat_pct: 25.5,
        region_fat_pct: 24.5,
      },
      regions: {
        left_arm: {
          fat_mass_kg: 1.14,
          lean_mass_kg: 2.04,
          bone_mass_kg: 0.13,
          total_mass_kg: 3.31,
          tissue_fat_pct: 35.92,
          region_fat_pct: 34.5,
        },
        trunk: {
          fat_mass_kg: 7.22,
          lean_mass_kg: 17.32,
          bone_mass_kg: 0.57,
          total_mass_kg: 25.11,
          tissue_fat_pct: 29.42,
          region_fat_pct: 28.75,
        },
      },
      android_gynoid_ratio: 0.91,
    }),
    boneDensity: { total: { bone_mineral_density: 1.25 } },
    percentiles: percentilesSchema.parse({
      params: {
        gender: "male",
        reference_age_range: { min_years: 35, max_years: 45 },
        reference_dataset_size: 12000,
      },
      metrics: {
        total_body_fat_pct: { value: 25.5, percentile: 45 },
        total_lmi_kg_m2: { value: 22.5, percentile: 68 },
        limb_lmi_kg_m2: { value: 8.5, percentile: 85 },
        vat_mass_kg: { value: 2.8, percentile: 72 },
        bone_density_g_cm2: { value: 1.25, percentile: 82 },
      },
    }),
    visceralFat: visceralFatSchema.parse({
      vat_mass_kg: 2.8,
      vat_volume_cm3: 2966,
    }),
    rmr: rmrSchema.parse({
      estimates: [
        { formula: "ten Haaf (2014)", kcal_per_day: 1850 },
        { formula: "Cunningham (1980)", kcal_per_day: 1798 },
        { formula: "De Lorenzo (1999)", kcal_per_day: 1920 },
        { formula: "Mifflin-St. Jeor (1990)", kcal_per_day: 1780 },
      ],
    }),
  };
}

describe("unit conversion (the import boundary — doc 15 §2.3)", () => {
  it("converts kg→lb at 2dp and cm→in at 1dp", () => {
    expect(kgToLb(60)).toBe(132.28);
    expect(kgToLb(83.7)).toBe(184.53);
    expect(kgToLb(0.04)).toBe(0.09);
    expect(cmToIn(180)).toBe(70.9);
    expect(cmToIn(2.54)).toBe(1);
  });

  it("converts a composition region wholesale, percentages untouched", () => {
    const converted = convertRegion({
      fat_mass_kg: 1.14,
      lean_mass_kg: 2.04,
      bone_mass_kg: 0.13,
      total_mass_kg: 3.31,
      tissue_fat_pct: 35.92,
      region_fat_pct: 34.5,
    });
    expect(converted).toEqual({
      fat_mass_lb: 2.51,
      lean_mass_lb: 4.5,
      bone_mass_lb: 0.29,
      total_mass_lb: 7.3,
      tissue_fat_pct: 35.92,
      region_fat_pct: 34.5,
    });
  });
});

describe("mapScanToImport (sections → canonical body_scans row)", () => {
  it("maps a full DEXA result — golden", () => {
    const row = mapScanToImport({
      providerResultId: "res-123",
      startTime: "2026-07-08T10:00:00-07:00",
      sections: fullSections(),
      raw: { composition: { marker: true } },
    });
    expect(row).toMatchObject({
      provider: "bodyspec",
      provider_result_id: "res-123",
      // scan-info's acquire_time wins over the result start_time
      scanned_at: "2026-07-08T10:15:00-07:00",
      scanner_model: "GE Lunar iDXA",
      weight_lb: 184.53,
      height_in: 70.9,
      age_years: 38.4,
      body_fat_pct: 25.5,
      lean_mass_lb: 132.28,
      fat_mass_lb: 45.19,
      bone_mass_lb: 7.05,
      vat_mass_lb: 6.17,
      vat_volume_cm3: 2966,
      android_gynoid_ratio: 0.91,
      lmi_kg_m2: 22.5,
      almi_kg_m2: 8.5,
      bmd_total_g_cm2: 1.25,
      rmr_kcal_cunningham: 1798,
      rmr_kcal_mifflin: 1780,
      raw: { composition: { marker: true } },
    });
    // regions converted to lb, keyed by the provider vocabulary
    expect(row.regions).toMatchObject({
      left_arm: { lean_mass_lb: 4.5, fat_mass_lb: 2.51 },
      trunk: { lean_mass_lb: 38.18, fat_mass_lb: 15.92 },
    });
    // percentiles stored with params + metrics
    expect(row.percentiles).toMatchObject({
      metrics: { limb_lmi_kg_m2: { value: 8.5, percentile: 85 } },
    });
  });

  it("degrades to nulls when only composition exists (minimum importable scan)", () => {
    const sections = fullSections();
    const row = mapScanToImport({
      providerResultId: "res-min",
      startTime: "2026-01-02T09:00:00-08:00",
      sections: {
        scanInfo: null,
        composition: sections.composition,
        boneDensity: null,
        percentiles: null,
        visceralFat: null,
        rmr: null,
      },
      raw: {},
    });
    // no scan-info ⇒ the result start_time is the scan time
    expect(row.scanned_at).toBe("2026-01-02T09:00:00-08:00");
    expect(row.scanner_model).toBeNull();
    expect(row.weight_lb).toBeNull();
    expect(row.height_in).toBeNull();
    expect(row.age_years).toBeNull();
    expect(row.vat_mass_lb).toBeNull();
    expect(row.lmi_kg_m2).toBeNull();
    expect(row.almi_kg_m2).toBeNull();
    expect(row.bmd_total_g_cm2).toBeNull();
    expect(row.rmr_kcal_cunningham).toBeNull();
    expect(row.rmr_kcal_mifflin).toBeNull();
    expect(row.percentiles).toBeNull();
    // the core payload still lands
    expect(row.body_fat_pct).toBe(25.5);
    expect(row.lean_mass_lb).toBe(132.28);
  });

  it("matches RMR formulas by name, order-independent", () => {
    const sections = fullSections();
    sections.rmr = rmrSchema.parse({
      estimates: [
        { formula: "Mifflin-St. Jeor (1990)", kcal_per_day: 1700 },
        { formula: "CUNNINGHAM (1980)", kcal_per_day: 1801 },
      ],
    });
    const row = mapScanToImport({
      providerResultId: "r",
      startTime: "2026-01-01T00:00:00Z",
      sections,
      raw: {},
    });
    expect(row.rmr_kcal_cunningham).toBe(1801);
    expect(row.rmr_kcal_mifflin).toBe(1700);
  });
});

describe("boundary schemas (hard rule 6 leniency posture)", () => {
  it("accepts a Keycloak token response and tolerates extra fields", () => {
    const parsed = tokenSetSchema.parse({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 300,
      token_type: "Bearer",
      scope: "openid profile email offline_access",
      "not-before-policy": 0,
      session_state: "abc",
    });
    expect(parsed.access_token).toBe("at");
    expect(parsed.refresh_token).toBe("rt");
  });

  it("rejects a token response without an access token", () => {
    expect(() => tokenSetSchema.parse({ token_type: "Bearer" })).toThrow();
  });

  it("parses the results list and pagination", () => {
    const parsed = resultsListSchema.parse({
      results: [
        {
          result_id: "res-1",
          start_time: "2026-07-08T10:00:00-07:00",
          location: { name: "SF" },
          service: { name: "DEXA" },
          create_time: "x",
          update_time: "y",
        },
      ],
      pagination: { page: 1, page_size: 100, results: 1, has_more: false },
    });
    expect(parsed.results[0].result_id).toBe("res-1");
    expect(parsed.pagination.has_more).toBe(false);
  });

  it("composition requires the total block but tolerates unknown regions", () => {
    expect(() =>
      compositionSchema.parse({ regions: {}, android_gynoid_ratio: null }),
    ).toThrow();
    const region = {
      fat_mass_kg: 1,
      lean_mass_kg: 2,
      bone_mass_kg: 0.1,
      total_mass_kg: 3.1,
      tissue_fat_pct: 30,
      region_fat_pct: 29,
    };
    const parsed = compositionSchema.parse({
      total: region,
      regions: { some_future_region: region },
    });
    expect(Object.keys(parsed.regions)).toEqual(["some_future_region"]);
    expect(parsed.android_gynoid_ratio).toBeUndefined();
  });
});

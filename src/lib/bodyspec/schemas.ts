import { z } from "zod";

/**
 * Zod schemas for the BodySpec API responses we consume (hard rule 6 —
 * validate every boundary). Shapes transcribed from `openapi.json` v0.14.3
 * (re-fetched 2026-07-11, unchanged since the doc 15 assessment).
 *
 * Leniency posture for an early-access API: fields we MAP are required;
 * fields we merely pass through are optional/nullish, so a provider tweak to
 * something we don't read never fails an import. The verbatim payloads are
 * stored in `body_scans.raw` regardless, so anything dropped here is
 * re-mappable later (doc 15 §2.2).
 */

/** OAuth token endpoint response (RFC 6749 §5.1; Keycloak). */
export const tokenSetSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});
export type BodySpecTokenSet = z.infer<typeof tokenSetSchema>;

/** GET /api/v1/users/me — also the §8.3 first-login verification probe. */
export const userSchema = z.object({
  user_id: z.string(),
  email: z.string(),
});
export type BodySpecUser = z.infer<typeof userSchema>;

/** One entry of GET /users/me/results/ — we only read id + time here. */
export const resultSummarySchema = z.object({
  result_id: z.string(),
  /** result date/time in the scan location's timezone */
  start_time: z.string(),
});
export type BodySpecResultSummary = z.infer<typeof resultSummarySchema>;

export const resultsListSchema = z.object({
  results: z.array(resultSummarySchema),
  pagination: z.object({
    page: z.number(),
    has_more: z.boolean(),
  }),
});

/** GET /users/me/results/{id} — the section names gate which DEXA
 *  sub-resources exist for this result. */
export const resultDetailSchema = z.object({
  result_id: z.string(),
  start_time: z.string(),
  sections: z.array(z.string()),
});
export type BodySpecResultDetail = z.infer<typeof resultDetailSchema>;

/** Per-region composition block (metric — converted at the import boundary). */
export const bodyRegionSchema = z.object({
  fat_mass_kg: z.number(),
  lean_mass_kg: z.number(),
  bone_mass_kg: z.number(),
  total_mass_kg: z.number(),
  /** fat % of soft tissue (excludes bone) — the app's body-fat notion */
  tissue_fat_pct: z.number(),
  /** fat % of the whole region (includes bone) */
  region_fat_pct: z.number(),
});
export type BodySpecBodyRegion = z.infer<typeof bodyRegionSchema>;

export const scanInfoSchema = z.object({
  scanner_model: z.string(),
  acquire_time: z.string(),
  patient_intake: z.object({
    age_years: z.number(),
    height_cm: z.number(),
    weight_kg: z.number(),
  }),
});
export type BodySpecScanInfo = z.infer<typeof scanInfoSchema>;

export const compositionSchema = z.object({
  total: bodyRegionSchema,
  regions: z.record(z.string(), bodyRegionSchema),
  android_gynoid_ratio: z.number().nullish(),
});
export type BodySpecComposition = z.infer<typeof compositionSchema>;

/** Only the total BMD is mapped to a column; regions stay in `raw`. */
export const boneDensitySchema = z.object({
  total: z.object({ bone_mineral_density: z.number() }),
});
export type BodySpecBoneDensity = z.infer<typeof boneDensitySchema>;

export const percentileMetricSchema = z.object({
  value: z.number(),
  percentile: z.number(),
});

export const percentilesSchema = z.object({
  params: z
    .object({
      gender: z.string().optional(),
      reference_age_range: z.record(z.string(), z.number()).optional(),
      reference_dataset_size: z.number().optional(),
    })
    .optional(),
  metrics: z.record(z.string(), percentileMetricSchema),
});
export type BodySpecPercentiles = z.infer<typeof percentilesSchema>;

export const visceralFatSchema = z.object({
  vat_mass_kg: z.number(),
  vat_volume_cm3: z.number(),
});
export type BodySpecVisceralFat = z.infer<typeof visceralFatSchema>;

export const rmrSchema = z.object({
  estimates: z.array(
    z.object({
      formula: z.string(),
      kcal_per_day: z.number(),
    }),
  ),
});
export type BodySpecRmr = z.infer<typeof rmrSchema>;

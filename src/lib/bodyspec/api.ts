import "server-only";
import type { z } from "zod";
import { BODYSPEC_API_BASE } from "./oauth";
import {
  boneDensitySchema,
  compositionSchema,
  percentilesSchema,
  resultDetailSchema,
  resultsListSchema,
  rmrSchema,
  scanInfoSchema,
  userSchema,
  visceralFatSchema,
  type BodySpecResultDetail,
  type BodySpecResultSummary,
  type BodySpecUser,
} from "./schemas";
import type { ScanSections } from "./convert";

/**
 * Read-only fetchers over the BodySpec user-tier API (doc 15 §1.2). All
 * requests are SERIAL and identity-from-token — no user id ever travels as an
 * argument (the provider's `/users/me/*` surface matches our own MCP rule).
 * Rate limits are undocumented; a single user syncing a few scans a year is
 * the whole load (doc 15 §8.3), so politeness = serial requests, no retries.
 */

export class BodySpecApiError extends Error {
  readonly status: number;
  constructor(path: string, status: number) {
    super(`BodySpec API ${path}: HTTP ${status}`);
    this.name = "BodySpecApiError";
    this.status = status;
  }
}

async function apiGet<T>(
  path: string,
  accessToken: string,
  schema: z.ZodType<T>,
): Promise<{ parsed: T; raw: unknown }> {
  const res = await fetch(`${BODYSPEC_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new BodySpecApiError(path, res.status);
  const raw: unknown = await res.json();
  return { parsed: schema.parse(raw), raw };
}

/** GET /users/me — doubles as the doc 15 §8.3 first-login verification: if
 *  the self-registered client's token is rejected here (401/403 — e.g. an
 *  undocumented `ext_api_token` audience requirement), the connect flow
 *  surfaces it instead of half-connecting. */
export async function fetchMe(accessToken: string): Promise<BodySpecUser> {
  const { parsed } = await apiGet("/api/v1/users/me", accessToken, userSchema);
  return parsed;
}

const PAGE_SIZE = 100;
/** 1000 results — far beyond any real scan history; a runaway-pagination stop. */
const MAX_PAGES = 10;

/** The account's full result history, newest data included (first sync =
 *  full backfill, doc 15 §2.3). */
export async function listAllResults(
  accessToken: string,
): Promise<BodySpecResultSummary[]> {
  const all: BodySpecResultSummary[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { parsed } = await apiGet(
      `/api/v1/users/me/results/?page=${page}&page_size=${PAGE_SIZE}`,
      accessToken,
      resultsListSchema,
    );
    all.push(...parsed.results);
    if (!parsed.pagination.has_more) break;
  }
  return all;
}

export async function fetchResultDetail(
  accessToken: string,
  resultId: string,
): Promise<BodySpecResultDetail> {
  const { parsed } = await apiGet(
    `/api/v1/users/me/results/${encodeURIComponent(resultId)}`,
    accessToken,
    resultDetailSchema,
  );
  return parsed;
}

/** The DEXA sections we import, keyed by their section name (the detail's
 *  `sections` entries, tolerating a `dexa/` prefix). */
const DEXA_SECTIONS = [
  "scan-info",
  "composition",
  "bone-density",
  "percentiles",
  "visceral-fat",
  "rmr",
] as const;
type DexaSection = (typeof DEXA_SECTIONS)[number];

function availableSections(detail: BodySpecResultDetail): Set<DexaSection> {
  const names = new Set(
    detail.sections.map((s) => s.replace(/^dexa\//, "").trim()),
  );
  return new Set(DEXA_SECTIONS.filter((s) => names.has(s)));
}

/**
 * Fetch + validate every available DEXA section for one result, serially.
 * Returns null when the result carries no composition section (not a DEXA
 * body-comp scan — e.g. an RMR-only service). `raw` collects the verbatim
 * payloads per section for `body_scans.raw`.
 */
export async function fetchScanSections(
  accessToken: string,
  detail: BodySpecResultDetail,
): Promise<{ sections: ScanSections; raw: Record<string, unknown> } | null> {
  const available = availableSections(detail);
  if (!available.has("composition")) return null;

  const raw: Record<string, unknown> = {};
  async function section<T>(
    name: DexaSection,
    schema: z.ZodType<T>,
  ): Promise<T | null> {
    if (!available.has(name)) return null;
    const { parsed, raw: payload } = await apiGet(
      `/api/v1/users/me/results/${encodeURIComponent(detail.result_id)}/dexa/${name}`,
      accessToken,
      schema,
    );
    raw[name] = payload;
    return parsed;
  }

  const composition = await section("composition", compositionSchema);
  if (!composition) return null;
  const sections: ScanSections = {
    composition,
    scanInfo: await section("scan-info", scanInfoSchema),
    boneDensity: await section("bone-density", boneDensitySchema),
    percentiles: await section("percentiles", percentilesSchema),
    visceralFat: await section("visceral-fat", visceralFatSchema),
    rmr: await section("rmr", rmrSchema),
  };
  return { sections, raw };
}

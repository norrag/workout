import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  knownSectionIds,
  searchSections,
  sectionPayload,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
} from "@/content/manual/retrieval";
import { parseSectionId } from "@/content/manual";
import { releaseActive } from "@/lib/version";
import { toolResult } from "../envelope";

/**
 * doc 22 Phase 5 — the connector's half of the manual (doc 22 §10.2).
 *
 * Two tools over the same build-time index that backs the in-app search screen,
 * plus the `workout://user-guide-index` resource in `resources.ts`. Retrieve,
 * then read: `search_manual` returns pointers, `get_manual_section` returns one
 * section's text. Neither takes a user ID and neither reads user data — the
 * manual is identical for every reader, which is why these are the only tools
 * on the surface that resolve no session at all.
 *
 * **They are gated on the release that ships the manual** ([`22b`](../../../../docs/22b-source-map.md)
 * §10, doc 23 §9.2). The guide routes are behind `releaseActive("1.1.0")`, so a
 * connector that could search it today would be answering out of a manual the
 * user cannot open — every `app_route` these tools return would 404. The gate
 * is applied at the registration call site (`tools/index.ts`), so before the
 * release the tools are not merely refused, they are not listed.
 */

export const SEARCH_MANUAL = "search_manual";
export const GET_MANUAL_SECTION = "get_manual_section";

/** Registered names, for the inventory tests and the doc-22d count. */
export const MANUAL_TOOL_NAMES: ReadonlySet<string> = new Set([
  SEARCH_MANUAL,
  GET_MANUAL_SECTION,
]);

/** doc 23 §9.2 — whether the manual (and therefore its retrieval surface) is live. */
export function manualRetrievalActive(): boolean {
  return releaseActive("1.1.0");
}

/**
 * How many known IDs to offer back when one does not resolve. Enough to be a
 * useful correction, short enough that a typo does not dump the whole map into
 * the model's context — the map has its own resource for that.
 */
const SUGGESTION_LIMIT = 5;

/**
 * A near-miss suggestion for an unresolvable ID: same chapter first, then any
 * ID sharing a word with what was asked for. Cheap string work over ~100 IDs.
 */
export function suggestSectionIds(id: string): string[] {
  const known = knownSectionIds();
  const parsed = parseSectionId(id);
  const sameChapter = parsed
    ? known.filter((k) => k.startsWith(`${parsed.manual}/${parsed.chapter}#`))
    : [];
  if (sameChapter.length > 0) return sameChapter.slice(0, SUGGESTION_LIMIT);
  const words = id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  return known
    .filter((k) => words.some((w) => k.toLowerCase().includes(w)))
    .slice(0, SUGGESTION_LIMIT);
}

export function registerManualTools(server: McpServer) {
  server.registerTool(
    SEARCH_MANUAL,
    {
      title: "Search the user guide",
      description:
        "Search the app's built-in user guide and return ranked pointers to " +
        "the sections that answer a question — each with its ID, chapter, " +
        "one-line summary, a snippet, and the in-app route the user can open. " +
        "Use it to ground an explanation of how the app works, what a term " +
        "means, or why a number moved, then call get_manual_section to read " +
        "the section itself. The guide explains the app; it never reports this " +
        "user's data — use the data tools for that. Searches titles, authored " +
        "keywords, glossary terms and body text, so plain wording works " +
        "(\"why did my weight go up\"). If nothing matches, read the " +
        "workout://user-guide-index resource and pick from the map.",
      inputSchema: {
        query: z
          .string()
          .min(2)
          .max(200)
          .describe("What to look for, in the user's own words."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(SEARCH_LIMIT_MAX)
          .optional()
          .describe(`How many sections to return (default ${SEARCH_LIMIT_DEFAULT}).`),
      },
    },
    async (args: { query: string; limit?: number }) => {
      const results = searchSections(args.query, args.limit ?? SEARCH_LIMIT_DEFAULT);
      return toolResult({
        query: args.query,
        count: results.length,
        results,
        ...(results.length === 0
          ? {
              hint:
                "No section matched. The workout://user-guide-index resource " +
                "lists every chapter and section — browse it rather than " +
                "guessing what the guide covers.",
            }
          : {}),
      });
    },
  );

  server.registerTool(
    GET_MANUAL_SECTION,
    {
      title: "Read a user-guide section",
      description:
        "Read one section of the app's built-in user guide as markdown, by " +
        "the section ID search_manual or workout://user-guide-index returns " +
        "(for example ug/effort-rir#what-rir-means). Returns the section's " +
        "full text, its in-app route, and — unless you turn them off — the " +
        "sections the author linked it to plus the ones either side of it in " +
        "reading order. This is the app's own explanation of itself: prefer " +
        "quoting or paraphrasing it over describing the app from memory, and " +
        "keep any estimate caveat it carries.",
      inputSchema: {
        section_id: z
          .string()
          .min(3)
          .max(120)
          .describe("Section ID, e.g. ug/effort-rir#what-rir-means."),
        include_related: z
          .boolean()
          .optional()
          .describe(
            "Include related and adjacent sections (default true). Set false " +
              "when reading several sections in a row.",
          ),
      },
    },
    async (args: { section_id: string; include_related?: boolean }) => {
      const payload = sectionPayload(args.section_id, {
        includeRelated: args.include_related ?? true,
      });
      if (!payload) {
        // R25's in-band failure shape: `ok: false` is what the composition root
        // turns into `isError`, so the model sees the miss and can retry
        return toolResult({
          ok: false,
          error:
            `No manual section with ID "${args.section_id}". IDs are ` +
            "manual/chapter#section, e.g. ug/effort-rir#what-rir-means — " +
            "search first, or read workout://user-guide-index.",
          suggestions: suggestSectionIds(args.section_id),
        });
      }
      return toolResult(payload as unknown as Record<string, unknown>);
    },
  );
}

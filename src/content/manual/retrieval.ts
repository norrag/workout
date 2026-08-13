// doc 22 §10 — retrieve-then-read, as three payloads.
//
// The connector's whole retrieval surface is shaped here, in pure functions
// over the registry, so the MCP layer stays what every other tool module is: a
// thin zod-validated wrapper that resolves identity and envelopes a payload.
// Nothing below reads a session, touches the network, or knows what MCP is —
// which is what makes the ranking and the payload shapes unit-testable.
//
// Three pieces, matching §10.2:
//
//   1. `guideIndex()`        → `workout://user-guide-index`, the map
//   2. `searchSections()`    → `search_manual`, ranked pointers
//   3. `sectionPayload()`    → `get_manual_section`, the read step
//
// **No embeddings** (§10.1): under D2 the expensive part of a retrieval
// pipeline — chunking — was done by authorship, so what is left is ranking, and
// ranking ~100 authored sections is a scan over the same inverted index the
// in-app search screen already uses.

import {
  adjacentSections,
  allSectionIds,
  chaptersFor,
  CHAPTERS,
  ESTIMATE_CAVEAT,
  resolveSection,
  type ResolvedSection,
} from "./index";
import { chapterRoute, MANUAL_LABEL, MANUAL_ROOT, sectionId, sectionRoute } from "./ids";
import { sectionToMarkdown } from "./markdown";
import { buildSearchIndex, searchManual, type SearchIndex } from "./search";
import type { ManualId } from "./types";

// ---------------------------------------------------------------------------
// The index, server-side
// ---------------------------------------------------------------------------

let cached: SearchIndex | null = null;

/**
 * The inverted index, built once per server process.
 *
 * It is **not** `search-index.ts`. That module exists to be a named client
 * chunk fetched on the first in-app query (doc 22 D3, guard 3), and importing
 * it from here would put a browser-shaped artifact on a server path for no
 * gain. The index is the same index — same builder, same weights, same glossary
 * aliases — built from the same registry.
 */
export function retrievalIndex(): SearchIndex {
  return (cached ??= buildSearchIndex(CHAPTERS));
}

/** Test seam: drop the memo so a test can build over a different registry. */
export function resetRetrievalIndex() {
  cached = null;
}

// ---------------------------------------------------------------------------
// 1. The map
// ---------------------------------------------------------------------------

export interface IndexedSection {
  readonly section_id: string;
  readonly title: string;
  readonly summary: string;
  /** doc 22 §10.2 — every entry carries the route, so the AI can hand over a link */
  readonly app_route: string;
}

export interface IndexedChapter {
  readonly chapter_id: string;
  readonly number: number;
  readonly title: string;
  readonly summary: string;
  readonly app_route: string;
  readonly sections: readonly IndexedSection[];
}

export interface IndexedManual {
  readonly manual: ManualId;
  readonly label: string;
  readonly app_route: string;
  readonly chapters: readonly IndexedChapter[];
}

export interface GuideIndex {
  readonly manuals: readonly IndexedManual[];
  readonly chapters: number;
  readonly sections: number;
  readonly how_to_use: string;
}

const HOW_TO_USE =
  "The contents tree for the app's built-in Guide. A section is the unit: " +
  "one screen, one ID, one link. Browse this map, or call search_manual for a " +
  "ranked lookup, then get_manual_section to read one. Hand the user app_route " +
  "when they should see the section in the app themselves.";

/** Every manual that has at least one chapter, in reading order. */
function indexedManuals(): IndexedManual[] {
  const ids: ManualId[] = ["ug"];
  return ids
    .map((manual) => ({
      manual,
      label: MANUAL_LABEL[manual],
      app_route: MANUAL_ROOT[manual],
      chapters: chaptersFor(manual).map((chapter) => ({
        chapter_id: `${manual}/${chapter.slug}`,
        number: chapter.number,
        title: chapter.title,
        summary: chapter.summary,
        app_route: chapterRoute(manual, chapter.slug),
        sections: chapter.sections.map((section) => {
          const id = sectionId(manual, chapter.slug, section.slug);
          return {
            section_id: id,
            title: section.title,
            summary: section.summary,
            app_route: sectionRoute(id) ?? "",
          };
        }),
      })),
    }))
    .filter((m) => m.chapters.length > 0);
}

/**
 * doc 22 §10.2 piece 1 — the full contents tree. A client loads it once and
 * then *has the map*, which answers a large share of "where is X" without any
 * search at all.
 */
export function guideIndex(): GuideIndex {
  const manuals = indexedManuals();
  return {
    manuals,
    chapters: manuals.reduce((n, m) => n + m.chapters.length, 0),
    sections: allSectionIds().length,
    how_to_use: HOW_TO_USE,
  };
}

// ---------------------------------------------------------------------------
// 2. Search
// ---------------------------------------------------------------------------

export interface SectionHit {
  readonly section_id: string;
  readonly manual: ManualId;
  readonly chapter: string;
  readonly title: string;
  readonly summary: string;
  readonly snippet: string;
  readonly app_route: string;
  /** relative, not absolute: it ranks these hits against each other, nothing else */
  readonly score: number;
}

export const SEARCH_LIMIT_DEFAULT = 8;
export const SEARCH_LIMIT_MAX = 25;

/**
 * doc 22 §10.2 piece 2 — ranked pointers, never prose. Title-weighted and
 * glossary-alias aware; the `keywords` each section authors are what carry the
 * paraphrase a lexical index would otherwise miss (§10.3 mitigation 1).
 */
export function searchSections(
  query: string,
  limit: number = SEARCH_LIMIT_DEFAULT,
): SectionHit[] {
  const capped = Math.min(Math.max(1, Math.trunc(limit)), SEARCH_LIMIT_MAX);
  return searchManual(retrievalIndex(), query, capped).map((hit) => ({
    section_id: hit.doc.id,
    manual: hit.doc.manual,
    chapter: hit.doc.chapterTitle,
    title: hit.doc.title,
    summary: hit.doc.summary,
    snippet: hit.snippet,
    app_route: hit.doc.route,
    score: Math.round(hit.score * 10) / 10,
  }));
}

// ---------------------------------------------------------------------------
// 3. The read step
// ---------------------------------------------------------------------------

export interface RelatedSection {
  readonly section_id: string;
  readonly title: string;
  readonly summary: string;
  readonly app_route: string;
}

export interface SectionPayload {
  readonly section_id: string;
  readonly manual: ManualId;
  readonly manual_label: string;
  readonly chapter: string;
  readonly chapter_number: number;
  readonly title: string;
  readonly summary: string;
  readonly app_route: string;
  /** "3 of 6" — where this section sits in its chapter */
  readonly position: string;
  readonly markdown: string;
  /** doc 22 §9.4.7 — the authored neighbour graph, doubling as retrieval's */
  readonly related?: readonly RelatedSection[];
  readonly next?: RelatedSection;
  readonly previous?: RelatedSection;
}

function stub(resolved: ResolvedSection): RelatedSection {
  return {
    section_id: resolved.id,
    title: resolved.section.title,
    summary: resolved.section.summary,
    app_route: sectionRoute(resolved.id) ?? "",
  };
}

/**
 * doc 22 §10.2 piece 3 — one section's full text. `null` when the ID does not
 * resolve, so the tool can answer with the ID it was given rather than an
 * exception.
 *
 * `include_related` also carries prev/next: reading order is how a section that
 * is *nearly* the answer leads to the one that is, and it costs four lines of
 * payload.
 */
export function sectionPayload(
  id: string,
  opts: { includeRelated?: boolean } = {},
): SectionPayload | null {
  const resolved = resolveSection(id);
  if (!resolved) return null;
  const { chapter, section, index } = resolved;

  const base: SectionPayload = {
    section_id: resolved.id,
    manual: chapter.manual,
    manual_label: MANUAL_LABEL[chapter.manual],
    chapter: chapter.title,
    chapter_number: chapter.number,
    title: section.title,
    summary: section.summary,
    app_route: sectionRoute(resolved.id) ?? "",
    position: `${index} of ${chapter.sections.length}`,
    markdown: sectionToMarkdown(section, { estimateCaveat: ESTIMATE_CAVEAT }),
  };

  if (opts.includeRelated === false) return base;

  const { prev, next } = adjacentSections(resolved.id);
  const related = (section.related ?? [])
    .map((relatedId) => resolveSection(relatedId))
    .filter((r): r is ResolvedSection => r != null)
    .map(stub);

  return {
    ...base,
    ...(related.length > 0 ? { related } : {}),
    ...(next ? { next: stub(next) } : {}),
    ...(prev ? { previous: stub(prev) } : {}),
  };
}

/** Every section ID that exists — the tool's error path suggests from this. */
export function knownSectionIds(): string[] {
  return allSectionIds();
}

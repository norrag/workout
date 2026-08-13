// doc 22 §9.4.2 — the section-ID scheme.
//
// A section ID is an API, not a convenience. It is the target of Phase 7's
// in-app links, the retrieval key for the connector's `get_manual_section`
// (§10.2), and — per doc 23 §7.2 — the target of a release note's `guide` link,
// resolved by *this* validator. Renaming one is a breaking change that needs a
// redirect entry, which is exactly why the shape is fixed here rather than
// spelled out per call site.
//
//   ug/effort-rir#per-exercise
//   └┬┘ └───┬───┘ └────┬─────┘
//    │      │          └─ section slug, unique within its chapter
//    │      └─ chapter slug, unique within its manual
//    └─ the built-in User Guide

import type { ManualId } from "./types";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ParsedSectionId {
  readonly manual: ManualId;
  readonly chapter: string;
  readonly section: string;
}

export function isManualId(value: string): value is ManualId {
  return value === "ug";
}

export function isSlug(value: string): boolean {
  return SLUG.test(value);
}

/** `ug/effort-rir` — the chapter half of a section ID. */
export function chapterId(manual: ManualId, chapter: string): string {
  return `${manual}/${chapter}`;
}

/** `ug/effort-rir#per-exercise`. */
export function sectionId(
  manual: ManualId,
  chapter: string,
  section: string,
): string {
  return `${chapterId(manual, chapter)}#${section}`;
}

/**
 * Parse an ID back into its parts, or `null` when it is malformed. Shape only
 * — whether the section *exists* is the registry's question (`resolveSection`).
 */
export function parseSectionId(id: string): ParsedSectionId | null {
  const [chapterPart, section, ...rest] = id.split("#");
  if (rest.length > 0 || !section || !chapterPart) return null;
  const [manual, chapter, ...tail] = chapterPart.split("/");
  if (tail.length > 0 || !manual || !chapter) return null;
  if (!isManualId(manual) || !isSlug(chapter) || !isSlug(section)) return null;
  return { manual, chapter, section };
}

/**
 * Where the Guide reader lives.
 */
export const MANUAL_ROOT: Record<ManualId, string> = {
  ug: "/more/guide",
};

export function chapterRoute(manual: ManualId, chapter: string): string {
  return `${MANUAL_ROOT[manual]}/${chapter}`;
}

export function sectionRoute(id: string): string | null {
  const parsed = parseSectionId(id);
  if (!parsed) return null;
  return `${chapterRoute(parsed.manual, parsed.chapter)}/${parsed.section}`;
}

/** Human-readable label for the manual itself — the meta line's first field. */
export const MANUAL_LABEL: Record<ManualId, string> = {
  ug: "USER GUIDE",
};

/** The lowercase logotype-style `h1` each manual's map screen carries. */
export const MANUAL_TITLE: Record<ManualId, string> = {
  ug: "guide",
};

/** Sentence case, for a back link or a row that names the manual in prose. */
export const MANUAL_NAME: Record<ManualId, string> = {
  ug: "Guide",
};

/**
 * The screen the Guide hangs off, and therefore where its map's back link goes.
 */
export const MANUAL_HOME: Record<
  ManualId,
  { readonly href: string; readonly label: string }
> = {
  ug: { href: "/more", label: "More" },
};

/**
 * The Guide's search screen.
 */
export const MANUAL_SEARCH_ROUTE = "/more/guide/search";

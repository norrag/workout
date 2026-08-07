// doc 22 §9.4.3 / §10.2 — the manual's search index.
//
// Lexical, not embeddings, and §10.1 gives the reason: under D2 the expensive
// part of a retrieval pipeline — chunking — is done *by authorship*. Every
// section is already titled, summarized, length-budgeted and cross-linked, so
// what remains is ranking, and ranking a few hundred authored sections is a
// scan over an inverted index rather than a model dependency.
//
// One artifact, three consumers: the in-app search screen (Phase 2), the
// connector's `search_manual` (Phase 5), and `workout://user-guide-index` (also
// Phase 5) — which is why this module is pure and knows nothing about React,
// fetching, or routes beyond the ones `ids.ts` computes.
//
// **It is not imported by the guide routes** (doc 22 D3). The search screen
// pulls it in behind a dynamic `import()`, so the index is a separate hashed
// chunk fetched on the first query rather than bytes every reader pays for.

import { GLOSSARY } from "@/lib/glossary";
import { sectionId, sectionRoute } from "./ids";
import type {
  ManualBlock,
  ManualChapter,
  ManualId,
  ManualSection,
  RichText,
} from "./types";

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

/**
 * Words carried by nearly every section, so matching one says nothing about
 * which section to open. Deliberately short: an aggressive stoplist throws away
 * real queries ("how it works", "what a set is").
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "with",
  "you",
  "your",
]);

/**
 * Fold a token to its index form. Plurals only — `sets` and `set` are the same
 * query, and anything more aggressive (a real stemmer) would be a dependency
 * and would start conflating words the manual uses precisely.
 */
function fold(word: string): string {
  if (word.length > 3 && word.endsWith("es") && !word.endsWith("ses")) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .map(fold);
}

// ---------------------------------------------------------------------------
// Flattening a section into searchable fields
// ---------------------------------------------------------------------------

function richText(text: RichText): string {
  if (typeof text === "string") return text;
  return text
    .map((run) => {
      if (typeof run === "string") return run;
      if ("ui" in run) return run.ui;
      if ("strong" in run) return run.strong;
      if ("num" in run) return run.num;
      if ("code" in run) return run.code;
      if ("term" in run) return run.text ?? GLOSSARY[run.term].label;
      return run.text;
    })
    .join("");
}

/** Prose a reader would recognize, `detail` contents included — a layer-3 rule
 *  is exactly the kind of thing someone searches for. */
function blockText(block: ManualBlock): string[] {
  switch (block.kind) {
    case "heading":
      return [block.text];
    case "para":
      return [richText(block.text)];
    case "list":
      return block.items.map(richText);
    case "steps":
      return block.steps.flatMap((s) => [s.label, richText(s.text)]);
    case "table":
      return [...block.columns, ...block.rows.flatMap((r) => r.map(richText))];
    case "callout":
      return [...(block.label ? [block.label] : []), richText(block.text)];
    case "term":
      return [GLOSSARY[block.term].label, GLOSSARY[block.term].body];
    case "legend":
      return block.items.map((i) => richText(i.text));
    case "figure":
      return [block.alt, ...(block.caption ? [richText(block.caption)] : [])];
    case "link":
      return [block.label];
    case "detail":
      return block.blocks.flatMap(blockText);
  }
}

/**
 * doc 22 §10.2 — the glossary is the alias layer. A section that renders a term
 * is findable by that term's app label, which is the synonym expansion a
 * lexical index otherwise lacks ("estimated one-rep max" → the e1RM section).
 */
function glossaryAliases(section: ManualSection): string[] {
  const keys = new Set<keyof typeof GLOSSARY>();
  const walk = (blocks: readonly ManualBlock[]) => {
    for (const block of blocks) {
      if (block.kind === "term") keys.add(block.term);
      if (block.kind === "detail") walk(block.blocks);
      const inlines =
        block.kind === "para"
          ? [block.text]
          : block.kind === "list"
            ? block.items
            : [];
      for (const text of inlines) {
        if (typeof text === "string") continue;
        for (const run of text) {
          if (typeof run !== "string" && "term" in run) keys.add(run.term);
        }
      }
    }
  };
  walk(section.blocks);
  return [...keys].map((key) => GLOSSARY[key].label);
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

export interface SearchDoc {
  readonly id: string;
  readonly manual: ManualId;
  /** in-app route — doc 22 §10.2: every result can be handed back as a link */
  readonly route: string;
  readonly chapterTitle: string;
  readonly chapterNumber: number;
  readonly title: string;
  readonly summary: string;
  /** body prose, kept for snippets rather than for matching */
  readonly body: string;
}

/** `[docIndex, weight]` — the best field weight this token earned in that doc. */
export type Posting = readonly [number, number];

export interface SearchIndex {
  readonly docs: readonly SearchDoc[];
  readonly postings: Readonly<Record<string, readonly Posting[]>>;
}

/**
 * Field weights. A title match is a different kind of evidence from a body
 * match: someone typing "deload" wants the section *about* deloads, not the six
 * that mention one in passing.
 */
const WEIGHT = {
  title: 10,
  keyword: 6,
  glossary: 5,
  summary: 3,
  chapter: 2,
  body: 1,
} as const;

export function buildSearchIndex(
  chapters: readonly ManualChapter[],
): SearchIndex {
  const docs: SearchDoc[] = [];
  const postings: Record<string, Posting[]> = {};

  for (const chapter of chapters) {
    for (const section of chapter.sections) {
      const id = sectionId(chapter.manual, chapter.slug, section.slug);
      const body = section.blocks.flatMap(blockText).join(" ");
      const at = docs.length;
      docs.push({
        id,
        manual: chapter.manual,
        route: sectionRoute(id) ?? "",
        chapterTitle: chapter.title,
        chapterNumber: chapter.number,
        title: section.title,
        summary: section.summary,
        body,
      });

      // one pass per field, keeping the strongest weight a token earned
      const best = new Map<string, number>();
      const add = (text: string, weight: number) => {
        for (const token of tokenize(text)) {
          const prev = best.get(token);
          if (prev === undefined || weight > prev) best.set(token, weight);
        }
      };
      add(section.title, WEIGHT.title);
      for (const keyword of section.keywords ?? []) add(keyword, WEIGHT.keyword);
      for (const alias of glossaryAliases(section)) add(alias, WEIGHT.glossary);
      add(section.summary, WEIGHT.summary);
      add(chapter.title, WEIGHT.chapter);
      add(body, WEIGHT.body);

      for (const [token, weight] of best) {
        (postings[token] ??= []).push([at, weight]);
      }
    }
  }

  return { docs, postings };
}

// ---------------------------------------------------------------------------
// Querying
// ---------------------------------------------------------------------------

export interface SearchHit {
  readonly doc: SearchDoc;
  readonly score: number;
  /** a window of body prose around the first match, for the result row */
  readonly snippet: string;
}

/** A prefix match is real evidence, but weaker than the word the author wrote. */
const PREFIX_FACTOR = 0.55;
const MIN_PREFIX_LENGTH = 3;

/** Every section that matched every query token is ranked above partial ones. */
const ALL_TOKENS_BONUS = 1.6;

const SNIPPET_CHARS = 150;

function snippetFor(doc: SearchDoc, tokens: readonly string[]): string {
  const body = doc.body;
  const haystack = body.toLowerCase();
  let at = -1;
  for (const token of tokens) {
    const found = haystack.indexOf(token);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0) return body.slice(0, SNIPPET_CHARS).trim();
  const start = Math.max(0, at - 40);
  const end = Math.min(body.length, start + SNIPPET_CHARS);
  const cut = body.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${cut}${end < body.length ? "…" : ""}`;
}

export function searchManual(
  index: SearchIndex,
  query: string,
  limit = 20,
): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scores = new Map<number, number>();
  const matched = new Map<number, Set<string>>();

  for (const token of tokens) {
    const seen = new Map<number, number>();
    for (const [at, weight] of index.postings[token] ?? []) {
      seen.set(at, Math.max(seen.get(at) ?? 0, weight));
    }
    if (token.length >= MIN_PREFIX_LENGTH) {
      for (const [indexed, entries] of Object.entries(index.postings)) {
        if (indexed === token || !indexed.startsWith(token)) continue;
        for (const [at, weight] of entries) {
          seen.set(at, Math.max(seen.get(at) ?? 0, weight * PREFIX_FACTOR));
        }
      }
    }
    for (const [at, weight] of seen) {
      scores.set(at, (scores.get(at) ?? 0) + weight);
      (matched.get(at) ?? matched.set(at, new Set()).get(at)!).add(token);
    }
  }

  return [...scores.entries()]
    .map(([at, score]) => ({
      at,
      score:
        matched.get(at)!.size === tokens.length
          ? score * ALL_TOKENS_BONUS
          : score,
    }))
    // ties break on reading order, so a stable list never reshuffles itself
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, limit)
    .map(({ at, score }) => ({
      doc: index.docs[at],
      score,
      snippet: snippetFor(index.docs[at], tokens),
    }));
}

// Traversal shared by the manual's test suites.
//
// Not a test file (vitest collects `*.test.ts`), and deliberately inside
// `src/content/manual/` so the D3 import guard has nothing to say about it.

import path from "node:path";
import { CHAPTERS, sectionId } from "../index";
import { markLabel } from "../budget";
import { GLOSSARY } from "@/lib/glossary";
import type {
  Inline,
  ManualBlock,
  ManualChapter,
  ManualSection,
  RichText,
} from "../types";

export const REPO_ROOT = path.resolve(__dirname, "../../../..");

export function runs(text: RichText): Inline[] {
  return typeof text === "string" ? [text] : [...text];
}

/** Every inline run a block carries. `detail` children are content too — for
 *  everything except the length budget (doc 22 §9.3). */
export function blockRuns(block: ManualBlock): Inline[] {
  switch (block.kind) {
    case "heading":
      return [block.text];
    case "para":
      return runs(block.text);
    case "list":
      return block.items.flatMap(runs);
    case "steps":
      return block.steps.flatMap((s) => [s.label, ...runs(s.text)]);
    case "table":
      return [...block.columns, ...block.rows.flatMap((r) => r.flatMap(runs))];
    case "callout":
      return [...(block.label ? [block.label] : []), ...runs(block.text)];
    case "term":
      return [GLOSSARY[block.term].label, GLOSSARY[block.term].body];
    case "legend":
      return block.items.flatMap((i) => [markLabel(i.mark), ...runs(i.text)]);
    case "figure":
      return [block.alt, ...(block.caption ? runs(block.caption) : [])];
    case "link":
      return [block.label];
    case "detail":
      return block.blocks.flatMap(blockRuns);
  }
}

/** Blocks with `detail` children hoisted alongside their parent. */
export function flatten(blocks: readonly ManualBlock[]): ManualBlock[] {
  return blocks.flatMap((b) =>
    b.kind === "detail" ? [b, ...flatten(b.blocks)] : [b],
  );
}

export function runText(run: Inline): string {
  if (typeof run === "string") return run;
  if ("ui" in run) return run.ui;
  if ("strong" in run) return run.strong;
  if ("num" in run) return run.num;
  if ("code" in run) return run.code;
  if ("term" in run) return run.text ?? "";
  return run.text;
}

export interface IndexedSection {
  readonly chapter: ManualChapter;
  readonly section: ManualSection;
  readonly id: string;
}

export const everySection: IndexedSection[] = CHAPTERS.flatMap((chapter) =>
  chapter.sections.map((section) => ({
    chapter,
    section,
    id: sectionId(chapter.manual, chapter.slug, section.slug),
  })),
);

/** Everything a reader would read, as one string. */
export function proseOf(entry: IndexedSection): string {
  return [
    entry.section.title,
    entry.section.summary,
    ...flatten(entry.section.blocks).flatMap(blockRuns).map(runText),
  ].join(" ");
}

/**
 * The words the **manual** wrote — `proseOf` minus every `term` block's body.
 *
 * A `term` card renders `GLOSSARY[key].body` verbatim (doc 22 §8.1), so those
 * sentences are the app's copy, not the manual's. A copy rule the manual could
 * only satisfy by rewording the glossary is a rule about the app, and it belongs
 * to `glossary.test.ts` and a design decision — not to a content test that would
 * otherwise be "fixed" by paraphrasing the card and breaking §8.1 outright.
 *
 * Contracts that judge *authorship* use this; contracts that judge what a reader
 * takes away — the honesty guardrails, the hype and precision denylists — keep
 * using `proseOf`, because the reader does not care who typed it.
 */
export function authoredProseOf(entry: IndexedSection): string {
  return [
    entry.section.title,
    entry.section.summary,
    ...flatten(entry.section.blocks)
      .filter((b) => b.kind !== "term")
      .flatMap(blockRuns)
      .map(runText),
  ].join(" ");
}

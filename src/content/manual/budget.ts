// doc 22 §9.3 — the section-length budget.
//
// The mechanism that stops long sections from re-creating the 100-page document
// the owner warned about. A section targets one to two phone screens; over
// budget, it is split, or the detail moves into a `detail` block — which is
// collapsed by default and therefore does not count.
//
// Calibrated against the Phase-1 exemplar (chapter 6): its six sections run
// 205–323 words over 6–9 blocks, median 229 words. So doc 22 §9.3's proposed
// 350 words / 12 blocks holds without adjustment — the typical section sits at
// two thirds of it and the densest (the three-layer mechanism section, which is
// the shape most at risk) at 92%, which is the right kind of tight: a ceiling
// a careful author brushes rather than one they never see.
//
// That densest section is also the calibration's live proof. Owner review round
// 2 lengthened `GLOSSARY.e1rm` to spell out "one-rep max", and because a `term`
// block counts the glossary's words, the section moved 309 → 323 without a line
// of its prose changing. A budget that ignored borrowed copy would not have
// noticed; this one puts the pressure where the reader feels it.

import type { ManualBlock, ManualMark, ManualSection, RichText } from "./types";
import { GLOSSARY } from "@/lib/glossary";
import { SET_MARKERS, type SetMarker } from "@/lib/set-markers";

/** The app's own name for a mark the manual shows (`lib/set-markers.ts`). */
export function markLabel(mark: ManualMark): string {
  return SET_MARKERS[mark.slice("set-marker:".length) as SetMarker].label;
}

export const SECTION_BUDGET = {
  words: 350,
  blocks: 12,
} as const;

function inlineWords(text: RichText): string {
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
    .join(" ");
}

/**
 * Words a reader meets before opening anything. `detail` contents are excluded
 * (D5 layer 3); a `term` block's body is **included**, because the glossary
 * card is real reading even though the manual did not author its words.
 */
function blockWords(block: ManualBlock): number {
  const parts: string[] = [];
  switch (block.kind) {
    case "heading":
      parts.push(block.text);
      break;
    case "para":
      parts.push(inlineWords(block.text));
      break;
    case "list":
      parts.push(...block.items.map(inlineWords));
      break;
    case "steps":
      for (const step of block.steps) {
        parts.push(step.label, inlineWords(step.text));
      }
      break;
    case "table":
      parts.push(...block.columns);
      for (const row of block.rows) parts.push(...row.map(inlineWords));
      break;
    case "callout":
      if (block.label) parts.push(block.label);
      parts.push(inlineWords(block.text));
      break;
    case "term":
      parts.push(GLOSSARY[block.term].label, GLOSSARY[block.term].body);
      break;
    case "legend":
      for (const item of block.items) {
        parts.push(markLabel(item.mark), inlineWords(item.text));
      }
      break;
    case "link":
      parts.push(block.label);
      break;
    case "detail":
      // layer 3 is collapsed — it costs one row, not its contents
      break;
  }
  return parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}

export interface SectionSize {
  readonly words: number;
  readonly blocks: number;
}

export function measureSection(section: ManualSection): SectionSize {
  return {
    words:
      section.title.split(/\s+/).filter(Boolean).length +
      section.blocks.reduce((sum, b) => sum + blockWords(b), 0),
    blocks: section.blocks.length,
  };
}

/** Empty when the section fits; otherwise one line per breach, for the test. */
export function budgetBreaches(section: ManualSection): string[] {
  const size = measureSection(section);
  const breaches: string[] = [];
  if (size.words > SECTION_BUDGET.words) {
    breaches.push(`${size.words} words (budget ${SECTION_BUDGET.words})`);
  }
  if (size.blocks > SECTION_BUDGET.blocks) {
    breaches.push(`${size.blocks} blocks (budget ${SECTION_BUDGET.blocks})`);
  }
  return breaches;
}

// doc 22 §10.2 — the block model rendered as markdown.
//
// `get_manual_section` is the *read* step of retrieve-then-read, and what it
// reads back has to be the same section the reader sees on the screen. That is
// why this is a second renderer over the one block model rather than a second
// copy of the prose: the connector and the app cannot disagree about what a
// section says, for the same reason the glossary is one source and not two
// (doc 22 §8.1).
//
// Pure, and deliberately free of React — the MCP surface is server-side and the
// content module is not, so the two meet here, in the model they share.
//
// Two rules the renderer keeps:
//
//   - **A `term` block renders the glossary's own words**, exactly as `TermCard`
//     does. An LLM reading a definition from the manual reads the definition the
//     app shows.
//   - **A cross-link renders as its in-app route** (§10.2), so an assistant can
//     hand the user a tappable link into the app rather than a section ID they
//     have no way to open.

import { GLOSSARY } from "@/lib/glossary";
import { SET_MARKERS, type SetMarker } from "@/lib/set-markers";
import { sectionRoute } from "./ids";
import type {
  Inline,
  ManualBlock,
  ManualMark,
  ManualSection,
  RichText,
} from "./types";

// ---------------------------------------------------------------------------
// Inline runs
// ---------------------------------------------------------------------------

function inlineText(run: Inline): string {
  if (typeof run === "string") return run;
  // app copy quoted verbatim — the screen's own label, so a model relaying it
  // to the user says what the button actually says
  if ("ui" in run) return `"${run.ui}"`;
  if ("strong" in run) return `**${run.strong}**`;
  // tabular numerals are presentation; the number is just the number
  if ("num" in run) return run.num;
  if ("code" in run) return `\`${run.code}\``;
  if ("term" in run) return `**${run.text ?? GLOSSARY[run.term].label}**`;
  const href = sectionRoute(run.to);
  return href ? `[${run.text}](${href})` : run.text;
}

export function richTextToMarkdown(text: RichText): string {
  if (typeof text === "string") return text;
  return text.map(inlineText).join("");
}

/** A table cell may not carry a raw pipe — it would end the column early. */
function cell(text: RichText): string {
  return richTextToMarkdown(text).replace(/\|/g, "\\|");
}

function markFor(mark: ManualMark): { glyph: string; label: string } {
  return SET_MARKERS[mark.slice("set-marker:".length) as SetMarker];
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * One block as a markdown paragraph. Headings start at `###` because the
 * section title is the document's `#` — a section is one screen, so its own
 * heading is the top of what a reader sees (doc 22 §9.1).
 */
function blockToMarkdown(block: ManualBlock): string {
  switch (block.kind) {
    case "heading":
      return `### ${block.text}`;

    case "para":
      return richTextToMarkdown(block.text);

    case "list":
      return block.items
        .map(
          (item, i) =>
            `${block.ordered ? `${i + 1}.` : "-"} ${richTextToMarkdown(item)}`,
        )
        .join("\n");

    case "steps":
      return block.steps
        .map(
          (step, i) =>
            `${i + 1}. **${step.label}** — ${richTextToMarkdown(step.text)}`,
        )
        .join("\n");

    case "table":
      return [
        `| ${block.columns.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`,
        `| ${block.columns.map(() => "---").join(" | ")} |`,
        ...block.rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
      ].join("\n");

    case "callout": {
      const body = richTextToMarkdown(block.text);
      // the honesty label is load-bearing (doc 22 §8.2) — it is the form doc 10
      // §9's guardrails take in prose, so it survives into the read step
      return block.label ? `> **${block.label}** — ${body}` : `> ${body}`;
    }

    case "term": {
      const entry = GLOSSARY[block.term];
      return `> **${entry.label}** — ${entry.body}`;
    }

    case "legend":
      return block.items
        .map((item) => {
          const { glyph, label } = markFor(item.mark);
          return `- ${glyph} **${label}** — ${richTextToMarkdown(item.text)}`;
        })
        .join("\n");

    case "figure":
      // the asset is a CSS mask of single-colour line art, which is nothing a
      // text client can use — the alt text is what the figure *says*, and that
      // is the part worth reading back
      return [
        `**Figure.** ${block.alt}`,
        ...(block.caption ? [richTextToMarkdown(block.caption)] : []),
      ].join("\n\n");

    case "link": {
      const href = sectionRoute(block.to);
      return href ? `[${block.label}](${href})` : block.label;
    }

    case "detail":
      // doc 22 D5 layer 3. Collapsed on screen, but never withheld here: a
      // model asking for a section is asking for the exact rule as often as not
      return [
        "**The exact rule.**",
        ...block.blocks.map(blockToMarkdown),
      ].join("\n\n");
  }
}

// ---------------------------------------------------------------------------
// A whole section
// ---------------------------------------------------------------------------

export interface SectionMarkdownOpts {
  /** doc 22 §8.2 — appended when the section is flagged `estimate` */
  readonly estimateCaveat?: string;
}

/**
 * A section as a standalone markdown document: its title, its summary, its
 * blocks, and — when the section states a strength figure — the standing
 * estimate caveat the screen renders under it. The caveat is not optional
 * decoration: dropping it on the way to a model is exactly the overclaiming
 * doc 10 §9 forbids.
 */
export function sectionToMarkdown(
  section: ManualSection,
  opts: SectionMarkdownOpts = {},
): string {
  const parts = [
    `# ${section.title}`,
    `*${section.summary}*`,
    ...section.blocks.map(blockToMarkdown),
  ];
  if (section.estimate && opts.estimateCaveat) {
    parts.push(`> ${opts.estimateCaveat}`);
  }
  return parts.join("\n\n");
}

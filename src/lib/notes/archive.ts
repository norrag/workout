/**
 * `docs/notes/archive.md` — where terminal rows land. Pure.
 *
 * Structure: newest sweep first, each `## Swept <date> — <summary>` with a
 * short prose paragraph and a `| ID | Title | Type | WS | Resolution |` table.
 * A sweep on a date+summary that already exists gains rows rather than
 * spawning a duplicate section.
 */

import {
  findHeading,
  findTable,
  joinLines,
  renderRow,
  sectionRange,
  splitLines,
} from "./markdown";

export interface ArchiveRow {
  id: string;
  /** the Title cell as it stood in the live index */
  title: string;
  type: string;
  workstream: string;
  /** why it is closed, with the PR/commit link */
  resolution: string;
}

export interface SweepHeader {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** e.g. "N67 notes MCP tools merged (PR #211)" */
  summary: string;
  /** one short paragraph of context; omitted when the section already exists */
  prose?: string;
}

const TABLE_HEADER = ["ID", "Title", "Type", "WS", "Resolution"];

/** Add rows to `archive.md`, creating the sweep section when it's new. */
export function appendSweep(md: string, header: SweepHeader, rows: ArchiveRow[]): string {
  if (rows.length === 0) return md;
  const lines = splitLines(md);
  const rendered = rows.map((r) =>
    renderRow([r.id, r.title, r.type, r.workstream, r.resolution]),
  );

  const headingText = `Swept ${header.date} — ${header.summary}`;
  const existing = findHeading(lines, 2, new RegExp(`^${escapeRegExp(headingText)}$`));
  if (existing >= 0) {
    const [, end] = sectionRange(lines, existing);
    const table = findTable(lines, existing, end);
    if (!table) throw new Error(`archive.md: sweep "${headingText}" has no table to extend`);
    lines.splice(table.end, 0, ...rendered);
    return joinLines(lines);
  }

  // New section goes at the top of the sweeps (newest first), which is the
  // first `## ` heading after the intro block.
  let at = findHeading(lines, 2, /^Swept /);
  if (at < 0) at = lines.length;
  const block = [
    `## ${headingText}`,
    "",
    ...(header.prose ? [...splitLines(header.prose.trim()), ""] : []),
    renderRow(TABLE_HEADER),
    "|----|-------|------|----|------------|",
    ...rendered,
    "",
  ];
  lines.splice(at, 0, ...block);
  return joinLines(lines);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

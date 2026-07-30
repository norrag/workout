/**
 * `docs/notes/backlog.md` — parse and surgical mutation. Pure.
 *
 * The file has three parts this module understands:
 *   `## Index`                    → the live index table (6 columns)
 *   `## Open follow-up tasks`     → the spawned-task table (5 columns)
 *   `## Appendix: verbatim source` → dated `### Batch N` sections, APPEND-ONLY
 *
 * The appendix is the permanent record of what the owner actually said. Nothing
 * in this module can rewrite or delete a batch — `appendBatch` is the only way
 * in, and it only ever adds at the end.
 */

import {
  findHeading,
  findTable,
  joinLines,
  parseRow,
  renderRow,
  sectionRange,
  splitLines,
  summarize,
} from "./markdown";
import {
  NOTE_STATUSES,
  type AppendixBatch,
  type BacklogItem,
  type FollowUpItem,
  type NoteStatus,
} from "./types";

const INDEX_COLUMNS = 6; // ID | Title | Type | Pri | WS | Status
const FOLLOWUP_COLUMNS = 5; // ID | From | Title | Type | Status

/** Pull the lifecycle word out of a rendered status cell, when it starts with
 *  one (`**done (PR #208)** — residual: …` → `done`). Free-form cells that
 *  don't start with a vocabulary word simply report `null`. */
export function statusWordOf(cell: string): NoteStatus | null {
  const head = cell
    .replace(/^\*+/, "")
    .trim()
    .toLowerCase();
  for (const s of NOTE_STATUSES) {
    if (head === s || head.startsWith(`${s} `) || head.startsWith(`${s}(`) || head.startsWith(`${s}*`)) {
      return s;
    }
  }
  return null;
}

/** Render a status cell in the house style: `**done (PR #208)** — note`. */
export function renderStatus(
  status: NoteStatus,
  opts: { pr?: number | null; note?: string | null } = {},
): string {
  const head = opts.pr != null ? `${status} (PR #${opts.pr})` : status;
  return opts.note ? `**${head}** — ${opts.note}` : `**${head}**`;
}

export interface ParsedBacklog {
  items: BacklogItem[];
  followUps: FollowUpItem[];
  batches: AppendixBatch[];
  /** rows inside a known table that could not be parsed (left untouched) */
  unparsedRows: number;
}

function indexTable(lines: string[]) {
  const heading = findHeading(lines, 2, /^Index\b/);
  if (heading < 0) return null;
  const [, end] = sectionRange(lines, heading);
  return findTable(lines, heading, end);
}

function followUpTable(lines: string[]) {
  const heading = findHeading(lines, 2, /^Open follow-up tasks\b/);
  if (heading < 0) return null;
  const [, end] = sectionRange(lines, heading);
  return findTable(lines, heading, end);
}

export function parseBacklog(md: string): ParsedBacklog {
  const lines = splitLines(md);
  const items: BacklogItem[] = [];
  const followUps: FollowUpItem[] = [];
  const batches: AppendixBatch[] = [];
  let unparsedRows = 0;

  const idx = indexTable(lines);
  if (idx) {
    for (let i = idx.first; i < idx.end; i++) {
      const cells = parseRow(lines[i], INDEX_COLUMNS);
      if (!cells) {
        unparsedRows++;
        continue;
      }
      const [id, body, type, priority, workstream, status] = cells;
      items.push({
        id,
        body,
        summary: summarize(body),
        type,
        priority,
        workstream,
        status,
        statusWord: statusWordOf(status),
        line: i,
      });
    }
  }

  const fu = followUpTable(lines);
  if (fu) {
    for (let i = fu.first; i < fu.end; i++) {
      const cells = parseRow(lines[i], FOLLOWUP_COLUMNS);
      if (!cells) {
        unparsedRows++;
        continue;
      }
      const [id, from, body, type, status] = cells;
      followUps.push({
        id,
        from,
        body,
        summary: summarize(body),
        type,
        status,
        statusWord: statusWordOf(status),
        line: i,
      });
    }
  }

  const appendix = findHeading(lines, 2, /^Appendix/);
  if (appendix >= 0) {
    const [, end] = sectionRange(lines, appendix);
    for (let i = appendix; i < end; i++) {
      const m = /^### Batch (\d+)\b/.exec(lines[i]);
      if (m) {
        batches.push({ number: Number(m[1]), heading: lines[i].slice(4), line: i });
      }
    }
  }

  return { items, followUps, batches, unparsedRows };
}

export interface NewBacklogRow {
  id: string;
  body: string;
  type: string;
  priority: string;
  workstream: string;
  status: string;
}

/** Append a row to the live index (the file's own convention — newest last). */
export function insertIndexRow(md: string, row: NewBacklogRow): string {
  const lines = splitLines(md);
  const table = indexTable(lines);
  if (!table) throw new Error("backlog.md: could not locate the `## Index` table");
  if (parseBacklog(md).items.some((i) => i.id === row.id)) {
    throw new Error(`backlog.md: item ${row.id} already exists in the index`);
  }
  lines.splice(
    table.end,
    0,
    renderRow([row.id, row.body, row.type, row.priority, row.workstream, row.status]),
  );
  return joinLines(lines);
}

export interface NewFollowUpRow {
  id: string;
  from: string;
  body: string;
  type: string;
  status: string;
}

export function insertFollowUpRow(md: string, row: NewFollowUpRow): string {
  const lines = splitLines(md);
  const table = followUpTable(lines);
  if (!table) {
    throw new Error("backlog.md: could not locate the `## Open follow-up tasks` table");
  }
  lines.splice(
    table.end,
    0,
    renderRow([row.id, row.from, row.body, row.type, row.status]),
  );
  return joinLines(lines);
}

export interface RowPatch {
  /** replace the whole Title cell */
  body?: string;
  /** append to the Title cell (the usual move — folding in a new phrasing) */
  appendBody?: string;
  type?: string;
  priority?: string;
  workstream?: string;
  status?: string;
}

/** Patch one row of either table, leaving every other line byte-identical. */
export function updateRow(md: string, id: string, patch: RowPatch): string {
  const lines = splitLines(md);
  const parsed = parseBacklog(md);
  const item = parsed.items.find((i) => i.id === id);
  const followUp = parsed.followUps.find((f) => f.id === id);
  if (!item && !followUp) throw new Error(`backlog.md: no live row with id ${id}`);

  if (item) {
    const body = nextBody(item.body, patch);
    lines[item.line] = renderRow([
      item.id,
      body,
      patch.type ?? item.type,
      patch.priority ?? item.priority,
      patch.workstream ?? item.workstream,
      patch.status ?? item.status,
    ]);
  } else if (followUp) {
    if (patch.priority != null || patch.workstream != null) {
      throw new Error(
        `${id} is a follow-up task — that table has no Pri/WS column; use body text instead`,
      );
    }
    const body = nextBody(followUp.body, patch);
    lines[followUp.line] = renderRow([
      followUp.id,
      followUp.from,
      body,
      patch.type ?? followUp.type,
      patch.status ?? followUp.status,
    ]);
  }
  return joinLines(lines);
}

function nextBody(current: string, patch: RowPatch): string {
  let body = patch.body ?? current;
  if (patch.appendBody) body = `${body} ${patch.appendBody}`.trim();
  return body;
}

/** Lift a row out of the live index (the archive sweep's first half). */
export function removeIndexRow(md: string, id: string): { md: string; item: BacklogItem } {
  const lines = splitLines(md);
  const item = parseBacklog(md).items.find((i) => i.id === id);
  if (!item) throw new Error(`backlog.md: no live index row with id ${id}`);
  lines.splice(item.line, 1);
  return { md: joinLines(lines), item };
}

export interface NewBatch {
  number: number;
  /** short label, e.g. "field notes" */
  title: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** where it came from, e.g. "in-session", "MCP capture" */
  source: string;
  /** the owner's words, verbatim */
  verbatim: string;
}

/**
 * Append a batch to the append-only appendix. This is the ONLY write path into
 * the appendix and it cannot modify an existing batch.
 */
export function appendBatch(md: string, batch: NewBatch): string {
  const lines = splitLines(md);
  const appendix = findHeading(lines, 2, /^Appendix/);
  if (appendix < 0) {
    throw new Error("backlog.md: could not locate the `## Appendix: verbatim source` section");
  }
  const parsed = parseBacklog(md);
  if (parsed.batches.some((b) => b.number === batch.number)) {
    throw new Error(`backlog.md: Batch ${batch.number} already exists`);
  }
  const [, end] = sectionRange(lines, appendix);
  // trim trailing blanks inside the section so batches stay uniformly spaced
  let at = end;
  while (at > appendix + 1 && lines[at - 1].trim() === "") at--;
  const block = [
    "",
    `### Batch ${batch.number} — ${batch.title} (${batch.date}, ${batch.source})`,
    "",
    ...splitLines(batch.verbatim.trimEnd()),
  ];
  lines.splice(at, 0, ...block);
  return joinLines(lines);
}

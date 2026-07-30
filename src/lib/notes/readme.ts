/**
 * `docs/notes/README.md` — the workstream roster. Pure.
 *
 * Items are grouped into workstreams so related work ships together. A new
 * workstream must be declared in the roster in the same commit that first
 * assigns an item to it, or the index grows labels nothing explains.
 */

import {
  findHeading,
  findTable,
  joinLines,
  parseRow,
  renderRow,
  sectionRange,
  splitLines,
} from "./markdown";
import type { Workstream } from "./types";

const COLUMNS = 4; // ID | Workstream | Detail file | What it covers

function rosterTable(lines: string[]) {
  const heading = findHeading(lines, 2, /^Workstreams\b/);
  if (heading < 0) return null;
  const [, end] = sectionRange(lines, heading);
  return findTable(lines, heading, end);
}

export function parseWorkstreams(md: string): Workstream[] {
  const lines = splitLines(md);
  const table = rosterTable(lines);
  if (!table) return [];
  const out: Workstream[] = [];
  for (let i = table.first; i < table.end; i++) {
    const cells = parseRow(lines[i], COLUMNS);
    if (!cells) continue;
    const [rawId, name, detailFile, covers] = cells;
    const id = rawId.replace(/\*/g, "").trim();
    out.push({ id, name, detailFile, covers });
  }
  return out;
}

export interface NewWorkstream {
  /** a single letter not already in the roster */
  id: string;
  name: string;
  /** markdown link or `_tbd_` */
  detailFile?: string;
  covers: string;
}

export function appendWorkstream(md: string, ws: NewWorkstream): string {
  const lines = splitLines(md);
  const table = rosterTable(lines);
  if (!table) throw new Error("README.md: could not locate the `## Workstreams` table");
  if (parseWorkstreams(md).some((w) => w.id === ws.id)) {
    throw new Error(`README.md: workstream ${ws.id} already exists`);
  }
  lines.splice(
    table.end,
    0,
    renderRow([`**${ws.id}**`, ws.name, ws.detailFile || "_tbd_", ws.covers]),
  );
  return joinLines(lines);
}

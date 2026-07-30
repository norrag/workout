/**
 * ID and batch-number allocation. Pure.
 *
 * The manual is strict about this: "IDs are stable handles, never reused." So
 * allocation scans **every** table in both the live index and the archive —
 * an ID retired to `archive.md` still burns its number forever.
 */

import { splitLines } from "./markdown";

/** Every ID appearing in the first column of any table row, across files. */
export function collectIds(...files: string[]): Set<string> {
  const ids = new Set<string>();
  for (const md of files) {
    for (const line of splitLines(md)) {
      if (!line.startsWith("| ")) continue;
      const first = line.slice(1).split("|")[0]?.trim();
      if (!first) continue;
      const id = first.replace(/\*/g, "").trim();
      if (/^[A-Za-z][A-Za-z0-9-]*$/.test(id) && id !== "ID") ids.add(id);
    }
  }
  return ids;
}

/** Next free `<prefix><n>` (e.g. `N67`), one past the highest ever used. */
export function nextId(prefix: string, used: Set<string>): string {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const id of used) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** A run of free IDs, reserving as it goes (so one call can create several). */
export function nextIds(prefix: string, used: Set<string>, count: number): string[] {
  const out: string[] = [];
  const seen = new Set(used);
  for (let i = 0; i < count; i++) {
    const id = nextId(prefix, seen);
    seen.add(id);
    out.push(id);
  }
  return out;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * Follow-up IDs for a parent item: `T-<parent>` when a single one is spawned
 * and nothing in that family exists yet, else lettered (`T-N60a`, `T-N60b`, …)
 * — both shapes are already in the file. A parent that once spawned a lettered
 * family keeps getting letters, so `T-N60` never appears beside `T-N60a`.
 */
export function nextFollowUpIds(
  parentId: string,
  used: Set<string>,
  count: number,
): string[] {
  const bare = `T-${parentId}`;
  const familyExists = [...used].some((id) => id.startsWith(bare));
  if (count === 1 && !familyExists) return [bare];
  const out: string[] = [];
  const seen = new Set(used);
  for (const letter of LETTERS) {
    if (out.length === count) break;
    const id = `${bare}${letter}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length < count) {
    throw new Error(`ran out of follow-up letters for ${parentId}`);
  }
  return out;
}

/** One past the highest appendix batch number. */
export function nextBatchNumber(batches: { number: number }[]): number {
  return batches.reduce((max, b) => Math.max(max, b.number), 0) + 1;
}

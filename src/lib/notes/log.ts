/**
 * `docs/notes/log.md` — the dated activity log, newest first. Pure.
 *
 * Every write to the notes area appends here in the same commit; that is what
 * lets a cold session reconstruct what happened from `log.md` alone (the
 * manual's resume protocol, step 1). New entries go above the newest existing
 * one, after the file's intro block.
 */

import { findHeading, joinLines, splitLines } from "./markdown";

export interface LogEntry {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** the heading tail, e.g. "MCP capture — Batch 28 (N67)" */
  title: string;
  /** markdown body; bullets are the house style */
  body: string;
}

/** Insert an entry at the top of the log (newest first). */
export function prependEntry(md: string, entry: LogEntry): string {
  const lines = splitLines(md);
  let at = findHeading(lines, 2, /./);
  if (at < 0) at = lines.length;
  const block = [
    `## ${entry.date} — ${entry.title}`,
    "",
    ...splitLines(entry.body.trim()),
    "",
  ];
  lines.splice(at, 0, ...block);
  return joinLines(lines);
}

/** The most recent entries, for orienting a remote session cheaply. */
export function recentEntries(md: string, limit = 5): { heading: string; body: string }[] {
  const lines = splitLines(md);
  const out: { heading: string; body: string }[] = [];
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    if (!lines[i].startsWith("## ")) continue;
    let end = i + 1;
    while (end < lines.length && !lines[end].startsWith("## ")) end++;
    out.push({
      heading: lines[i].slice(3),
      body: joinLines(lines.slice(i + 1, end)).trim(),
    });
    i = end - 1;
  }
  return out;
}

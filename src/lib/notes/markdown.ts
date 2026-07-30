/**
 * Minimal, surgical markdown helpers for the notes area. Pure.
 *
 * The guiding constraint: these files are hand-authored by Claude Code sessions
 * and read by humans in diffs. A tool that round-trips them through a real
 * markdown AST would reflow prose and produce unreviewable diffs, so everything
 * here works on **lines** and touches only the lines it must. A row that
 * doesn't parse cleanly is left verbatim rather than rewritten — the parse is
 * allowed to under-report, never to corrupt.
 */

export function splitLines(md: string): string[] {
  return md.split("\n");
}

export function joinLines(lines: string[]): string {
  return lines.join("\n");
}

/** Index of the first line matching `## <pattern>` / `### <pattern>` etc. */
export function findHeading(
  lines: string[],
  level: number,
  pattern: RegExp,
  from = 0,
): number {
  const prefix = `${"#".repeat(level)} `;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(prefix) && pattern.test(line.slice(prefix.length))) {
      return i;
    }
  }
  return -1;
}

/** The line range `[start, end)` a heading owns — up to the next heading of
 *  the same or a shallower level, or EOF. */
export function sectionRange(
  lines: string[],
  headingIdx: number,
): [number, number] {
  const level = /^#+/.exec(lines[headingIdx])?.[0].length ?? 1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = /^(#+) /.exec(lines[i]);
    if (m && m[1].length <= level) return [headingIdx, i];
  }
  return [headingIdx, lines.length];
}

export function isTableRow(line: string): boolean {
  return line.startsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s:|-]+\|\s*$/.test(line) && line.includes("-");
}

/**
 * Split a table row into trimmed cells, ignoring `|` inside inline code spans
 * — the live index really does carry cells like ``` `pinned | source_session` ```,
 * and a naive split would drop that row out of the parse (invisible to every
 * tool). Returns null when the row still doesn't yield the expected cell count,
 * and the caller then preserves the line untouched: the parse may under-report,
 * never corrupt.
 */
export function parseRow(line: string, expectedCells: number): string[] | null {
  if (!isTableRow(line)) return null;
  const trimmed = line.replace(/\s+$/, "");
  if (!trimmed.endsWith("|")) return null;
  const inner = trimmed.slice(1, -1);

  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (const ch of inner) {
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  if (inCode) return null; // unbalanced backticks — don't guess
  if (cells.length !== expectedCells) return null;
  return cells.map((c) => c.trim());
}

export function renderRow(cells: string[]): string {
  return `| ${cells.map((c) => c.trim()).join(" | ")} |`;
}

export interface TableRange {
  /** line index of the header row */
  header: number;
  /** line index of the `|---|` separator */
  separator: number;
  /** line index of the first data row */
  first: number;
  /** line index AFTER the last data row */
  end: number;
}

/** Locate the first markdown table inside `[from, to)`. */
export function findTable(
  lines: string[],
  from: number,
  to: number,
): TableRange | null {
  for (let i = from; i < to - 1; i++) {
    if (isTableRow(lines[i]) && isSeparatorRow(lines[i + 1])) {
      let end = i + 2;
      while (end < to && isTableRow(lines[end])) end++;
      return { header: i, separator: i + 1, first: i + 2, end };
    }
  }
  return null;
}

/** Collapse markdown to a plain-text lead-in for compact listings. */
export function summarize(cell: string, max = 160): string {
  const plain = cell
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= max ? plain : `${plain.slice(0, max - 1).trimEnd()}…`;
}

/** Trailing-newline-preserving write: keeps the file's final newline as-is. */
export function withTrailingNewline(md: string, hadTrailing: boolean): string {
  const stripped = md.replace(/\n+$/, "");
  return hadTrailing ? `${stripped}\n` : stripped;
}

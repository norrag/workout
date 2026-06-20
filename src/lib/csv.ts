/**
 * Tiny, dependency-free RFC 4180 CSV serializer. Pure — no I/O — so the export
 * route can stay a thin wrapper and the formatting is unit-testable.
 */

export type CsvCell = string | number | boolean | null | undefined;

/** Escape a single field: quote when it contains a comma, quote, or newline. */
export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a full CSV document (CRLF line endings) from a header + data rows. */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  return lines.join("\r\n") + "\r\n";
}

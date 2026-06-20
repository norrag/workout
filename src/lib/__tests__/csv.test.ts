import { describe, expect, it } from "vitest";
import { buildCsv, csvEscape } from "@/lib/csv";

describe("csvEscape", () => {
  it("passes plain values through", () => {
    expect(csvEscape("squat")).toBe("squat");
    expect(csvEscape(135)).toBe("135");
    expect(csvEscape(true)).toBe("true");
  });

  it("renders null/undefined as empty", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("quotes and doubles embedded quotes, commas, and newlines", () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildCsv", () => {
  it("joins header + rows with CRLF and a trailing newline", () => {
    const csv = buildCsv(
      ["date", "exercise", "weight"],
      [
        ["2026-06-20", "Hack Squat", 200],
        ["2026-06-20", "Cable, Pushdown", 50],
      ],
    );
    expect(csv).toBe(
      'date,exercise,weight\r\n' +
        '2026-06-20,Hack Squat,200\r\n' +
        '2026-06-20,"Cable, Pushdown",50\r\n',
    );
  });

  it("handles an empty data set (header only)", () => {
    expect(buildCsv(["a", "b"], [])).toBe("a,b\r\n");
  });
});

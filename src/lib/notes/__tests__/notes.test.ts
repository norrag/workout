import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendBatch,
  insertFollowUpRow,
  insertIndexRow,
  parseBacklog,
  removeIndexRow,
  renderStatus,
  statusWordOf,
  updateRow,
} from "../backlog";
import { appendSweep } from "../archive";
import { prependEntry, recentEntries } from "../log";
import { appendWorkstream, parseWorkstreams } from "../readme";
import { collectIds, nextBatchNumber, nextFollowUpIds, nextId, nextIds } from "../ids";
import { renderRow, summarize } from "../markdown";
import { assertWritablePath } from "../repo";

/**
 * These run against the REAL `docs/notes/` files, not fixtures. The whole risk
 * of this feature is a tool mangling hand-authored markdown, so the tests that
 * matter are the ones proving the parser reads the live files exactly and every
 * mutation touches only the lines it claims to.
 */
const read = (f: string) => readFileSync(join(process.cwd(), "docs/notes", f), "utf8");
const BACKLOG = read("backlog.md");
const ARCHIVE = read("archive.md");
const LOG = read("log.md");
const README = read("README.md");

function lines(md: string) {
  return md.split("\n");
}

/** Lines that differ between two versions of a file, as `[index, before, after]`. */
function diffLines(before: string, after: string) {
  const a = lines(before);
  const b = lines(after);
  const out: { line: number; before?: string; after?: string }[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) out.push({ line: i, before: a[i], after: b[i] });
  }
  return out;
}

describe("parseBacklog (live file)", () => {
  const parsed = parseBacklog(BACKLOG);

  it("reads every row of both tables without a parse failure", () => {
    expect(parsed.unparsedRows).toBe(0);
    expect(parsed.items.length).toBeGreaterThan(20);
    expect(parsed.followUps.length).toBeGreaterThan(0);
  });

  it("parses rows whose cells contain a pipe inside inline code", () => {
    // N62's cell carries `pinned | source_session | recent_session`
    const n62 = parsed.items.find((i) => i.id === "N62");
    expect(n62).toBeDefined();
    expect(n62!.body).toContain("`note.source`");
    expect(n62!.statusWord).toBe("done");
    expect(n62!.workstream).toBe("H");
  });

  it("finds the known items with their real columns", () => {
    const n66 = parsed.items.find((i) => i.id === "N66");
    expect(n66).toBeDefined();
    expect(n66!.type).toBe("F");
    expect(n66!.workstream).toBe("Q");
    expect(n66!.statusWord).toBe("needs-input");
    expect(n66!.summary.length).toBeLessThanOrEqual(160);
  });

  it("round-trips every parsed row byte-identically", () => {
    const src = lines(BACKLOG);
    for (const item of parsed.items) {
      expect(
        renderRow([
          item.id,
          item.body,
          item.type,
          item.priority,
          item.workstream,
          item.status,
        ]),
      ).toBe(src[item.line]);
    }
    for (const f of parsed.followUps) {
      expect(renderRow([f.id, f.from, f.body, f.type, f.status])).toBe(src[f.line]);
    }
  });

  it("reads the appendix batches and never renumbers them", () => {
    expect(parsed.batches.length).toBeGreaterThan(20);
    const numbers = parsed.batches.map((b) => b.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(nextBatchNumber(parsed.batches)).toBe(Math.max(...numbers) + 1);
  });
});

describe("statusWordOf", () => {
  it("pulls the lifecycle word out of the house status styles", () => {
    expect(statusWordOf("answered")).toBe("answered");
    expect(statusWordOf("**done (PR #208)**")).toBe("done");
    expect(statusWordOf("**done (PR #181, merged 2026-07-12).** …")).toBe("done");
    expect(statusWordOf("**in-progress** — plan in J-performance.md")).toBe("in-progress");
    expect(statusWordOf("**needs-input** — direction doc in PR #210")).toBe("needs-input");
    expect(statusWordOf("**superseded → N58 (2026-07-19):** …")).toBe("superseded");
  });

  it("reports null for free-form prose rather than guessing", () => {
    expect(statusWordOf("waiting on the owner")).toBeNull();
    expect(statusWordOf("")).toBeNull();
  });
});

describe("renderStatus", () => {
  it("renders the protocol's `done (PR #N)` form", () => {
    expect(renderStatus("done", { pr: 211 })).toBe("**done (PR #211)**");
    expect(renderStatus("done", { pr: 211, note: "residual: owner re-checks" })).toBe(
      "**done (PR #211)** — residual: owner re-checks",
    );
    expect(renderStatus("ready")).toBe("**ready**");
  });
});

describe("index mutations", () => {
  it("insertIndexRow adds exactly one line and leaves the rest untouched", () => {
    const after = insertIndexRow(BACKLOG, {
      id: "N99",
      body: "**A new note** (owner, 2026-07-30, Batch 99).",
      type: "B",
      priority: "HIGH",
      workstream: "G",
      status: renderStatus("inbox"),
    });
    expect(lines(after).length).toBe(lines(BACKLOG).length + 1);
    const parsed = parseBacklog(after);
    expect(parsed.items.at(-1)!.id).toBe("N99");
    expect(parsed.unparsedRows).toBe(0);
    // everything before the insertion point is identical
    const at = parsed.items.at(-1)!.line;
    expect(lines(after).slice(0, at)).toEqual(lines(BACKLOG).slice(0, at));
    expect(lines(after).slice(at + 1)).toEqual(lines(BACKLOG).slice(at));
  });

  it("refuses to insert a duplicate id", () => {
    expect(() =>
      insertIndexRow(BACKLOG, {
        id: "N66",
        body: "x",
        type: "F",
        priority: "MED",
        workstream: "Q",
        status: "inbox",
      }),
    ).toThrow(/already exists/);
  });

  it("updateRow changes exactly one line", () => {
    const after = updateRow(BACKLOG, "N46", { status: renderStatus("in-progress") });
    const diff = diffLines(BACKLOG, after);
    expect(diff).toHaveLength(1);
    expect(diff[0].after).toContain("| N46 |");
    expect(diff[0].after).toContain("**in-progress**");
    expect(parseBacklog(after).items.find((i) => i.id === "N46")!.body).toBe(
      parseBacklog(BACKLOG).items.find((i) => i.id === "N46")!.body,
    );
  });

  it("appendBody preserves the accumulated assessment", () => {
    const before = parseBacklog(BACKLOG).items.find((i) => i.id === "N47")!;
    const after = updateRow(BACKLOG, "N47", { appendBody: "**Batch 99:** still repros." });
    const row = parseBacklog(after).items.find((i) => i.id === "N47")!;
    expect(row.body.startsWith(before.body)).toBe(true);
    expect(row.body.endsWith("**Batch 99:** still repros.")).toBe(true);
  });

  it("updates a follow-up-table row through the same entry point", () => {
    const after = updateRow(BACKLOG, "T-A5", { status: renderStatus("ready") });
    expect(diffLines(BACKLOG, after)).toHaveLength(1);
    expect(parseBacklog(after).followUps.find((f) => f.id === "T-A5")!.statusWord).toBe(
      "ready",
    );
  });

  it("rejects Pri/WS edits on the follow-up table, which has no such columns", () => {
    expect(() => updateRow(BACKLOG, "T-A5", { priority: "HIGH" })).toThrow(/follow-up/);
  });

  it("throws on an unknown id rather than writing anything", () => {
    expect(() => updateRow(BACKLOG, "ZZ9", { status: "ready" })).toThrow(/no live row/);
  });

  it("removeIndexRow lifts exactly one row out", () => {
    const { md, item } = removeIndexRow(BACKLOG, "N64");
    expect(lines(md).length).toBe(lines(BACKLOG).length - 1);
    expect(item.id).toBe("N64");
    expect(parseBacklog(md).items.some((i) => i.id === "N64")).toBe(false);
  });

  it("insertFollowUpRow lands in the follow-up table", () => {
    const after = insertFollowUpRow(BACKLOG, {
      id: "T-N99a",
      from: "N99",
      body: "**Spawned task.**",
      type: "F",
      status: renderStatus("ready"),
    });
    const parsed = parseBacklog(after);
    expect(parsed.followUps.at(-1)!.id).toBe("T-N99a");
    expect(parsed.items.some((i) => i.id === "T-N99a")).toBe(false);
  });
});

describe("appendix (append-only)", () => {
  it("appends a batch without touching a single existing line", () => {
    const after = appendBatch(BACKLOG, {
      number: 99,
      title: "field notes",
      date: "2026-07-30",
      source: "MCP capture",
      verbatim: "the tab bar still detaches\nand the splash is black",
    });
    const before = lines(BACKLOG).filter((l) => l.trim() !== "");
    const now = lines(after).filter((l) => l.trim() !== "");
    expect(now.slice(0, before.length)).toEqual(before);
    expect(after).toContain("### Batch 99 — field notes (2026-07-30, MCP capture)");
    expect(after).toContain("the tab bar still detaches");
    expect(parseBacklog(after).batches.at(-1)!.number).toBe(99);
  });

  it("refuses to reuse an existing batch number", () => {
    expect(() =>
      appendBatch(BACKLOG, {
        number: 27,
        title: "x",
        date: "2026-07-30",
        source: "MCP capture",
        verbatim: "y",
      }),
    ).toThrow(/already exists/);
  });
});

describe("archive sweeps", () => {
  it("opens a new sweep section above the newest one", () => {
    const after = appendSweep(
      ARCHIVE,
      { date: "2026-07-30", summary: "N99 merged (PR #999)", prose: "Reconciliation sweep." },
      [{ id: "N99", title: "**A note.**", type: "B", workstream: "G", resolution: "**done (PR #999).**" }],
    );
    const idxNew = lines(after).findIndex((l) => l.startsWith("## Swept 2026-07-30"));
    const idxOld = lines(after).findIndex((l) => l.startsWith("## Swept 2026-07-12"));
    expect(idxNew).toBeGreaterThan(0);
    expect(idxNew).toBeLessThan(idxOld);
    expect(after).toContain("| N99 | **A note.** | B | G | **done (PR #999).** |");
  });

  it("extends an existing sweep instead of duplicating its heading", () => {
    const header = { date: "2026-07-12", summary: "Batch-17 roundup merged (PR #181)" };
    const after = appendSweep(ARCHIVE, header, [
      { id: "N98", title: "**Another.**", type: "F", workstream: "E", resolution: "done." },
    ]);
    const headings = lines(after).filter((l) =>
      l.startsWith("## Swept 2026-07-12 — Batch-17"),
    );
    expect(headings).toHaveLength(1);
    expect(after).toContain("| N98 |");
  });

  it("is a no-op with no rows", () => {
    expect(appendSweep(ARCHIVE, { date: "2026-07-30", summary: "x" }, [])).toBe(ARCHIVE);
  });
});

describe("log", () => {
  // These assert shape, never the live file's current newest date — the log
  // gains an entry every session, this one included.
  it("prepends above the newest entry and below the intro", () => {
    const marker = "## 2099-01-01 — placeholder entry for the prepend test";
    const after = prependEntry(LOG, {
      date: "2099-01-01",
      title: "placeholder entry for the prepend test",
      body: "- body",
    });
    const l = lines(after);
    const newIdx = l.indexOf(marker);
    const previousNewest = lines(LOG).findIndex((x) => x.startsWith("## "));
    expect(newIdx).toBeGreaterThan(0);
    expect(newIdx).toBe(previousNewest); // lands exactly where the old newest was
    expect(l.slice(0, newIdx)).toEqual(lines(LOG).slice(0, newIdx)); // intro untouched
    expect(l.slice(newIdx + 4)).toEqual(lines(LOG).slice(newIdx)); // nothing else moved
  });

  it("reads the most recent entries newest first", () => {
    const recent = recentEntries(LOG, 3);
    expect(recent).toHaveLength(3);
    const headings = lines(LOG).filter((x) => x.startsWith("## ")).slice(0, 3);
    expect(recent.map((r) => `## ${r.heading}`)).toEqual(headings);
    expect(recent.every((r) => r.body.length > 0)).toBe(true);
    const dates = recent.map((r) => r.heading.slice(0, 10));
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe("workstream roster", () => {
  const roster = parseWorkstreams(README);

  it("parses the live roster", () => {
    expect(roster.length).toBeGreaterThan(10);
    expect(roster.map((w) => w.id)).toContain("Q");
    expect(roster.find((w) => w.id === "A")!.name).toContain("Engine");
  });

  it("appends a new workstream row", () => {
    const after = appendWorkstream(README, {
      id: "Z",
      name: "Notes tooling",
      covers: "the MCP notes surface",
    });
    expect(parseWorkstreams(after).map((w) => w.id)).toContain("Z");
    expect(after).toContain("| **Z** | Notes tooling | _tbd_ | the MCP notes surface |");
  });

  it("refuses to redeclare an existing workstream", () => {
    expect(() => appendWorkstream(README, { id: "A", name: "x", covers: "y" })).toThrow(
      /already exists/,
    );
  });
});

describe("id allocation", () => {
  const used = collectIds(BACKLOG, ARCHIVE);

  it("collects ids from the live index and the archive alike", () => {
    expect(used.has("N66")).toBe(true);
    expect(used.has("N44")).toBe(true); // archived
    expect(used.has("T-N60a")).toBe(true);
    expect(used.has("ID")).toBe(false);
  });

  it("never reissues a retired id", () => {
    const next = nextId("N", used);
    const highest = Math.max(
      ...[...used].map((id) => Number(/^N(\d+)$/.exec(id)?.[1] ?? 0)),
    );
    expect(next).toBe(`N${highest + 1}`);
    expect(used.has(next)).toBe(false);
  });

  it("allocates a run without collisions", () => {
    const ids = nextIds("N", used, 3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => !used.has(id))).toBe(true);
  });

  it("uses the bare T- form for a single follow-up, letters for several", () => {
    expect(nextFollowUpIds("N46", used, 1)).toEqual(["T-N46"]);
    expect(nextFollowUpIds("N46", used, 2)).toEqual(["T-N46a", "T-N46b"]);
    // N60 already spawned a lettered family (a–f), so it keeps getting letters
    // rather than growing a bare `T-N60` beside them
    expect(nextFollowUpIds("N60", used, 1)).toEqual(["T-N60g"]);
  });
});

describe("path allowlist", () => {
  it("permits notes markdown only", () => {
    expect(() => assertWritablePath("docs/notes/backlog.md")).not.toThrow();
    expect(() => assertWritablePath("docs/notes/J-performance.md")).not.toThrow();
  });

  it("refuses anything else, however it is spelled", () => {
    for (const bad of [
      "src/lib/engine/rules.ts",
      "docs/16-prescribed-progression.md",
      "docs/notes/../../.github/workflows/ci.yml",
      "docs/notes/secrets.env",
      "package.json",
    ]) {
      expect(() => assertWritablePath(bad)).toThrow(/refusing to write/);
    }
  });
});

describe("summarize", () => {
  it("strips markdown and clamps length", () => {
    expect(summarize("**Bold** and [a link](./x.md) and `code`")).toBe(
      "Bold and a link and code",
    );
    expect(summarize("x".repeat(300)).length).toBe(160);
  });
});

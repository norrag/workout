import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The notes MCP surface (N67): gating, argument contracts, and the guardrails
 * that keep a remote model on the manual's protocol. The markdown surgery
 * itself is covered by `src/lib/notes/__tests__/notes.test.ts` against the real
 * files; here the area module is mocked so nothing touches GitHub.
 */

const USER = "user-1";
const resolveSession = vi.fn();
vi.mock("../session", () => ({
  resolveSession: (...args: unknown[]) => resolveSession(...(args as [])),
}));

const getProfile = vi.fn();
vi.mock("@/lib/queries/profiles", () => ({
  getProfile: (...args: unknown[]) => getProfile(...(args as [])),
}));

vi.mock("../audit", () => ({ recordMcpWrite: vi.fn(async () => {}) }));

const area = {
  readArea: vi.fn(),
  readManual: vi.fn(),
  readNotesFile: vi.fn(),
  captureIntake: vi.fn(),
  updateItem: vi.fn(),
  appendLog: vi.fn(),
  recentEntries: vi.fn((): { heading: string; body: string }[] => []),
  repoConfigError: vi.fn(() => null as string | null),
};
vi.mock("@/lib/notes/area", () => ({
  readArea: (...a: unknown[]) => area.readArea(...(a as [])),
  readManual: (...a: unknown[]) => area.readManual(...(a as [])),
  readNotesFile: (...a: unknown[]) => area.readNotesFile(...(a as [])),
  captureIntake: (...a: unknown[]) => area.captureIntake(...(a as [])),
  updateItem: (...a: unknown[]) => area.updateItem(...(a as [])),
  appendLog: (...a: unknown[]) => area.appendLog(...(a as [])),
  recentEntries: (...a: unknown[]) => area.recentEntries(...(a as [])),
  repoConfigError: () => area.repoConfigError(),
}));

import {
  registerNotesTools,
  NOTES_TOOL_NAMES,
  GET_NOTES_MANUAL,
  GET_NOTES_BACKLOG,
  READ_NOTES_FILE,
  CAPTURE_NOTES,
  UPDATE_NOTE_ITEM,
  APPEND_NOTES_LOG,
} from "../tools/admin-notes";
import { captureServer, fakeAuthInfo, fakeExtra } from "./harness";

type ToolResult = { structuredContent?: { data?: Record<string, unknown> } };

function handler(name: string) {
  const { server, tools } = captureServer();
  registerNotesTools(server);
  return tools.get(name)!.handler;
}

function data(result: unknown): Record<string, unknown> {
  return (result as ToolResult).structuredContent?.data ?? {};
}

const adminExtra = () => fakeExtra(fakeAuthInfo(USER));

const AREA = {
  headSha: "abc123",
  backlog: {
    items: [
      {
        id: "N47",
        body: "**Tab bar detaches** (owner, Batch 17).",
        summary: "Tab bar detaches (owner, Batch 17).",
        type: "B",
        priority: "HIGH",
        workstream: "G",
        status: "**done (PR #186)**",
        statusWord: "done",
        line: 50,
      },
      {
        id: "N66",
        body: "**MEASURE — a companion measurement app** (owner, Batch 27).",
        summary: "MEASURE — a companion measurement app",
        type: "F",
        priority: "MED",
        workstream: "Q",
        status: "**needs-input**",
        statusWord: "needs-input",
        line: 68,
      },
    ],
    followUps: [
      {
        id: "T-A5",
        from: "S7",
        body: "**Graded MEV→MAV→MRV ramp.**",
        summary: "Graded ramp",
        type: "D→F",
        status: "**deferred**",
        statusWord: null,
        line: 95,
      },
    ],
    batches: [{ number: 27, heading: "Batch 27", line: 1272 }],
    unparsedRows: 0,
  },
  backlogMd: "",
  workstreams: [
    { id: "G", name: "Bugs", detailFile: "_tbd_", covers: "defects" },
    { id: "Q", name: "MEASURE companion app", detailFile: "x", covers: "measurement" },
  ],
  readmeMd: "",
  logMd: "## 2026-07-25 — Session 91\n\nbody\n",
  archiveMd: "",
  usedIds: new Set(["N47", "N66", "T-A5"]),
  nextBatch: 28,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveSession.mockReturnValue({ client: {}, userId: USER, token: "t" });
  getProfile.mockResolvedValue({ role: "admin" });
  area.repoConfigError.mockReturnValue(null);
  area.readArea.mockResolvedValue(AREA);
  area.readManual.mockResolvedValue("# CLAUDE.md — Operating manual\n");
  area.recentEntries.mockReturnValue([{ heading: "2026-07-25 — Session 91", body: "b" }]);
});

describe("registration & gating", () => {
  it("registers the whole notes surface", () => {
    const { server, tools } = captureServer();
    registerNotesTools(server);
    for (const name of NOTES_TOOL_NAMES) expect(tools.has(name), name).toBe(true);
  });

  it("is listed as admin-only, so non-admins never see it (PH33)", async () => {
    const { ADMIN_TOOL_NAMES } = await import("../tools/admin");
    for (const name of NOTES_TOOL_NAMES) {
      expect(ADMIN_TOOL_NAMES.has(name), name).toBe(true);
    }
  });

  it("no tool takes a user_id argument (hard rule #5)", () => {
    const { server, tools } = captureServer();
    registerNotesTools(server);
    for (const [, tool] of tools) {
      expect(Object.keys((tool.config.inputSchema ?? {}) as object)).not.toContain("user_id");
    }
  });

  it("denies a non-admin session before doing any work", async () => {
    getProfile.mockResolvedValue({ role: "user" });
    for (const name of NOTES_TOOL_NAMES) {
      await expect(handler(name)({}, adminExtra()), name).rejects.toThrow(/admin session/i);
    }
    expect(area.readArea).not.toHaveBeenCalled();
    expect(area.captureIntake).not.toHaveBeenCalled();
  });

  it("denies an unauthenticated session", async () => {
    resolveSession.mockImplementation(() => {
      throw new Error("no authenticated session");
    });
    for (const name of NOTES_TOOL_NAMES) {
      await expect(handler(name)({}, fakeExtra(undefined)), name).rejects.toThrow();
    }
  });

  it("explains the one-time env setup instead of failing opaquely", async () => {
    area.repoConfigError.mockReturnValue("notes repo access misconfigured — NOTES_REPO_TOKEN: missing");
    const out = data(await handler(GET_NOTES_BACKLOG)({}, adminExtra()));
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/NOTES_REPO_TOKEN/);
    expect(String(out.fix)).toMatch(/manual-operations/);
    expect(area.readArea).not.toHaveBeenCalled();
  });
});

describe("get_notes_manual", () => {
  it("serves the manual verbatim with the enforced vocabulary and allocation state", async () => {
    const out = data(await handler(GET_NOTES_MANUAL)({}, adminExtra()));
    expect(out.manual).toContain("Operating manual");
    const vocab = out.vocabulary as Record<string, Record<string, string>>;
    expect(vocab.statuses["needs-input"]).toMatch(/owner decision/);
    expect(vocab.types.B).toMatch(/bug/);
    expect((out.allocation as Record<string, unknown>).next_batch).toBe(28);
    expect((out.allocation as Record<string, unknown>).next_item_id).toBe("N67");
    expect(out.workstreams).toHaveLength(2);
  });
});

describe("get_notes_backlog", () => {
  it("returns compact rows by default and full bodies on request", async () => {
    const compact = data(await handler(GET_NOTES_BACKLOG)({}, adminExtra()));
    const items = compact.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveProperty("summary");
    expect(items[0]).not.toHaveProperty("body");

    const full = data(await handler(GET_NOTES_BACKLOG)({ include_body: true }, adminExtra()));
    expect((full.items as Record<string, unknown>[])[0]).toHaveProperty("body");
  });

  it("filters by status, workstream and free text", async () => {
    const byStatus = data(await handler(GET_NOTES_BACKLOG)({ status: "done" }, adminExtra()));
    expect((byStatus.items as { id: string }[]).map((i) => i.id)).toEqual(["N47"]);

    const byWs = data(await handler(GET_NOTES_BACKLOG)({ workstream: "Q" }, adminExtra()));
    expect((byWs.items as { id: string }[]).map((i) => i.id)).toEqual(["N66"]);

    const bySearch = data(await handler(GET_NOTES_BACKLOG)({ search: "tab bar" }, adminExtra()));
    expect((bySearch.items as { id: string }[]).map((i) => i.id)).toEqual(["N47"]);
  });

  it("reports truncation rather than silently dropping rows", async () => {
    const out = data(await handler(GET_NOTES_BACKLOG)({ limit: 1 }, adminExtra()));
    expect(out.matched).toBe(2);
    expect(out.returned).toBe(1);
    expect(out.truncated).toBe(true);
  });

  it("omits follow-ups unless asked", async () => {
    expect(data(await handler(GET_NOTES_BACKLOG)({}, adminExtra()))).not.toHaveProperty(
      "follow_ups",
    );
    const withFu = data(
      await handler(GET_NOTES_BACKLOG)({ include_follow_ups: true }, adminExtra()),
    );
    expect((withFu.follow_ups as { id: string }[]).map((f) => f.id)).toEqual(["T-A5"]);
  });
});

describe("capture_notes", () => {
  const base = {
    batch_title: "field notes",
    verbatim: "the splash is still black on launch",
    log_title: "Batch 28 intake via MCP",
    log_body: "- one new item",
  };

  beforeEach(() => {
    area.captureIntake.mockResolvedValue({
      batch: 28,
      created: [{ id: "N67", where: "index" }],
      folded: [],
      commitSha: "deadbeef",
      url: "https://github.com/x/y/commit/deadbeef",
      files: ["docs/notes/backlog.md", "docs/notes/log.md"],
    });
  });

  it("refuses a capture that files nothing — every note gets assessed", async () => {
    const out = data(await handler(CAPTURE_NOTES)(base, adminExtra()));
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/nothing to file/);
    expect(area.captureIntake).not.toHaveBeenCalled();
  });

  it("files new items, defaulting source and date", async () => {
    const out = data(
      await handler(CAPTURE_NOTES)(
        {
          ...base,
          items: [
            {
              title: "Splash still black",
              detail: "Recurrence of N53.",
              type: "B",
              priority: "HIGH",
              workstream: "G",
              relates_to: ["N53"],
            },
          ],
        },
        adminExtra(),
      ),
    );
    expect(out.ok).toBe(true);
    expect(out.batch).toBe(28);
    expect(out.created).toEqual([{ id: "N67", where: "index" }]);
    expect(out.commit_url).toContain("deadbeef");
    const call = area.captureIntake.mock.calls[0][0];
    expect(call.source).toBe("MCP capture");
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.verbatim).toBe(base.verbatim);
  });

  it("accepts a fold-in with no new rows (the dedup path)", async () => {
    area.captureIntake.mockResolvedValue({
      batch: 28,
      created: [],
      folded: ["N53"],
      commitSha: "c0ffee",
      url: "u",
      files: [],
    });
    const out = data(
      await handler(CAPTURE_NOTES)(
        { ...base, fold_into: [{ id: "N53", append: "still repros on 2026-07-30." }] },
        adminExtra(),
      ),
    );
    expect(out.ok).toBe(true);
    expect(out.folded).toEqual(["N53"]);
  });

  it("surfaces an area error as a readable failure, not a crash", async () => {
    area.captureIntake.mockRejectedValue(new Error("fold_into: N99 is not a live row"));
    const out = data(
      await handler(CAPTURE_NOTES)(
        { ...base, fold_into: [{ id: "N99", append: "x" }] },
        adminExtra(),
      ),
    );
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/not a live row/);
  });

  it("honours an explicit date for a caller whose local day differs from UTC", async () => {
    await handler(CAPTURE_NOTES)(
      {
        ...base,
        date: "2026-07-29",
        items: [
          { title: "Something", detail: "d", type: "UX", priority: "LOW", workstream: "G" },
        ],
      },
      adminExtra(),
    );
    expect(area.captureIntake.mock.calls[0][0].date).toBe("2026-07-29");
  });
});

describe("update_note_item", () => {
  beforeEach(() => {
    area.updateItem.mockResolvedValue({
      id: "N47",
      archived: false,
      commitSha: "beef",
      url: "u",
      files: ["docs/notes/backlog.md", "docs/notes/log.md"],
    });
  });

  it("refuses a no-op update", async () => {
    const out = data(
      await handler(UPDATE_NOTE_ITEM)(
        { id: "N47", log_title: "nothing", log_body: "no change at all" },
        adminExtra(),
      ),
    );
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/no change requested/);
    expect(area.updateItem).not.toHaveBeenCalled();
  });

  it("passes the status, PR number and residual through", async () => {
    const out = data(
      await handler(UPDATE_NOTE_ITEM)(
        {
          id: "N47",
          status: "done",
          status_pr: 186,
          status_note: "residual: owner re-checks on device",
          log_title: "N47 shipped",
          log_body: "- tab bar fix merged",
        },
        adminExtra(),
      ),
    );
    expect(out.ok).toBe(true);
    const call = area.updateItem.mock.calls[0][0];
    expect(call).toMatchObject({ id: "N47", status: "done", status_pr: 186 });
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports an archive refusal from the area rather than throwing", async () => {
    area.updateItem.mockRejectedValue(new Error("N66 is not terminal (status: needs-input)"));
    const out = data(
      await handler(UPDATE_NOTE_ITEM)(
        {
          id: "N66",
          archive: { resolution: "closed somehow", sweep_summary: "sweep" },
          log_title: "sweep N66",
          log_body: "- attempting an archive",
        },
        adminExtra(),
      ),
    );
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/not terminal/);
  });
});

describe("append_notes_log", () => {
  it("writes a standalone dated entry", async () => {
    area.appendLog.mockResolvedValue({ commitSha: "abc", url: "u", files: ["docs/notes/log.md"] });
    const out = data(
      await handler(APPEND_NOTES_LOG)(
        { title: "Owner decision in chat", body: "- MEASURE install model settled" },
        adminExtra(),
      ),
    );
    expect(out.ok).toBe(true);
    expect(area.appendLog.mock.calls[0][0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("read_notes_file", () => {
  it("returns a line window with the totals", async () => {
    area.readNotesFile.mockResolvedValue("a\nb\nc\nd\n");
    const out = data(
      await handler(READ_NOTES_FILE)({ path: "archive.md", offset: 1, limit: 2 }, adminExtra()),
    );
    expect(out.total_lines).toBe(5);
    expect(out.content).toBe("b\nc");
    expect(out.from_line).toBe(1);
  });
});

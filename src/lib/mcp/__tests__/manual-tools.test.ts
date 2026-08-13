import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { allSectionIds } from "@/content/manual";
import { registerResources } from "../resources";
import { registerTools } from "../tools";
import {
  GET_MANUAL_SECTION,
  MANUAL_TOOL_NAMES,
  manualRetrievalActive,
  registerManualTools,
  SEARCH_MANUAL,
  suggestSectionIds,
} from "../tools/manual";
import { captureServer, fakeExtra } from "./harness";

/**
 * doc 22 Phase 5 — the connector's retrieval surface (§10.2).
 *
 * Two properties beyond the payload shapes, which `retrieval.test.ts` owns:
 *
 *  1. **Neither tool reads user data.** They are the only tools on the surface
 *     that resolve no session at all, because the manual is identical for every
 *     reader — asserted by invoking them with no auth context whatsoever.
 *  2. **The whole surface is gated on the release that ships the manual**
 *     (doc 23 §9.2). Before 1.1.0 the guide routes 404, so a searchable manual
 *     would only hand out links the reader cannot open.
 */

const { server, tools } = captureServer();
registerManualTools(server);

const call = async (name: string, args: Record<string, unknown>) => {
  const result = (await tools.get(name)!.handler(args, fakeExtra())) as {
    structuredContent: { data: Record<string, unknown> };
  };
  return result.structuredContent.data;
};

describe("search_manual", () => {
  it("answers without an auth context — the manual is not user data", async () => {
    const data = await call(SEARCH_MANUAL, { query: "deload" });
    expect(data.count).toBeGreaterThan(0);
    const results = data.results as { section_id: string; app_route: string }[];
    expect(results[0].section_id).toBe("ug/deloads#what-a-deload-is");
    expect(results[0].app_route).toBe("/more/guide/deloads/what-a-deload-is");
  });

  it("honours a limit and defaults to a readable handful", async () => {
    expect((await call(SEARCH_MANUAL, { query: "set", limit: 3 })).count).toBe(3);
    expect((await call(SEARCH_MANUAL, { query: "set" })).count).toBe(8);
  });

  it("sends an empty search to the map rather than leaving it there", async () => {
    const data = await call(SEARCH_MANUAL, { query: "cholesterol" });
    expect(data.count).toBe(0);
    expect(data.hint).toContain("workout://user-guide-index");
  });

  it("validates the query at the boundary (hard rule 6)", () => {
    const schema = tools.get(SEARCH_MANUAL)!.config.inputSchema as {
      query: { safeParse: (v: unknown) => { success: boolean } };
      limit: { safeParse: (v: unknown) => { success: boolean } };
    };
    expect(schema.query.safeParse("a").success).toBe(false);
    expect(schema.query.safeParse("rir").success).toBe(true);
    expect(schema.limit.safeParse(0).success).toBe(false);
    expect(schema.limit.safeParse(1000).success).toBe(false);
    expect(schema.limit.safeParse(5).success).toBe(true);
  });
});

describe("get_manual_section", () => {
  it("reads a section back as markdown, with its route and neighbours", async () => {
    const data = await call(GET_MANUAL_SECTION, {
      section_id: "ug/effort-rir#what-rir-means",
    });
    expect(data.title).toBeTruthy();
    expect(data.app_route).toBe("/more/guide/effort-rir/what-rir-means");
    expect(String(data.markdown)).toContain(`# ${data.title}`);
    expect(data.next).toBeTruthy();
  });

  it("drops the neighbours on request", async () => {
    const data = await call(GET_MANUAL_SECTION, {
      section_id: "ug/effort-rir#what-rir-means",
      include_related: false,
    });
    expect(data.related).toBeUndefined();
    expect(data.next).toBeUndefined();
  });

  it("fails in band, with the ID it was given and somewhere to go next", async () => {
    // R25's convention: `ok: false` is what the composition root turns into
    // `isError`, so the model sees the miss and can correct itself
    const data = await call(GET_MANUAL_SECTION, {
      section_id: "ug/deloads#no-such-thing",
    });
    expect(data.ok).toBe(false);
    expect(String(data.error)).toContain("ug/deloads#no-such-thing");
    expect(data.suggestions as string[]).toContain("ug/deloads#what-a-deload-is");
  });

  it("suggests from the same chapter first, then from the words asked for", () => {
    expect(suggestSectionIds("ug/deloads#whatever")[0]).toMatch(/^ug\/deloads#/);
    expect(suggestSectionIds("something about volume")).toContain(
      "ug/volume#what-volume-means-here",
    );
    expect(suggestSectionIds("")).toEqual([]);
  });

  it("can read every section the map advertises", async () => {
    for (const id of allSectionIds()) {
      const data = await call(GET_MANUAL_SECTION, { section_id: id });
      expect(data.ok, id).toBeUndefined();
      expect(String(data.markdown).length, id).toBeGreaterThan(80);
    }
  });
});

describe("the release gate (doc 23 §9.2)", () => {
  const src = (rel: string) =>
    readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

  it("registers the tools and the resource only while the manual is live", () => {
    // Both call sites carry the same gate, so the tools and the map they point
    // at can never ship apart from each other — or ahead of the routes.
    expect(src("src/lib/mcp/tools/index.ts")).toContain(
      "if (manualRetrievalActive()) registerManualTools(guarded)",
    );
    expect(src("src/lib/mcp/resources.ts")).toContain(
      "if (manualRetrievalActive()) registerGuideIndex(server)",
    );
  });

  it("puts the tools on the real surface exactly when the gate is open", () => {
    // The outcome, not the source line: registered through the composition
    // root, so the assertion follows the gate through the 1.1.0 release PR
    // instead of having to be remembered by it.
    const capture = captureServer();
    registerTools(capture.server);
    for (const name of MANUAL_TOOL_NAMES) {
      expect(capture.tools.has(name), name).toBe(manualRetrievalActive());
    }
    // and the rest of the surface is unaffected either way
    expect(capture.tools.has("get_current_state")).toBe(true);
  });

  it("opens at 1.1.0 — the release PR is the switch, and this proves it", () => {
    expect(manualRetrievalActive()).toBe(true);
    const capture = captureServer();
    registerTools(capture.server);
    registerResources(capture.server);
    for (const name of MANUAL_TOOL_NAMES) {
      expect(capture.tools.has(name), name).toBe(true);
    }
    expect(capture.resources.get("user-guide-index")?.uri).toBe(
      "workout://user-guide-index",
    );
  });

  it("names both tools for the inventory", () => {
    expect([...MANUAL_TOOL_NAMES].sort()).toEqual([
      "get_manual_section",
      "search_manual",
    ]);
  });
});

describe("the index resource", () => {
  it("is registered under workout://user-guide-index when the gate is open", () => {
    const capture = captureServer();
    registerResources(capture.server);
    const registered = capture.resources.get("user-guide-index");
    expect(Boolean(registered)).toBe(manualRetrievalActive());
    if (registered) expect(registered.uri).toBe("workout://user-guide-index");
  });
});

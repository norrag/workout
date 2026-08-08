import { describe, expect, it } from "vitest";
import { allSectionIds, resolveSection, sectionRoute } from "../index";
import {
  guideIndex,
  searchSections,
  sectionPayload,
  SEARCH_LIMIT_MAX,
} from "../retrieval";
import { everySection } from "./helpers";

/**
 * doc 22 §10 — retrieve-then-read, as the connector will use it.
 *
 * `search.test.ts` already covers ranking; what is asserted here is the
 * *contract* the three payloads owe an assistant: an ID it can read back, a
 * route it can hand the user, a summary it can choose from, and text that
 * carries the section's caveats with it. §10.2's two refinements — every result
 * carries its in-app route, and the glossary is the alias layer — are properties
 * of these payloads, so they are tested as properties.
 */

const index = guideIndex();

describe("workout://user-guide-index — the map", () => {
  it("lists every chapter and every section that exists", () => {
    const listed = index.manuals.flatMap((m) =>
      m.chapters.flatMap((c) => c.sections.map((s) => s.section_id)),
    );
    expect(listed).toEqual(allSectionIds());
    expect(index.sections).toBe(allSectionIds().length);
    expect(index.chapters).toBe(
      index.manuals.reduce((n, m) => n + m.chapters.length, 0),
    );
  });

  it("carries a resolvable ID, a summary, and an in-app route on every entry", () => {
    for (const manual of index.manuals) {
      expect(manual.app_route).toMatch(/^\/more\//);
      for (const chapter of manual.chapters) {
        expect(chapter.summary.length, chapter.chapter_id).toBeGreaterThan(10);
        expect(chapter.app_route).toBe(`${manual.app_route}/${chapter.chapter_id.split("/")[1]}`);
        for (const section of chapter.sections) {
          expect(resolveSection(section.section_id), section.section_id).toBeDefined();
          expect(section.app_route).toBe(sectionRoute(section.section_id));
          expect(section.summary.length, section.section_id).toBeGreaterThan(10);
        }
      }
    }
  });

  it("orders chapters by their reading number", () => {
    for (const manual of index.manuals) {
      const numbers = manual.chapters.map((c) => c.number);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    }
  });

  it("omits a manual with no chapters rather than shipping an empty branch", () => {
    // the AI Manual is Phase 6; until it has a chapter, the map does not
    // advertise a surface a client would then find empty
    expect(index.manuals.map((m) => m.manual)).toEqual(["ug"]);
  });

  it("stays small enough to load once and keep", () => {
    // §10.2 calls it "a few KB". It is a map, not the manual: if this ever
    // approaches the size of the prose it indexes, the summaries have grown
    // into paragraphs and the design claim has quietly stopped holding.
    const bytes = JSON.stringify(index).length;
    expect(bytes).toBeLessThan(60_000);
  });
});

describe("search_manual — ranked pointers", () => {
  it("returns pointers, not prose", () => {
    const [hit] = searchSections("deload");
    expect(hit.section_id).toBe("ug/deloads#what-a-deload-is");
    expect(hit.app_route).toBe(sectionRoute(hit.section_id));
    expect(hit.chapter.length).toBeGreaterThan(0);
    expect(hit.snippet.length).toBeLessThan(200);
    expect(hit.score).toBeGreaterThan(0);
  });

  it("finds a mechanism from plain wording, which is what keywords are for", () => {
    // §10.3's honest limit and its first mitigation: the paraphrase a reader
    // actually types shares little vocabulary with the prose
    const ask = (q: string) => searchSections(q, 5).map((h) => h.section_id);
    expect(ask("why did my weight go up")).toContain(
      "ug/how-your-weight-is-chosen#leading-by-one-step",
    );
    expect(ask("what does the app do with my answers")).toContain(
      "ug/how-it-felt#what-your-answers-do",
    );
  });

  it("resolves a glossary term to the section that defines it", () => {
    expect(searchSections("estimated one-rep max")[0].section_id).toBe(
      "ug/glossary#strength-estimates",
    );
  });

  it("caps and floors the limit rather than trusting it", () => {
    expect(searchSections("set", 1)).toHaveLength(1);
    expect(searchSections("set", 500).length).toBeLessThanOrEqual(SEARCH_LIMIT_MAX);
    expect(searchSections("set", 0).length).toBeGreaterThan(0);
  });

  it("returns nothing rather than noise for a query the manual cannot answer", () => {
    expect(searchSections("cholesterol")).toEqual([]);
  });

  it("points every hit at a section that can then be read", () => {
    for (const hit of searchSections("volume", SEARCH_LIMIT_MAX)) {
      expect(sectionPayload(hit.section_id), hit.section_id).not.toBeNull();
    }
  });
});

describe("get_manual_section — the read step", () => {
  it("returns the section's text, its place, and its route", () => {
    const payload = sectionPayload("ug/effort-rir#the-weeks-ramp")!;
    expect(payload.manual).toBe("ug");
    expect(payload.chapter_number).toBe(6);
    expect(payload.app_route).toBe("/more/guide/effort-rir/the-weeks-ramp");
    expect(payload.position).toMatch(/^\d+ of \d+$/);
    expect(payload.markdown).toContain(`# ${payload.title}`);
  });

  it("carries the authored neighbour graph and reading order by default", () => {
    // doc 22 §9.4.7 — related sections double as the retrieval layer's
    // neighbours, so a section that is *nearly* the answer leads to the one
    // that is
    const payload = sectionPayload("ug/deloads#what-a-deload-is")!;
    expect(payload.related?.length).toBeGreaterThan(0);
    for (const related of payload.related ?? []) {
      expect(resolveSection(related.section_id), related.section_id).toBeDefined();
      expect(related.app_route).toBe(sectionRoute(related.section_id));
    }
    expect(payload.next?.section_id).toBe("ug/deloads#the-week-itself");
  });

  it("drops the neighbours when a caller is reading several in a row", () => {
    const payload = sectionPayload("ug/deloads#what-a-deload-is", {
      includeRelated: false,
    })!;
    expect(payload.related).toBeUndefined();
    expect(payload.next).toBeUndefined();
    expect(payload.previous).toBeUndefined();
    expect(payload.markdown.length).toBeGreaterThan(100);
  });

  it("crosses a chapter boundary in reading order, as the reader does", () => {
    const last = sectionPayload("ug/what-workout-is#the-workout-page")!;
    expect(last.next?.section_id).toBe("ug/your-profile#what-it-is-for");
  });

  it("answers null for an ID that does not resolve", () => {
    expect(sectionPayload("ug/deloads#no-such-section")).toBeNull();
    expect(sectionPayload("not-an-id")).toBeNull();
  });

  it("reads back every section in the manual without a gap", () => {
    for (const entry of everySection) {
      const payload = sectionPayload(entry.id);
      expect(payload, entry.id).not.toBeNull();
      expect(payload!.markdown.length, entry.id).toBeGreaterThan(80);
      expect(payload!.app_route, entry.id).toMatch(/^\/more\/(guide|connector)\//);
    }
  });
});

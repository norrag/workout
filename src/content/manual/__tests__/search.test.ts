import { describe, expect, it } from "vitest";
import { CHAPTERS, resolveSection, sectionRoute } from "../index";
import { buildSearchIndex, searchManual, tokenize } from "../search";
import { everySection } from "./helpers";

/**
 * doc 22 §9.4.3 / §10 — search over the authored section graph.
 *
 * The design claim being tested is §10.1's: authorship already did the
 * chunking, so ranking titled, summarized, keyworded sections is enough and no
 * embedding store is needed. If that claim holds, plain queries land on the
 * section a person would have picked by hand — which is what most of these
 * assert, against the real chapter rather than a fixture.
 */

const index = buildSearchIndex(CHAPTERS);
const top = (query: string) => searchManual(index, query, 5).map((h) => h.doc.id);

describe("tokenizing", () => {
  it("folds case, punctuation, and plurals", () => {
    expect(tokenize("RIR ramps, week-by-week")).toEqual([
      "rir",
      "ramp",
      "week",
      "week",
    ]);
  });

  it("keeps numbers, which the manual states constantly", () => {
    expect(tokenize("3 → 0 over 5 weeks")).toEqual(["3", "0", "over", "5", "week"]);
  });

  it("drops only the words every section carries", () => {
    expect(tokenize("what is the set")).toEqual(["what", "set"]);
  });
});

describe("the index", () => {
  it("has one doc per section, each with a resolvable ID and route", () => {
    expect(index.docs.length).toBe(everySection.length);
    for (const doc of index.docs) {
      expect(resolveSection(doc.id), doc.id).toBeDefined();
      expect(doc.route).toBe(sectionRoute(doc.id));
      expect(doc.body.length).toBeGreaterThan(100);
    }
  });

  it("carries the glossary label as an alias, so a term finds its section", () => {
    // doc 22 §10.2 — the synonym layer a lexical index otherwise lacks. Nothing
    // in ch. 6 writes the words "estimated one-rep max" into a heading; the
    // section is findable by them because it renders the card.
    //
    // Phase 3i shipped chapter 20, so the definitional home now ranks first —
    // which is the right answer to a bare term search, and the same mechanism
    // producing it. Both sections carry the alias; neither writes the phrase.
    const hits = top("estimated one-rep max");
    expect(hits[0]).toBe("ug/glossary#strength-estimates");
    expect(hits).toContain("ug/effort-rir#why-honesty-matters");
  });

  it("indexes layer-3 prose, which is exactly what someone searches for", () => {
    expect(top("interpolation")).toContain("ug/effort-rir#the-weeks-ramp");
  });
});

describe("ranking", () => {
  it("puts the section about a thing above the sections that mention it", () => {
    expect(top("ramp")[0]).toBe("ug/effort-rir#the-weeks-ramp");
    expect(top("effort target")[0]).toBe("ug/effort-rir#per-exercise");
  });

  it("answers a hand-authored keyword the prose never says", () => {
    // §10.3's first mitigation: "why is it lighter" is nowhere in the copy
    expect(top("why is it lighter")[0]).toBe("ug/effort-rir#missing-the-ask");
  });

  it("matches on a prefix, but ranks the whole word above it", () => {
    const prefix = searchManual(index, "delo", 5);
    expect(prefix.length).toBeGreaterThan(0);
    const exact = searchManual(index, "deload", 5);
    expect(exact[0].score).toBeGreaterThan(prefix[0].score);
  });

  it("prefers a section matching every word of the query", () => {
    const hits = searchManual(index, "report rir", 5);
    expect(hits[0].doc.id).toBe("ug/effort-rir#report-what-you-did");
  });

  it("returns nothing for an empty or stopword-only query", () => {
    expect(searchManual(index, "")).toEqual([]);
    expect(searchManual(index, "   ")).toEqual([]);
    expect(searchManual(index, "the and of")).toEqual([]);
  });

  it("returns nothing for a word the manual does not contain", () => {
    expect(searchManual(index, "kettlebellzzz")).toEqual([]);
  });

  it("honors the limit and orders strictly by score", () => {
    const hits = searchManual(index, "rir", 3);
    expect(hits.length).toBe(3);
    for (let i = 1; i < hits.length; i++)
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
  });
});

describe("snippets", () => {
  it("shows the matched word in context, not the top of the section", () => {
    const [hit] = searchManual(index, "interpolation", 1);
    expect(hit.snippet.toLowerCase()).toContain("interpolat");
    expect(hit.snippet.length).toBeLessThan(200);
  });

  it("marks a snippet taken from the middle of a section", () => {
    const [hit] = searchManual(index, "interpolation", 1);
    expect(hit.snippet.startsWith("…")).toBe(true);
  });
});

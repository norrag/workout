import { describe, expect, it } from "vitest";
import {
  allSectionIds,
  budgetBreaches,
  CHAPTERS,
  chaptersFor,
  measureSection,
  parseSectionId,
  resolveSection,
  SECTION_BUDGET,
  sectionId,
  sectionRoute,
} from "../index";
import { GLOSSARY } from "@/lib/glossary";
import type { Inline, ManualBlock, RichText } from "../types";

// ---------------------------------------------------------------------------
// traversal helpers — `detail` children are content too, for everything except
// the length budget (doc 22 §9.3)
// ---------------------------------------------------------------------------

function runs(text: RichText): Inline[] {
  return typeof text === "string" ? [text] : [...text];
}

function blockRuns(block: ManualBlock): Inline[] {
  switch (block.kind) {
    case "heading":
      return [block.text];
    case "para":
      return runs(block.text);
    case "list":
      return block.items.flatMap(runs);
    case "steps":
      return block.steps.flatMap((s) => [s.label, ...runs(s.text)]);
    case "table":
      return [...block.columns, ...block.rows.flatMap((r) => r.flatMap(runs))];
    case "callout":
      return [...(block.label ? [block.label] : []), ...runs(block.text)];
    case "term":
      return [GLOSSARY[block.term].label, GLOSSARY[block.term].body];
    case "link":
      return [block.label];
    case "detail":
      return block.blocks.flatMap(blockRuns);
  }
}

function flatten(blocks: readonly ManualBlock[]): ManualBlock[] {
  return blocks.flatMap((b) =>
    b.kind === "detail" ? [b, ...flatten(b.blocks)] : [b],
  );
}

const everySection = CHAPTERS.flatMap((chapter) =>
  chapter.sections.map((section) => ({
    chapter,
    section,
    id: sectionId(chapter.manual, chapter.slug, section.slug),
  })),
);

function proseOf(section: (typeof everySection)[number]): string {
  return [
    section.section.title,
    section.section.summary,
    ...flatten(section.section.blocks)
      .flatMap(blockRuns)
      .map((run) => {
        if (typeof run === "string") return run;
        if ("ui" in run) return run.ui;
        if ("strong" in run) return run.strong;
        if ("num" in run) return run.num;
        if ("code" in run) return run.code;
        if ("term" in run) return run.text ?? "";
        return run.text;
      }),
  ].join(" ");
}

// ---------------------------------------------------------------------------

describe("section IDs (doc 22 §9.4.2)", () => {
  it("round-trips through parse", () => {
    const parsed = parseSectionId("ug/effort-rir#per-exercise");
    expect(parsed).toEqual({
      manual: "ug",
      chapter: "effort-rir",
      section: "per-exercise",
    });
  });

  it("rejects malformed IDs rather than guessing", () => {
    for (const bad of [
      "effort-rir#per-exercise", // no manual
      "ug/effort-rir", // no section
      "ug/effort-rir#a#b", // two anchors
      "xx/effort-rir#per-exercise", // unknown manual
      "ug/Effort-Rir#per-exercise", // not a slug
      "ug/effort-rir#per_exercise",
      "ug//effort-rir#per-exercise",
      "",
    ]) {
      expect(parseSectionId(bad), bad).toBeNull();
    }
  });

  it("maps each manual to its own reader root (doc 22 D1)", () => {
    expect(sectionRoute("ug/effort-rir#per-exercise")).toBe(
      "/more/guide/effort-rir/per-exercise",
    );
    expect(sectionRoute("ai/setup#connecting")).toBe(
      "/more/connector/guide/setup/connecting",
    );
    expect(sectionRoute("nope")).toBeNull();
  });
});

describe("the registry", () => {
  it("has unique chapter slugs and numbers per manual", () => {
    for (const manual of ["ug", "ai"] as const) {
      const chapters = chaptersFor(manual);
      expect(new Set(chapters.map((c) => c.slug)).size).toBe(chapters.length);
      expect(new Set(chapters.map((c) => c.number)).size).toBe(chapters.length);
    }
  });

  it("has unique section slugs within each chapter", () => {
    for (const chapter of CHAPTERS) {
      const slugs = chapter.sections.map((s) => s.slug);
      expect(new Set(slugs).size, chapter.slug).toBe(slugs.length);
    }
  });

  it("resolves every ID it publishes, and nothing else", () => {
    for (const id of allSectionIds()) {
      expect(resolveSection(id), id).toBeDefined();
    }
    expect(resolveSection("ug/effort-rir#no-such-section")).toBeUndefined();
    expect(resolveSection("ug/no-such-chapter#x")).toBeUndefined();
  });

  it("gives every section a title and a one-line summary", () => {
    for (const { id, section } of everySection) {
      expect(section.title.length, id).toBeGreaterThan(0);
      expect(section.summary.length, id).toBeGreaterThan(20);
      expect(section.summary.length, id).toBeLessThanOrEqual(160);
      expect(section.blocks.length, id).toBeGreaterThan(0);
    }
  });
});

// doc 22 §9.4.5 — cross-links are typed and validated at build. Phase 2 widens
// this to the release registry's `guide` targets (doc 23 §7.2): one validator,
// two consumers.
describe("link targets resolve", () => {
  it("every `link` block, inline cross-link, and `related` entry", () => {
    for (const { id, section } of everySection) {
      const targets: string[] = [...(section.related ?? [])];
      for (const block of flatten(section.blocks)) {
        if (block.kind === "link") targets.push(block.to);
        for (const run of blockRuns(block)) {
          if (typeof run !== "string" && "to" in run) targets.push(run.to);
        }
      }
      for (const target of targets) {
        expect(resolveSection(target), `${id} → ${target}`).toBeDefined();
      }
    }
  });

  it("no section is listed as related to itself", () => {
    for (const { id, section } of everySection) {
      expect(section.related ?? [], id).not.toContain(id);
    }
  });
});

// doc 22 §9.3 — the budget fails the build naming the offending section, so the
// constraint is felt at authoring time rather than discovered by a reader.
describe("section-length budget", () => {
  it("every section fits", () => {
    const over = everySection
      .map(({ id, section }) => ({ id, breaches: budgetBreaches(section) }))
      .filter((r) => r.breaches.length > 0)
      .map((r) => `${r.id}: ${r.breaches.join(", ")}`);
    expect(over).toEqual([]);
  });

  it("a `detail` block costs one row, not its contents (D5 layer 3)", () => {
    const withDetail = everySection.find(({ section }) =>
      section.blocks.some((b) => b.kind === "detail"),
    );
    expect(withDetail, "the exemplar should exercise layer 3").toBeDefined();
    const detail = withDetail!.section.blocks.find((b) => b.kind === "detail")!;
    const size = measureSection(withDetail!.section);
    const withoutDetail = measureSection({
      ...withDetail!.section,
      blocks: withDetail!.section.blocks.filter((b) => b !== detail),
    });
    expect(size.words).toBe(withoutDetail.words);
    expect(size.blocks).toBe(withoutDetail.blocks + 1);
  });

  it("the budget is a ceiling with headroom, not a target", () => {
    const words = everySection.map(({ section }) => measureSection(section).words);
    const median = [...words].sort((a, b) => a - b)[Math.floor(words.length / 2)];
    expect(median).toBeLessThan(SECTION_BUDGET.words * 0.8);
  });
});

// The full doc 22 §8 contract suite lands in Phase 2 with the reader. These are
// the two that cost nothing and that content landing now must already satisfy.
describe("copy discipline", () => {
  it("carries no exclamation marks (hard rule 7)", () => {
    for (const section of everySection) {
      expect(proseOf(section), section.id).not.toContain("!");
    }
  });

  it("uses no hype vocabulary (hard rule 7)", () => {
    const DENY = [
      "amazing",
      "awesome",
      "blazing",
      "crush",
      "effortless",
      "game-chang",
      "incredible",
      "magic",
      "powerful",
      "revolutionary",
      "seamless",
      "supercharge",
      "unlock",
    ];
    for (const section of everySection) {
      const prose = proseOf(section).toLowerCase();
      for (const word of DENY) {
        expect(prose, `${section.id} — "${word}"`).not.toContain(word);
      }
    }
  });

  it("flags a section that states a strength estimate (doc 22 §8.2)", () => {
    for (const section of everySection) {
      const prose = proseOf(section).toLowerCase();
      const statesOne =
        prose.includes("estimated 1rm") || prose.includes("strength estimate");
      if (statesOne) {
        expect(section.section.estimate, section.id).toBe(true);
      }
    }
  });
});

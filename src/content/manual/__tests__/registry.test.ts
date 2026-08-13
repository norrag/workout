import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  adjacentChapters,
  adjacentSections,
  allSectionIds,
  budgetBreaches,
  CHAPTERS,
  chaptersFor,
  measureSection,
  parseSectionId,
  resolveSection,
  readingOrder,
  SECTION_BUDGET,
  sectionRoute,
} from "../index";
import { markLabel } from "../budget";
import { SET_MARKERS } from "@/lib/set-markers";
import { blockRuns, everySection, flatten, REPO_ROOT } from "./helpers";
import type { ManualId } from "../types";

/**
 * Every registered manual. The AI material is now chapter 18 of the Guide.
 */
const MANUALS: readonly ManualId[] = ["ug"];

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

  it("maps Guide sections to the Guide reader", () => {
    expect(sectionRoute("ug/effort-rir#per-exercise")).toBe(
      "/more/guide/effort-rir/per-exercise",
    );
    expect(sectionRoute("ai/setup#connecting")).toBeNull();
    expect(sectionRoute("nope")).toBeNull();
  });
});

describe("the registry", () => {
  it("has unique chapter slugs and numbers per manual", () => {
    for (const manual of MANUALS) {
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

  // Owner review round 2: a link needs to say why it is there. `related` rows
  // render the target's summary, which is the reason — so every section that
  // will be pointed at owes one, and every section that points owes a list.
  it("every section carries a related list, so no link arrives cold", () => {
    for (const { id, section } of everySection) {
      expect((section.related ?? []).length, id).toBeGreaterThan(0);
    }
  });
});

// doc 22 §9.2 — prev/next crosses chapter boundaries, so cover-to-cover
// reading stays "next, next, next" (owner review round 2).
describe.each(MANUALS)("reading order and adjacency — %s", (manual) => {
  it("covers every section of a manual exactly once, in chapter order", () => {
    const order = readingOrder(manual);
    const ids = allSectionIds().filter((id) => id.startsWith(`${manual}/`));
    expect([...order].sort()).toEqual([...ids].sort());
    expect(new Set(order).size).toBe(order.length);
  });

  it("chains forward and backward, with open ends at the extremes", () => {
    const order = readingOrder(manual);
    expect(adjacentSections(order[0]).prev).toBeUndefined();
    expect(adjacentSections(order[order.length - 1]).next).toBeUndefined();
    for (let i = 0; i < order.length - 1; i++) {
      expect(adjacentSections(order[i]).next?.id, order[i]).toBe(order[i + 1]);
      expect(adjacentSections(order[i + 1]).prev?.id, order[i + 1]).toBe(order[i]);
    }
  });

  it("stays within the Guide", () => {
    for (const id of readingOrder(manual)) {
      const { prev, next } = adjacentSections(id);
      expect(prev?.chapter.manual ?? manual).toBe(manual);
      expect(next?.chapter.manual ?? manual).toBe(manual);
    }
  });
});

// doc 22 §9.2 as amended 2026-08-08 (owner review round 3): the map lists
// chapters only, so the chapter page is on the browse path and carries the
// section footer's affordance one level up (09-changelog 2026-08-09 §2).
describe.each(MANUALS)("chapter adjacency — %s", (manual) => {
  it("chains in chapter-number order, with open ends", () => {
    const chapters = chaptersFor(manual);
    expect(adjacentChapters(manual, chapters[0].slug).prev).toBeUndefined();
    expect(
      adjacentChapters(manual, chapters[chapters.length - 1].slug).next,
    ).toBeUndefined();
    for (let i = 0; i < chapters.length - 1; i++) {
      expect(adjacentChapters(manual, chapters[i].slug).next?.slug).toBe(
        chapters[i + 1].slug,
      );
      expect(adjacentChapters(manual, chapters[i + 1].slug).prev?.slug).toBe(
        chapters[i].slug,
      );
    }
  });

  it("stays inside one manual, and shrugs at an unknown slug", () => {
    for (const chapter of chaptersFor(manual)) {
      const { prev, next } = adjacentChapters(manual, chapter.slug);
      expect(prev?.manual ?? manual).toBe(manual);
      expect(next?.manual ?? manual).toBe(manual);
    }
    expect(adjacentChapters(manual, "no-such-chapter")).toEqual({});
  });
});

// Owner review round 2: showing an app element beats describing it — but only
// while the manual shows the SAME element the app renders.
describe("legend marks come from the app, not from the manual", () => {
  it("every mark resolves to a glyph and a name the app defines", () => {
    for (const { id, section } of everySection) {
      for (const block of flatten(section.blocks)) {
        if (block.kind !== "legend") continue;
        for (const item of block.items) {
          const key = item.mark.slice("set-marker:".length);
          expect(Object.keys(SET_MARKERS), `${id} → ${item.mark}`).toContain(key);
          expect(markLabel(item.mark).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("the day view still renders those glyphs from the shared source", () => {
    // WS-J-style source assertion: the marks are one definition, and the screen
    // reads it rather than hardcoding characters the manual would then mirror.
    const dayView = readFileSync(
      path.join(REPO_ROOT, "src/app/(app)/log/[workoutId]/DayView.tsx"),
      "utf8",
    );
    expect(dayView).toContain('from "@/lib/set-markers"');
    expect(dayView).toContain("SET_MARKERS[performance].glyph");
    for (const { glyph } of Object.values(SET_MARKERS)) {
      expect(dayView).not.toContain(`"${glyph}"`);
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

// The doc 22 §8 copy contracts moved to `contracts.test.ts` when Phase 2
// completed the set — one home for the five, so a new chapter has one file to
// satisfy rather than two.

// doc 22 Phase 2 — `figure`. The asset policy is a D3 guard (`guards.test.ts`);
// these are the properties a reader depends on.
describe("figures", () => {
  it("say what they show, and reserve their own space", () => {
    for (const { id, section } of everySection) {
      for (const block of flatten(section.blocks)) {
        if (block.kind !== "figure") continue;
        // a figure renders as a CSS mask, so a reader who cannot see it has
        // nothing at all without this
        expect(block.alt.length, `${id} → ${block.src}`).toBeGreaterThan(20);
        expect(block.width).toBeGreaterThan(0);
        expect(block.height).toBeGreaterThan(0);
      }
    }
  });
});

// The App Router serves static segments ahead of dynamic ones, so a chapter
// slugged `search` would be permanently unreachable behind the search screen.
describe("route segments the reader owns", () => {
  const RESERVED = ["search"];

  it("no chapter claims a slug the guide routes already use", () => {
    for (const chapter of CHAPTERS) {
      expect(RESERVED, `${chapter.manual}/${chapter.slug}`).not.toContain(
        chapter.slug,
      );
    }
  });
});

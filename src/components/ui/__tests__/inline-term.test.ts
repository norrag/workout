import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/**
 * N81 (doc 22 Phase 7) — the inline term's contract, asserted the way
 * `guide-links.test.ts` asserts the mechanism link's: over the source, because
 * what matters here is *where the code is* and *what words the mark covers*.
 *
 * Three properties, each of which is how the affordance stops being trustworthy
 * if it slips:
 *
 * 1. **The marked run is the term itself.** A dotted underline is a promise that
 *    the card behind it defines *this word*. A mark over a paraphrase would open
 *    a card about something the reader did not tap.
 * 2. **The card has one drawing.** `InfoDot` and `InlineTerm` are two triggers
 *    for one card; a second copy of the popover is how one term ends up
 *    explained in two shapes.
 * 3. **The gate lives in the primitive.** Same reason as `GuideLink` (doc 23
 *    §9.2) and the same failure mode if a call site owns it.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SRC = path.join(REPO_ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(item.name) ? [full] : [];
  });
}

const SOURCES = walk(SRC).map((file) => ({
  rel: path.relative(REPO_ROOT, file).split(path.sep).join("/"),
  text: readFileSync(file, "utf8"),
}));

const isTest = (rel: string) =>
  rel.includes("/__tests__/") || rel.endsWith(".test.ts");

const PRIMITIVE = "src/components/ui/InlineTerm.tsx";
const CARD = "src/components/ui/useGlossaryCard.tsx";

/**
 * `<InlineTerm term="x">…</InlineTerm>` call sites whose child is literal text.
 * The manual's renderer passes a variable (it marks whatever the content model
 * says), so it is matched separately below rather than parsed here.
 */
const CALL_SITE =
  /<InlineTerm\s+term="([a-z_0-9]+)"\s*>\s*([^<{][^<]*?)\s*<\/InlineTerm>/g;

interface Site {
  rel: string;
  term: GlossaryKey;
  text: string;
}

const SITES: Site[] = SOURCES.filter(({ rel }) => !isTest(rel)).flatMap(
  ({ rel, text }) =>
    [...text.matchAll(CALL_SITE)].map((m) => ({
      rel,
      term: m[1] as GlossaryKey,
      text: m[2].replace(/\s+/g, " ").trim(),
    })),
);

describe("the inline term marks the word it defines", () => {
  it("finds the call sites (guards the matcher)", () => {
    expect(SITES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(SITES.map((s): [string, Site] => [`${s.rel} → ${s.term}`, s]))(
    "%s names a term the glossary defines",
    (_label, site) => {
      expect(GLOSSARY[site.term], site.term).toBeDefined();
    },
  );

  it.each(SITES.map((s): [string, Site] => [`${s.rel} → "${s.text}"`, s]))(
    "%s marks the term's own word, not a paraphrase",
    (_label, site) => {
      // the label is the app's tracked-caps form; the sentence says it in its
      // own case and number. Anything else is a mark over the wrong words.
      const label = GLOSSARY[site.term].label.toLowerCase();
      const marked = site.text.toLowerCase().replace(/[.,;:]$/, "");
      expect(
        marked === label || marked === `${label}s`,
        `"${site.text}" is not ${GLOSSARY[site.term].label} — mark the term, not the phrase around it`,
      ).toBe(true);
    },
  );

  it("marks a term at most once per file", () => {
    // 09-changelog 2026-08-15 session 3 §2: first use only. A screen that marks
    // the same word three times is decoration, not an affordance.
    for (const rel of new Set(SITES.map((s) => s.rel))) {
      const inFile = SITES.filter((s) => s.rel === rel).map((s) => s.term);
      expect(new Set(inFile).size, `${rel} marks a term twice`).toBe(
        inFile.length,
      );
    }
  });
});

describe("one card, one gate", () => {
  it("draws the card in exactly one place", () => {
    const drawings = SOURCES.filter(
      ({ rel, text }) =>
        !isTest(rel) &&
        // the manual's `term` block renders the same copy as a static card in
        // the flow, which is the block model's job rather than a second popover
        rel !== "src/components/manual/ManualBlocks.tsx" &&
        /role="dialog"/.test(text) &&
        /entry\.body/.test(text),
    ).map(({ rel }) => rel);
    expect(drawings).toEqual([CARD]);
  });

  it("keeps both triggers on the shared card", () => {
    for (const rel of [PRIMITIVE, "src/components/ui/InfoDot.tsx"]) {
      const source = SOURCES.find((s) => s.rel === rel)!;
      expect(source.text, rel).toMatch(/useGlossaryCard/);
    }
  });

  it("gates the affordance in the primitive", () => {
    const primitive = SOURCES.find((s) => s.rel === PRIMITIVE)!;
    expect(primitive.text).toMatch(/releaseActive\(UNRELEASED_VERSION\)/);
    // closed, the words still render — a gate that dropped the run would
    // delete a word out of the middle of a sentence
    expect(primitive.text).toMatch(/return <>\{children\}<\/>/);
  });

  it("leaves no call site drawing its own underline", () => {
    const freehand = SOURCES.filter(
      ({ rel, text }) =>
        !isTest(rel) &&
        rel !== PRIMITIVE &&
        /decoration-dotted/.test(text),
    ).map(({ rel }) => rel);
    expect(freehand).toEqual([]);
  });
});

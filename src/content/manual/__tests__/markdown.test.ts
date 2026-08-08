import { describe, expect, it } from "vitest";
import { GLOSSARY } from "@/lib/glossary";
import { SET_MARKERS } from "@/lib/set-markers";
import { ESTIMATE_CAVEAT, resolveSection, sectionRoute } from "../index";
import { richTextToMarkdown, sectionToMarkdown } from "../markdown";
import type { ManualSection } from "../types";
import { everySection, flatten, proseOf } from "./helpers";

/**
 * doc 22 §10.2 — the read step of retrieve-then-read.
 *
 * The property that matters is not the markdown dialect: it is that the section
 * a model reads is the section the reader sees. So the assertions below are
 * mostly about *nothing being lost* — every block kind survives, the glossary's
 * own words survive, the honesty caveat survives, and a cross-link arrives as a
 * route the user can actually open.
 */

const section = (id: string): ManualSection => resolveSection(id)!.section;

describe("inline runs", () => {
  it("renders each run in a form a model can act on", () => {
    expect(
      richTextToMarkdown([
        "the ",
        { ui: "Log set" },
        " button adds ",
        { num: "2.5" },
        " lb, per ",
        { code: "engine_params.increment" },
        " — ",
        { strong: "always" },
        ".",
      ]),
    ).toBe(
      'the "Log set" button adds 2.5 lb, per `engine_params.increment` — **always**.',
    );
  });

  it("renders a term as the app's own label", () => {
    expect(richTextToMarkdown([{ term: "deload" }])).toBe(
      `**${GLOSSARY.deload.label}**`,
    );
    expect(richTextToMarkdown([{ term: "deload", text: "deload week" }])).toBe(
      "**deload week**",
    );
  });

  it("renders a cross-link as its in-app route, not its section ID", () => {
    // doc 22 §10.2 — the connector and the app point at the same section, so a
    // model can hand the user something tappable
    const to = "ug/effort-rir#what-rir-means";
    expect(richTextToMarkdown([{ to, text: "reps in reserve" }])).toBe(
      `[reps in reserve](${sectionRoute(to)})`,
    );
  });

  it("falls back to the link text when a target cannot resolve", () => {
    expect(richTextToMarkdown([{ to: "nonsense", text: "elsewhere" }])).toBe(
      "elsewhere",
    );
  });
});

describe("blocks", () => {
  it("renders every block kind the model allows", () => {
    const md = sectionToMarkdown({
      slug: "x",
      title: "T",
      summary: "S",
      blocks: [
        { kind: "heading", text: "A HEADING" },
        { kind: "para", text: "A paragraph." },
        { kind: "list", items: ["one", "two"] },
        { kind: "list", ordered: true, items: ["first", "second"] },
        { kind: "steps", steps: [{ label: "STEP", text: "do it" }] },
        {
          kind: "table",
          columns: ["Week", "RIR"],
          rows: [[[{ num: "1" }], "3"]],
        },
        { kind: "callout", tone: "honesty", label: "AN ESTIMATE", text: "careful" },
        { kind: "callout", tone: "note", text: "a note" },
        { kind: "term", term: "rir" },
        {
          kind: "legend",
          items: [{ mark: "set-marker:over", text: "you beat it" }],
        },
        { kind: "figure", src: "/manual/x.svg", alt: "a shape", width: 1, height: 1 },
        { kind: "link", to: "ug/deloads#what-a-deload-is", label: "Deloads" },
        { kind: "detail", blocks: [{ kind: "para", text: "the pedantry" }] },
      ],
    });

    expect(md).toContain("# T");
    expect(md).toContain("### A HEADING");
    expect(md).toContain("- one\n- two");
    expect(md).toContain("1. first\n2. second");
    expect(md).toContain("1. **STEP** — do it");
    expect(md).toContain("| Week | RIR |\n| --- | --- |\n| 1 | 3 |");
    expect(md).toContain("> **AN ESTIMATE** — careful");
    expect(md).toContain("> a note");
    expect(md).toContain(`> **${GLOSSARY.rir.label}** — ${GLOSSARY.rir.body}`);
    expect(md).toContain(`- ${SET_MARKERS.over.glyph} **${SET_MARKERS.over.label}**`);
    expect(md).toContain("**Figure.** a shape");
    expect(md).toContain("[Deloads](/more/guide/deloads/what-a-deload-is)");
    // doc 22 D5 layer 3 is collapsed on screen but never withheld from a read
    expect(md).toContain("**The exact rule.**");
    expect(md).toContain("the pedantry");
  });

  it("escapes a pipe so a table cell cannot end its own column", () => {
    const md = sectionToMarkdown({
      slug: "x",
      title: "T",
      summary: "S",
      blocks: [{ kind: "table", columns: ["a|b"], rows: [["c|d"]] }],
    });
    expect(md).toContain("| a\\|b |");
    expect(md).toContain("| c\\|d |");
  });
});

describe("a whole section", () => {
  it("keeps the estimate caveat the screen renders under it", () => {
    // doc 22 §8.2 / doc 10 §9 — dropping the caveat on the way to a model is
    // exactly the overclaiming the guardrails exist to prevent
    const estimating = everySection.filter((e) => e.section.estimate);
    expect(estimating.length).toBeGreaterThan(0);
    for (const entry of estimating) {
      const md = sectionToMarkdown(entry.section, {
        estimateCaveat: ESTIMATE_CAVEAT,
      });
      expect(md, entry.id).toContain(ESTIMATE_CAVEAT);
    }
  });

  it("adds the caveat only where the author flagged one", () => {
    const plain = everySection.find((e) => !e.section.estimate)!;
    expect(
      sectionToMarkdown(plain.section, { estimateCaveat: ESTIMATE_CAVEAT }),
    ).not.toContain(ESTIMATE_CAVEAT);
  });

  it("carries every real section's prose through, block for block", () => {
    // the anti-drift assertion: whatever a section says on screen, the model
    // reads. Checked over the whole manual rather than a fixture, so a new
    // block kind that this renderer forgets fails here.
    for (const entry of everySection) {
      const md = sectionToMarkdown(entry.section, {
        estimateCaveat: ESTIMATE_CAVEAT,
      });
      expect(md.startsWith(`# ${entry.section.title}`), entry.id).toBe(true);
      expect(md, entry.id).toContain(entry.section.summary);
      expect(
        md.length,
        `${entry.id} rendered shorter than its own prose`,
      ).toBeGreaterThan(proseOf(entry).length * 0.6);
      expect(md, entry.id).not.toContain("undefined");
      expect(md, entry.id).not.toContain("[object Object]");
    }
  });

  it("names every heading and every step label the reader sees", () => {
    for (const entry of everySection) {
      const md = sectionToMarkdown(entry.section);
      for (const block of flatten(entry.section.blocks)) {
        if (block.kind === "heading") expect(md, entry.id).toContain(block.text);
        if (block.kind === "steps") {
          for (const step of block.steps) {
            expect(md, entry.id).toContain(`**${step.label}**`);
          }
        }
      }
    }
  });

  it("quotes chapter 6's RIR section the way the screen shows it", () => {
    const md = sectionToMarkdown(section("ug/effort-rir#what-rir-means"));
    expect(md).toContain(`# ${section("ug/effort-rir#what-rir-means").title}`);
    expect(md).toContain(GLOSSARY.rir.body);
  });
});

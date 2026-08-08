import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { z } from "zod";
import { engineParamsSchema } from "@/lib/engine/params";
import { resolveSection } from "../index";
import {
  authoredProseOf,
  blockRuns,
  everySection,
  flatten,
  proseOf,
  REPO_ROOT,
  runText,
} from "./helpers";
import type { ManualBlock } from "../types";

/**
 * doc 22 §8 — the content contracts, each enforced by a test so drift is caught
 * in CI rather than by someone reading 21 chapters written weeks apart.
 *
 * Phase 1 shipped the two that cost nothing (no exclamation marks, no hype).
 * Phase 2 owes the rest: glossary identity, the honesty contract in full, the
 * claims ledger, positive framing, and plain language.
 */

// ---------------------------------------------------------------------------
// §8.1 — the glossary is one source, not two
// ---------------------------------------------------------------------------

/**
 * §8.1's end state, reached in Phase 3i: **every** `GlossaryKey` resolves to a
 * `term` block. The scaffolding it replaces was `PENDING_GLOSSARY_TERMS`, a list
 * that could only shrink — a reasonable contract while chapters were landing one
 * at a time, and dead weight once chapter 20 exists.
 *
 * Chapter 20 is what retires it. The chapter groups the terms by hand (reading
 * order is an authorial decision, not `Object.keys()` order) and the assertion
 * below is what makes it *generated* in the sense that matters: a term added to
 * `glossary.ts` and not filed into a group fails CI.
 */
const GLOSSARY_CHAPTER = "ug/glossary";

function termsRenderedBy(blocks: readonly ManualBlock[]): GlossaryKey[] {
  return flatten(blocks).flatMap((block) =>
    block.kind === "term" ? [block.term] : [],
  );
}

const covered = new Set(
  everySection.flatMap(({ section }) => termsRenderedBy(section.blocks)),
);

describe("§8.1 — the glossary is one source, not two", () => {
  it("renders a definition only through a `term` block, never in its own words", () => {
    // the renderer reads `GLOSSARY[key].body` at render time, so identity is
    // structural. What a test can still catch is the manual *restating* a
    // definition in prose beside the card that already carries it.
    for (const entry of everySection) {
      const prose = flatten(entry.section.blocks)
        .filter((b) => b.kind !== "term")
        .flatMap(blockRuns)
        .map(runText)
        .join(" ");
      for (const [key, term] of Object.entries(GLOSSARY)) {
        const opening = term.body.split(/[.—]/)[0].trim();
        if (opening.length < 30) continue;
        expect(prose, `${entry.id} restates GLOSSARY.${key}`).not.toContain(
          opening,
        );
      }
    }
  });

  it("renders every glossary key somewhere in the guide", () => {
    for (const key of Object.keys(GLOSSARY) as GlossaryKey[]) {
      expect(covered.has(key), `GLOSSARY.${key} is never rendered`).toBe(true);
    }
  });

  it("files every glossary key into chapter 20, exactly once", () => {
    const inChapter = everySection
      .filter((entry) => entry.id.startsWith(`${GLOSSARY_CHAPTER}#`))
      .flatMap((entry) => termsRenderedBy(entry.section.blocks));
    expect(inChapter.length, "chapter 20 renders nothing").toBeGreaterThan(0);
    for (const key of Object.keys(GLOSSARY) as GlossaryKey[]) {
      expect(
        inChapter.filter((k) => k === key).length,
        `GLOSSARY.${key} appears ${inChapter.filter((k) => k === key).length}× in chapter 20 — file it into exactly one group`,
      ).toBe(1);
    }
    for (const key of inChapter) {
      expect(GLOSSARY[key], `chapter 20 renders unknown term ${key}`).toBeDefined();
    }
  });

  it("uses the app's own label whenever it names a term inline", () => {
    // an inline `{ term }` run renders `GLOSSARY[key].label`; an override is
    // allowed for grammar, but it may not rename the term
    for (const entry of everySection) {
      for (const block of flatten(entry.section.blocks)) {
        for (const run of blockRuns(block)) {
          if (typeof run === "string" || !("term" in run)) continue;
          expect(GLOSSARY[run.term], `${entry.id} → ${run.term}`).toBeDefined();
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §8.2 — the honesty contract
// ---------------------------------------------------------------------------

/**
 * Does `a.b.c` name a real engine parameter?
 *
 * Checked against the **schema**, not against `DEFAULT_ENGINE_PARAMS`. Several
 * live parameters are `.optional()` so that pre-v11 rows still parse
 * byte-identically, which means they are absent from the defaults while being
 * very much present on the active row — `e1rm.brzycki_max_eff_reps` (10 on v25)
 * is exactly that shape, and it is one of the values chapter 6 states.
 */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let node = schema;
  for (;;) {
    const def = node._def as { innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny };
    const inner = def.innerType ?? def.schema;
    if (!inner) return node;
    node = inner;
  }
}

function paramPathExists(pathExpr: string): boolean {
  let node: z.ZodTypeAny = engineParamsSchema;
  for (const key of pathExpr.split(".")) {
    const unwrapped = unwrap(node);
    if (!(unwrapped instanceof z.ZodObject)) return false;
    const shape = unwrapped.shape as Record<string, z.ZodTypeAny>;
    if (!(key in shape)) return false;
    node = shape[key];
  }
  return true;
}

/** A `code` run shaped like a parameter path rather than a column or a file. */
const PARAM_PATH = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

/**
 * Phase 3e: several live parameters sit at the **top level** of the row —
 * `pain_gate`, `workload_high`, `min_sets` — so a dotted shape is not what
 * makes a run a citation. A bare identifier is ambiguous on its face (it could
 * be a column, a flag, a file), so it counts as a citation only when the schema
 * recognises it. Dotted paths keep their own, stricter contract below: cite one
 * that does not resolve and the suite fails.
 */
function citesParam(code: string): boolean {
  if (PARAM_PATH.test(code)) return true;
  return /^[a-z][a-z0-9_]*$/.test(code) && paramPathExists(code);
}

describe("§8.2 — the honesty contract", () => {
  it("carries no exclamation marks (hard rule 7)", () => {
    for (const entry of everySection) {
      expect(proseOf(entry), entry.id).not.toContain("!");
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
    for (const entry of everySection) {
      const prose = proseOf(entry).toLowerCase();
      for (const word of DENY) {
        expect(prose, `${entry.id} — "${word}"`).not.toContain(word);
      }
    }
  });

  it("claims no precision the engine does not have (doc 10 §9)", () => {
    const OVERCLAIM =
      /\bguaranteed?\b|\bprecisely\b|\btested max\b|\byour true (?:one[- ]rep )?max\b|\bperfectly\b|\bproven to\b/i;
    // sentence by sentence, skipping the negated form — "an estimate, not a
    // tested max" is the guardrail's own wording, and a flat denylist would
    // forbid doc 10 §9 from being stated at all
    const NEGATED = /\bnot\b|\bnever\b|\brather than\b|\bwithout\b/i;
    for (const entry of everySection) {
      for (const sentence of proseOf(entry).split(/(?<=[.?])\s+/)) {
        const hit = sentence.match(OVERCLAIM);
        if (!hit || NEGATED.test(sentence)) continue;
        expect(hit[0], `${entry.id}: "${sentence}"`).toBeUndefined();
      }
    }
  });

  it("flags any section that states a strength estimate", () => {
    for (const entry of everySection) {
      const prose = proseOf(entry).toLowerCase();
      const statesOne =
        prose.includes("estimated one-rep max") ||
        prose.includes("estimated 1rm") ||
        prose.includes("strength estimate") ||
        prose.includes("e1rm");
      if (statesOne) expect(entry.section.estimate, entry.id).toBe(true);
    }
  });

  it("never frames a deload as a growth or strength builder (§6.1)", () => {
    const GROWTH = /\bdeload\b[^.]*\b(?:grow|growth|gains?|builds?|stronger)\b/i;
    for (const entry of everySection) {
      const prose = proseOf(entry);
      // the glossary's own "protects progress rather than builds it" is the
      // honest form, so the pattern is checked sentence by sentence
      for (const sentence of prose.split(/(?<=[.?])\s+/)) {
        if (!/\bdeload/i.test(sentence)) continue;
        if (/rather than|not a\b|never/i.test(sentence)) continue;
        expect(GROWTH.test(sentence), `${entry.id}: "${sentence}"`).toBe(false);
      }
    }
  });

  it("cites only `engine_params` paths that exist", () => {
    for (const entry of everySection) {
      for (const block of flatten(entry.section.blocks)) {
        for (const run of blockRuns(block)) {
          if (typeof run === "string" || !("code" in run)) continue;
          if (!PARAM_PATH.test(run.code)) continue;
          expect(
            paramPathExists(run.code),
            `${entry.id} cites ${run.code}, which is not an engine parameter`,
          ).toBe(true);
        }
      }
    }
  });

  it("states a live default only next to the parameter that sets it", () => {
    // "currently 6 RIR (`deload.target_rir`)" is the shape: a number the
    // engine owns is greppable back to the row that owns it, so a param change
    // finds the prose that states it (§8.2, last bullet)
    for (const entry of everySection) {
      for (const block of flatten(entry.section.blocks)) {
        if (block.kind === "detail") continue;
        const inlines = blockRuns(block);
        const text = inlines.map(runText).join(" ");
        if (!/\bcurrently\b/i.test(text)) continue;
        const hasNumber = inlines.some(
          (run) => typeof run !== "string" && "num" in run,
        );
        if (!hasNumber) continue;
        const hasPath = inlines.some(
          (run) =>
            typeof run !== "string" && "code" in run && citesParam(run.code),
        );
        expect(
          hasPath,
          `${entry.id} states a current value with no engine_params path: "${text}"`,
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §8.3 — the claims ledger
// ---------------------------------------------------------------------------

describe("§8.3 — the claims ledger", () => {
  const ledger = readFileSync(
    path.join(REPO_ROOT, "docs/22a-manual-claims.md"),
    "utf8",
  );

  interface Row {
    readonly id: string;
    readonly locations: string[];
    readonly verified: string;
  }

  const rows: Row[] = ledger
    .split("\n")
    .filter((line) => /^\|\s*`?C-[a-z0-9]+-[0-9]+[a-z]?`?\s*\|/i.test(line))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      const id = cells[1].replace(/`/g, "");
      // a row may cite several sections, and a follow-on may be written as the
      // bare anchor (`#per-exercise`) against the previous full ID
      let chapter = "";
      const locations: string[] = [];
      for (const token of cells[2].match(/`[^`]+`/g) ?? []) {
        const raw = token.replace(/`/g, "");
        if (raw.startsWith("#")) {
          if (chapter) locations.push(`${chapter}${raw}`);
          continue;
        }
        if (!raw.includes("#")) continue;
        chapter = raw.split("#")[0];
        locations.push(raw);
      }
      return { id, locations, verified: cells[5] ?? "" };
    });

  it("parses (guards the parser itself)", () => {
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.every((r) => r.locations.length > 0)).toBe(true);
  });

  it("gives every claim a unique ID", () => {
    const seen = new Set<string>();
    for (const row of rows) {
      expect(seen.has(row.id), `duplicate claim ${row.id}`).toBe(false);
      seen.add(row.id);
    }
  });

  it("points every claim at a section that exists", () => {
    for (const row of rows)
      for (const id of row.locations)
        expect(resolveSection(id), `${row.id} → ${id}`).toBeDefined();
  });

  it("records a verification date on every claim", () => {
    for (const row of rows)
      expect(row.verified, `${row.id} is unverified`).toMatch(
        /✓\s*\d{4}-\d{2}-\d{2}/,
      );
  });

  it("has a claim for every section that makes one", () => {
    // a section states something about app behavior; the ledger is where that
    // statement is pinned to code. Chapter 6 is fully covered, and this keeps
    // Phase 3's chapters from landing prose with no ledger rows.
    const claimed = new Set(rows.flatMap((r) => r.locations));
    for (const entry of everySection)
      expect(claimed.has(entry.id), `${entry.id} has no ledger row`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §8.4 — positive framing
// ---------------------------------------------------------------------------

describe("§8.4 — positive framing", () => {
  /**
   * Narrow on purpose. A blanket ban on "does not" would flag the sentences
   * §8.2 *requires* — "a deload is not a growth booster", "it never deletes
   * logged history" — where the negative is the honest statement. What §1.2
   * actually forbids is describing the app by what it lacks, so the patterns
   * below match capability-absence and comparison, not negation.
   */
  const ABSENCE = [
    /\b(?:the app|workout|it|we)\s+(?:does not|doesn't|do not|don't|cannot|can't|won't|will not)\s+(?:support|track|handle|offer|include|do|have)\b/i,
    /\bnot supported\b/i,
    /\bno support for\b/i,
    /\bunlike (?:other|most|some)\b/i,
    /\bthere is no way to\b/i,
    /\bisn't (?:a|an) .*\bapp\b/i,
  ];

  /**
   * §8.4d rule 3 (owner review round 5, 2026-08-11): a third shape of the same
   * failure. §8.4's list above catches capability-absence and §8.4b rule 5
   * catches the rhetorical "X is not Y, it is Y"; this catches praising the app
   * for an absence of friction — "nothing to wait for and nothing to confirm",
   * "nothing about it is hidden". Every one of these is a virtue the sentence
   * could have stated directly, and the owner's word for it was
   * self-congratulatory.
   */
  const VIRTUE_BY_NEGATION = [
    /\bnothing (?:to (?:wait|confirm|configure|set up|remember|do)|else to)\b/i,
    /\bnothing (?:about it )?is (?:hidden|lost)\b/i,
    /\bnothing is lost\b/i,
    /\bno need to\b/i,
    /\bwithout having to\b/i,
    /\bnever have to\b/i,
    /\bno waiting\b/i,
  ];

  it("states a virtue directly rather than as an absence (§8.4d)", () => {
    // authored prose only: `GLOSSARY.e1rm` says an estimate means "you never
    // have to test one", which is the card's own way of saying what an estimate
    // is for. §8.1 makes that text the app's to change, not the manual's.
    for (const entry of everySection) {
      const prose = authoredProseOf(entry);
      for (const pattern of VIRTUE_BY_NEGATION) {
        const hit = prose.match(pattern);
        expect(hit?.[0], `${entry.id}: "${hit?.[0]}" — say what happens`).toBeUndefined();
      }
    }
  });

  it("describes what the app is, not what it is not (§1.2)", () => {
    for (const entry of everySection) {
      const prose = proseOf(entry);
      for (const pattern of ABSENCE) {
        const hit = prose.match(pattern);
        expect(hit?.[0], `${entry.id}: "${hit?.[0]}"`).toBeUndefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §8.5 — plain-language vocabulary
// ---------------------------------------------------------------------------

describe("§8.5 — plain-language vocabulary", () => {
  /**
   * O4: start from zero and use the words a reader already has. The AI Manual
   * is where this bites; it is enforced from now so Phase 6 inherits it rather
   * than being retrofitted.
   */
  const JARGON: readonly { readonly pattern: RegExp; readonly say: string }[] = [
    { pattern: /\bLLMs?\b/, say: "Claude or ChatGPT" },
    { pattern: /\blarge language model/i, say: "Claude or ChatGPT" },
    { pattern: /\bOAuth\b/i, say: "sign in and approve" },
    { pattern: /\bJSON-?RPC\b/i, say: "(drop it)" },
    { pattern: /\bAPI\b/, say: "(drop it)" },
  ];

  /**
   * §8.5's one allowance: `MCP` may appear where the reader has to find that
   * word in their own AI client's interface. Phase 3i takes it for the first
   * time — ch. 18's setup section, where the app's own field reads
   * `ADD THIS AS A CUSTOM / REMOTE MCP CONNECTOR` and a reader who has not been
   * told the word cannot complete the step. Phase 6 adds the AI Manual's own
   * setup section for the same reason and on the same evidence — those two
   * sections are the entire allowance, and both quote the app's label rather
   * than teaching the abbreviation as vocabulary.
   */
  const MAY_SAY_MCP: readonly string[] = [
    "ug/connecting-an-ai#setting-one-up",
    "ai/setup#connecting",
  ];

  it("uses the reader's words, not the build's", () => {
    for (const entry of everySection) {
      const prose = proseOf(entry);
      for (const { pattern, say } of JARGON) {
        const hit = prose.match(pattern);
        expect(
          hit?.[0],
          `${entry.id} says "${hit?.[0]}" — say ${say}`,
        ).toBeUndefined();
      }
    }
  });

  it("says MCP only where the reader must find that word themselves", () => {
    for (const entry of everySection) {
      if (MAY_SAY_MCP.includes(entry.id)) continue;
      expect(/\bMCP\b/.test(proseOf(entry)), entry.id).toBe(false);
    }
  });

  it("glosses `endpoint` wherever it uses the word", () => {
    for (const entry of everySection) {
      const prose = proseOf(entry);
      if (!/\bendpoint\b/i.test(prose)) continue;
      expect(/\bweb address\b|\baddress\b/i.test(prose), entry.id).toBe(true);
    }
  });
});

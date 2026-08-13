// doc 22 D2 — the manual's block model.
//
// Content is *data*, not markup and not markdown: a closed union rendered by
// house-styled components (`src/components/manual/`). One artifact then backs
// the renderer, the search index, the anchor map, and the connector's retrieval
// surface (doc 22 §10) — which is the whole reason for typing it rather than
// authoring MDX.
//
// The union is closed on purpose. A new block kind is a design decision, so it
// goes through the 09-changelog like every other rendered pattern; the compiler
// makes that unavoidable rather than aspirational.

import type { GlossaryKey } from "@/lib/glossary";
import type { SetMarker } from "@/lib/set-markers";

// ---------------------------------------------------------------------------
// Inline runs
// ---------------------------------------------------------------------------

/**
 * A span inside a paragraph. Deliberately small: emphasis, numbers, code
 * identifiers, glossary references, and cross-links. There is no inline colour,
 * no inline size, and no arbitrary class — hard rule 7 lives in the renderer,
 * not in the content.
 */
export type Inline =
  | string
  /** app copy quoted verbatim — a label, a control, a line the screen shows */
  | { readonly ui: string }
  /** semibold — one clause per section at most */
  | { readonly strong: string }
  /** tabular numerals (`.numeral`): every figure the manual states */
  | { readonly num: string }
  /** an identifier the reader could grep — an `engine_params` path, a column */
  | { readonly code: string }
  /**
   * A glossary reference. Renders the term's app label; the definition itself
   * only ever appears through a `term` block, so §8.1 identity is structural.
   */
  | { readonly term: GlossaryKey; readonly text?: string }
  /** a cross-link to another section, by ID (`ug/effort-rir#per-exercise`) */
  | { readonly to: string; readonly text: string };

/** A paragraph's content: a plain string, or a run of inline spans. */
export type RichText = string | readonly Inline[];

/**
 * An app mark the manual may show the reader verbatim, keyed to where it is
 * defined in the app. Closed, and it grows one entry per design decision —
 * a mark the manual can draw is a mark the app actually renders.
 */
export type ManualMark = `set-marker:${SetMarker}`;

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type ManualBlock =
  /** a tracked-caps rule inside a section (never a second `h1`) */
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "para"; readonly text: RichText }
  | {
      readonly kind: "list";
      readonly ordered?: boolean;
      readonly items: readonly RichText[];
    }
  /** an ordered procedure: each step is a tracked-caps label plus one line */
  | {
      readonly kind: "steps";
      readonly steps: readonly { readonly label: string; readonly text: RichText }[];
    }
  | {
      readonly kind: "table";
      readonly columns: readonly string[];
      readonly rows: readonly (readonly RichText[])[];
    }
  /**
   * A bordered aside. `honesty` carries a tracked-caps label and is the form
   * doc 10 §9's guardrails take in prose — an estimate named as an estimate.
   */
  | {
      readonly kind: "callout";
      readonly tone: "note" | "honesty";
      readonly label?: string;
      readonly text: RichText;
    }
  /** a glossary card, rendered from `glossary.ts` at render time (§8.1) */
  | { readonly kind: "term"; readonly term: GlossaryKey }
  /**
   * Show the reader the actual mark, next to what it means (owner review round
   * 2, 2026-08-07). Demonstrating an app element beats describing it, and it is
   * something this format can do that spec prose cannot.
   *
   * The vocabulary is closed for the same reason the block union is: a symbol
   * the manual invents is a symbol the app does not have. Each mark renders
   * from the app's own definition — `SET_MARKERS` — so the manual and the
   * screen cannot drift.
   */
  | {
      readonly kind: "legend";
      readonly items: readonly {
        readonly mark: ManualMark;
        readonly text: RichText;
      }[];
    }
  /**
   * A drawn figure — doc 22 D2, built in Phase 2 with its asset policy
   * (09-changelog 2026-08-08 §5).
   *
   * The asset is **single-colour line art** under `public/manual/`, rendered as
   * a CSS mask filled with `currentColor` rather than as an `<img>`. That is
   * what makes a figure theme-correct: the app has an explicit light/dark
   * switch on `<html data-theme>`, so baked ink would disappear in one of them
   * and `prefers-color-scheme` cannot see an explicit override.
   *
   * `width`/`height` are the asset's own aspect, reserving space so a figure
   * never shifts the prose it sits in.
   */
  | {
      readonly kind: "figure";
      /** `/manual/<name>.svg` — the path policy the guards assert */
      readonly src: string;
      /** what the figure says, for a reader who cannot see it */
      readonly alt: string;
      readonly width: number;
      readonly height: number;
      readonly caption?: RichText;
    }
  /** a standalone onward link to another section */
  | { readonly kind: "link"; readonly to: string; readonly label: string }
  /**
   * doc 22 D5 layer 3 — "the exact rule". Collapsed by default and therefore
   * excluded from the §9.3 length budget, which is what lets layers 1–2 stay
   * readable while the pedantry still has somewhere honest to live.
   */
  | { readonly kind: "detail"; readonly blocks: readonly ManualBlock[] };

export type ManualBlockKind = ManualBlock["kind"];

/** Every figure asset lives here, so one glob covers the whole asset policy. */
export const FIGURE_ROOT = "/manual/";

// ---------------------------------------------------------------------------
// Sections and chapters
// ---------------------------------------------------------------------------

/** The built-in Guide. The former AI Manual now lives in chapter 18. */
export type ManualId = "ug";

export interface ManualSection {
  /** stable slug, unique within its chapter; renaming one is a breaking change */
  readonly slug: string;
  /** sentence case; the screen's own heading */
  readonly title: string;
  /** one line. Feeds the chapter contents, search results, and the connector index */
  readonly summary: string;
  /**
   * doc 22 §10.3 — hand-authored synonyms for the paraphrase a lexical index
   * would otherwise miss. Cheap, under authorial control, and it improves
   * in-app search as well as retrieval.
   */
  readonly keywords?: readonly string[];
  /**
   * doc 22 §8.2 — the section states an e1RM, a strength projection, or a macro
   * target, so the standing estimate caveat renders with it.
   */
  readonly estimate?: boolean;
  readonly blocks: readonly ManualBlock[];
  /** section IDs; doubles as the retrieval layer's neighbour graph (§9.4.7) */
  readonly related?: readonly string[];
}

export interface ManualChapter {
  readonly manual: ManualId;
  /** stable slug, unique within its manual */
  readonly slug: string;
  /** reading-order number, as doc 22 §5 / §7 numbers them */
  readonly number: number;
  /** lowercase-friendly; renders as the screen title */
  readonly title: string;
  /** one line, for the map */
  readonly summary: string;
  readonly sections: readonly ManualSection[];
}

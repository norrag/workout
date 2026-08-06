/**
 * doc 16 §5.3 — the three-state marker a logged set carries: did it land above,
 * level with, or below its prescription.
 *
 * Extracted so the day view and the manual render **the same characters with
 * the same names**. The manual demonstrates app elements (doc 22, owner review
 * round 2), and a manual that draws its own approximation of a glyph is a
 * manual that goes quietly wrong the first time the glyph changes. Same
 * argument as the glossary being one source rather than two (doc 22 §8.1).
 *
 * Presentation stays with each caller — the day view positions these around the
 * set-number cell at 6–8px, the manual sets them in a legend row.
 */
export type SetMarker = "over" | "met" | "under";

export const SET_MARKERS: Record<
  SetMarker,
  { readonly glyph: string; readonly label: string }
> = {
  over: { glyph: "▲", label: "above prescription" },
  met: { glyph: "■", label: "met prescription" },
  under: { glyph: "▼", label: "below prescription" },
};

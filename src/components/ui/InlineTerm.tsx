"use client";

import type { ReactNode } from "react";
import { type GlossaryKey } from "@/lib/glossary";
import { useGlossaryCard } from "@/components/ui/useGlossaryCard";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * N81 — the definition grammar's third member, and its second **term-level**
 * one: a word underlined *inside a sentence*, opening the same glossary card
 * `InfoDot` opens, from the same `src/lib/glossary.ts` entry.
 *
 * Ruled in 09-changelog **2026-08-15** §3, built in **session 3** §1. The owner's
 * ask was plain: an `InfoDot` only fits where a term is a label, and most jargon
 * lands mid-sentence, where it had nowhere to go.
 *
 * **Why dotted.** Hard rule 7 reserves orange for position and selection, so the
 * affordance cannot be coloured, and a *solid* underline is already what
 * in-prose **navigation** wears (the prescription strip's ask line, N75). Dotted
 * is the standard "definition, not destination" convention: distinguishable
 * without colour, and it borrows the text's own colour so it survives any theme.
 *
 * **It inherits.** No size, no colour, no weight of its own — the run has to
 * read as the sentence it sits in, marked rather than restyled. Preflight
 * already gives a `<button>` `font: inherit` and `color: inherit`; everything
 * here is the mark itself.
 *
 * **The gate is the same one `GuideLink` carries**, for the narrower reason that
 * this affordance is part of the staged manual release (doc 23 §9.2): closed, it
 * renders the words with no mark at all, so prose written for it reads correctly
 * either way and no call site needs its own check.
 */
export function InlineTerm({
  term,
  children,
}: {
  term: GlossaryKey;
  /**
   * The term as the sentence says it — inflected, in the surrounding case
   * (`macrocycles`, `phases`). Not the glossary label: a mark that rewrote the
   * word it marks would be a different word.
   * `inline-term.test.ts` asserts every call site's text is the term's own.
   */
  children: ReactNode;
}) {
  const { entry, open, toggle, triggerRef, card } = useGlossaryCard(term);
  if (!releaseActive(UNRELEASED_VERSION)) return <>{children}</>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`What is ${entry.label}?`}
        aria-expanded={open}
        onClick={toggle}
        className="underline decoration-dotted decoration-from-font underline-offset-2"
      >
        {children}
      </button>
      {card}
    </>
  );
}

import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";
import {
  ESTIMATE_CAVEAT,
  sectionRoute,
  type Inline,
  type ManualBlock,
  type ManualSection,
  type RichText,
} from "@/content/manual";

/**
 * The manual's block renderer — 09-changelog 2026-08-07 §4.
 *
 * Every block kind maps onto a pattern the app already ships (the `SETTINGS`
 * rule, the `InfoDot` card, the quiet `LABEL ›` link, the planner's `ADVANCED`
 * disclosure), so the guide reads as part of the app rather than as an embedded
 * document. Hard rule 7 lives here rather than in the content: there is no
 * inline colour, size, or class in the block model to abuse.
 *
 * Server components throughout. `detail` uses native `<details>`, so a section
 * of any depth costs the reader no JavaScript.
 */

// ---------------------------------------------------------------------------

function InlineSpan({ run }: { run: Inline }) {
  if (typeof run === "string") return <>{run}</>;
  // app copy quoted verbatim: full ink and a weight bump, no italics — the
  // house system has none (09-changelog 2026-08-07 §4)
  if ("ui" in run) return <span className="font-medium text-ink">{run.ui}</span>;
  if ("strong" in run) return <strong className="font-semibold">{run.strong}</strong>;
  if ("num" in run) return <span className="numeral">{run.num}</span>;
  if ("code" in run) {
    return (
      <span className="numeral bg-ink/[0.06] px-1 text-[0.92em]">{run.code}</span>
    );
  }
  if ("term" in run) {
    // the app's own label for the term — the definition itself only ever
    // renders through a `term` block (doc 22 §8.1)
    return <span className="font-semibold">{run.text ?? GLOSSARY[run.term].label}</span>;
  }
  const href = sectionRoute(run.to);
  if (!href) return <>{run.text}</>;
  return (
    <Link
      href={href}
      className="underline decoration-ink/35 underline-offset-[3px]"
    >
      {run.text}
    </Link>
  );
}

function Rich({ text }: { text: RichText }) {
  if (typeof text === "string") return <>{text}</>;
  return (
    <>
      {text.map((run, i) => (
        <InlineSpan key={i} run={run} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

function TermCard({ term }: { term: keyof typeof GLOSSARY }) {
  const entry = GLOSSARY[term];
  return (
    // the InfoDot card's exact internals, in the same bordered box — so the
    // manual cannot define a term in different words (doc 22 §8.1)
    <div className="border-[1.5px] border-ink px-4 py-3.5">
      <div className="label-caps text-[10px] font-bold tracking-[0.14em]">
        {entry.label}
      </div>
      <div className="mt-1.5 text-xs leading-[1.55] text-ink/80">{entry.body}</div>
    </div>
  );
}

function Block({ block }: { block: ManualBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <div className="label-caps border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
          {block.text}
        </div>
      );

    case "para":
      return (
        <p className="text-sm leading-[1.65] text-ink/80">
          <Rich text={block.text} />
        </p>
      );

    case "list":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li
              key={i}
              className={`flex gap-2.5 text-sm leading-[1.65] text-ink/80 ${
                i > 0 ? "mt-2" : ""
              }`}
            >
              {block.ordered ? (
                <span className="numeral w-[18px] flex-shrink-0 text-[13px] font-semibold text-ink/40">
                  {i + 1}
                </span>
              ) : (
                <span
                  aria-hidden
                  className="mt-[9px] h-[3px] w-[3px] flex-shrink-0 bg-ink/30"
                />
              )}
              <span>
                <Rich text={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <div className="border-t border-ink/15">
          {block.steps.map((step, i) => (
            <div key={i} className="border-b border-ink/10 py-2.5">
              <div className="label-caps text-[9.5px] font-semibold tracking-[0.12em] text-ink/45">
                {step.label}
              </div>
              <div className="mt-1 text-sm leading-[1.65] text-ink/80">
                <Rich text={step.text} />
              </div>
            </div>
          ))}
        </div>
      );

    case "table":
      return (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b-[1.5px] border-ink">
                {block.columns.map((col) => (
                  <th
                    key={col}
                    className="label-caps pb-1.5 pr-3 text-[9.5px] font-bold tracking-[0.12em] text-ink/45"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-ink/15">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="py-2.5 pr-3 align-top text-[13px] leading-[1.5] text-ink/80"
                    >
                      <Rich text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "callout":
      return (
        <div className="border-[1.5px] border-ink px-4 py-3.5">
          {block.tone === "honesty" && block.label && (
            <div className="label-caps text-[10px] font-bold tracking-[0.14em]">
              {block.label}
            </div>
          )}
          <div
            className={`text-xs leading-[1.55] text-ink/80 ${
              block.tone === "honesty" && block.label ? "mt-1.5" : ""
            }`}
          >
            <Rich text={block.text} />
          </div>
        </div>
      );

    case "term":
      return <TermCard term={block.term} />;

    case "link": {
      const href = sectionRoute(block.to);
      if (!href) return null;
      return (
        <Link
          href={href}
          className="label-caps block text-[9.5px] font-semibold tracking-[0.1em] text-ink/55"
        >
          {block.label} ›
        </Link>
      );
    }

    case "detail":
      // doc 22 D5 layer 3 — collapsed by default, one fixed affordance so the
      // reader learns it once (09-changelog 2026-08-07 §4)
      return (
        <details className="group">
          <summary className="label-caps cursor-pointer list-none text-[9.5px] font-semibold tracking-[0.1em] text-ink/55 [&::-webkit-details-marker]:hidden">
            The exact rule <span className="group-open:hidden">›</span>
            <span className="hidden group-open:inline">⌄</span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-ink/15 pt-3">
            {block.blocks.map((child, i) => (
              <Block key={i} block={child} />
            ))}
          </div>
        </details>
      );
  }
}

// ---------------------------------------------------------------------------

/** A section's body: its blocks, plus the §8.2 caveat when it states one. */
export function ManualSectionBody({ section }: { section: ManualSection }) {
  return (
    <div className="mt-5 space-y-4">
      {section.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
      {section.estimate && (
        <p className="border-t border-ink/15 pt-3 text-[11px] leading-[1.5] text-ink/50">
          {ESTIMATE_CAVEAT}
        </p>
      )}
    </div>
  );
}

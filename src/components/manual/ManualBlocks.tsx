import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";
import { SET_MARKERS, type SetMarker } from "@/lib/set-markers";
import {
  adjacentChapters,
  adjacentSections,
  ESTIMATE_CAVEAT,
  MANUAL_ROOT,
  resolveSection,
  sectionRoute,
  type Inline,
  type ManualBlock,
  type ManualId,
  type ManualMark,
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

/** Resolve a mark token to the app's own glyph and name for it. */
function markFor(mark: ManualMark): { glyph: string; label: string } {
  const key = mark.slice("set-marker:".length) as SetMarker;
  return SET_MARKERS[key];
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
            className={
              block.tone === "honesty" && block.label
                ? "mt-1.5 text-xs leading-[1.55] text-ink/80"
                : "text-xs leading-[1.55] text-ink/80"
            }
          >
            <Rich text={block.text} />
          </div>
        </div>
      );

    case "term":
      return <TermCard term={block.term} />;

    case "legend":
      // show the mark, then name it, then say what it means — the app's own
      // glyph and its own words for it, never a redrawing
      return (
        <div className="border-t border-ink/15">
          {block.items.map((item, i) => {
            const { glyph, label } = markFor(item.mark);
            return (
              <div
                key={i}
                className="flex items-start gap-3 border-b border-ink/10 py-2.5"
              >
                <span className="flex w-[22px] flex-shrink-0 justify-center pt-[3px] text-[11px] leading-none text-ink/50">
                  {glyph}
                </span>
                <span className="flex-1">
                  <span className="label-caps block text-[9.5px] font-semibold tracking-[0.12em] text-ink/45">
                    {label}
                  </span>
                  <span className="mt-1 block text-sm leading-[1.65] text-ink/80">
                    <Rich text={item.text} />
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      );

    case "figure":
      // a CSS mask filled with `currentColor`, not an `<img>` — the app carries
      // an explicit light/dark switch, so a figure with baked ink would vanish
      // in one of them (09-changelog 2026-08-08 §5). Single-colour line art is
      // also the only figure style the light-ledger system has room for.
      return (
        <figure>
          <div className="border-[1.5px] border-ink px-4 py-4">
            <div
              role="img"
              aria-label={block.alt}
              className="mx-auto w-full bg-ink/80"
              style={{
                maxWidth: block.width,
                aspectRatio: `${block.width} / ${block.height}`,
                WebkitMaskImage: `url(${block.src})`,
                maskImage: `url(${block.src})`,
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
          </div>
          {block.caption && (
            <figcaption className="mt-2 text-[11px] leading-[1.5] text-ink/55">
              <Rich text={block.caption} />
            </figcaption>
          )}
        </figure>
      );

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

/**
 * doc 22 §9.4.7 — related sections.
 *
 * Under its own labelled rule, and **each row carries the target's summary**.
 * A link with no stated reason is a link a reader has to open to evaluate
 * (owner review round 2); the summary is the reason, and it costs nothing
 * because every section already owes one.
 */
export function ManualRelated({
  section,
  id,
}: {
  section: ManualSection;
  /** this section's own ID, so adjacency can be de-duplicated */
  id: string;
}) {
  // prev/next sits directly below this list, so a related row pointing at an
  // adjacent section would be the same link offered twice on one screen. The
  // author still lists it — which of the two surfaces carries it is a rendering
  // question, and staying silent here keeps `related` meaningful when Phase 3's
  // chapters change what "adjacent" means.
  const { prev, next } = adjacentSections(id);
  const adjacent = new Set([prev?.id, next?.id].filter(Boolean));
  const related = (section.related ?? [])
    .filter((target) => !adjacent.has(target))
    .map((target) => resolveSection(target))
    .filter((r): r is NonNullable<typeof r> => r != null);
  if (related.length === 0) return null;
  return (
    <div className="mt-8">
      <div className="label-caps border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        Related
      </div>
      {related.map(({ id, chapter, section: target }) => (
        <Link
          key={id}
          href={`${MANUAL_ROOT[chapter.manual]}/${chapter.slug}/${target.slug}`}
          className="flex items-start gap-3 border-b border-ink/15 py-3.5"
        >
          <span className="flex-1">
            <span className="block text-[14px] font-bold">{target.title}</span>
            <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink/60">
              {target.summary}
            </span>
          </span>
          <span className="mt-[2px] text-base text-ink/50">›</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * doc 22 §9.2 — prev/next, so an adjacent section is one tap rather than a trip
 * up to the chapter page and back down (owner review round 2). It crosses
 * chapter boundaries, so cover-to-cover reading stays "next, next, next".
 *
 * Each side names its destination: a bare arrow makes the reader commit before
 * knowing where they are going.
 */
interface NavTarget {
  readonly href: string;
  readonly title: string;
}

/** The shared two-column footer. One grammar, used at both levels. */
function NavPair({ prev, next }: { prev?: NavTarget; next?: NavTarget }) {
  if (!prev && !next) return null;
  return (
    <nav className="mt-8 grid grid-cols-2 gap-3 border-t-[1.5px] border-ink pt-3.5">
      {prev ? (
        <Link href={prev.href} className="block">
          <span className="label-caps block text-[9.5px] font-semibold tracking-[0.12em] text-ink/45">
            ‹ Previous
          </span>
          <span className="mt-1 block text-[13px] font-semibold leading-[1.35]">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className="block text-right">
          <span className="label-caps block text-[9.5px] font-semibold tracking-[0.12em] text-ink/45">
            Next ›
          </span>
          <span className="mt-1 block text-[13px] font-semibold leading-[1.35]">
            {next.title}
          </span>
        </Link>
      )}
    </nav>
  );
}

export function ManualSectionNav({ id }: { id: string }) {
  const { prev, next } = adjacentSections(id);
  return (
    <NavPair
      prev={
        prev && {
          href: `${MANUAL_ROOT[prev.chapter.manual]}/${prev.chapter.slug}/${prev.section.slug}`,
          title: prev.section.title,
        }
      }
      next={
        next && {
          href: `${MANUAL_ROOT[next.chapter.manual]}/${next.chapter.slug}/${next.section.slug}`,
          title: next.section.title,
        }
      }
    />
  );
}

/**
 * The same affordance one level up (09-changelog 2026-08-09 §2). The map lists
 * chapters only, so the chapter page is on the browse path and owes the reader
 * a way onward that is not a trip back to the map.
 */
export function ManualChapterNav({
  manual,
  slug,
}: {
  manual: ManualId;
  slug: string;
}) {
  const { prev, next } = adjacentChapters(manual, slug);
  return (
    <NavPair
      prev={
        prev && {
          href: `${MANUAL_ROOT[prev.manual]}/${prev.slug}`,
          title: prev.title,
        }
      }
      next={
        next && {
          href: `${MANUAL_ROOT[next.manual]}/${next.slug}`,
          title: next.title,
        }
      }
    />
  );
}

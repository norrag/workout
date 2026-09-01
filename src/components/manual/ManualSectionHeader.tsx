import Link from "next/link";
import {
  chapterRoute,
  MANUAL_LABEL,
  resolveOrigin,
  type ResolvedSection,
} from "@/content/manual";

/**
 * A section's header — fig 4.10, extended in Phase 2 for deep-link entry
 * (09-changelog 2026-08-08 §3).
 *
 * Two jobs beyond the title. **The back link honors where the reader came
 * from** (N27, the app's `?from=` grammar): someone sent here from the middle
 * of a workout goes back to the workout, not up into the guide. The chapter
 * parent moves to the right of the same row so nothing is lost.
 *
 * And **an arriving reader is told they landed**: a deep-linked section carries
 * the accent ■ beside its meta line. That is the accent's one job in the reader
 * — hard rule 7 reserves orange for current position, and "the section you were
 * just sent to" is exactly that. It is gone the moment the reader moves on,
 * because the next section carries no origin.
 *
 * The manual label and chapter route come from the shared content model.
 */
export function ManualSectionHeader({
  resolved,
  from,
}: {
  resolved: ResolvedSection;
  /** the raw `?from=` search param, validated here */
  from?: string;
}) {
  const { chapter, section, index } = resolved;
  const origin = resolveOrigin(from);
  const chapterHref = chapterRoute(chapter.manual, chapter.slug);
  const crumb =
    "label-caps text-[10px] font-bold tracking-[0.14em] text-ink-muted";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Link href={origin ? origin.href : chapterHref} className={crumb}>
          ‹ {origin ? origin.label : chapter.title}
        </Link>
        {origin && (
          <Link href={chapterHref} className={`${crumb} flex-shrink-0`}>
            {chapter.title} ›
          </Link>
        )}
      </div>
      {/* a section title is a sentence, not a screen name — the app's other
          bold-heading form rather than `title-display` (09-changelog §1) */}
      <h1 className="mt-3.5 text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em]">
        {section.title}
      </h1>
      <p className="mt-2 flex items-center gap-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        {origin && (
          <span aria-hidden className="text-[8px] leading-none text-accent">
            ■
          </span>
        )}
        <span>
          <span className="label-caps">{MANUAL_LABEL[chapter.manual]} · CH </span>
          <span className="numeral">{chapter.number}</span>
          <span className="label-caps"> · </span>
          <span className="numeral">{index}</span>
          <span className="label-caps"> OF </span>
          <span className="numeral">{chapter.sections.length}</span>
        </span>
      </p>
    </div>
  );
}

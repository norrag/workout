import Link from "next/link";
import type { Release, ReleaseEntry } from "@/content/releases/types";
import { guideSectionRoute } from "@/content/releases/links";

/**
 * doc 23 §8 — **one renderer, two selections**. The modal passes only entries
 * marked as highlights; the history passes every entry. A selected entry keeps
 * identical wording and destination in both places, so history remains the
 * complete durable record and the modal can stay strictly once-only.
 *
 * House system (08 §1 / hard rule 7): square corners, hairline rules between
 * rows, tracked all-caps for the area label and the link, no accent colour —
 * orange is reserved for current position and selection, which on the history
 * page belongs to the release header, not to an entry.
 */

function EntryLink({ link }: { link: NonNullable<ReleaseEntry["link"]> }) {
  const href =
    link.target.kind === "app"
      ? link.target.href
      : guideSectionRoute(link.target.section);
  if (!href) return null;
  return (
    <Link
      href={href}
      className="mt-2.5 inline-block text-[9.5px] font-semibold tracking-[0.1em] text-ink-muted"
    >
      {link.label.toUpperCase()} ›
    </Link>
  );
}

/**
 * A feature's own screen recording (09-changelog 2026-08-30 §7). Framed in the
 * ink rule the house uses for anything captured rather than drawn, so in either
 * theme it reads as *a picture of the app* rather than as a panel of the page —
 * which matters, because a recording is a raster and carries its own theme with
 * it. `width`/`height` come from the asset so the row never reflows around it.
 *
 * Capped at 260px rather than run to the entry's full width. A phone recording
 * is portrait, and at full width one of them is taller than the modal's whole
 * scroll area — the note would open on a picture with its own prose pushed off
 * screen. At this size the entry reads as a unit: title, body, demonstration.
 *
 * A plain `<img>`, not `next/image`: an animated GIF put through the optimizer
 * comes back as a still.
 */
function EntryMedia({ media }: { media: NonNullable<ReleaseEntry["media"]> }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.src}
      alt={media.alt}
      width={media.width}
      height={media.height}
      loading="lazy"
      decoding="async"
      className="mt-3 block h-auto w-full max-w-[260px] border-[1.5px] border-ink"
    />
  );
}

export function ReleaseEntryList({ entries }: { entries: ReleaseEntry[] }) {
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id} className="border-b border-ink/15 py-4 first:pt-3">
          {entry.area && (
            <div className="text-[9.5px] font-semibold tracking-[0.12em] text-ink/45">
              {entry.area.toUpperCase()}
            </div>
          )}
          <div className="mt-0.5 text-[15px] font-bold tracking-[-0.01em]">
            {entry.title}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">
            {entry.body}
          </p>
          {entry.media && <EntryMedia media={entry.media} />}
          {entry.link && <EntryLink link={entry.link} />}
        </li>
      ))}
    </ul>
  );
}

/** ISO date → the tracked all-caps stamp the ledger uses elsewhere. */
export function releaseDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const month = months[Number(m) - 1] ?? m;
  return `${d} ${month} ${y.slice(2)}`;
}

/**
 * One announced release on the history page: a section rule carrying the
 * version and date, the headline, then the shared entry list. The release the
 * app is currently serving carries the ■ position marker in orange — the one
 * thing on this page that is "where you are" (hard rule 7).
 */
export function ReleaseSection({
  release,
  isCurrent,
}: {
  release: Release;
  isCurrent: boolean;
}) {
  return (
    <section className="mt-7 first:mt-6">
      <div className="flex items-baseline justify-between border-b-[1.5px] border-ink pb-1.5">
        <div className="flex items-baseline gap-1.5 text-[10px] font-bold tracking-[0.14em]">
          {isCurrent && (
            <span className="text-accent" aria-label="current version">
              ■
            </span>
          )}
          <span className="numeral">{release.version}</span>
        </div>
        <div className="text-[9.5px] font-medium tracking-[0.1em] text-ink/45">
          {releaseDateLabel(release.date)}
        </div>
      </div>
      {release.headline && (
        <h2 className="mt-3 text-xl font-extrabold tracking-[-0.01em]">
          {release.headline}
        </h2>
      )}
      <div className="mt-1">
        <ReleaseEntryList entries={release.entries} />
      </div>
    </section>
  );
}

/**
 * Fix releases (O3): visible maintenance that does not compete with feature
 * releases for attention. Collapsed to a version, a date and one line each,
 * behind a dashed border — the house marker for something held back rather
 * than laid out.
 */
export function FixReleaseRow({
  release,
  isCurrent,
}: {
  release: Release;
  isCurrent: boolean;
}) {
  return (
    <details className="mt-2 border border-dashed border-ink/35 px-3 py-2.5">
      <summary className="flex cursor-pointer items-baseline justify-between text-[10px] font-semibold tracking-[0.12em] text-ink-muted [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline gap-1.5">
          {isCurrent && (
            <span className="text-accent" aria-label="current version">
              ■
            </span>
          )}
          <span className="numeral">{release.version}</span>
          <span className="text-ink/35">
            {release.entries.length === 1
              ? "1 FIX"
              : `${release.entries.length} FIXES`}
          </span>
        </span>
        <span className="text-ink/40">{releaseDateLabel(release.date)}</span>
      </summary>
      <ul className="mt-2.5 border-t border-ink/15 pt-2.5">
        {release.entries.map((entry) => (
          <li key={entry.id} className="py-1 text-sm text-ink/70">
            {entry.title}
          </li>
        ))}
      </ul>
    </details>
  );
}

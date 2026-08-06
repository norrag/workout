import Link from "next/link";
import { CURRENT_VERSION, RELEASES_NEWEST_FIRST } from "@/content/releases";
import {
  FixReleaseRow,
  ReleaseSection,
} from "@/components/releases/ReleaseEntryList";

export const metadata = { title: "What's new" };

/**
 * Version history (doc 23 §8; 09-changelog 2026-08-06 §2, fig 4.6).
 *
 * The durable copy of the What's New sheet: a user who dismissed it, or who
 * wants to re-explore, comes here. That is what lets the sheet stay strictly
 * once-only. Feature and major releases render in full through the same
 * `ReleaseEntryList` the sheet uses; fix releases collapse (O3).
 *
 * Reads no user data — the registry is compiled in, so this page is static
 * apart from the layout's auth check.
 */
export default function WhatsNewPage() {
  const releases = RELEASES_NEWEST_FIRST;

  return (
    <div>
      <Link
        href="/more"
        className="text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ MORE
      </Link>
      <h1 className="title-display mt-4 text-[32px]">what&apos;s new</h1>
      <p className="mt-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        WORKOUT <span className="numeral">{CURRENT_VERSION}</span> · EVERY
        RELEASE, NEWEST FIRST
      </p>

      {releases.map((release) =>
        release.kind === "fix" ? (
          <FixReleaseRow
            key={release.version}
            release={release}
            isCurrent={release.version === CURRENT_VERSION}
          />
        ) : (
          <ReleaseSection
            key={release.version}
            release={release}
            isCurrent={release.version === CURRENT_VERSION}
          />
        ),
      )}
    </div>
  );
}

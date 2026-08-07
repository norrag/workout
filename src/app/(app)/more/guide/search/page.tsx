import Link from "next/link";
import { notFound } from "next/navigation";
import { ManualSearch } from "@/components/manual/ManualSearch";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * Guide — search (fig 4.11; 09-changelog 2026-08-08 §2).
 *
 * A static segment, so it wins over `[chapter]` in the App Router's ordering;
 * the registry test keeps a chapter from ever claiming this slug.
 *
 * The screen itself is a header and a field. Everything else — the index, the
 * ranking, the results — is the client component, and the index is not part of
 * this route's payload (doc 22 D3, guard 3).
 */
export default async function GuideSearchPage() {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  return (
    <div>
      <Link
        href="/more/guide"
        className="label-caps text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ Guide
      </Link>
      <h1 className="title-display mt-4 text-[32px]">search</h1>
      <p className="mt-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        <span className="label-caps">USER GUIDE · TITLES, TERMS AND TEXT</span>
      </p>
      <ManualSearch />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { MANUAL_ROOT, resolveOrigin } from "@/content/manual";
import { ManualSearch } from "@/components/manual/ManualSearch";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * Search — one field over both manuals (fig 4.11; 09-changelog 2026-08-08 §2,
 * amended 2026-08-13 §2).
 *
 * A static segment, so it wins over `[chapter]` in the App Router's ordering;
 * the registry test keeps a chapter from ever claiming this slug.
 *
 * doc 22 §9.4.3 asks for one field over both manuals, so there is one search
 * route rather than one per manual — and the **back link follows the reader in**
 * through the same `?from=` allowlist the section screen uses. Someone who
 * searched from the AI Manual returns to the AI Manual.
 *
 * The screen itself is a header and a field. Everything else — the index, the
 * ranking, the results — is the client component, and the index is not part of
 * this route's payload (doc 22 D3, guard 3).
 */
export default async function GuideSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  if (!releaseActive(UNRELEASED_VERSION)) notFound();
  const { from } = await searchParams;
  const origin = resolveOrigin(from);

  return (
    <div>
      <Link
        href={origin ? origin.href : MANUAL_ROOT.ug}
        className="label-caps text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        ‹ {origin ? origin.label : "Guide"}
      </Link>
      <h1 className="title-display mt-4 text-[32px]">search</h1>
      <p className="mt-2 text-[10px] font-medium tracking-[0.1em] text-ink/45">
        <span className="label-caps">
          USER GUIDE + AI MANUAL · TITLES, TERMS AND TEXT
        </span>
      </p>
      <ManualSearch />
    </div>
  );
}

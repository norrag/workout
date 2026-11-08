import Link from "next/link";
import { notFound } from "next/navigation";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";
import { ReleaseProposal } from "@/components/releases/ReleaseProposal";

export const metadata = { title: "Release proposal" };
export default function ReleaseProposalPage() {
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ||
    process.env.NEXT_PUBLIC_RELEASE_OVERRIDE !== UNRELEASED_VERSION
  )
    notFound();
  return (
    <div>
      <Link
        href="/more/whats-new"
        className="inline-flex min-h-11 items-center text-[10px] font-semibold tracking-[0.12em] text-ink/65"
      >
        &lt; RELEASE NOTES
      </Link>
      <h1 className="title-display mt-4 text-[32px]">release proposal</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        Version {UNRELEASED_VERSION} is proposed for review. It has not been
        released.
      </p>
      <ReleaseProposal />
    </div>
  );
}

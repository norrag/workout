import Link from "next/link";
import type { GuideLinkTarget } from "@/lib/guide-links";
import { releaseActive } from "@/lib/version";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";

/**
 * doc 22 Phase 7 — the mechanism-level link into the Guide
 * (09-changelog 2026-08-15 §1; placements in
 * `docs/22e-link-placement-audit.md`).
 *
 * The third member of the app's definition grammar, and the only one that
 * **navigates**: `InfoDot` answers *"what does this word mean"* in place, this
 * answers *"why is this number what it is"* by sending the reader to the
 * section that explains it. They coexist on the same block — the `InfoDot`
 * stays on the label, this goes under it.
 *
 * Not a new drawing: it is the app's existing quiet forward-link idiom
 * (`READ ›`, `SET UP ›`, `CSV ›`) at the foot of a block, tracked caps at
 * `ink/55`. Findable if you are looking, invisible if you are not — which is
 * the condition for adding anything to screens N82 had just decluttered.
 *
 * **The gate lives here, once.** Guide routes 404 before 1.1.0 (doc 23 §9.2),
 * so an ungated link would hand out addresses the reader cannot open. Putting
 * it in the primitive rather than at each call site makes forgetting it
 * structurally impossible, and `guide-links.test.ts` asserts no call site
 * carries its own copy.
 *
 * Server-safe by construction — no hooks, no client boundary — so it costs a
 * client component nothing to render one.
 */
/**
 * The reader route for a target, carrying the N27 origin when there is one.
 * Shared with `GuardedGuideLink`, which has to push the same address the link
 * would have opened — two spellings of it would be one refactor from drifting.
 */
export function guideHref(to: GuideLinkTarget, from?: string): string {
  return from ? `${to.href}?from=${encodeURIComponent(from)}` : to.href;
}

export function GuideLink({
  to,
  from,
  rule = false,
  className = "",
}: {
  to: GuideLinkTarget;
  /**
   * Where the reader is now, so the section's back link returns them here
   * (N27, the app's `?from=` grammar). Passed explicitly rather than read from
   * a hook: the app builds these at the call site everywhere else, and it keeps
   * this component free of a client boundary. Omitted → the section falls back
   * to its chapter breadcrumb.
   */
  from?: string;
  /**
   * Separate the link from the block above it with the ledger's own hairline.
   *
   * A prop rather than a wrapper at the call site, because **everything must
   * vanish together** when the gate is closed: a `border-t` div around a link
   * that returned `null` would paint a stray rule under the block for every
   * user until 1.1.0 ships.
   */
  rule?: boolean;
  /** spacing for the call site — margins only; the type is the primitive's */
  className?: string;
}) {
  if (!releaseActive(UNRELEASED_VERSION)) return null;
  const href = guideHref(to, from);
  const link = (
    <Link
      href={href}
      className={`label-caps inline-block text-[9.5px] font-semibold tracking-[0.1em] text-ink/55 ${rule ? "" : className}`}
    >
      {to.label} ›
    </Link>
  );
  if (!rule) return link;
  return (
    <div className={`border-t border-ink/15 pt-3 ${className}`}>{link}</div>
  );
}

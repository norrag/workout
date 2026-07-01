"use client";

import { useEffect, useRef } from "react";

/**
 * Whether a click on this anchor would navigate the current document away —
 * i.e. the navigations a dirty-state guard must intercept. Pure so the rule is
 * unit-testable: in-app hrefs only; hash jumps, downloads, new-tab targets, and
 * scheme-qualified URLs (https:, mailto:, tel:, …) stay untouched.
 */
export function shouldGuardNavigation(anchor: {
  href: string | null;
  target?: string | null;
  download?: boolean;
}): boolean {
  const href = anchor.href;
  if (!href || href.startsWith("#")) return false;
  if (anchor.download) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  // scheme-qualified = external (every in-app link is root-relative)
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  return true;
}

/**
 * Guards in-app navigation while a surface holds unsaved local state (R16).
 * While `active`:
 * - anchor clicks (header links, BottomNav tabs) are intercepted in the capture
 *   phase — before Next's Link handler — and reported via `onIntercept(href)`
 *   so the caller can confirm instead of silently discarding the staged state;
 * - the browser back button is absorbed by a history sentinel and reported as
 *   `onIntercept(null)`;
 * - closing/reloading the tab gets the native beforeunload prompt.
 *
 * The caller decides what "leave" means (typically: open a discard-confirm
 * sheet, then `router.push` the intercepted href).
 */
export function useNavigationGuard(
  active: boolean,
  onIntercept: (href: string | null) => void,
): void {
  // keep the latest callback without re-arming the guard every render
  const interceptRef = useRef(onIntercept);
  useEffect(() => {
    interceptRef.current = onIntercept;
  });

  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // modified clicks open a new tab — the staged state survives, let them be
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !shouldGuardNavigation({
          href,
          target: anchor.getAttribute("target"),
          download: anchor.hasAttribute("download"),
        })
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      interceptRef.current(href);
    };

    // sentinel entry: the first back press pops this (same URL, no move) and
    // re-arms, so the guard gets to ask before the real entry is left
    window.history.pushState(null, "", window.location.href);
    const onPopState = () => {
      window.history.pushState(null, "", window.location.href);
      interceptRef.current(null);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [active]);
}

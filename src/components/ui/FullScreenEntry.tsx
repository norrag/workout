"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/components/ui/useModalA11y";
import { useScrollLock } from "@/components/ui/useScrollLock";

/** A page-sized entry flow. Like BottomNav, the action bar is fixed to the
 * viewport, not padded into a sheet. The body portal avoids ancestor transforms
 * becoming a fixed-position containing block. Existing sheets are unchanged. */
export function FullScreenEntry({
  title,
  header,
  footer,
  overlays,
  onClose,
  children,
}: {
  title: string;
  header: ReactNode;
  footer: ReactNode;
  overlays?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const [footerHeight, setFooterHeight] = useState(56);
  const panelRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => setTarget(document.body), []);
  useScrollLock(Boolean(target));
  useModalA11y(Boolean(target), panelRef, onClose);

  useLayoutEffect(() => {
    if (!target) return;
    const visible = window.visualViewport;
    const update = () => {
      const next = {
        top: visible?.offsetTop ?? 0,
        height: visible?.height ?? window.innerHeight,
      };
      setViewport((old) =>
        old?.top === next.top && old.height === next.height ? old : next,
      );
    };
    update();
    visible?.addEventListener("resize", update);
    visible?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visible?.removeEventListener("resize", update);
      visible?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [target]);

  useLayoutEffect(() => {
    const footerEl = footerRef.current;
    if (!target || !footerEl) return;
    const update = () =>
      setFooterHeight(footerEl.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(footerEl);
    return () => observer.disconnect();
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      panelRef.current?.contains(focused) &&
      focused.matches("input, textarea, select")
    ) {
      focused.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [target, viewport, footerHeight]);

  if (!target) return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex min-w-0 flex-col overflow-hidden bg-bg-base focus:outline-none"
      style={
        viewport
          ? { top: viewport.top, height: viewport.height, bottom: "auto" }
          : undefined
      }
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 bg-bg-base shadow-[0_8px_16px_-12px_rgba(23,20,15,0.55)]">
        <div className="mx-auto w-full max-w-lg px-4 pb-3 pt-[max(.5rem,env(safe-area-inset-top))]">
          {header}
        </div>
      </div>
      <div
        role="region"
        aria-label="Measurement fields"
        className="min-h-0 min-w-0 flex-1 scroll-py-4 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto w-full min-w-0 max-w-lg px-4 py-4">
          {children}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="shrink-0"
        style={{ height: footerHeight }}
      />
      <div
        ref={footerRef}
        role="group"
        aria-label="Measurement actions"
        className="fixed inset-x-0 bottom-0 z-10 transform-gpu border-t-2 border-ink bg-bg-base pb-[env(safe-area-inset-bottom)]"
        style={
          viewport
            ? { bottom: `calc(100% - ${viewport.top + viewport.height}px)` }
            : undefined
        }
      >
        {footer}
      </div>
      {overlays}
    </div>,
    target,
  );
}

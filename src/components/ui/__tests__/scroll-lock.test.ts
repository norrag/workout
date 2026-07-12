import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireScrollLock,
  isScrollLocked,
} from "@/components/ui/useScrollLock";

type Style = {
  overflow: string;
  paddingRight: string;
  position: string;
  top: string;
  width: string;
};

function installDom() {
  const bodyStyle: Style = {
    overflow: "clip",
    paddingRight: "3px",
    position: "relative",
    top: "2px",
    width: "91%",
  };
  const rootStyle = { overflow: "scroll" };
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const scrollTo = vi.fn();
  const requestAnimationFrame = vi.fn(() => 17);
  const cancelAnimationFrame = vi.fn();
  const timers: Array<() => void> = [];
  const setTimeout = vi.fn((callback: () => void) => {
    timers.push(callback);
    return timers.length;
  });
  class MockElement {
    closest(): object | null {
      return null;
    }
  }

  vi.stubGlobal("Element", MockElement);
  vi.stubGlobal("HTMLElement", class HTMLElement {});
  vi.stubGlobal("getComputedStyle", () => ({ paddingRight: "3px" }));
  vi.stubGlobal("document", {
    activeElement: null,
    body: { style: bodyStyle },
    documentElement: { clientHeight: 844, clientWidth: 390, style: rootStyle },
    addEventListener,
    removeEventListener,
  });
  vi.stubGlobal("window", {
    cancelAnimationFrame,
    clearTimeout: vi.fn(),
    innerWidth: 400,
    requestAnimationFrame,
    scrollTo,
    scrollX: 7,
    scrollY: 321,
    setTimeout,
    visualViewport: null,
  });

  return {
    addEventListener,
    bodyStyle,
    MockElement,
    removeEventListener,
    requestAnimationFrame,
    rootStyle,
    scrollTo,
    timers,
  };
}

const releases: Array<() => void> = [];

afterEach(() => {
  for (const release of releases.splice(0).reverse()) release();
  vi.unstubAllGlobals();
});

describe("page scroll lock", () => {
  it("freezes overflow without changing body's positioning context", () => {
    const dom = installDom();
    releases.push(acquireScrollLock());

    expect(isScrollLocked()).toBe(true);
    expect(dom.rootStyle.overflow).toBe("hidden");
    expect(dom.bodyStyle.overflow).toBe("hidden");
    expect(dom.bodyStyle.paddingRight).toBe("13px");
    expect(dom.bodyStyle.position).toBe("relative");
    expect(dom.bodyStyle.top).toBe("2px");
    expect(dom.bodyStyle.width).toBe("91%");
    expect(dom.addEventListener).toHaveBeenCalledWith(
      "touchmove",
      expect.any(Function),
      { passive: false },
    );
  });

  it("blocks background touch scrolling while allowing marked sheet scrollers", () => {
    const dom = installDom();
    releases.push(acquireScrollLock());
    const touchMove = dom.addEventListener.mock.calls.find(
      ([type]) => type === "touchmove",
    )?.[1] as (event: Pick<TouchEvent, "target" | "preventDefault">) => void;

    const preventBackground = vi.fn();
    touchMove({ target: null, preventDefault: preventBackground });
    expect(preventBackground).toHaveBeenCalledOnce();

    class OverlayElement extends dom.MockElement {
      closest = vi.fn(() => ({}));
    }
    const preventSheet = vi.fn();
    touchMove({
      target: new OverlayElement() as unknown as EventTarget,
      preventDefault: preventSheet,
    });
    expect(preventSheet).not.toHaveBeenCalled();
  });

  it("ref-counts nested overlays and restores styles and scroll once", () => {
    const dom = installDom();
    const releaseOuter = acquireScrollLock();
    const releaseInner = acquireScrollLock();
    releases.push(releaseOuter, releaseInner);

    releaseInner();
    expect(isScrollLocked()).toBe(true);
    expect(dom.rootStyle.overflow).toBe("hidden");
    expect(dom.scrollTo).not.toHaveBeenCalled();

    releaseOuter();
    expect(isScrollLocked()).toBe(false);
    expect(dom.rootStyle.overflow).toBe("scroll");
    expect(dom.bodyStyle.overflow).toBe("clip");
    expect(dom.bodyStyle.paddingRight).toBe("3px");
    expect(dom.removeEventListener).toHaveBeenCalledWith(
      "touchmove",
      expect.any(Function),
    );
    expect(dom.scrollTo).toHaveBeenCalledTimes(1);
    expect(dom.scrollTo).toHaveBeenCalledWith(7, 321);

    // Releases are deliberately idempotent; effect cleanup may run twice in
    // development Strict Mode without underflowing the shared lock.
    releaseOuter();
    expect(dom.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("restores through keyboard viewport resize and stops after it settles", () => {
    const dom = installDom();
    const resizeListeners: Array<() => void> = [];
    const viewport = {
      height: 420,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        resizeListeners.push(listener);
      }),
      removeEventListener: vi.fn(),
    };
    Object.assign(window, { visualViewport: viewport });

    const release = acquireScrollLock();
    releases.push(release);
    release();

    expect(viewport.addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(resizeListeners).toHaveLength(1);
    resizeListeners[0]();
    expect(dom.requestAnimationFrame).toHaveBeenCalledTimes(2);

    // The second timer is the post-resize quiet timer (the first is the max
    // safety cutoff). Once quiet, later viewport changes cannot snap the page.
    dom.timers[1]();
    expect(viewport.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
  });
});

import { describe, expect, it } from "vitest";
import { touchMoveAllowed, type TouchChainEl } from "../useScrollLock";

// N47: while an overlay holds the scroll lock, a document-level touchmove
// guard decides which gestures keep their default behavior. Allowed: touches
// inside interactive controls and inside genuinely scrollable overlay regions
// (their own overscroll-contain stops chaining). Everything else — the scrim,
// static sheet chrome — is prevented so the page can never scroll behind an
// overlay. The DOM walk is exercised here through fake element chains (the
// suite runs in node, no DOM).

type FakeEl = TouchChainEl & { parentElement: FakeEl | null };

function fake(
  opts: {
    interactive?: boolean;
    overflowY?: string;
    overflowX?: string;
    scrollHeight?: number;
    clientHeight?: number;
    scrollWidth?: number;
    clientWidth?: number;
  } = {},
  parent: FakeEl | null = null,
): FakeEl & { overflowY: string; overflowX: string } {
  return {
    parentElement: parent,
    matches: () => opts.interactive ?? false,
    scrollHeight: opts.scrollHeight ?? 100,
    clientHeight: opts.clientHeight ?? 100,
    scrollWidth: opts.scrollWidth ?? 100,
    clientWidth: opts.clientWidth ?? 100,
    overflowY: opts.overflowY ?? "visible",
    overflowX: opts.overflowX ?? "visible",
  };
}

const styleOf = (el: FakeEl) => ({
  overflowY: (el as ReturnType<typeof fake>).overflowY,
  overflowX: (el as ReturnType<typeof fake>).overflowX,
});

describe("touchMoveAllowed", () => {
  const body = fake();

  it("prevents touches on the scrim / static overlay chrome", () => {
    const overlayRoot = fake({}, body);
    const scrim = fake({}, overlayRoot);
    expect(touchMoveAllowed(scrim, body, styleOf)).toBe(false);
  });

  it("allows touches inside a vertically scrollable sheet panel", () => {
    const overlayRoot = fake({}, body);
    const panel = fake(
      { overflowY: "auto", scrollHeight: 400, clientHeight: 200 },
      overlayRoot,
    );
    const row = fake({}, panel);
    expect(touchMoveAllowed(row, body, styleOf)).toBe(true);
  });

  it("prevents touches in a sheet whose content does not overflow", () => {
    // overflow-y-auto but nothing to scroll — the gesture has nowhere to go,
    // so it must not leak to the page
    const overlayRoot = fake({}, body);
    const panel = fake(
      { overflowY: "auto", scrollHeight: 200, clientHeight: 200 },
      overlayRoot,
    );
    const row = fake({}, panel);
    expect(touchMoveAllowed(row, body, styleOf)).toBe(false);
  });

  it("does not treat overflow:hidden clipping as scrollable", () => {
    const overlayRoot = fake({}, body);
    const clipped = fake(
      { overflowY: "hidden", scrollHeight: 400, clientHeight: 200 },
      overlayRoot,
    );
    const row = fake({}, clipped);
    expect(touchMoveAllowed(row, body, styleOf)).toBe(false);
  });

  it("allows horizontal scrollers (filter chip rows) inside sheets", () => {
    const overlayRoot = fake({}, body);
    const chips = fake(
      { overflowX: "auto", scrollWidth: 600, clientWidth: 320 },
      overlayRoot,
    );
    const chip = fake({}, chips);
    expect(touchMoveAllowed(chip, body, styleOf)).toBe(true);
  });

  it("allows interactive controls (inputs keep selection drags)", () => {
    const overlayRoot = fake({}, body);
    const input = fake({ interactive: true }, overlayRoot);
    expect(touchMoveAllowed(input, body, styleOf)).toBe(true);
  });

  it("stops the walk at the boundary — a scrollable body grants nothing", () => {
    const scrollableBody = fake({
      overflowY: "auto",
      scrollHeight: 2000,
      clientHeight: 800,
    });
    const overlayRoot = fake({}, scrollableBody);
    const scrim = fake({}, overlayRoot);
    expect(touchMoveAllowed(scrim, scrollableBody, styleOf)).toBe(false);
  });

  it("handles a null target", () => {
    expect(touchMoveAllowed(null, body, styleOf)).toBe(false);
  });

  it("finds a scrollable ancestor from deep static nesting", () => {
    const overlayRoot = fake({}, body);
    const panel = fake(
      { overflowY: "scroll", scrollHeight: 900, clientHeight: 300 },
      overlayRoot,
    );
    const list = fake({}, panel);
    const row = fake({}, list);
    const label = fake({}, row);
    expect(touchMoveAllowed(label, body, styleOf)).toBe(true);
  });
});

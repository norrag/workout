import { describe, expect, it } from "vitest";
import { shouldGuardNavigation } from "../useNavigationGuard";

// R16: the dirty-state guard must intercept exactly the clicks that would
// navigate the document away in-app — and nothing else.
describe("shouldGuardNavigation", () => {
  it("guards root-relative in-app links (BottomNav, header back)", () => {
    expect(shouldGuardNavigation({ href: "/workout" })).toBe(true);
    expect(shouldGuardNavigation({ href: "/cycles/meso/abc" })).toBe(true);
    expect(shouldGuardNavigation({ href: "/cycles?tab=macro" })).toBe(true);
  });

  it("guards relative links", () => {
    expect(shouldGuardNavigation({ href: "stats" })).toBe(true);
    expect(shouldGuardNavigation({ href: "../plan" })).toBe(true);
  });

  it("ignores missing and hash-only hrefs", () => {
    expect(shouldGuardNavigation({ href: null })).toBe(false);
    expect(shouldGuardNavigation({ href: "" })).toBe(false);
    expect(shouldGuardNavigation({ href: "#volume" })).toBe(false);
  });

  it("ignores scheme-qualified URLs (external, mail, tel)", () => {
    expect(shouldGuardNavigation({ href: "https://example.com/x" })).toBe(false);
    expect(shouldGuardNavigation({ href: "mailto:a@b.c" })).toBe(false);
    expect(shouldGuardNavigation({ href: "tel:+15551234" })).toBe(false);
  });

  it("ignores downloads and new-tab targets (document survives)", () => {
    expect(shouldGuardNavigation({ href: "/export.csv", download: true })).toBe(
      false,
    );
    expect(shouldGuardNavigation({ href: "/help", target: "_blank" })).toBe(
      false,
    );
    expect(shouldGuardNavigation({ href: "/help", target: "_self" })).toBe(true);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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

// ---------------------------------------------------------------------------
// doc 22 Phase 7c — wave 2 put a guarded surface behind nine more links, which
// is the point at which "the app asks before it discards" stops being one
// screen's behavior and becomes a contract. Source assertions, in the WS-J
// style the manual's own guards use: they are about *where the code is*.
// ---------------------------------------------------------------------------

const SRC = path.resolve(__dirname, "../../..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(item.name) ? [full] : [];
  });
}

const SOURCES = walk(SRC).map((file) => ({
  rel: path.relative(SRC, file).split(path.sep).join("/"),
  text: readFileSync(file, "utf8"),
}));

describe("there is one discard-confirm", () => {
  it("nobody re-draws the sheet", () => {
    // The planner board wrote this copy first; wave 2 made it shared. A second
    // copy of it is how two surfaces end up asking the same question in two
    // voices, which is exactly what §8.1's single-source rule exists to stop.
    const owners = SOURCES.filter(
      ({ rel, text }) =>
        !rel.includes("/__tests__/") && text.includes("Discard changes?"),
    ).map(({ rel }) => rel);
    expect(owners).toEqual(["components/ui/LeaveConfirm.tsx"]);
  });

  it("every guarded surface routes through it", () => {
    // A surface that arms `useNavigationGuard` but renders no confirm has
    // taken the navigation away from the reader without offering the way out.
    const armed = SOURCES.filter(
      ({ rel, text }) =>
        !rel.includes("/__tests__/") &&
        rel !== "components/ui/useNavigationGuard.ts" &&
        /useNavigationGuard\(/.test(text),
    );
    expect(armed.length).toBeGreaterThanOrEqual(4);
    const silent = armed
      .filter(({ text }) => !/<LeaveConfirm\b/.test(text))
      .map(({ rel }) => rel);
    expect(silent).toEqual([]);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for the iOS-standalone "browser bars" bug (2026-07-02).
//
// iOS 16.4+ enforces the Web App Manifest `scope` for home-screen PWAs: any
// navigation to a URL OUTSIDE scope is treated as leaving the app and opens in
// the in-app Safari browser (visible URL bar + share/reload chrome) instead of
// staying standalone. With no explicit `scope`, iOS derives a narrow one around
// `start_url` (`/workout`), so every sibling route (`/cycles`, `/exercises`, …)
// fell outside it and popped the browser chrome. An explicit root scope keeps
// the whole app standalone. Do not narrow `scope` below the routes it must
// cover without a matching device retest.

const repoRoot = path.resolve(__dirname, "../../../..");

function loadManifest() {
  const raw = readFileSync(
    path.join(repoRoot, "public/manifest.webmanifest"),
    "utf8",
  );
  return JSON.parse(raw) as {
    scope?: string;
    start_url?: string;
    display?: string;
  };
}

// Every top-level route the app can navigate to lives under src/app/(app).
function appRouteRoots(): string[] {
  const appDir = path.join(repoRoot, "src/app/(app)");
  return readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("("))
    .map((e) => `/${e.name}`);
}

describe("PWA manifest scope", () => {
  const manifest = loadManifest();

  it("declares an explicit scope", () => {
    expect(manifest.scope).toBeDefined();
  });

  it("scopes the whole app to root so no route breaks standalone on iOS", () => {
    expect(manifest.scope).toBe("/");
  });

  it("keeps the launch target inside scope", () => {
    const scope = manifest.scope ?? "";
    expect(manifest.start_url?.startsWith(scope)).toBe(true);
  });

  it("covers every top-level app route", () => {
    const scope = manifest.scope ?? "";
    const outside = appRouteRoots().filter((r) => !r.startsWith(scope));
    expect(outside).toEqual([]);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guards for the iOS-standalone "browser bars" bug (2026-07-02).
//
// Three failure modes are pinned here:
//
// 1. START_URL IS THE REAL SCOPE ON iOS. iOS 26.5 scopes an installed web app
//    to the page it was added from and does NOT honor the manifest `scope`
//    member (observed on-device: with scope "/" and start_url "/workout",
//    every route except /workout opened in the in-app browser with the ✕
//    returning to /workout). A signed-in user can only add from where "/"
//    lands them, so the app must LIVE at "/": start_url stays "/" and the
//    middleware rewrites (not redirects) "/" to the Workout tab.
//
// 2. SCOPE. Kept explicit at "/" anyway for spec-conforming platforms: any
//    navigation outside it is treated as leaving the app.
//
// 3. STALE MANIFEST AT INSTALL. iOS caches the manifest and the cache survives
//    deleting the home-screen icon, so a re-add can install from a pre-fix
//    copy. The defense is a PATH-versioned manifest link (query-string busts
//    can be stripped by cache normalization): to change any install-time field
//    (scope/start_url/id/display), bump the linked path to the next version,
//    add the new file, and keep every old file in place — a 404 on a stale
//    cached HTML's manifest link drops iOS to no-manifest legacy mode. All
//    copies must stay byte-identical so the old path never serves different
//    install semantics than the new one.

const repoRoot = path.resolve(__dirname, "../../../..");

type Manifest = {
  scope?: string;
  start_url?: string;
  display?: string;
  id?: string;
};

function manifestFiles(): string[] {
  return readdirSync(path.join(repoRoot, "public"))
    .filter((f) => f.endsWith(".webmanifest"))
    .sort();
}

function loadManifest(file: string): Manifest {
  return JSON.parse(
    readFileSync(path.join(repoRoot, "public", file), "utf8"),
  ) as Manifest;
}

/** The manifest href the root layout actually links (Metadata.manifest). */
function linkedManifestHref(): string {
  const layout = readFileSync(
    path.join(repoRoot, "src/app/layout.tsx"),
    "utf8",
  );
  const m = layout.match(/manifest:\s*"([^"]+)"/);
  if (!m) throw new Error("root layout no longer declares Metadata.manifest");
  return m[1];
}

// Every top-level route the app can navigate to lives under src/app/(app).
function appRouteRoots(): string[] {
  const appDir = path.join(repoRoot, "src/app/(app)");
  return readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("("))
    .map((e) => `/${e.name}`);
}

describe("PWA manifest", () => {
  const files = manifestFiles();

  it("has at least the original and one versioned manifest", () => {
    expect(files).toContain("manifest.webmanifest");
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps every manifest copy byte-identical", () => {
    const contents = files.map((f) =>
      readFileSync(path.join(repoRoot, "public", f), "utf8"),
    );
    for (const c of contents) expect(c).toBe(contents[0]);
  });

  it("links a path-versioned manifest (no query-string busting)", () => {
    const href = linkedManifestHref();
    expect(href.includes("?")).toBe(false);
    expect(href).toMatch(/^\/manifest-v\d+\.webmanifest$/);
  });

  it("links a manifest file that exists", () => {
    const href = linkedManifestHref();
    expect(files).toContain(href.slice(1));
  });

  describe.each(files)("%s", (file) => {
    const manifest = loadManifest(file);

    it("scopes the whole app to root so no route breaks iOS standalone", () => {
      expect(manifest.scope).toBe("/");
    });

    it("keeps a stable id so re-adds update the same app", () => {
      expect(manifest.id).toBe("/");
    });

    it("launches at the root — iOS derives the app scope from it", () => {
      expect(manifest.start_url).toBe("/");
    });

    it("stays standalone", () => {
      expect(manifest.display).toBe("standalone");
    });

    it("covers every top-level app route", () => {
      const scope = manifest.scope ?? "";
      const outside = appRouteRoots().filter((r) => !r.startsWith(scope));
      expect(outside).toEqual([]);
    });
  });
});

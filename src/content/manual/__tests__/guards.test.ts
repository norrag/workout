import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHAPTERS, FIGURE_ROOT } from "../index";
import type { ManualBlock } from "../types";

/**
 * doc 22 D3 — the three performance guards, in the WS-J source-assertion style
 * (`src/lib/engine/__tests__/predict.test.ts`).
 *
 * The owner accepted offline availability **only** on the condition that it
 * cost the app's hot paths nothing. These are the enforcements that make the
 * condition a property rather than an intention: a manual that leaks into a
 * shared bundle, or into the precache, fails CI here rather than showing up as
 * a slower Workout tab.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SRC = path.join(REPO_ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(item.name) ? [full] : [];
  });
}

const SOURCES = walk(SRC).map((file) => ({
  /** posix-style, repo-relative — the form the allowlist is written in */
  rel: path.relative(REPO_ROOT, file).split(path.sep).join("/"),
  text: readFileSync(file, "utf8"),
}));

/**
 * Guard 1 — the manual never enters another route's bundle.
 *
 * Next splits by route already, so `/more/guide/**` chunks are not in the
 * Workout tab's first load *unless something imports them*. The real risk is an
 * import leak — a day-view component pulling in a chapter for a link label —
 * which is why Phase 7's links pass a section **ID string** and never a module.
 */
const MAY_IMPORT_CONTENT = [
  "src/content/manual/",
  "src/components/manual/",
  "src/app/(app)/more/guide/",
  // Legacy AI Manual routes now redirect into the main Guide
  "src/app/(app)/more/connector/guide/",
  // Phase 5's connector retrieval (doc 22 §10.2). This guard is about *client*
  // bundles, and the MCP surface is `import "server-only"` throughout — it
  // cannot reach one. The second assertion below is what holds that reason to
  // account rather than taking it on trust.
  "src/lib/mcp/",
];

/** Tests may import anything — they are not in a bundle. */
const isTest = (rel: string) =>
  rel.includes("/__tests__/") || rel.endsWith(".test.ts");

/**
 * Any module specifier that reaches into `src/content/manual`, aliased or
 * relative. Files *inside* the manual reach each other with `./…`, and they are
 * allowlisted wholesale, so the pattern only has to catch the way an outsider
 * would have to spell it.
 */
const IMPORTS_CONTENT =
  /(?:from\s*|import\s*\(\s*(?:\/\*[^*]*\*\/\s*)?)["'][^"']*(?:@\/|[./]\/)?content\/manual(?:\/[^"']*)?["']/;

describe("guard 1 — manual content stays out of every other bundle", () => {
  it("finds the sources at all (guards the walker itself)", () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.some((s) => s.rel === "src/content/manual/index.ts")).toBe(
      true,
    );
  });

  it("is imported only by the manual itself, its renderer, and the guide routes", () => {
    const leaks = SOURCES.filter(
      ({ rel, text }) =>
        !isTest(rel) &&
        !MAY_IMPORT_CONTENT.some((prefix) => rel.startsWith(prefix)) &&
        IMPORTS_CONTENT.test(text),
    ).map(({ rel }) => rel);
    expect(leaks).toEqual([]);
  });

  it("lets the connector read the manual only from server-only modules", () => {
    // The allowlist entry above is justified by `server-only`, which throws at
    // build time if the module is pulled into a client component. Assert the
    // justification, not just the exemption: an MCP module that dropped the
    // directive would silently become bundle-reachable.
    const unguarded = SOURCES.filter(
      ({ rel, text }) =>
        !isTest(rel) &&
        rel.startsWith("src/lib/mcp/") &&
        IMPORTS_CONTENT.test(text) &&
        !/^import\s+["']server-only["'];/m.test(text),
    ).map(({ rel }) => rel);
    expect(unguarded).toEqual([]);
  });

  it("keeps the release registry on literal section IDs, not on an import", () => {
    // doc 23 §7.2's `guide` targets are the one place outside the manual that
    // names a section. `links.ts` is reachable from the app shell (the What's
    // New sheet), so it holds strings and the *test* does the resolving.
    const links = SOURCES.find(
      (s) => s.rel === "src/content/releases/links.ts",
    )!;
    expect(IMPORTS_CONTENT.test(links.text)).toBe(false);
  });
});

/**
 * Guard 2 — the manual is not precached.
 *
 * Serwist's defaults precache `public/**` and every prerendered `.html`, so
 * without explicit ignores a service-worker install would download the whole
 * guide before anyone opened it.
 */
describe("guard 2 — nothing manual reaches the precache manifest", () => {
  const config = readFileSync(path.join(REPO_ROOT, "next.config.ts"), "utf8");

  it("keeps the public directory out of the manifest, which is what covers figures", () => {
    // The load-bearing mechanism: `withSerwistInit` only globs `public/**`
    // when `additionalPrecacheEntries` is absent, so this option is what keeps
    // every figure out. Deleting it would silently start precaching them.
    expect(config).toMatch(/additionalPrecacheEntries:\s*\[/);
    expect(config).toContain('url: "/~offline"');
  });

  it("excludes the manual's one client artifact by chunk name", () => {
    // Defence in depth rather than the mechanism — measured against a real
    // build, client chunks do not reach this manifest at all. It is kept
    // because it is the one line that would still bite if that changed.
    expect(config).toContain("exclude: [/^static\\/chunks\\/manual-search-index/]");
  });

  /**
   * The assertion doc 22 D3 actually asks for: *the built manifest carries no
   * manual assets*. Source assertions describe intent; this reads the artifact.
   *
   * `public/sw.js` is a build output and is gitignored, so this is skipped on a
   * bare checkout — CI runs it again after `npm run build`, which is where it
   * has teeth.
   */
  const swDest = path.join(REPO_ROOT, "public/sw.js");
  it.skipIf(!existsSync(swDest))(
    "carries nothing manual in the built precache manifest",
    () => {
      const built = readFileSync(swDest, "utf8");
      const urls = [...built.matchAll(/url:\s*["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
      expect(urls.length, "parsed no manifest entries at all").toBeGreaterThan(0);
      for (const url of urls) {
        expect(url, `${url} is precached`).not.toMatch(
          /manual|\/guide(\/|$)/i,
        );
      }
    },
  );

  it("keeps every figure asset under the one directory the ignore covers", () => {
    const figures: string[] = [];
    const walkBlocks = (blocks: readonly ManualBlock[]) => {
      for (const block of blocks) {
        if (block.kind === "figure") figures.push(block.src);
        if (block.kind === "detail") walkBlocks(block.blocks);
      }
    };
    for (const chapter of CHAPTERS)
      for (const section of chapter.sections) walkBlocks(section.blocks);

    for (const src of figures) {
      expect(src.startsWith(FIGURE_ROOT), `${src} is outside ${FIGURE_ROOT}`).toBe(
        true,
      );
      expect(
        existsSync(path.join(REPO_ROOT, "public", src.replace(/^\//, ""))),
        `${src} has no asset`,
      ).toBe(true);
    }
  });

  it("caches figures in their own bucket, ahead of the app-chrome images", () => {
    // the app-icon cache is capped at 64 entries; a chapter of figures sharing
    // it would evict app chrome, which is the outcome D3's condition forbids
    const sw = readFileSync(path.join(REPO_ROOT, "src/app/sw.ts"), "utf8");
    const figureAt = sw.indexOf('cacheName: "manual-figures"');
    const imagesAt = sw.indexOf('cacheName: "static-image-assets"');
    expect(figureAt, "sw.ts has no manual-figures cache").toBeGreaterThan(0);
    expect(figureAt).toBeLessThan(imagesAt);
    expect(sw).toContain('url.pathname.startsWith("/manual/")');
  });
});

/**
 * Guard 3 — the search index is fetched on first search, never imported.
 *
 * It is the one artifact big enough for the owner's launch-cost condition to
 * bite, so it must stay reachable only through the dynamic import that gives it
 * its own hashed, named, precache-excluded chunk.
 */
describe("guard 3 — the search index is lazy", () => {
  it("is never statically imported", () => {
    const statics = SOURCES.filter(
      ({ rel, text }) =>
        !isTest(rel) &&
        rel !== "src/content/manual/search-index.ts" &&
        /^\s*import\s[^;]*["'](?:@\/content\/manual\/search-index|\.\/search-index)["']/m.test(
          text,
        ),
    ).map(({ rel }) => rel);
    expect(statics).toEqual([]);
  });

  it("is loaded by a named dynamic import, so globIgnores can match it", () => {
    const search = SOURCES.find(
      (s) => s.rel === "src/components/manual/ManualSearch.tsx",
    )!;
    expect(search.text).toContain(
      '/* webpackChunkName: "manual-search-index" */',
    );
    expect(search.text).toMatch(/import\(\s*\/\* webpackChunkName/);
  });

  it("keeps Guide and legacy redirect routes off it entirely", () => {
    const READERS = [
      "src/app/(app)/more/guide/",
      "src/app/(app)/more/connector/guide/",
    ];
    for (const { rel, text } of SOURCES) {
      if (!READERS.some((prefix) => rel.startsWith(prefix))) continue;
      expect(text, `${rel} pulls the index onto the reading path`).not.toContain(
        "search-index",
      );
    }
  });
});

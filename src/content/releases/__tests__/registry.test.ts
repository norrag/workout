import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compare, step } from "@/lib/version/semver";
import { CURRENT_VERSION, RELEASES, RELEASES_NEWEST_FIRST } from "..";
import { UNRELEASED_ENTRIES, UNRELEASED_VERSION } from "../unreleased";
import { CONTENT_LIMITS, type Release, type ReleaseEntry } from "../types";
import { isGuideSectionId, isLinkableRoute } from "../links";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

const allEntries: { release: Release; entry: ReleaseEntry }[] =
  RELEASES.flatMap((release) =>
    release.entries.map((entry) => ({ release, entry })),
  );

// ---------------------------------------------------------------------------
// §9.4 — three-way version identity
// ---------------------------------------------------------------------------

describe("version identity", () => {
  it("package.json, CURRENT_VERSION and max(RELEASES) agree", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    ) as { version: string };
    const max = RELEASES.reduce(
      (best, r) => (compare(r.version, best) > 0 ? r.version : best),
      RELEASES[0].version,
    );
    expect(CURRENT_VERSION).toBe(max);
    expect(pkg.version).toBe(CURRENT_VERSION);
  });
});

// ---------------------------------------------------------------------------
// §5.3 — registry invariants
// ---------------------------------------------------------------------------

describe("registry invariants (§5.3)", () => {
  it("has at least one release", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
  });

  it("versions are unique, parseable and strictly increasing", () => {
    const seen = new Set<string>();
    for (const r of RELEASES) {
      expect(seen.has(r.version), `duplicate version ${r.version}`).toBe(false);
      seen.add(r.version);
    }
    for (let i = 1; i < RELEASES.length; i += 1)
      expect(
        compare(RELEASES[i].version, RELEASES[i - 1].version),
        `${RELEASES[i].version} must be above ${RELEASES[i - 1].version}`,
      ).toBe(1);
  });

  it("dates are ISO and non-decreasing with version", () => {
    for (const r of RELEASES)
      expect(r.date, `${r.version} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (let i = 1; i < RELEASES.length; i += 1)
      expect(
        RELEASES[i].date >= RELEASES[i - 1].date,
        `${RELEASES[i].version} (${RELEASES[i].date}) predates ${RELEASES[i - 1].version} (${RELEASES[i - 1].date})`,
      ).toBe(true);
  });

  it("each kind advances only its own digit, resetting the ones to its right", () => {
    // §4.1: 1.0.3 → 1.1.0, 1.4.2 → 2.0.0. The first release is measured against
    // an implicit 0.0.0.
    let prev = "0.0.0";
    for (const r of RELEASES) {
      expect(step(prev, r.version), `${prev} → ${r.version} (${r.kind})`).toBe(
        r.kind,
      );
      prev = r.version;
    }
  });

  it("entry ids are unique across the whole registry and never reused", () => {
    const seen = new Set<string>();
    for (const { entry } of allEntries) {
      expect(seen.has(entry.id), `duplicate entry id ${entry.id}`).toBe(false);
      seen.add(entry.id);
    }
    for (const entry of UNRELEASED_ENTRIES)
      expect(
        seen.has(entry.id),
        `staged entry ${entry.id} reuses a shipped id`,
      ).toBe(false);
  });

  it("feature and major releases have a headline and at least one entry; fix releases have no headline", () => {
    for (const r of RELEASES) {
      if (r.kind === "fix") {
        expect(r.headline, `${r.version} is a fix release`).toBeUndefined();
      } else {
        expect(r.headline, `${r.version} needs a headline`).toBeTruthy();
        expect(r.entries.length, `${r.version} needs entries`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("keeps unreleased entries out of RELEASES (§9.2)", () => {
    // structural, not a rule: `index.ts` does not import `unreleased.ts`, so
    // there is no path from a staged entry to the version history
    const shipped = new Set(allEntries.map(({ entry }) => entry.id));
    for (const entry of UNRELEASED_ENTRIES)
      expect(shipped.has(entry.id)).toBe(false);
    expect(compare(UNRELEASED_VERSION, CURRENT_VERSION)).toBe(1);
  });

  it("orders the history newest first", () => {
    expect(RELEASES_NEWEST_FIRST.map((r) => r.version)).toEqual(
      [...RELEASES].reverse().map((r) => r.version),
    );
  });
});

// ---------------------------------------------------------------------------
// §5.2 — content contracts
// ---------------------------------------------------------------------------

/** Every string a reader will see, staged entries included. */
const copy: { where: string; text: string; entry?: ReleaseEntry }[] = [
  ...RELEASES.flatMap((r) =>
    r.headline ? [{ where: `${r.version} headline`, text: r.headline }] : [],
  ),
  ...[
    ...allEntries.map(({ release, entry }) => ({
      where: `${release.version} / ${entry.id}`,
      entry,
    })),
    ...UNRELEASED_ENTRIES.map((entry) => ({
      where: `unreleased / ${entry.id}`,
      entry,
    })),
  ].flatMap(({ where, entry }) => [
    { where: `${where} title`, text: entry.title, entry },
    { where: `${where} body`, text: entry.body, entry },
    ...(entry.link
      ? [{ where: `${where} link`, text: entry.link.label, entry }]
      : []),
    ...(entry.media
      ? [{ where: `${where} media alt`, text: entry.media.alt, entry }]
      : []),
  ]),
];

/** Every entry that ships a recording, staged entries included. */
const allMedia: { where: string; media: NonNullable<ReleaseEntry["media"]> }[] =
  [
    ...allEntries.map(({ release, entry }) => ({
      where: `${release.version} / ${entry.id}`,
      entry,
    })),
    ...UNRELEASED_ENTRIES.map((entry) => ({
      where: `unreleased / ${entry.id}`,
      entry,
    })),
  ].flatMap(({ where, entry }) =>
    entry.media ? [{ where, media: entry.media }] : [],
  );

describe("content contracts (§5.2)", () => {
  it("has no hype — no exclamation marks, no superlatives (hard rule 7)", () => {
    const HYPE =
      /!|\bexcited\b|\bexciting\b|\bamazing\b|\bawesome\b|\bincredible\b|\brevolutionary\b|\bgame[- ]?chang/i;
    for (const { where, text } of copy)
      expect(HYPE.test(text), `${where}: ${text}`).toBe(false);
  });

  it("frames positively — the correct behavior, not the old defect (§8.4)", () => {
    const NEGATIVE =
      /\bbugs?\b|\bbroken\b|\bcrash|\bno longer\b|\bissue where\b|\bproblem where\b|\bfailed to\b|\bincorrectly\b/i;
    for (const { where, text } of copy)
      expect(NEGATIVE.test(text), `${where}: ${text}`).toBe(false);
  });

  it("uses plain language — the reader's words, not the build's (§8.5)", () => {
    const JARGON =
      /\bLLM\b|\bAPI\b|\bendpoint\b|\bdatabase\b|\bbackend\b|\brefactor|\bmigration\b|\bRLS\b|\bschema\b/i;
    for (const { where, text } of copy)
      expect(JARGON.test(text), `${where}: ${text}`).toBe(false);
  });

  it("says MCP only where the reader must find that word in their own client", () => {
    for (const { where, text, entry } of copy)
      if (/\bMCP\b/.test(text))
        expect(
          entry?.area,
          `${where} may say MCP only under area "connector"`,
        ).toBe("connector");
  });

  it("keeps the honesty guardrails — no claimed precision the engine lacks (doc 10 §9)", () => {
    const OVERCLAIM =
      /\bexact(ly)?\b|\bguaranteed?\b|\bprecisely\b|\btrue (?:one[- ]rep )?max\b|\btested max\b|\bperfectly\b/i;
    for (const { where, text } of copy)
      expect(OVERCLAIM.test(text), `${where}: ${text}`).toBe(false);
    // an estimate is named as one wherever it appears
    for (const { where, text } of copy)
      if (/\b(1RM|one[- ]rep max)\b/i.test(text))
        expect(
          /estimat/i.test(text),
          `${where} must say it is an estimate`,
        ).toBe(true);
  });

  it("describes every recording in words", () => {
    // the recording carries the entry's whole demonstration; a reader who
    // cannot see it is owed the same account
    for (const { where, media } of allMedia) {
      expect(media.alt.trim().length, `${where} needs alt text`).toBeGreaterThan(
        20,
      );
      expect(media.alt.length, `${where} alt`).toBeLessThanOrEqual(
        CONTENT_LIMITS.mediaAlt,
      );
    }
  });

  it("ships every recording it points at, version-scoped and inside budget", () => {
    for (const { where, media } of allMedia) {
      expect(media.src, `${where} media path`).toMatch(
        /^\/releases\/\d+\.\d+\.\d+\/[a-z0-9-]+\.(gif|png|webp)$/,
      );
      const file = path.join(REPO_ROOT, "public", media.src);
      expect(existsSync(file), `${where}: ${media.src} is not in public/`).toBe(
        true,
      );
      // a release note is read on a phone, often on mobile data
      expect(
        statSync(file).size,
        `${where}: ${media.src} is over the size budget`,
      ).toBeLessThanOrEqual(CONTENT_LIMITS.mediaBytes);
      expect(media.width, `${where} width`).toBeGreaterThan(0);
      expect(media.height, `${where} height`).toBeGreaterThan(0);
    }
  });

  it("respects the length budget (§5.2.6)", () => {
    for (const r of RELEASES) {
      if (r.headline)
        expect(r.headline.length, `${r.version} headline`).toBeLessThanOrEqual(
          CONTENT_LIMITS.headline,
        );
      const highlights = r.entries.filter((entry) => entry.highlight);
      if (r.kind === "fix") {
        expect(highlights, `${r.version} fix highlights`).toHaveLength(0);
      } else if (r.version !== "1.0.0") {
        expect(
          highlights.length,
          `${r.version} highlight count`,
        ).toBeGreaterThan(0);
        expect(
          highlights.length,
          `${r.version} highlight count`,
        ).toBeLessThanOrEqual(CONTENT_LIMITS.maxHighlights);
      }
      for (const entry of highlights)
        expect(
          entry.link,
          `${r.version} / ${entry.id} highlight needs a link`,
        ).toBeDefined();
      const firstSupporting = r.entries.findIndex((entry) => !entry.highlight);
      if (firstSupporting >= 0)
        expect(
          r.entries.slice(firstSupporting).some((entry) => entry.highlight),
          `${r.version} highlights must precede supporting notes`,
        ).toBe(false);
    }
    if (UNRELEASED_ENTRIES.length > 0) {
      const highlights = UNRELEASED_ENTRIES.filter((entry) => entry.highlight);
      expect(highlights.length, "unreleased highlight count").toBeGreaterThan(
        0,
      );
      expect(
        highlights.length,
        "unreleased highlight count",
      ).toBeLessThanOrEqual(CONTENT_LIMITS.maxHighlights);
      for (const entry of highlights)
        expect(entry.link, `${entry.id} highlight needs a link`).toBeDefined();
      const firstSupporting = UNRELEASED_ENTRIES.findIndex(
        (entry) => !entry.highlight,
      );
      if (firstSupporting >= 0)
        expect(
          UNRELEASED_ENTRIES.slice(firstSupporting).some(
            (entry) => entry.highlight,
          ),
          "unreleased highlights must precede supporting notes",
        ).toBe(false);
    }
    for (const entry of [
      ...allEntries.map(({ entry }) => entry),
      ...UNRELEASED_ENTRIES,
    ]) {
      expect(entry.title.length, `${entry.id} title`).toBeLessThanOrEqual(
        CONTENT_LIMITS.title,
      );
      expect(entry.body.length, `${entry.id} body`).toBeLessThanOrEqual(
        CONTENT_LIMITS.body,
      );
      if (entry.link)
        expect(
          entry.link.label.length,
          `${entry.id} link label`,
        ).toBeLessThanOrEqual(CONTENT_LIMITS.linkLabel);
    }
  });

  it("writes titles in sentence case with no trailing period", () => {
    for (const entry of [
      ...allEntries.map(({ entry }) => entry),
      ...UNRELEASED_ENTRIES,
    ]) {
      expect(entry.title.endsWith("."), `${entry.id} title`).toBe(false);
      expect(entry.title.trim(), `${entry.id} title`).toBe(entry.title);
      expect(entry.body.trim(), `${entry.id} body`).toBe(entry.body);
    }
  });
});

// ---------------------------------------------------------------------------
// §7 — deep links
// ---------------------------------------------------------------------------

describe("deep-link targets (§7)", () => {
  it("resolves every app target against the allowlist", () => {
    for (const entry of [
      ...allEntries.map(({ entry }) => entry),
      ...UNRELEASED_ENTRIES,
    ]) {
      const target = entry.link?.target;
      if (target?.kind === "app")
        expect(
          isLinkableRoute(target.href),
          `${entry.id} → ${target.href}`,
        ).toBe(true);
      if (target?.kind === "guide")
        // doc 22 Phase 2 has not landed, so there are no valid guide sections
        // yet — assert that rather than silently accept an unresolvable link
        expect(
          isGuideSectionId(target.section),
          `${entry.id} → guide section ${target.section} does not exist yet`,
        ).toBe(true);
    }
  });
});

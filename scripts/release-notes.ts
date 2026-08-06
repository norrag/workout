/**
 * doc 23 §9.3 step 7 / O5 — the GitHub release body, generated from the
 * registry so the tag and the app can never drift. The registry stays the
 * source of truth; the tag is an artifact.
 *
 * Run after merging a release PR:
 *
 *   npx tsx scripts/release-notes.ts            # the current version
 *   npx tsx scripts/release-notes.ts 1.1.0      # a specific one
 *
 * Then: `gh release create v<version> --title ... --notes-file -` (or paste).
 * Never hand-write the body — that is the drift this script exists to prevent.
 */
import { CURRENT_VERSION, RELEASES } from "../src/content/releases";
import type { Release } from "../src/content/releases/types";

function body(release: Release): string {
  const lines: string[] = [];
  lines.push(`# ${release.version} — ${release.headline ?? "Fixes"}`);
  lines.push("");
  lines.push(
    `_${release.kind === "fix" ? "Fix release" : release.kind === "feature" ? "Feature release" : "Major release"} · ${release.date}_`,
  );
  lines.push("");
  for (const entry of release.entries) {
    lines.push(`### ${entry.title}`);
    lines.push("");
    lines.push(entry.body);
    if (entry.link) {
      const target =
        entry.link.target.kind === "app"
          ? entry.link.target.href
          : `guide: ${entry.link.target.section}`;
      lines.push("");
      lines.push(`↳ ${entry.link.label} (${target})`);
    }
    lines.push("");
  }
  if (release.kind !== "fix")
    lines.push(
      "Read this again any time under **More → What's new** in the app.",
    );
  return `${lines.join("\n").trimEnd()}\n`;
}

const requested = process.argv[2] ?? CURRENT_VERSION;
const release = RELEASES.find((r) => r.version === requested);
if (!release) {
  console.error(
    `no release ${requested} in the registry (have: ${RELEASES.map((r) => r.version).join(", ")})`,
  );
  process.exit(1);
}
process.stdout.write(body(release));

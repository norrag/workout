import { describe, it, expect } from "vitest";
import { RELEASES } from "@/content/releases";
import { versionGate } from "../gate";
import { releaseAnnouncement } from "../announcement";
function announcement(lastSeen: string) {
  const gate = versionGate(lastSeen, RELEASES, "1.4.1");
  return gate.kind === "whats-new" ? releaseAnnouncement(gate.releases) : null;
}
describe("skipped release flagship presentation", () => {
  it("leads with measurements when 1.3 and 1.4 are unseen", () => {
    const result = announcement("1.2.1")!;
    expect(result.headline).toBe("Track size changes between scans");
    expect(result.highlights[0].id).toBe("monthly-body-measurements");
    expect(result.highlights.map((x) => x.id)).toEqual([
      "monthly-body-measurements",
      "measurement-backlog-import",
      "connector-tool-list-refresh-notice",
    ]);
  });
  it("does not replay measurements after 1.3 was acknowledged", () => {
    const result = announcement("1.3.0")!;
    expect(result.highlights.map((x) => x.id)).toEqual([
      "measurement-backlog-import",
    ]);
  });
  it("does not reopen dismissed announcements for a fix release", () => {
    expect(announcement("1.4.0")).toBeNull();
    expect(announcement("1.4.1")).toBeNull();
  });
  it("preserves first-account priming", () =>
    expect(versionGate(null, RELEASES, "1.4.1").kind).toBe("prime"));
});

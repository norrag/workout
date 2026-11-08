import type { Release } from "@/content/releases/types";

/** Lead with unseen flagship features, even when a smaller release follows. */
export function releaseAnnouncement(releases: readonly Release[]) {
  const newestFirst = [...releases].reverse();
  const entries = newestFirst.flatMap((release) =>
    release.entries.filter((entry) => entry.highlight),
  );
  const flagshipRelease = newestFirst.find((release) =>
    release.entries.some((entry) => entry.highlight && entry.featured),
  );
  return {
    highlights: [
      ...entries.filter((entry) => entry.featured),
      ...entries.filter((entry) => !entry.featured),
    ],
    headline: (flagshipRelease ?? newestFirst[0])?.headline,
  };
}

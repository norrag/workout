import "server-only";
import { z } from "zod";
import { NOTES_DIR } from "./types";

/**
 * The notes area's transport: read and commit `docs/notes/**` through the
 * GitHub API. The one I/O module under `src/lib/notes/` (everything else here
 * is pure and unit-tested).
 *
 * WHY THE REPO AND NOT THE DATABASE (N67). The notes area *is* markdown in this
 * repo — that is what a Claude Code session reads at the start of every
 * session. Mirroring it into Postgres would create a second source of truth and
 * a sync problem the manual explicitly doesn't have ("backlog.md ... the single
 * source of truth for item state"). Committing to the repo instead means a note
 * captured from a phone is in `backlog.md` immediately, in git history, with no
 * reconciliation step and no drift.
 *
 * SAFETY. Writes are admin-gated at the tool boundary, path-allowlisted here to
 * `docs/notes/**.md`, applied as a single atomic commit per tool call, and
 * rejected outright if the branch moved since the snapshot was read (no silent
 * clobber of a concurrent Claude Code commit). Every write is an ordinary git
 * commit: reviewable in the log and revertable.
 */

const envSchema = z.object({
  NOTES_REPO_TOKEN: z
    .string({ required_error: "missing (set it in the Vercel env vars)" })
    .min(1, "must not be empty"),
  NOTES_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "must be `owner/repo`")
    .default("norrag/workout"),
  NOTES_REPO_BRANCH: z.string().min(1).default("main"),
});

export interface NotesRepoConfig {
  token: string;
  repo: string;
  branch: string;
}

/** Validated config, or a loud named error (R22 style — never an opaque 500). */
export function notesRepoConfig(): NotesRepoConfig {
  const parsed = envSchema.safeParse({
    NOTES_REPO_TOKEN: process.env.NOTES_REPO_TOKEN,
    NOTES_REPO: process.env.NOTES_REPO || undefined,
    NOTES_REPO_BRANCH: process.env.NOTES_REPO_BRANCH || undefined,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(
      `notes repo access misconfigured — ${problems}. ` +
        `See docs/deployment/manual-operations.md (“notes MCP tools”).`,
    );
  }
  return {
    token: parsed.data.NOTES_REPO_TOKEN,
    repo: parsed.data.NOTES_REPO,
    branch: parsed.data.NOTES_REPO_BRANCH,
  };
}

/** Reject anything outside `docs/notes/**.md` before it can reach a blob. */
export function assertWritablePath(path: string): void {
  const ok =
    path.startsWith(`${NOTES_DIR}/`) &&
    !path.includes("..") &&
    /^[\w./-]+\.md$/.test(path);
  if (!ok) {
    throw new Error(`refusing to write outside ${NOTES_DIR}/**.md: ${path}`);
  }
}

const API = "https://api.github.com";

async function gh<T>(
  cfg: NotesRepoConfig,
  path: string,
  init: RequestInit & { raw?: boolean } = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      accept: init.raw ? "application/vnd.github.raw" : "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "workout-mcp-notes",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} → ${res.status}: ${detail}`);
  }
  return (init.raw ? await res.text() : await res.json()) as T;
}

/**
 * A consistent view of the notes area at one commit. Reading and writing
 * against the same `headSha` is what makes the compare-and-swap meaningful:
 * if anything else lands on the branch in between, the commit is rejected
 * rather than silently overwriting it.
 */
export interface NotesSnapshot {
  headSha: string;
  read(path: string): Promise<string>;
}

export async function openSnapshot(cfg = notesRepoConfig()): Promise<NotesSnapshot> {
  const ref = await gh<{ object: { sha: string } }>(
    cfg,
    `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`,
  );
  const headSha = ref.object.sha;
  const cache = new Map<string, Promise<string>>();
  return {
    headSha,
    read(path: string) {
      let hit = cache.get(path);
      if (!hit) {
        hit = gh<string>(
          cfg,
          `/repos/${cfg.repo}/contents/${path}?ref=${headSha}`,
          { raw: true },
        );
        cache.set(path, hit);
      }
      return hit;
    },
  };
}

export interface CommitResult {
  commitSha: string;
  url: string;
  files: string[];
}

/**
 * Commit a set of files as one commit on top of `parentSha`. Fails (rather than
 * forcing) when the branch has moved — the caller re-reads and retries.
 */
export async function commitFiles(
  parentSha: string,
  files: { path: string; content: string }[],
  message: string,
  cfg = notesRepoConfig(),
): Promise<CommitResult> {
  if (files.length === 0) throw new Error("commitFiles: nothing to write");
  for (const f of files) assertWritablePath(f.path);

  const base = await gh<{ tree: { sha: string } }>(
    cfg,
    `/repos/${cfg.repo}/git/commits/${parentSha}`,
  );

  const blobs = await Promise.all(
    files.map(async (f) => {
      const blob = await gh<{ sha: string }>(cfg, `/repos/${cfg.repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(f.content, "utf8").toString("base64"),
          encoding: "base64",
        }),
      });
      return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    }),
  );

  const tree = await gh<{ sha: string }>(cfg, `/repos/${cfg.repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: base.tree.sha, tree: blobs }),
  });

  const commit = await gh<{ sha: string; html_url: string }>(
    cfg,
    `/repos/${cfg.repo}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
    },
  );

  try {
    await gh(cfg, `/repos/${cfg.repo}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } catch (err) {
    throw new Error(
      `the notes branch moved while this write was being prepared, so nothing was ` +
        `committed (a concurrent session wrote to ${cfg.branch}). Re-read the area and ` +
        `retry. Underlying: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    commitSha: commit.sha,
    url: commit.html_url,
    files: files.map((f) => f.path),
  };
}

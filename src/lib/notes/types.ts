/**
 * The notes-area vocabulary, in code.
 *
 * `docs/notes/CLAUDE.md` is the operating manual for the field-notes area; it
 * defines a lifecycle, a type set, an ID scheme, and a workstream grouping that
 * Claude Code sessions follow by reading the manual. The admin MCP notes tools
 * (N67) let a *remote* model work the same area, so the parts of that manual
 * that are enforceable are encoded here and validated at the tool boundary —
 * the vocabulary can't drift by paraphrase, and a status word that isn't in the
 * lifecycle can never reach a row.
 *
 * Pure module: no I/O, no dates-from-now. Everything in `src/lib/notes/` is
 * pure except `repo.ts` (GitHub transport) and `area.ts` (orchestration).
 */

/** Lifecycle states (manual → *Lifecycle*). Order is the progression order. */
export const NOTE_STATUSES = [
  "inbox",
  "triaged",
  "answered",
  "needs-input",
  "ready",
  "in-progress",
  "done",
  "wontfix",
  "superseded",
  "archived",
] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/** Statuses that make an item eligible for the archive sweep. */
export const TERMINAL_STATUSES: ReadonlySet<NoteStatus> = new Set([
  "done",
  "wontfix",
  "superseded",
  "archived",
]);

/** Item types (manual → *Types*). A type may shift (`Q→B`); the arrow is kept. */
export const NOTE_TYPES = ["Q", "B", "F", "UX", "D"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

/** Priorities the owner uses; `—` means "not assigned" (answered questions). */
export const NOTE_PRIORITIES = ["HIGH", "MED", "LOW", "—"] as const;
export type NotePriority = (typeof NOTE_PRIORITIES)[number];

export const STATUS_MEANINGS: Record<NoteStatus, string> = {
  inbox: "captured, not yet examined",
  triaged: "classified + initial scope written",
  answered: "question resolved in a detail doc (may spawn a task)",
  "needs-input": "blocked on an owner decision (frame the options in-row)",
  ready: "clean scoped task with acceptance criteria",
  "in-progress": "being built (link the branch/PR)",
  done: "shipped (PR/commit linked) — eligible for archival",
  wontfix: "declined, with a one-line reason",
  superseded: "folded into / replaced by another item (link it)",
  archived: "terminal; moved out of the live index into archive.md",
};

export const TYPE_MEANINGS: Record<NoteType, string> = {
  Q: "question / info-gathering (answer from code + docs)",
  B: "bug (incorrect behavior)",
  F: "feature / rework",
  UX: "UX polish / cosmetic",
  D: "needs a product decision before it can be scoped",
};

/** A row of `backlog.md`'s live index. `body` is the whole Title cell — in
 *  practice it carries the item's title *and* its accumulated assessment. */
export interface BacklogItem {
  id: string;
  /** the full Title cell, markdown intact */
  body: string;
  /** a plain-text lead-in of `body`, for compact listings */
  summary: string;
  type: string;
  priority: string;
  workstream: string;
  /** the full Status cell, markdown intact (e.g. `**done (PR #208)**`) */
  status: string;
  /** the lifecycle word parsed out of `status`, when it starts with one */
  statusWord: NoteStatus | null;
  /** 0-based line index in the file, for surgical edits */
  line: number;
}

/** A row of the "Open follow-up tasks" table. */
export interface FollowUpItem {
  id: string;
  from: string;
  body: string;
  summary: string;
  type: string;
  status: string;
  statusWord: NoteStatus | null;
  line: number;
}

/** A workstream row from `README.md`'s roster. */
export interface Workstream {
  id: string;
  name: string;
  detailFile: string;
  covers: string;
}

/** An appendix batch heading (the append-only verbatim record). */
export interface AppendixBatch {
  number: number;
  heading: string;
  line: number;
}

/** The files this module knows how to read and write. All under `docs/notes/`. */
export const NOTES_DIR = "docs/notes";
export const BACKLOG_PATH = `${NOTES_DIR}/backlog.md`;
export const ARCHIVE_PATH = `${NOTES_DIR}/archive.md`;
export const LOG_PATH = `${NOTES_DIR}/log.md`;
export const README_PATH = `${NOTES_DIR}/README.md`;
export const MANUAL_PATH = `${NOTES_DIR}/CLAUDE.md`;

/** Only these paths may ever be written by the notes tools (defense in depth —
 *  the transport enforces the `docs/notes/**` prefix as well). */
export const WRITABLE_PATHS: readonly string[] = [
  BACKLOG_PATH,
  ARCHIVE_PATH,
  LOG_PATH,
  README_PATH,
];

import "server-only";
import {
  appendBatch,
  insertFollowUpRow,
  insertIndexRow,
  parseBacklog,
  removeIndexRow,
  renderStatus,
  updateRow,
  type ParsedBacklog,
} from "./backlog";
import { appendSweep } from "./archive";
import { prependEntry, recentEntries } from "./log";
import { appendWorkstream, parseWorkstreams } from "./readme";
import { collectIds, nextBatchNumber, nextFollowUpIds, nextIds } from "./ids";
import { commitFiles, notesRepoConfig, openSnapshot, type CommitResult } from "./repo";
import {
  ARCHIVE_PATH,
  BACKLOG_PATH,
  LOG_PATH,
  MANUAL_PATH,
  NOTES_DIR,
  README_PATH,
  TERMINAL_STATUSES,
  type NoteStatus,
  type Workstream,
} from "./types";

/**
 * Orchestration for the notes area: read a consistent snapshot, apply the pure
 * transforms, write one commit. The MCP tools (`src/lib/mcp/tools/admin-notes.ts`)
 * are thin wrappers over these functions.
 *
 * Each exported operation is **protocol-complete**: it does everything the
 * manual requires for that move in a single commit, so the area can never be
 * left half-updated by a dropped connection. Intake, for instance, always
 * writes the verbatim appendix entry, the index rows, and the log entry
 * together — the failure mode the manual warns about (code moves, index goes
 * stale) is structurally unavailable to these tools.
 */

/** The area's current state, read at one commit. */
export interface AreaSnapshot {
  headSha: string;
  backlog: ParsedBacklog;
  backlogMd: string;
  workstreams: Workstream[];
  readmeMd: string;
  logMd: string;
  archiveMd: string;
  usedIds: Set<string>;
  nextBatch: number;
}

export async function readArea(): Promise<AreaSnapshot> {
  const snap = await openSnapshot();
  const [backlogMd, readmeMd, logMd, archiveMd] = await Promise.all([
    snap.read(BACKLOG_PATH),
    snap.read(README_PATH),
    snap.read(LOG_PATH),
    snap.read(ARCHIVE_PATH),
  ]);
  const backlog = parseBacklog(backlogMd);
  return {
    headSha: snap.headSha,
    backlog,
    backlogMd,
    workstreams: parseWorkstreams(readmeMd),
    readmeMd,
    logMd,
    archiveMd,
    usedIds: collectIds(backlogMd, archiveMd),
    nextBatch: nextBatchNumber(backlog.batches),
  };
}

/** The operating manual verbatim — the paradigm a remote model must follow. */
export async function readManual(): Promise<string> {
  const snap = await openSnapshot();
  return snap.read(MANUAL_PATH);
}

/** Read any file in the notes area (read-only escape hatch for detail docs). */
export async function readNotesFile(path: string): Promise<string> {
  const full = path.startsWith(`${NOTES_DIR}/`) ? path : `${NOTES_DIR}/${path}`;
  if (full.includes("..") || !/^[\w./-]+$/.test(full)) {
    throw new Error(`not a readable notes path: ${path}`);
  }
  const snap = await openSnapshot();
  return snap.read(full);
}

export { recentEntries };

// --- intake ------------------------------------------------------------------

export interface IntakeItem {
  title: string;
  /** the assessment prose that follows the title in the index cell */
  detail: string;
  type: string;
  priority: string;
  workstream: string;
  status?: NoteStatus;
  /** IDs this item relates to / is blocked on / is a symptom of */
  relates_to?: string[];
  blocked_on?: string[];
  symptom_of?: string;
  /** when set, the item is filed in the follow-up table under that parent */
  follow_up_of?: string;
}

export interface FoldIn {
  id: string;
  /** the new phrasing / extra evidence appended to the existing row */
  append: string;
}

export interface IntakeInput {
  batch_title: string;
  verbatim: string;
  source: string;
  date: string;
  items: IntakeItem[];
  fold_into: FoldIn[];
  new_workstreams: { id: string; name: string; covers: string; detail_file?: string }[];
  log_title: string;
  log_body: string;
}

export interface IntakeResult extends CommitResult {
  batch: number;
  created: { id: string; where: "index" | "follow-ups" }[];
  folded: string[];
}

export async function captureIntake(input: IntakeInput): Promise<IntakeResult> {
  const area = await readArea();
  const batch = area.nextBatch;

  // validate first, so a bad reference fails before anything is written
  const liveIds = new Set([
    ...area.backlog.items.map((i) => i.id),
    ...area.backlog.followUps.map((f) => f.id),
  ]);
  for (const f of input.fold_into) {
    if (!liveIds.has(f.id)) throw new Error(`fold_into: ${f.id} is not a live row`);
  }
  const knownWs = new Set([
    ...area.workstreams.map((w) => w.id),
    ...input.new_workstreams.map((w) => w.id),
  ]);
  for (const item of input.items) {
    if (!knownWs.has(item.workstream)) {
      throw new Error(
        `workstream "${item.workstream}" is not in the roster (${[...knownWs].join(", ")}). ` +
          `Pass it in new_workstreams to declare it in the same commit.`,
      );
    }
    if (item.follow_up_of && !liveIds.has(item.follow_up_of)) {
      throw new Error(`follow_up_of: ${item.follow_up_of} is not a live row`);
    }
  }

  // allocate IDs (never reusing one that reached the archive)
  const used = new Set(area.usedIds);
  const indexItems = input.items.filter((i) => !i.follow_up_of);
  const indexIds = nextIds("N", used, indexItems.length);
  indexIds.forEach((id) => used.add(id));
  const followUpIds = new Map<IntakeItem, string>();
  for (const parent of new Set(input.items.filter((i) => i.follow_up_of).map((i) => i.follow_up_of!))) {
    const children = input.items.filter((i) => i.follow_up_of === parent);
    const ids = nextFollowUpIds(parent, used, children.length);
    ids.forEach((id) => used.add(id));
    children.forEach((child, n) => followUpIds.set(child, ids[n]));
  }

  // backlog.md: appendix first (append-only record), then the rows
  let backlogMd = appendBatch(area.backlogMd, {
    number: batch,
    title: input.batch_title,
    date: input.date,
    source: input.source,
    verbatim: input.verbatim,
  });

  const created: { id: string; where: "index" | "follow-ups" }[] = [];
  let n = 0;
  for (const item of input.items) {
    const status = item.status ?? "inbox";
    const body = renderItemBody(item, input.date, batch);
    if (item.follow_up_of) {
      const id = followUpIds.get(item)!;
      backlogMd = insertFollowUpRow(backlogMd, {
        id,
        from: item.follow_up_of,
        body,
        type: item.type,
        status: renderStatus(status),
      });
      created.push({ id, where: "follow-ups" });
    } else {
      const id = indexIds[n++];
      backlogMd = insertIndexRow(backlogMd, {
        id,
        body,
        type: item.type,
        priority: item.priority,
        workstream: item.workstream,
        status: renderStatus(status),
      });
      created.push({ id, where: "index" });
    }
  }

  for (const fold of input.fold_into) {
    backlogMd = updateRow(backlogMd, fold.id, {
      appendBody: `**Batch ${batch} (${input.date}):** ${fold.append}`,
    });
  }

  const files = [{ path: BACKLOG_PATH, content: backlogMd }];

  if (input.new_workstreams.length > 0) {
    let readmeMd = area.readmeMd;
    for (const ws of input.new_workstreams) {
      readmeMd = appendWorkstream(readmeMd, {
        id: ws.id,
        name: ws.name,
        covers: ws.covers,
        detailFile: ws.detail_file,
      });
    }
    files.push({ path: README_PATH, content: readmeMd });
  }

  files.push({
    path: LOG_PATH,
    content: prependEntry(area.logMd, {
      date: input.date,
      title: input.log_title,
      body: input.log_body,
    }),
  });

  const commit = await commitFiles(
    area.headSha,
    files,
    `docs(notes): Batch ${batch} intake via MCP — ${input.batch_title}\n\n` +
      `${created.length} item(s): ${created.map((c) => c.id).join(", ") || "none"}` +
      `${input.fold_into.length ? `; folded into ${input.fold_into.map((f) => f.id).join(", ")}` : ""}`,
  );

  return { ...commit, batch, created, folded: input.fold_into.map((f) => f.id) };
}

function renderItemBody(item: IntakeItem, date: string, batch: number): string {
  const parts = [`**${item.title}** (owner, ${date}, Batch ${batch}).`];
  if (item.detail.trim()) parts.push(item.detail.trim());
  if (item.symptom_of) parts.push(`Symptom of ${item.symptom_of}.`);
  if (item.blocked_on?.length) parts.push(`Blocked on ${item.blocked_on.join(", ")}.`);
  if (item.relates_to?.length) parts.push(`Relates ${item.relates_to.join(", ")}.`);
  return parts.join(" ");
}

// --- item updates ------------------------------------------------------------

export interface UpdateInput {
  id: string;
  status?: NoteStatus;
  status_pr?: number;
  status_note?: string;
  priority?: string;
  type?: string;
  workstream?: string;
  append_body?: string;
  replace_body?: string;
  /** move the row out of the live index into `archive.md` */
  archive?: { resolution: string; sweep_summary: string };
  date: string;
  log_title: string;
  log_body: string;
}

export interface UpdateResult extends CommitResult {
  id: string;
  archived: boolean;
}

export async function updateItem(input: UpdateInput): Promise<UpdateResult> {
  const area = await readArea();
  const item = area.backlog.items.find((i) => i.id === input.id);
  const followUp = area.backlog.followUps.find((f) => f.id === input.id);
  if (!item && !followUp) {
    throw new Error(
      `${input.id} is not a live row in backlog.md (it may already be archived — ` +
        `read archive.md with read_notes_file).`,
    );
  }
  if (input.workstream && !area.workstreams.some((w) => w.id === input.workstream)) {
    throw new Error(`workstream "${input.workstream}" is not in the roster`);
  }

  const status =
    input.status != null
      ? renderStatus(input.status, { pr: input.status_pr, note: input.status_note })
      : undefined;

  let backlogMd = updateRow(area.backlogMd, input.id, {
    body: input.replace_body,
    appendBody: input.append_body,
    type: input.type,
    priority: input.priority,
    workstream: input.workstream,
    status,
  });

  const files: { path: string; content: string }[] = [];
  let archived = false;

  if (input.archive) {
    if (!item) throw new Error(`${input.id} is a follow-up task; sweep it by hand`);
    const effective = input.status ?? item.statusWord;
    if (!effective || !TERMINAL_STATUSES.has(effective)) {
      throw new Error(
        `${input.id} is not terminal (status: ${item.status || "unset"}). Only ` +
          `done / wontfix / superseded rows are swept to archive.md.`,
      );
    }
    const removal = removeIndexRow(backlogMd, input.id);
    backlogMd = removal.md;
    files.push({
      path: ARCHIVE_PATH,
      content: appendSweep(
        area.archiveMd,
        { date: input.date, summary: input.archive.sweep_summary, prose: input.log_body },
        [
          {
            id: item.id,
            title: item.body,
            type: input.type ?? item.type,
            workstream: input.workstream ?? item.workstream,
            resolution: input.archive.resolution,
          },
        ],
      ),
    });
    archived = true;
  }

  files.unshift({ path: BACKLOG_PATH, content: backlogMd });
  files.push({
    path: LOG_PATH,
    content: prependEntry(area.logMd, {
      date: input.date,
      title: input.log_title,
      body: input.log_body,
    }),
  });

  const commit = await commitFiles(
    area.headSha,
    files,
    `docs(notes): ${input.id} ${archived ? "archived" : "updated"} via MCP — ${input.log_title}`,
  );
  return { ...commit, id: input.id, archived };
}

// --- standalone log ----------------------------------------------------------

export async function appendLog(entry: {
  date: string;
  title: string;
  body: string;
}): Promise<CommitResult> {
  const area = await readArea();
  return commitFiles(
    area.headSha,
    [{ path: LOG_PATH, content: prependEntry(area.logMd, entry) }],
    `docs(notes): log entry via MCP — ${entry.title}`,
  );
}

/** Whether repo access is configured at all — reported instead of thrown so a
 *  read tool can explain the one manual setup step rather than 500. */
export function repoConfigError(): string | null {
  try {
    notesRepoConfig();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

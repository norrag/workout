import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  appendLog,
  captureIntake,
  readArea,
  readManual,
  readNotesFile,
  recentEntries,
  repoConfigError,
  updateItem,
} from "@/lib/notes/area";
import {
  NOTE_PRIORITIES,
  NOTE_STATUSES,
  NOTE_TYPES,
  STATUS_MEANINGS,
  TYPE_MEANINGS,
} from "@/lib/notes/types";
import { resolveAdmin } from "./admin-gate";
import { toolResult } from "../envelope";
import { recordMcpWrite } from "../audit";
import type { McpExtra } from "../session";

/**
 * N67 — the field-notes area (`docs/notes/`) as an admin MCP surface.
 *
 * The point (owner, Batch 28): capture and organise notes fluidly from any
 * model/device the connector reaches, and leave Claude Code for the work that
 * genuinely needs the codebase — deep scoping, reviews, implementation. So
 * these tools cover **intake, assessment and status**, and deliberately stop
 * short of the scoping files: `read_notes_file` can read them, nothing here
 * rewrites them.
 *
 * "In the exact same way that you do" is the requirement, so the paradigm is
 * carried three ways rather than assumed:
 *   1. `get_notes_manual` serves `docs/notes/CLAUDE.md` verbatim — the same
 *      instructions a Claude Code session reads — plus the live vocabulary.
 *   2. The vocabulary is *enforced* (zod + `src/lib/notes/types.ts`): a status
 *      outside the lifecycle, a type outside the set, or a workstream that
 *      isn't in the roster cannot reach a row.
 *   3. Each write is protocol-complete in one commit — intake always writes the
 *      verbatim appendix entry, the rows, and the `log.md` entry together, so
 *      the "code moved, index went stale" failure the manual is built to
 *      prevent has no way to happen here.
 *
 * Identity is the session's (hard rule #5), every tool is admin-gated, and the
 * transport is path-locked to `docs/notes/**.md` (`notes/repo.ts`).
 */

function jsonResult(payload: Record<string, unknown>) {
  return toolResult(payload);
}

/** Server-side UTC day; every write tool takes an explicit `date` override for
 *  a caller whose local day differs (the headings are calendar days). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .optional();

/** Config is a one-time manual step; say so plainly instead of throwing a 500. */
function configProblem() {
  const problem = repoConfigError();
  if (!problem) return null;
  return jsonResult({
    ok: false,
    error: problem,
    fix: "Set NOTES_REPO_TOKEN (fine-grained PAT, Contents: read+write on this repo) in the deployment env. See docs/deployment/manual-operations.md.",
  });
}

// --- get_notes_manual --------------------------------------------------------

export const GET_NOTES_MANUAL = "get_notes_manual";
function registerGetNotesManual(server: McpServer) {
  server.registerTool(
    GET_NOTES_MANUAL,
    {
      title: "Get the notes-area operating manual",
      description:
        "Admin only. READ THIS FIRST, before any other notes tool. Returns " +
        "`docs/notes/CLAUDE.md` verbatim — the operating manual for the owner's " +
        "field-notes area (intake protocol, lifecycle, types, ID scheme, " +
        "workstreams, consolidation/purge policy) — together with the live " +
        "workstream roster, the enforced status/type/priority vocabulary, the " +
        "next free item ID and appendix batch number, and the most recent " +
        "`log.md` entries. Follow the manual exactly: the value this area adds " +
        "is ASSESSMENT (dedup, relate, group, sequence, prioritise), not " +
        "file-and-forget. In practice that means calling get_notes_backlog to " +
        "check the new note against what is already open BEFORE calling " +
        "capture_notes.",
      inputSchema: {
        recent_log_entries: z.number().int().min(0).max(10).optional(),
      },
    },
    async ({ recent_log_entries }: { recent_log_entries?: number }, extra: McpExtra) => {
      await resolveAdmin(extra);
      const bad = configProblem();
      if (bad) return bad;
      const [manual, area] = await Promise.all([readManual(), readArea()]);
      return jsonResult({
        manual,
        vocabulary: {
          statuses: STATUS_MEANINGS,
          types: TYPE_MEANINGS,
          priorities: NOTE_PRIORITIES,
          lifecycle:
            "inbox → triaged → (needs-input | ready | answered) → in-progress → done → archived",
        },
        workstreams: area.workstreams,
        allocation: {
          next_item_id: `N${
            Math.max(
              0,
              ...[...area.usedIds]
                .map((id) => /^N(\d+)$/.exec(id)?.[1])
                .filter(Boolean)
                .map(Number),
            ) + 1
          }`,
          next_batch: area.nextBatch,
          note: "IDs are allocated by the tools, never by you — capture_notes returns the ones it used.",
        },
        live_counts: {
          index_rows: area.backlog.items.length,
          follow_up_rows: area.backlog.followUps.length,
        },
        recent_log: recentEntries(area.logMd, recent_log_entries ?? 3),
      });
    },
  );
}

// --- get_notes_backlog -------------------------------------------------------

export const GET_NOTES_BACKLOG = "get_notes_backlog";
function registerGetNotesBacklog(server: McpServer) {
  server.registerTool(
    GET_NOTES_BACKLOG,
    {
      title: "Read the notes backlog",
      description:
        "Admin only. The live index from `docs/notes/backlog.md`, parsed. Use it " +
        "to assess a new note against open work (the manual's step 3: duplicate? " +
        "overlaps? blocked on? same workstream?) and to answer 'what's open / " +
        "what's next'. Compact by default (id, one-line summary, type, priority, " +
        "workstream, status); pass include_body=true — ideally with ids or a " +
        "search — for the full row text, which carries the accumulated " +
        "assessment. `search` matches the row text case-insensitively. Archived " +
        "items are NOT here; read `archive.md` via read_notes_file for those.",
      inputSchema: {
        ids: z.array(z.string()).max(50).optional(),
        status: z.enum(NOTE_STATUSES).optional(),
        type: z.enum(NOTE_TYPES).optional(),
        workstream: z.string().max(4).optional(),
        priority: z.enum(NOTE_PRIORITIES).optional(),
        search: z.string().min(2).max(120).optional(),
        include_body: z.boolean().optional(),
        include_follow_ups: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (
      args: {
        ids?: string[];
        status?: string;
        type?: string;
        workstream?: string;
        priority?: string;
        search?: string;
        include_body?: boolean;
        include_follow_ups?: boolean;
        limit?: number;
      },
      extra: McpExtra,
    ) => {
      await resolveAdmin(extra);
      const bad = configProblem();
      if (bad) return bad;
      const area = await readArea();
      const needle = args.search?.toLowerCase();
      const wanted = args.ids ? new Set(args.ids) : null;

      const matches = area.backlog.items.filter((i) => {
        if (wanted && !wanted.has(i.id)) return false;
        if (args.status && i.statusWord !== args.status) return false;
        if (args.type && i.type !== args.type) return false;
        if (args.workstream && i.workstream !== args.workstream) return false;
        if (args.priority && i.priority !== args.priority) return false;
        if (needle && !`${i.id} ${i.body} ${i.status}`.toLowerCase().includes(needle))
          return false;
        return true;
      });
      const limit = args.limit ?? 60;
      const shown = matches.slice(0, limit);

      const followUps = args.include_follow_ups
        ? area.backlog.followUps.filter(
            (f) =>
              (!wanted || wanted.has(f.id)) &&
              (!needle || `${f.id} ${f.body}`.toLowerCase().includes(needle)),
          )
        : [];

      const project = (row: { body: string; summary: string }) =>
        args.include_body ? { body: row.body } : { summary: row.summary };

      return jsonResult({
        total_live: area.backlog.items.length,
        matched: matches.length,
        returned: shown.length,
        truncated: matches.length > shown.length,
        items: shown.map((i) => ({
          id: i.id,
          ...project(i),
          type: i.type,
          priority: i.priority,
          workstream: i.workstream,
          status: i.status,
          status_word: i.statusWord,
        })),
        ...(args.include_follow_ups
          ? {
              follow_ups: followUps.map((f) => ({
                id: f.id,
                from: f.from,
                ...project(f),
                type: f.type,
                status: f.status,
              })),
            }
          : {}),
        workstreams: area.workstreams.map((w) => ({ id: w.id, name: w.name })),
      });
    },
  );
}

// --- read_notes_file ---------------------------------------------------------

export const READ_NOTES_FILE = "read_notes_file";
function registerReadNotesFile(server: McpServer) {
  server.registerTool(
    READ_NOTES_FILE,
    {
      title: "Read a notes-area file",
      description:
        "Admin only. Read any file under `docs/notes/` verbatim — `archive.md` " +
        "(closed items), `log.md` (full history), `scoping.md` (codebase-grounded " +
        "scope notes), a workstream detail file, or `backlog.md` raw. Read-only: " +
        "these files are written by Claude Code sessions with the codebase in " +
        "front of them. Large files support offset/limit by line.",
      inputSchema: {
        path: z
          .string()
          .min(3)
          .max(120)
          .describe("e.g. `archive.md`, `scoping.md`, `docs/notes/log.md`"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
    },
    async (
      { path, offset, limit }: { path: string; offset?: number; limit?: number },
      extra: McpExtra,
    ) => {
      await resolveAdmin(extra);
      const bad = configProblem();
      if (bad) return bad;
      const content = await readNotesFile(path);
      const lines = content.split("\n");
      const start = offset ?? 0;
      const slice = lines.slice(start, start + (limit ?? lines.length));
      return jsonResult({
        path,
        total_lines: lines.length,
        from_line: start,
        returned_lines: slice.length,
        content: slice.join("\n"),
      });
    },
  );
}

// --- capture_notes -----------------------------------------------------------

const intakeItemSchema = z.object({
  title: z
    .string()
    .min(5)
    .max(300)
    .describe("one-line headline, rendered bold at the head of the row"),
  detail: z
    .string()
    .max(4000)
    .describe(
      "your assessment: what it means, what it overlaps, what it depends on, why this priority",
    ),
  type: z.enum(NOTE_TYPES),
  priority: z.enum(NOTE_PRIORITIES),
  workstream: z.string().min(1).max(4),
  status: z.enum(NOTE_STATUSES).optional(),
  relates_to: z.array(z.string()).max(10).optional(),
  blocked_on: z.array(z.string()).max(10).optional(),
  symptom_of: z.string().optional(),
  follow_up_of: z
    .string()
    .optional()
    .describe("file it in the follow-up table under this parent item instead"),
});

export const CAPTURE_NOTES = "capture_notes";
function registerCaptureNotes(server: McpServer) {
  server.registerTool(
    CAPTURE_NOTES,
    {
      title: "Capture a batch of field notes",
      description:
        "Admin only. Run the manual's INTAKE PROTOCOL as one atomic commit: the " +
        "owner's words appended verbatim to the append-only appendix under a new " +
        "dated batch, the parsed items added to the live index (IDs allocated " +
        "here — never invent one), duplicates folded into the rows they restate, " +
        "any new workstream declared in the README roster, and a dated `log.md` " +
        "entry. Nothing lands half-done.\n\n" +
        "BEFORE calling: read get_notes_manual, then get_notes_backlog to check " +
        "the notes against open work. One note may become several items, or " +
        "several notes may collapse into one — that assessment is the job. " +
        "Restatements of an existing item belong in fold_into, NOT as a new row " +
        "(the manual forbids two live rows for one problem). `verbatim` must be " +
        "the owner's raw words, unedited and complete — it is the permanent " +
        "record and nothing can rewrite it afterwards. Leave deep scoping " +
        "(file:line, acceptance criteria) to a Claude Code session; status " +
        "`inbox`/`triaged` is the honest state for a note captured here.",
      inputSchema: {
        batch_title: z
          .string()
          .min(3)
          .max(120)
          .describe("short label for the batch, e.g. 'field notes'"),
        verbatim: z
          .string()
          .min(1)
          .max(20000)
          .describe("the owner's raw words, unedited — the permanent record"),
        source: z.string().max(60).optional().describe("default 'MCP capture'"),
        items: z.array(intakeItemSchema).max(25).optional(),
        fold_into: z
          .array(
            z.object({
              id: z.string(),
              append: z.string().min(3).max(2000),
            }),
          )
          .max(25)
          .optional(),
        new_workstreams: z
          .array(
            z.object({
              id: z.string().min(1).max(2),
              name: z.string().min(2).max(60),
              covers: z.string().min(5).max(400),
              detail_file: z.string().max(120).optional(),
            }),
          )
          .max(3)
          .optional(),
        log_title: z.string().min(5).max(140),
        log_body: z
          .string()
          .min(10)
          .max(6000)
          .describe("what this batch added/changed, what merged, what to tackle next"),
        date: dateArg,
      },
    },
    async (
      args: {
        batch_title: string;
        verbatim: string;
        source?: string;
        items?: z.infer<typeof intakeItemSchema>[];
        fold_into?: { id: string; append: string }[];
        new_workstreams?: {
          id: string;
          name: string;
          covers: string;
          detail_file?: string;
        }[];
        log_title: string;
        log_body: string;
        date?: string;
      },
      extra: McpExtra,
    ) => {
      const { userId } = await resolveAdmin(extra);
      const bad = configProblem();
      if (bad) return bad;
      const items = args.items ?? [];
      const foldInto = args.fold_into ?? [];
      if (items.length === 0 && foldInto.length === 0) {
        return jsonResult({
          ok: false,
          error:
            "nothing to file: pass items (new rows) and/or fold_into (append to existing rows). " +
            "The verbatim record is never captured on its own — every note is assessed.",
        });
      }
      let result;
      try {
        result = await captureIntake({
          batch_title: args.batch_title,
          verbatim: args.verbatim,
          source: args.source ?? "MCP capture",
          date: args.date ?? today(),
          items,
          fold_into: foldInto,
          new_workstreams: args.new_workstreams ?? [],
          log_title: args.log_title,
          log_body: args.log_body,
        });
      } catch (e) {
        return jsonResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      const summary =
        `notes Batch ${result.batch}: created ${result.created.map((c) => c.id).join(", ") || "—"}` +
        `${result.folded.length ? `, folded into ${result.folded.join(", ")}` : ""}`;
      await recordMcpWrite(userId, CAPTURE_NOTES, { batch: result.batch, ids: result.created }, summary);
      return jsonResult({
        ok: true,
        batch: result.batch,
        created: result.created,
        folded: result.folded,
        commit: result.commitSha,
        commit_url: result.url,
        files: result.files,
        summary,
        next: "Tell the owner what was new, what merged into existing items, what dependencies you found, and what to tackle next — the chat is their interface to this area.",
      });
    },
  );
}

// --- update_note_item --------------------------------------------------------

export const UPDATE_NOTE_ITEM = "update_note_item";
function registerUpdateNoteItem(server: McpServer) {
  server.registerTool(
    UPDATE_NOTE_ITEM,
    {
      title: "Update a backlog item",
      description:
        "Admin only. Move one item's state — status, priority, type, workstream, " +
        "or the row's assessment text — and log it, in one commit (the manual: " +
        "'update the row AND append a dated log entry'). Status is the lifecycle " +
        "vocabulary only; pass status_pr when a PR carries it (renders `done " +
        "(PR #N)`) and status_note for the residual ('owner re-checks on device'). " +
        "append_body is the usual move — it adds to the accumulated assessment " +
        "rather than discarding it; replace_body overwrites the whole cell. " +
        "Superseding a duplicate: set status `superseded`, status_note 'folded " +
        "into <ID>', and archive it.\n\n" +
        "ARCHIVING sweeps the row out of the live index into `archive.md` with " +
        "its resolution. Only terminal rows (done / wontfix / superseded) qualify, " +
        "and per the purge policy a `done` row is only swept once its PR has " +
        "MERGED and no follow-up is still open — don't sweep on the status word " +
        "alone.",
      inputSchema: {
        id: z.string().min(1).max(20),
        status: z.enum(NOTE_STATUSES).optional(),
        status_pr: z.number().int().positive().optional(),
        status_note: z.string().max(400).optional(),
        priority: z.enum(NOTE_PRIORITIES).optional(),
        type: z.enum(NOTE_TYPES).optional(),
        workstream: z.string().min(1).max(4).optional(),
        append_body: z.string().min(3).max(3000).optional(),
        replace_body: z.string().min(10).max(4000).optional(),
        archive: z
          .object({
            resolution: z
              .string()
              .min(10)
              .max(1000)
              .describe("why it's closed, with the PR/commit link"),
            sweep_summary: z
              .string()
              .min(5)
              .max(140)
              .describe("the sweep section heading tail, e.g. 'N64/N65 merged (PR #208)'"),
          })
          .optional(),
        log_title: z.string().min(5).max(140),
        log_body: z.string().min(10).max(4000),
        date: dateArg,
      },
    },
    async (
      args: {
        id: string;
        status?: (typeof NOTE_STATUSES)[number];
        status_pr?: number;
        status_note?: string;
        priority?: string;
        type?: string;
        workstream?: string;
        append_body?: string;
        replace_body?: string;
        archive?: { resolution: string; sweep_summary: string };
        log_title: string;
        log_body: string;
        date?: string;
      },
      extra: McpExtra,
    ) => {
      const { userId } = await resolveAdmin(extra);
      const bad = configProblem();
      if (bad) return bad;
      const touchesRow =
        args.status != null ||
        args.priority != null ||
        args.type != null ||
        args.workstream != null ||
        args.append_body != null ||
        args.replace_body != null ||
        args.archive != null;
      if (!touchesRow) {
        return jsonResult({
          ok: false,
          error:
            "no change requested — pass at least one of status / priority / type / workstream / append_body / replace_body / archive. " +
            "For a standalone note about the area, use append_notes_log.",
        });
      }
      let result;
      try {
        result = await updateItem({ ...args, date: args.date ?? today() });
      } catch (e) {
        return jsonResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      const summary = `notes ${result.id} ${result.archived ? "archived" : "updated"}`;
      await recordMcpWrite(userId, UPDATE_NOTE_ITEM, args, summary);
      return jsonResult({
        ok: true,
        id: result.id,
        archived: result.archived,
        commit: result.commitSha,
        commit_url: result.url,
        files: result.files,
        summary,
      });
    },
  );
}

// --- append_notes_log --------------------------------------------------------

export const APPEND_NOTES_LOG = "append_notes_log";
function registerAppendNotesLog(server: McpServer) {
  server.registerTool(
    APPEND_NOTES_LOG,
    {
      title: "Append a notes-area log entry",
      description:
        "Admin only. Add a dated entry to `docs/notes/log.md` on its own, for " +
        "something that moved the area without changing a row — an owner " +
        "decision taken in chat, a session summary, a 'next session should start " +
        "here' note. Newest first; this is the first thing a cold session reads. " +
        "Item changes already log themselves — don't double-log them here.",
      inputSchema: {
        title: z.string().min(5).max(140),
        body: z.string().min(10).max(6000),
        date: dateArg,
      },
    },
    async (
      { title, body, date }: { title: string; body: string; date?: string },
      extra: McpExtra,
    ) => {
      const { userId } = await resolveAdmin(extra);
      const bad = configProblem();
      if (bad) return bad;
      let result;
      try {
        result = await appendLog({ date: date ?? today(), title, body });
      } catch (e) {
        return jsonResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      const summary = `notes log entry: ${title}`;
      await recordMcpWrite(userId, APPEND_NOTES_LOG, { title, date }, summary);
      return jsonResult({
        ok: true,
        commit: result.commitSha,
        commit_url: result.url,
        summary,
      });
    },
  );
}

// --- registry ----------------------------------------------------------------

export function registerNotesTools(server: McpServer) {
  registerGetNotesManual(server);
  registerGetNotesBacklog(server);
  registerReadNotesFile(server);
  registerCaptureNotes(server);
  registerUpdateNoteItem(server);
  registerAppendNotesLog(server);
}

export const NOTES_TOOL_NAMES: readonly string[] = [
  GET_NOTES_MANUAL,
  GET_NOTES_BACKLOG,
  READ_NOTES_FILE,
  CAPTURE_NOTES,
  UPDATE_NOTE_ITEM,
  APPEND_NOTES_LOG,
];

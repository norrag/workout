import { createHash } from "node:crypto";
import { MCP_CATALOG_GENERATION } from "./version";
import { MCP_INSTRUCTIONS } from "./instructions";

/**
 * N91 — tool-catalog freshness, the pure half.
 *
 * ## The problem
 *
 * ChatGPT takes a snapshot of a connector's tool catalog when the user connects
 * and keeps serving from it until the user manually hits Settings → Plugins →
 * Workout → Refresh. There is no protocol signal for this: the client simply
 * never calls `tools/list` again, so a connector that has gained a dozen tools
 * since looks unchanged from inside that conversation. `ttlMs: 0` on our
 * `tools/list` cache hint does nothing about it — that governs shared HTTP
 * caches, not the client's own memory.
 *
 * ## The approach
 *
 * The server cannot read the client's snapshot, but it knows what it last
 * *handed* that connection. So: fingerprint the catalog as served, record it
 * per (user, OAuth client) on every `tools/list`, and compare on every
 * `tools/call`. A mismatch means the client is working from something we no
 * longer serve.
 *
 * ## Why a fingerprint rather than a version number
 *
 * A manually-incremented integer is only as reliable as the developer who
 * remembers to increment it, and the failure is silent in the direction that
 * matters — you add a tool, forget the bump, and nobody is ever told. Hashing
 * the definitions the SDK actually emits makes the detection a property of the
 * code rather than of anyone's discipline: a new tool, a renamed one, a
 * reworded description, a changed input schema all move the hash by
 * construction. The generation counter is folded in on top for the cases the
 * bytes cannot show (see `version.ts`), so it is a lever, not the mechanism.
 *
 * Everything in this module is pure — no I/O, no clock reads beyond the `now`
 * a caller passes in — so the policy is unit-testable without a database.
 */

/**
 * Which listing a principal was served. `tools/list` is filtered per principal
 * (admin tools are hidden from non-admins, `visibility.ts`), so there is no
 * single "the catalog" to compare against — a non-admin's hash can never equal
 * an admin's, and treating them as one surface would mark every ordinary user
 * permanently stale.
 */
export type CatalogVariant = "standard" | "admin";

/** The shape of a served tool definition this module cares about. */
export interface ServedTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
  [key: string]: unknown;
}

/** One variant's identity: what a client holding it would have recorded. */
export interface CatalogFacts {
  fingerprint: string;
  toolCount: number;
}

/** Both variants of the catalog this build serves, plus its generation. */
export interface CatalogSnapshot {
  generation: number;
  standard: CatalogFacts;
  admin: CatalogFacts;
}

/** What we recorded the last time this connection fetched a catalog. */
export interface CatalogRecord {
  /** null = this connection has never been observed fetching a catalog */
  fingerprint: string | null;
  generation: number | null;
  variant: CatalogVariant | null;
  listedAt: string | null;
  notifiedAt: string | null;
}

export type StaleReason =
  /** no record at all, or a record with no observed catalog (pre-tracking) */
  | "never-listed"
  /** the generation counter was deliberately advanced */
  | "generation-advanced"
  /** the served tool definitions or instructions changed */
  | "catalog-changed";

export type CatalogFreshness =
  | { stale: false; reason: "current" | "indeterminate" }
  | { stale: true; reason: StaleReason };

/**
 * Recursively key-sorted JSON. The fingerprint must move when the *meaning* of
 * the catalog changes and stay put otherwise, so it cannot inherit whatever key
 * order the SDK's JSON-Schema conversion happens to emit this version — an
 * upgrade that reordered `{type, properties}` to `{properties, type}` would
 * otherwise mark every connected client stale for no reason. Sorting makes the
 * hash semantic. Pure.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`;
}

/**
 * The catalog fingerprint: sha256 over the served tool definitions, the
 * generation counter, and the server instructions.
 *
 * Tools are sorted by name because `tools/list` ordering is a registration
 * detail, not a contract — reordering two `registerTool` calls is not a catalog
 * change and must not warn anybody. The instructions are included because a
 * client snapshots them with the tool list, so a rewritten grounding paragraph
 * genuinely is a stale snapshot even when no tool moved.
 *
 * Pure.
 */
export function fingerprintCatalog(
  tools: readonly ServedTool[],
  opts: { generation?: number; instructions?: string } = {},
): string {
  const material = {
    generation: opts.generation ?? MCP_CATALOG_GENERATION,
    instructions: opts.instructions ?? MCP_INSTRUCTIONS,
    tools: [...tools]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((t) => ({
        name: t.name,
        title: t.title ?? null,
        description: t.description ?? null,
        inputSchema: t.inputSchema ?? null,
        outputSchema: t.outputSchema ?? null,
        annotations: t.annotations ?? null,
      })),
  };
  return createHash("sha256").update(stableStringify(material)).digest("hex");
}

/**
 * Which variant a served listing is, read off the listing itself rather than
 * plumbed through from the visibility check. One fewer thing to keep in sync:
 * if the filter changes, this follows it. Pure.
 */
export function catalogVariantOf(
  tools: readonly ServedTool[],
  adminToolNames: ReadonlySet<string>,
): CatalogVariant {
  return tools.some((t) => adminToolNames.has(t.name)) ? "admin" : "standard";
}

/**
 * Is this connection working from a catalog we still serve?
 *
 * Three deliberate properties:
 *
 * - **An unknown snapshot is stale.** A connection with no recorded listing
 *   predates this tracking, which is exactly the population most likely to be
 *   missing tools — the users who connected months ago. Assuming they are
 *   current would permanently hide the notice from them. The cost is one
 *   refresh to establish a baseline, paid once, and it is what makes the
 *   rollout self-migrating rather than needing a backfill that could only
 *   guess.
 * - **An unknown *current* catalog is never stale.** If the snapshot could not
 *   be computed (an SDK shape change, say), we say nothing rather than warn
 *   everybody. Fail open on the notice, exactly as `visibility.ts` fails open
 *   on hiding admin tools.
 * - **Variants are compared like for like.** A record that knows its variant is
 *   compared against that variant. A record that does not (it cannot happen
 *   today, but a future listing filter might add a third) is allowed to match
 *   either, so an unrecognised variant reads as current rather than as a
 *   permanent warning.
 *
 * Pure.
 */
export function evaluateCatalogFreshness(
  record: CatalogRecord | null,
  snapshot: CatalogSnapshot | null,
): CatalogFreshness {
  if (!snapshot) return { stale: false, reason: "indeterminate" };
  if (!record || !record.fingerprint)
    return { stale: true, reason: "never-listed" };

  const expected =
    record.variant === "admin"
      ? [snapshot.admin.fingerprint]
      : record.variant === "standard"
        ? [snapshot.standard.fingerprint]
        : [snapshot.standard.fingerprint, snapshot.admin.fingerprint];

  if (expected.includes(record.fingerprint))
    return { stale: false, reason: "current" };
  if (record.generation != null && record.generation !== snapshot.generation) {
    return { stale: true, reason: "generation-advanced" };
  }
  return { stale: true, reason: "catalog-changed" };
}

/**
 * How long to stay quiet after telling a connection to refresh.
 *
 * The notice has to be reliable enough that the user actually sees it and
 * quiet enough that it is not stapled to every result of a twenty-call
 * conversation. An hour splits those: at most one notice per conversation in
 * practice, and a user who ignored it today is told again tomorrow rather than
 * never.
 */
export const CATALOG_NOTICE_COOLDOWN_MS = 60 * 60 * 1000;

/** Has this connection's cooldown elapsed? Pure. */
export function shouldAttachNotice(
  notifiedAt: string | null,
  now: number,
  cooldownMs: number = CATALOG_NOTICE_COOLDOWN_MS,
): boolean {
  if (!notifiedAt) return true;
  const last = Date.parse(notifiedAt);
  if (!Number.isFinite(last)) return true;
  return now - last >= cooldownMs;
}

/**
 * The notice itself, written for the model rather than for a log.
 *
 * The owner's wording for the ChatGPT path is reproduced exactly, because it is
 * the instruction the user has to follow and it is precise about the one thing
 * people get wrong (the control is at the *bottom* of the tool list). The
 * leading line tells the model what to do with it — a bare fact gets
 * paraphrased away or dropped; an instruction to relay it survives. The
 * generic sentence is there because this connector also serves Claude and
 * others, for whom the ChatGPT menu path is nonsense.
 */
export const CONNECTOR_UPDATE_NOTICE = [
  "WORKOUT CONNECTOR UPDATE — tell the user this before continuing, then answer their request as normal.",
  "",
  "New WORKOUT connector tools are available. Open ChatGPT on the web → Settings → Plugins → Workout → Refresh. The Refresh control is at the bottom of the tool list.",
  "",
  "(On a client other than ChatGPT, reconnect or refresh the WORKOUT connector's tool list however that client does it.) This connection is working from a cached tool list, so some WORKOUT tools may be missing from it. The notice stops on its own once the client re-fetches the tool list — the user does not need to sign in again, and the tools they can already see keep working.",
].join("\n");

/** The machine-readable companion, for a consumer that reads result `_meta`. */
export const CATALOG_NOTICE_META_KEY = "workout/connector-update";

export interface CatalogNoticeMeta {
  kind: "stale-tool-catalog";
  reason: StaleReason;
  message: string;
  refresh_path: string;
}

/** Build the `_meta` payload for a stale connection. Pure. */
export function catalogNoticeMeta(reason: StaleReason): CatalogNoticeMeta {
  return {
    kind: "stale-tool-catalog",
    reason,
    message: CONNECTOR_UPDATE_NOTICE,
    refresh_path: "ChatGPT → Settings → Plugins → Workout → Refresh",
  };
}

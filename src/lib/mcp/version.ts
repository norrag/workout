import { CURRENT_VERSION } from "@/content/releases";

/**
 * The connector's three version identities, and what each one is for (N91).
 *
 * They are deliberately separate because they answer different questions, and
 * conflating them is what left `MCP_SERVER_VERSION` pinned at `0.1.0` while the
 * app shipped 1.2.1.
 *
 * 1. **`MCP_SERVER_VERSION` — "which build of WORKOUT is answering?"**
 *    Reported to clients as `serverInfo.version`. Derived from the release
 *    registry (`src/content/releases/`), which doc 23 §5.1 makes the single
 *    author of the app's version identity, so it moves with every release and
 *    can never drift again. It is an identity label, NOT a freshness signal:
 *    under the stateless 2026-07-28 protocol there is no `initialize`
 *    handshake, `serverInfo` rides an optional `server/discover` most clients
 *    never call, and a client holding a frozen catalog is by definition not
 *    re-reading it. Anything that tried to detect staleness from this number
 *    would be reading a field nobody fetched.
 *
 * 2. **`MCP_CATALOG_GENERATION` — "has the tool surface moved?"**
 *    The freshness input a human controls. It is folded into the catalog
 *    fingerprint (`catalog.ts`), so raising it invalidates every recorded
 *    snapshot. Ordinary tool changes need no bump at all: the fingerprint is
 *    computed from the definitions as served and moves on its own. Bump it only
 *    for a change the served bytes cannot show (see the changelog below).
 *
 * 3. **`MCP_SCHEMA_VERSION` (`envelope.ts`) — "what shape is the payload?"**
 *    The response envelope's contract version, for consumers parsing results.
 *    Unrelated to both of the above and left where it is.
 */

export const MCP_SERVER_NAME = "workout";

/**
 * `serverInfo.version`. One source of truth with the app's release identity
 * (doc 23 §5.1): the registry names the version, `package.json` and this
 * constant follow it rather than restating it.
 */
export const MCP_SERVER_VERSION: string = CURRENT_VERSION;

/**
 * The tool catalog's generation counter.
 *
 * ## When to bump this
 *
 * Almost never. The fingerprint in `catalog.ts` hashes the tool definitions as
 * the SDK actually serves them plus the server instructions, so adding,
 * removing, renaming, re-describing or re-schema-ing a tool already moves it —
 * that is the whole point of hashing the served surface rather than trusting a
 * developer to remember a counter.
 *
 * Bump it only when the client's snapshot is stale in a way the served bytes
 * do not show, or when you deliberately want every connection to re-fetch:
 *
 * - a semantic change behind an unchanged schema and description
 * - a forced re-baseline (a bad catalog was served for a while)
 *
 * ## Changelog
 *
 * - **1** — the implicit pre-tracking era. No connection was ever recorded, so
 *   nothing in the database carries it; it exists to name what came before.
 * - **2** — 2026-09-12, N91. The generation this feature ships at. Every
 *   connection predating the tracking table has no recorded catalog at all and
 *   is stale on that ground alone, so this bump is belt and braces rather than
 *   the mechanism — but it is also the value an existing connection must reach
 *   before it reads as current, which is what makes the rollout testable: the
 *   owner's already-up-to-date ChatGPT connection goes stale on deploy, and one
 *   Refresh clears it for good.
 */
export const MCP_CATALOG_GENERATION = 2;

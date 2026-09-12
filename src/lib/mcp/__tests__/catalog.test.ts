import { describe, it, expect } from "vitest";
import {
  CATALOG_NOTICE_COOLDOWN_MS,
  CONNECTOR_UPDATE_NOTICE,
  catalogNoticeMeta,
  catalogVariantOf,
  evaluateCatalogFreshness,
  fingerprintCatalog,
  shouldAttachNotice,
  stableStringify,
  type CatalogRecord,
  type CatalogSnapshot,
  type ServedTool,
} from "../catalog";
import { MCP_CATALOG_GENERATION } from "../version";

/**
 * N91 — the freshness policy, tested as the pure function it is. The wiring
 * (which handler calls what, and what lands in the database) is exercised
 * separately in `catalog-freshness.test.ts` against a real `McpServer`.
 */

const TOOL_A: ServedTool = {
  name: "get_current_state",
  description: "where the user is",
  inputSchema: { type: "object", properties: {} },
};
const TOOL_B: ServedTool = {
  name: "get_profile",
  description: "who the user is",
  inputSchema: { type: "object", properties: {} },
};
const ADMIN_TOOL: ServedTool = {
  name: "get_engine_params",
  description: "tuning",
};

const ADMIN_NAMES = new Set(["get_engine_params"]);

function snapshotOf(
  standard: readonly ServedTool[],
  admin: readonly ServedTool[],
  generation = MCP_CATALOG_GENERATION,
): CatalogSnapshot {
  return {
    generation,
    standard: {
      fingerprint: fingerprintCatalog(standard, { generation }),
      toolCount: standard.length,
    },
    admin: {
      fingerprint: fingerprintCatalog(admin, { generation }),
      toolCount: admin.length,
    },
  };
}

function recordOf(over: Partial<CatalogRecord> = {}): CatalogRecord {
  return {
    fingerprint: null,
    generation: MCP_CATALOG_GENERATION,
    variant: "standard",
    listedAt: "2026-09-01T00:00:00.000Z",
    notifiedAt: null,
    ...over,
  };
}

describe("stableStringify", () => {
  it("is insensitive to key order, so a reshuffled JSON Schema is not a change", () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableStringify({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("keeps array order, which is meaningful (enum/required lists)", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});

describe("fingerprintCatalog", () => {
  it("is stable across calls and across tool ordering", () => {
    expect(fingerprintCatalog([TOOL_A, TOOL_B])).toBe(
      fingerprintCatalog([TOOL_A, TOOL_B]),
    );
    // registration order is not a catalog change
    expect(fingerprintCatalog([TOOL_B, TOOL_A])).toBe(
      fingerprintCatalog([TOOL_A, TOOL_B]),
    );
  });

  it("moves when a tool is added — the case that motivated the feature", () => {
    expect(fingerprintCatalog([TOOL_A])).not.toBe(
      fingerprintCatalog([TOOL_A, TOOL_B]),
    );
  });

  it("moves when a tool is removed, renamed, re-described or re-schema'd", () => {
    const base = fingerprintCatalog([TOOL_A, TOOL_B]);
    expect(fingerprintCatalog([TOOL_A])).not.toBe(base);
    expect(
      fingerprintCatalog([TOOL_A, { ...TOOL_B, name: "get_profile_v2" }]),
    ).not.toBe(base);
    expect(
      fingerprintCatalog([TOOL_A, { ...TOOL_B, description: "reworded" }]),
    ).not.toBe(base);
    expect(
      fingerprintCatalog([
        TOOL_A,
        {
          ...TOOL_B,
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        },
      ]),
    ).not.toBe(base);
  });

  it("moves when the generation is advanced, with no tool change at all", () => {
    expect(fingerprintCatalog([TOOL_A], { generation: 2 })).not.toBe(
      fingerprintCatalog([TOOL_A], { generation: 3 }),
    );
  });

  it("moves when the server instructions are rewritten", () => {
    expect(fingerprintCatalog([TOOL_A], { instructions: "one" })).not.toBe(
      fingerprintCatalog([TOOL_A], { instructions: "two" }),
    );
  });
});

describe("catalogVariantOf", () => {
  it("reads the variant off the served listing rather than off the caller", () => {
    expect(catalogVariantOf([TOOL_A, TOOL_B], ADMIN_NAMES)).toBe("standard");
    expect(catalogVariantOf([TOOL_A, ADMIN_TOOL], ADMIN_NAMES)).toBe("admin");
  });
});

describe("evaluateCatalogFreshness", () => {
  const snapshot = snapshotOf([TOOL_A, TOOL_B], [TOOL_A, TOOL_B, ADMIN_TOOL]);

  it("treats a connection with no record as stale (the pre-tracking migration)", () => {
    expect(evaluateCatalogFreshness(null, snapshot)).toEqual({
      stale: true,
      reason: "never-listed",
    });
  });

  it("treats a row with no observed listing as stale — a notified pre-tracking row", () => {
    const notifiedButUnknown = recordOf({
      fingerprint: null,
      notifiedAt: "2026-09-12T00:00:00.000Z",
    });
    expect(evaluateCatalogFreshness(notifiedButUnknown, snapshot).stale).toBe(
      true,
    );
  });

  it("does not mark a current standard client stale", () => {
    const current = recordOf({
      fingerprint: snapshot.standard.fingerprint,
      variant: "standard",
    });
    expect(evaluateCatalogFreshness(current, snapshot)).toEqual({
      stale: false,
      reason: "current",
    });
  });

  it("does not mark a current admin client stale", () => {
    const current = recordOf({
      fingerprint: snapshot.admin.fingerprint,
      variant: "admin",
    });
    expect(evaluateCatalogFreshness(current, snapshot).stale).toBe(false);
  });

  it("never confuses the two variants — a standard client is not stale for lacking admin tools", () => {
    // the bug this guards: comparing everyone against one catalog would mark
    // every non-admin permanently stale, and every admin too
    const standardClient = recordOf({
      fingerprint: snapshot.standard.fingerprint,
      variant: "standard",
    });
    const adminClient = recordOf({
      fingerprint: snapshot.admin.fingerprint,
      variant: "admin",
    });
    expect(evaluateCatalogFreshness(standardClient, snapshot).stale).toBe(
      false,
    );
    expect(evaluateCatalogFreshness(adminClient, snapshot).stale).toBe(false);
    // and the hashes really are different, so the test above is not vacuous
    expect(snapshot.standard.fingerprint).not.toBe(snapshot.admin.fingerprint);
  });

  it("marks a client stale when the catalog gained a tool", () => {
    const stale = recordOf({
      fingerprint: fingerprintCatalog([TOOL_A]),
      variant: "standard",
    });
    expect(evaluateCatalogFreshness(stale, snapshot)).toEqual({
      stale: true,
      reason: "catalog-changed",
    });
  });

  it("names an advanced generation as the reason when that is what moved", () => {
    const previousGeneration = MCP_CATALOG_GENERATION - 1;
    const stale = recordOf({
      fingerprint: fingerprintCatalog([TOOL_A, TOOL_B], {
        generation: previousGeneration,
      }),
      generation: previousGeneration,
      variant: "standard",
    });
    expect(evaluateCatalogFreshness(stale, snapshot)).toEqual({
      stale: true,
      reason: "generation-advanced",
    });
  });

  it("accepts either variant when the record does not know its own", () => {
    const legacy = recordOf({
      fingerprint: snapshot.admin.fingerprint,
      variant: null,
    });
    expect(evaluateCatalogFreshness(legacy, snapshot).stale).toBe(false);
  });

  it("says nothing when the current catalog cannot be computed (fail open)", () => {
    expect(evaluateCatalogFreshness(null, null)).toEqual({
      stale: false,
      reason: "indeterminate",
    });
    expect(
      evaluateCatalogFreshness(recordOf({ fingerprint: "whatever" }), null)
        .stale,
    ).toBe(false);
  });
});

describe("shouldAttachNotice", () => {
  const now = Date.parse("2026-09-12T12:00:00.000Z");

  it("notifies a connection that has never been told", () => {
    expect(shouldAttachNotice(null, now)).toBe(true);
  });

  it("stays quiet inside the cooldown, so one conversation gets one notice", () => {
    const justNow = new Date(now - 60_000).toISOString();
    expect(shouldAttachNotice(justNow, now)).toBe(false);
  });

  it("speaks again once the cooldown has elapsed", () => {
    const old = new Date(now - CATALOG_NOTICE_COOLDOWN_MS - 1).toISOString();
    expect(shouldAttachNotice(old, now)).toBe(true);
  });

  it("notifies rather than stays silent when the stamp is unparseable", () => {
    expect(shouldAttachNotice("not-a-date", now)).toBe(true);
  });
});

describe("CONNECTOR_UPDATE_NOTICE", () => {
  it("carries the owner's refresh path verbatim, bottom-of-the-list included", () => {
    expect(CONNECTOR_UPDATE_NOTICE).toContain(
      "New WORKOUT connector tools are available. Open ChatGPT on the web → Settings → Plugins → Workout → Refresh. The Refresh control is at the bottom of the tool list.",
    );
  });

  it("tells the model to relay it, and says the notice clears itself", () => {
    expect(CONNECTOR_UPDATE_NOTICE).toMatch(/tell the user/i);
    expect(CONNECTOR_UPDATE_NOTICE).toMatch(/stops on its own/i);
  });

  it("separates refreshing the tool list from signing in again", () => {
    // freshness and auth are different concepts; the notice must not send
    // anyone off to reconnect their account
    expect(CONNECTOR_UPDATE_NOTICE).toMatch(/does not need to sign in again/i);
  });

  it("carries the reason in the machine-readable companion", () => {
    expect(catalogNoticeMeta("catalog-changed")).toMatchObject({
      kind: "stale-tool-catalog",
      reason: "catalog-changed",
    });
  });
});

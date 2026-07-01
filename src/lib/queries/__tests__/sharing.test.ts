/**
 * Sharing tests: code format (pure) + the R1 ownership assertion on the
 * copy-on-accept path, driven through a mocked service client (the full DB
 * walk stays covered by the hosted-DB integration smoke).
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { acceptShareCode, formatShareCode, newShareCode } from "../sharing";

describe("share codes", () => {
  it("formats 8 chars from the unambiguous alphabet", () => {
    const code = formatShareCode(
      new Uint8Array([0, 31, 32, 255, 7, 100, 200, 50]),
    );
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(code).not.toMatch(/[01IO]/);
  });

  it("generates distinct codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => newShareCode()));
    expect(codes.size).toBeGreaterThan(45);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// R1 — the service-role copy must never touch an object the share's owner
// doesn't own. A minimal read-only mock: select chains resolve against the
// fixture rows by their eq() filters; update resolves ok (the accept stamp).
// ---------------------------------------------------------------------------

function mockService(rows: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        is: () => builder,
        not: () => builder,
        limit: () => builder,
        order: () => builder,
        update: () => builder,
        maybeSingle: async () => ({
          data:
            (rows[table] ?? []).find((r) =>
              filters.every(([c, v]) => r[c] === v),
            ) ?? null,
          error: null,
        }),
        then: (resolve: (v: { error: null }) => void) =>
          resolve({ error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

const share = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "share-1",
  owner_id: "owner",
  grantee_id: null,
  object_type: "template",
  object_id: "obj-1",
  share_code: "AAAAAAAA",
  expires_at: null,
  accepted_at: null,
  ...over,
});

describe("acceptShareCode — R1 ownership assertion", () => {
  it("refuses a template the share's owner does not own (re-pointed object_id)", async () => {
    const service = mockService({
      shares: [share()],
      templates: [{ id: "obj-1", user_id: "victim", name: "Victim split" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.objectId).toBeNull();
    expect(result.error).toMatch(/no longer exists/);
  });

  it("refuses a mesocycle the share's owner does not own", async () => {
    const service = mockService({
      shares: [share({ object_type: "mesocycle" })],
      mesocycles: [{ id: "obj-1", user_id: "victim", name: "Victim meso" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.objectId).toBeNull();
    expect(result.error).toMatch(/no longer exists/);
  });

  it("refuses a custom exercise owned by a third user", async () => {
    const service = mockService({
      shares: [share({ object_type: "exercise" })],
      exercises: [{ id: "obj-1", user_id: "victim", name: "Victim curl" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.objectId).toBeNull();
    expect(result.error).toMatch(/no longer exists/);
  });

  it("passes a stock exercise (user_id null) through untouched", async () => {
    const service = mockService({
      shares: [share({ object_type: "exercise" })],
      exercises: [{ id: "obj-1", user_id: null, name: "Barbell Row" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.error).toBeNull();
    expect(result.objectId).toBe("obj-1");
  });

  it("still rejects an already-used code from another grantee", async () => {
    const service = mockService({
      shares: [
        share({ grantee_id: "someone-else", accepted_at: "2026-06-01T00:00:00Z" }),
      ],
      templates: [{ id: "obj-1", user_id: "owner", name: "Owner split" }],
    });
    const result = await acceptShareCode(service, "grantee", "AAAAAAAA");
    expect(result.error).toMatch(/already used/i);
  });
});

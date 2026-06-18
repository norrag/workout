/**
 * Regression tests for the exercise-affinity query chunking (MCP tooling review
 * §5.1). The no-arg / equipment-only modes failed because an unbounded
 * `.in(col, ids)` list overflowed the PostgREST request URL; `selectInChunks`
 * splits any id list into bounded requests. Pure-mechanism test — full data
 * assembly is covered by integration smoke.
 */
import { describe, expect, it } from "vitest";
import { selectInChunks, fetchAllRows, ID_CHUNK, PAGE_SIZE } from "../coaching";

describe("selectInChunks", () => {
  it("never passes more than ID_CHUNK ids to a single request", async () => {
    const ids = Array.from({ length: ID_CHUNK * 2 + 7 }, (_, i) => `id-${i}`);
    const chunkSizes: number[] = [];
    const rows = await selectInChunks<{ id: string }>(ids, async (chunk) => {
      chunkSizes.push(chunk.length);
      return { data: chunk.map((id) => ({ id })), error: null };
    });
    expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(ID_CHUNK);
    expect(chunkSizes).toEqual([ID_CHUNK, ID_CHUNK, 7]);
    // every chunk's rows are concatenated back together
    expect(rows).toHaveLength(ids.length);
  });

  it("makes no request for an empty id list", async () => {
    let calls = 0;
    const rows = await selectInChunks<{ id: string }>([], async () => {
      calls += 1;
      return { data: [], error: null };
    });
    expect(calls).toBe(0);
    expect(rows).toEqual([]);
  });

  it("throws the underlying error instead of swallowing it", async () => {
    await expect(
      selectInChunks(["a"], async () => ({
        data: null,
        error: { code: "PGRST", message: "boom" },
      })),
    ).rejects.toEqual({ code: "PGRST", message: "boom" });
  });
});

describe("fetchAllRows", () => {
  it("walks range windows past the row cap until a short page (§ row-cap fix)", async () => {
    // a table of 2 full pages + a partial third — the cap that silently
    // truncated the affinity feedback rollup
    const total = PAGE_SIZE * 2 + 13;
    const rows = Array.from({ length: total }, (_, i) => ({ i }));
    const ranges: [number, number][] = [];
    const out = await fetchAllRows<{ i: number }>(async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(out).toHaveLength(total);
    expect(out[0].i).toBe(0);
    expect(out.at(-1)!.i).toBe(total - 1);
    // three windows: [0..cap-1], [cap..2cap-1], [2cap..short]
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toEqual([0, PAGE_SIZE - 1]);
  });

  it("stops after one window when the first page is short", async () => {
    let calls = 0;
    const out = await fetchAllRows<{ i: number }>(async () => {
      calls += 1;
      return { data: [{ i: 1 }], error: null };
    });
    expect(calls).toBe(1);
    expect(out).toEqual([{ i: 1 }]);
  });

  it("throws the underlying error", async () => {
    await expect(
      fetchAllRows(async () => ({ data: null, error: { message: "nope" } })),
    ).rejects.toEqual({ message: "nope" });
  });
});

/**
 * Regression tests for the exercise-affinity query chunking (MCP tooling review
 * §5.1). The no-arg / equipment-only modes failed because an unbounded
 * `.in(col, ids)` list overflowed the PostgREST request URL; `selectInChunks`
 * splits any id list into bounded requests. Pure-mechanism test — full data
 * assembly is covered by integration smoke.
 */
import { describe, expect, it } from "vitest";
import { selectInChunks, ID_CHUNK } from "../coaching";

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

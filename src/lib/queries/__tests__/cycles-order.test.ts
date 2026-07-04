import { describe, it, expect } from "vitest";
import { orderCyclesTopLevel } from "../cycles";

// N28 — the /cycles top level sorts by training start date (newest first),
// falling back to created_at. Backfilled history makes created_at an
// import-order artifact (the oldest training period can carry the newest
// created_at), which is exactly the case the owner's screenshot showed:
// Current > Oldest > … > Newest under a pure created_at sort.

function row(start_date: string | null, created_at: string, name: string) {
  return { start_date, created_at, name };
}

describe("orderCyclesTopLevel (N28)", () => {
  it("sorts by start_date desc, ignoring import-order created_at", () => {
    // imported oldest-training-first ⇒ the oldest block has the newest created_at
    const bulk2024 = row("2024-07-01", "2026-06-22T12:00:03+00:00", "bulk-24");
    const cut2025 = row("2025-12-01", "2026-06-22T12:00:02+00:00", "cut-25");
    const current = row("2026-06-01", "2026-06-22T12:00:01+00:00", "current");
    expect(
      orderCyclesTopLevel([bulk2024, cut2025, current]).map((r) => r.name),
    ).toEqual(["current", "cut-25", "bulk-24"]);
  });

  it("an unstarted plan (null start_date) sorts by its fresh created_at — on top", () => {
    const planned = row(null, "2026-07-04T09:00:00+00:00", "planned");
    const active = row("2026-06-01", "2026-05-30T09:00:00+00:00", "active");
    const done = row("2026-01-05", "2026-01-04T09:00:00+00:00", "done");
    expect(
      orderCyclesTopLevel([done, active, planned]).map((r) => r.name),
    ).toEqual(["planned", "active", "done"]);
  });

  it("ties on start_date break by created_at desc; input is not mutated", () => {
    const a = row("2026-06-01", "2026-06-01T08:00:00+00:00", "a");
    const b = row("2026-06-01", "2026-06-02T08:00:00+00:00", "b");
    const input = [a, b];
    expect(orderCyclesTopLevel(input).map((r) => r.name)).toEqual(["b", "a"]);
    expect(input.map((r) => r.name)).toEqual(["a", "b"]);
  });
});

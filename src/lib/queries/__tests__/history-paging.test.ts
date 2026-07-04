import { describe, it, expect } from "vitest";
import { pageSetsByDay, HISTORY_PAGE_SETS } from "../history";

// N30 — exercise history pages on whole calendar days so the raw set limit
// never splits a session across pages (sets of one workout can even share
// identical timestamps after an import). The cursor re-reads the dropped
// boundary day in full: no set is skipped or duplicated across pages.

function set(day: string, time: string) {
  return { performed_at: `${day}T${time}+00:00` };
}

describe("pageSetsByDay (N30)", () => {
  it("returns everything with a null cursor when under the limit", () => {
    const rows = [set("2026-07-01", "10:00:00"), set("2026-06-30", "10:00:00")];
    expect(pageSetsByDay(rows, 120)).toEqual({ page: rows, nextCursor: null });
  });

  it("returns exactly-limit rows with a null cursor (history exhausted)", () => {
    const rows = [set("2026-07-01", "10:00:00"), set("2026-06-30", "10:00:00")];
    expect(pageSetsByDay(rows, 2)).toEqual({ page: rows, nextCursor: null });
  });

  it("drops the boundary day and cursors at the oldest kept day's start", () => {
    // limit 4, over-fetch 5: the 5th row proves 06-29 continues past the window,
    // so every 06-29 row is dropped and the cursor re-reads that day in full
    const rows = [
      set("2026-07-01", "10:00:00"),
      set("2026-06-30", "10:00:02"),
      set("2026-06-30", "10:00:01"),
      set("2026-06-29", "10:00:01"),
      set("2026-06-29", "10:00:00"),
    ];
    const { page, nextCursor } = pageSetsByDay(rows, 4);
    expect(page).toEqual(rows.slice(0, 3));
    expect(nextCursor).toBe("2026-06-30T00:00:00Z");
  });

  it("drops a whole multi-session boundary day (re-read next page, no dupes)", () => {
    // two workouts on the boundary day, identical timestamps (import artifact):
    // both are dropped; the cursor re-fetches the entire day next page
    const rows = [
      set("2026-07-01", "10:00:00"),
      set("2026-06-29", "09:00:00"),
      set("2026-06-29", "09:00:00"),
      set("2026-06-29", "09:00:00"),
    ];
    const { page, nextCursor } = pageSetsByDay(rows, 3);
    expect(page).toEqual(rows.slice(0, 1));
    expect(nextCursor).toBe("2026-07-01T00:00:00Z");
  });

  it("keeps a split rather than an empty page when one day exceeds the limit", () => {
    const rows = [
      set("2026-06-29", "09:00:03"),
      set("2026-06-29", "09:00:02"),
      set("2026-06-29", "09:00:01"),
    ];
    const { page, nextCursor } = pageSetsByDay(rows, 2);
    expect(page).toEqual(rows.slice(0, 2));
    expect(nextCursor).toBe("2026-06-29T09:00:02+00:00");
  });

  it("cursor walk covers every row exactly once", () => {
    // 10 days × 3 sets, page limit 7 → walk pages via the cursor contract
    // (fetch = rows strictly older than the cursor) and check full coverage
    const rows: { performed_at: string }[] = [];
    for (let d = 30; d > 20; d--) {
      for (let s = 3; s > 0; s--) {
        rows.push(set(`2026-06-${d}`, `09:00:0${s}`));
      }
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const window: { performed_at: string }[] = (
        cursor ? rows.filter((r) => r.performed_at < cursor!) : rows
      ).slice(0, 8);
      const { page, nextCursor } = pageSetsByDay(window, 7);
      seen.push(...page.map((r) => r.performed_at));
      cursor = nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(rows.map((r) => r.performed_at));
  });

  it("exports a sane default page size", () => {
    expect(HISTORY_PAGE_SETS).toBe(120);
  });
});
